import { useEffect, useRef, useState, useCallback, type FormEvent } from 'react';
import { Spinner } from '../ui/Spinner';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { createKey } from '../../lib/tauri';
import { useKeyStore } from '../../stores/keyStore';
import { useTabStore } from '../../stores/tabStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getMonacoThemeName, registerAllMonacoThemes } from '../../themes';

export interface CreateKeyInitialValues {
  keyName?: string;
  value?: string;
  contentMode?: ContentMode;
  ttl?: string;
}

interface CreateKeyDialogProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
  namespaceId: string;
  initialValues?: CreateKeyInitialValues;
}

type ContentMode = 'json' | 'text';

export default function CreateKeyDialog({ open, onClose, accountId, namespaceId, initialValues }: CreateKeyDialogProps) {
  const settingsTheme = useSettingsStore((s) => s.theme);
  const monacoThemeName = getMonacoThemeName(settingsTheme);

  const [keyName, setKeyName] = useState('');
  const [contentMode, setContentMode] = useState<ContentMode>('json');
  const [ttl, setTtl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const keyNameInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  const titleId = 'create-key-dialog-title';
  const errorId = 'create-key-dialog-error';

  const loadKeys = useKeyStore((s) => s.loadKeys);
  const openKeyTab = useTabStore((s) => s.openKeyTab);

  // Reset form state when dialog opens
  useEffect(() => {
    if (open) {
      setKeyName(initialValues?.keyName ?? '');
      setContentMode(initialValues?.contentMode ?? 'json');
      setTtl(initialValues?.ttl ?? '');
      setLoading(false);
      setError('');
      editorRef.current = null;
      // Focus the key name input after the dialog renders
      requestAnimationFrame(() => {
        keyNameInputRef.current?.focus();
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update Monaco language when content mode changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(
          model,
          contentMode === 'json' ? 'json' : 'plaintext',
        );
      }
    }
  }, [contentMode]);

  // Focus trap & Escape handling
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusable = dialog.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleEditorMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      registerAllMonacoThemes(monaco);
      monaco.editor.setTheme(monacoThemeName);
    },
    [monacoThemeName],
  );

  if (!open) return null;

  const canSubmit = keyName.trim() && !loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');

    try {
      const value = editorRef.current?.getValue() ?? '';
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(value));

      const ttlValue = ttl.trim() ? parseInt(ttl.trim(), 10) : undefined;
      if (ttlValue !== undefined && (isNaN(ttlValue) || ttlValue <= 0)) {
        setError('TTL must be a positive number');
        setLoading(false);
        return;
      }

      const trimmedKeyName = keyName.trim();
      await createKey(accountId, namespaceId, trimmedKeyName, bytes, ttlValue);

      // Refresh key list
      await loadKeys(namespaceId);

      // Open a tab for the new key
      openKeyTab(accountId, namespaceId, trimmedKeyName, false);

      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create key.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  const inputClasses =
    'w-full rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] px-3 py-2 text-[length:var(--font-size-base)] outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-colors placeholder:text-[var(--text-tertiary)]';

  const labelClasses =
    'block text-[length:var(--font-size-sm)] font-medium text-[var(--text-secondary)] mb-1';

  const helperClasses =
    'text-[length:var(--font-size-sm)] text-[var(--text-tertiary)] mt-1';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[560px] mx-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2
            id={titleId}
            className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]"
          >
            Create Key
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded"
            aria-label="Close dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Key Name */}
          <div>
            <label htmlFor="create-key-name" className={labelClasses}>
              Key Name
            </label>
            <input
              ref={keyNameInputRef}
              id="create-key-name"
              type="text"
              required
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. users:123:profile"
              className={`${inputClasses} font-mono`}
            />
          </div>

          {/* Content Type Selector */}
          <div>
            <span className={labelClasses}>Content Type</span>
            <div className="flex items-center gap-4 mt-1">
              <label className="flex items-center gap-2 cursor-pointer text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
                <input
                  type="radio"
                  name="content-mode"
                  value="json"
                  checked={contentMode === 'json'}
                  onChange={() => setContentMode('json')}
                  className="accent-[var(--accent)]"
                />
                JSON
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
                <input
                  type="radio"
                  name="content-mode"
                  value="text"
                  checked={contentMode === 'text'}
                  onChange={() => setContentMode('text')}
                  className="accent-[var(--accent)]"
                />
                Text
              </label>
            </div>
          </div>

          {/* Value Editor (Monaco mini-editor) */}
          <div>
            <label className={labelClasses}>Value</label>
            <div className="rounded-md border border-[var(--border)] overflow-hidden">
              <Editor
                height="200px"
                key={open ? 'editor-open' : 'editor-closed'}
                defaultValue={initialValues?.value ?? (contentMode === 'json' ? '{}' : '')}
                language={contentMode === 'json' ? 'json' : 'plaintext'}
                theme={monacoThemeName}
                onMount={handleEditorMount}
                beforeMount={(monaco) => {
                  registerAllMonacoThemes(monaco);
                }}
                options={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: contentMode === 'json' ? 'on' : 'off',
                  renderLineHighlight: 'line',
                  automaticLayout: true,
                  padding: { top: 8 },
                  wordWrap: 'on',
                  tabSize: 2,
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'hidden',
                  },
                }}
              />
            </div>
          </div>

          {/* TTL */}
          <div>
            <label htmlFor="create-key-ttl" className={labelClasses}>
              TTL (seconds)
            </label>
            <input
              id="create-key-ttl"
              type="number"
              min="1"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              placeholder="Optional"
              className={inputClasses}
            />
            <p className={helperClasses}>Leave empty for no expiration</p>
          </div>

          {/* Error message */}
          {error && (
            <p id={errorId} className="text-[length:var(--font-size-sm)] text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[length:var(--font-size-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading && (
                <Spinner size={16} />
              )}
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
