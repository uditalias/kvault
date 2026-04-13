import { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { getValue, putValue } from '../../lib/tauri';
import { useTabStore } from '../../stores/tabStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useKeyStore } from '../../stores/keyStore';
import { MetadataHeader } from './MetadataHeader';
import { HexViewer } from './HexViewer';
import { Skeleton } from '../ui/Skeleton';
import { getMonacoThemeName, registerAllMonacoThemes } from '../../themes';

export interface ValueEditorProps {
  accountId: string;
  namespaceId: string;
  keyName: string;
  isDeleted: boolean;
}

type ContentType = 'json' | 'text' | 'binary';


function detectContentType(data: number[], isJson: boolean): ContentType {
  if (isJson) return 'json';

  // Check if bytes are valid UTF-8 text by attempting decode
  try {
    const bytes = new Uint8Array(data);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(bytes);
    return 'text';
  } catch {
    return 'binary';
  }
}

function bytesToString(data: number[]): string {
  const bytes = new Uint8Array(data);
  return new TextDecoder('utf-8').decode(bytes);
}

function stringToBytes(str: string): number[] {
  const encoder = new TextEncoder();
  return Array.from(encoder.encode(str));
}

function tryFormatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function ValueEditor({ accountId, namespaceId, keyName, isDeleted }: ValueEditorProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentType, setContentType] = useState<ContentType>('text');
  const [size, setSize] = useState(0);

  // Read expiration from the cached key list
  const expiration = useKeyStore((s) => {
    const keys = s.keysMap[namespaceId];
    if (!keys) return null;
    const keyRow = keys.find((k) => k.key_name === keyName);
    return keyRow?.expiration ?? null;
  });
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Store raw value (as originally received)
  const originalRawRef = useRef<string>('');
  const binaryDataRef = useRef<number[]>([]);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  const tabId = `key:${namespaceId}:${keyName}`;
  const setTabDirty = useTabStore((s) => s.setTabDirty);
  const markKeyTabDeleted = useTabStore((s) => s.markKeyTabDeleted);
  const isDirty = useTabStore((s) => s.tabs.find((t) => t.id === tabId)?.isDirty ?? false);

  // Settings
  const settingsTheme = useSettingsStore((s) => s.theme);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const editorWordWrap = useSettingsStore((s) => s.editorWordWrap);
  const editorMinimap = useSettingsStore((s) => s.editorMinimap);
  const monacoThemeName = getMonacoThemeName(settingsTheme);

  // Fetch value on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const result = await getValue(accountId, namespaceId, keyName);
        if (cancelled) return;

        const ct = detectContentType(result.data, result.is_json);
        setContentType(ct);
        setSize(result.size);
        // expiration is read from keyStore, not from getValue result

        if (ct === 'binary') {
          originalRawRef.current = '';
          binaryDataRef.current = result.data;
        } else {
          binaryDataRef.current = [];
          const raw = bytesToString(result.data);
          originalRawRef.current = raw;
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);

        // If the key was not found on Cloudflare, mark the tab as deleted
        if (msg.includes('key not found') || msg.includes('10009')) {
          markKeyTabDeleted(namespaceId, keyName);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, namespaceId, keyName]);

  // Compute editor value based on view mode
  const getEditorValue = useCallback(() => {
    const raw = originalRawRef.current;
    if (contentType === 'json' && viewMode === 'formatted') {
      return tryFormatJson(raw);
    }
    return raw;
  }, [contentType, viewMode]);

  // Handle view mode changes
  const handleViewModeChange = useCallback(
    (mode: 'formatted' | 'raw') => {
      if (!editorRef.current) {
        setViewMode(mode);
        return;
      }

      // Get current content to preserve edits
      const currentContent = editorRef.current.getValue();

      // When switching modes, reformat or un-format
      let newContent: string;
      if (mode === 'formatted') {
        newContent = tryFormatJson(currentContent);
      } else {
        // Compact JSON
        try {
          newContent = JSON.stringify(JSON.parse(currentContent));
        } catch {
          newContent = currentContent;
        }
      }

      setViewMode(mode);
      editorRef.current.setValue(newContent);
    },
    [],
  );

  // Dirty tracking
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined) return;

      // Compare with original (always compare raw/compacted form for JSON)
      let isDirty: boolean;
      if (contentType === 'json') {
        // Normalize both to compacted form for comparison
        try {
          const currentParsed = JSON.stringify(JSON.parse(value));
          const originalParsed = JSON.stringify(JSON.parse(originalRawRef.current));
          isDirty = currentParsed !== originalParsed;
        } catch {
          isDirty = value !== originalRawRef.current;
        }
      } else {
        isDirty = value !== originalRawRef.current;
      }

      setTabDirty(tabId, isDirty);
    },
    [contentType, tabId, setTabDirty],
  );

  // Save function
  const handleSave = useCallback(async () => {
    if (!editorRef.current || isDeleted) return;

    const content = editorRef.current.getValue();
    const bytes = stringToBytes(content);

    setSaveStatus('saving');
    setSaveError(null);

    try {
      await putValue(accountId, namespaceId, keyName, bytes);

      // Update original raw ref to current content
      originalRawRef.current = content;
      setTabDirty(tabId, false);
      setSaveStatus('saved');

      // Clear "saved" indicator after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : String(err));

      // Clear error status after 5 seconds
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveError(null);
      }, 5000);
    }
  }, [accountId, namespaceId, keyName, isDeleted, tabId, setTabDirty]);

  // Discard changes — restore editor to original value
  const handleDiscard = useCallback(() => {
    if (!editorRef.current) return;
    const raw = originalRawRef.current;
    const value = contentType === 'json' && viewMode === 'formatted' ? tryFormatJson(raw) : raw;
    editorRef.current.setValue(value);
    setTabDirty(tabId, false);
  }, [contentType, viewMode, tabId, setTabDirty]);

  // Editor mount handler
  const handleEditorMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      registerAllMonacoThemes(monaco);
      monaco.editor.setTheme(monacoThemeName);

      // Bind Cmd+S / Ctrl+S to save
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleSave();
      });
    },
    [handleSave, monacoThemeName],
  );

  // Listen for global save event from command palette
  useEffect(() => {
    const handleGlobalSave = () => {
      const { tabs, activeTabId } = useTabStore.getState();
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.id === tabId) {
        handleSave();
      }
    };
    window.addEventListener('kvault:save-current-value', handleGlobalSave);
    return () => window.removeEventListener('kvault:save-current-value', handleGlobalSave);
  }, [tabId, handleSave]);

  // Sync Monaco theme and editor options when settings change
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(monacoThemeName);
    }
  }, [monacoThemeName]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        fontSize: editorFontSize,
        wordWrap: editorWordWrap,
        minimap: { enabled: editorMinimap },
      });
    }
  }, [editorFontSize, editorWordWrap, editorMinimap]);

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex flex-col">
        {/* Metadata header skeleton */}
        <div className="shimmer-container flex items-center gap-3 px-3 h-10 min-h-[40px] bg-[var(--bg-secondary)] border-b border-[var(--border)]">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-10 rounded" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
        </div>
        {/* Editor content skeleton */}
        <div className="shimmer-container flex-1 p-4 space-y-2.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--danger)] text-sm px-4 text-center">
          Failed to load value: {error}
        </div>
      </div>
    );
  }

  // Binary content: render hex viewer
  if (contentType === 'binary') {
    return (
      <div className="h-full flex flex-col">
        <MetadataHeader
          keyName={keyName}
          contentType={contentType}
          size={size}
          expiration={expiration}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
        <div className="flex-1 min-h-0">
          <HexViewer data={binaryDataRef.current} />
        </div>
      </div>
    );
  }

  const language = contentType === 'json' ? 'json' : 'plaintext';

  return (
    <div className="h-full flex flex-col">
      <MetadataHeader
        keyName={keyName}
        contentType={contentType}
        size={size}
        expiration={expiration}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isDirty={isDirty}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Save status indicator */}
      {saveStatus !== 'idle' && (
        <div
          className={`px-3 py-1 text-[11px] font-medium ${
            saveStatus === 'saving'
              ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
              : saveStatus === 'saved'
                ? 'bg-[var(--success)]/10 text-[var(--success)]'
                : 'bg-[var(--danger)]/10 text-[var(--danger)]'
          }`}
        >
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && `Save failed: ${saveError}`}
        </div>
      )}

      {/* Monaco editor */}
      <div className="flex-1 min-h-0">
        <Editor
          defaultValue={getEditorValue()}
          language={language}
          theme={monacoThemeName}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={{
            readOnly: isDeleted,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: editorFontSize,
            minimap: { enabled: editorMinimap },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            automaticLayout: true,
            padding: { top: 8 },
            wordWrap: editorWordWrap,
            tabSize: 2,
          }}
          beforeMount={(monaco) => {
            registerAllMonacoThemes(monaco);
          }}
        />
      </div>
    </div>
  );
}
