import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { Play, Square } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useAccountStore } from '../../stores/accountStore';
import { useTabStore } from '../../stores/tabStore';
import { getMonacoThemeName, registerAllMonacoThemes } from '../../themes';
import { useSettingsStore } from '../../stores/settingsStore';
import type { PlaygroundMode } from '../../lib/tauri';
import { registerAccountEnvType } from '../../lib/playground/envTypes';
import { PlaygroundRun, type RunStatus } from '../../lib/playground/runManager';
import {
  PlaygroundConsole,
  type PlaygroundConsoleHandle,
} from './PlaygroundConsole';
import { PlaygroundModeToggle } from './PlaygroundModeToggle';
import { ConsoleHeader } from './ConsoleHeader';

// Keep in sync with ConsoleHeader's height (h-[38px]).
const CONSOLE_HEADER_HEIGHT_PX = 38;

interface Props {
  playgroundId: string;
  accountId: string;
}

const AUTOSAVE_DEBOUNCE_MS = 500;
const SAMPLE_CODE = `// KVault playground — write TypeScript that reads/writes KV using the \`env\` bindings.
// Press Cmd+Enter (Mac) or Ctrl+Enter to run.
//
// Top-level \`await\` is supported. Use \`return <value>\` to display a result below.
//
// Examples:
//   const v = await env.MY_NAMESPACE.get('some-key');
//   const keys = await env.MY_NAMESPACE.list({ prefix: 'user:' });
//   return keys;
//
// Docs: https://uditalias.github.io/kvault/docs/features/playground.html
`;

export function PlaygroundTab({ playgroundId, accountId }: Props) {
  const playground = usePlaygroundStore((s) => s.byId[playgroundId]);
  const updateCode = usePlaygroundStore((s) => s.updateCode);
  const updateMode = usePlaygroundStore((s) => s.updateMode);
  const namespaces = useAccountStore((s) => s.namespacesMap[accountId] ?? []);
  const openKeyTab = useTabStore((s) => s.openKeyTab);
  const theme = useSettingsStore((s) => s.theme);

  const [status, setStatus] = useState<RunStatus>('idle');
  const [consoleOpen, setConsoleOpen] = useState(true);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const consoleRef = useRef<PlaygroundConsoleHandle | null>(null);
  const consolePanelRef = useRef<PanelImperativeHandle | null>(null);
  const activeRunRef = useRef<PlaygroundRun | null>(null);
  const localCodeRef = useRef<string>(playground?.code ?? '');
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    localCodeRef.current = playground?.code ?? '';
  }, [playground?.id]);

  // Register the per-account Env type whenever Monaco is ready and namespaces change.
  useEffect(() => {
    if (!monacoRef.current) return;
    registerAccountEnvType(monacoRef.current, accountId, namespaces);
  }, [accountId, namespaces]);

  // Drive the console Panel's collapse/expand from the toolbar toggle.
  useEffect(() => {
    const panel = consolePanelRef.current;
    if (!panel) return;
    if (consoleOpen) panel.expand();
    else panel.collapse();
  }, [consoleOpen]);

  const handleEditorMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
      editorRef.current = ed;
      monacoRef.current = monaco;

      // Hook up Monaco theme that matches the app theme.
      registerAllMonacoThemes(monaco);
      monaco.editor.setTheme(getMonacoThemeName(theme));

      // Monaco 0.55 exposes the TypeScript API at `monaco.languages.typescript`
      // at runtime. The .d.ts marks that path as deprecated in favor of a new
      // top-level `monaco.typescript`, but the new namespace doesn't actually
      // exist at runtime in this version (touching it throws). Cast past the
      // deprecated type and use the path that actually works.
      //
      // Use Monaco's defaults for `lib` — overriding with specific names
      // (e.g. 'es2022') that Monaco's bundled libs don't expose under those
      // exact keys disables the built-in lib entirely, which kills
      // autocomplete for `console`, `Promise`, `Array`, etc.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ts: any = (monaco.languages as any).typescript;
      ts.typescriptDefaults.setCompilerOptions({
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        allowNonTsExtensions: true,
        strict: true,
        noImplicitAny: false,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
      });

      // Our runtime wraps every script in an async function before transpile,
      // so top-level await and top-level return are both valid in practice.
      // The editor's TS worker sees the file as a script and flags them —
      // silence those specific diagnostics:
      //   TS1108 — 'return' statement can only be used within a function body
      //   TS1375 — 'await' only allowed at top level of a module
      //   TS1378 — Top-level 'await' requires specific module options
      ts.typescriptDefaults.setDiagnosticsOptions({
        diagnosticCodesToIgnore: [1108, 1375, 1378],
      });

      // Register the per-account Env type immediately now that Monaco is available.
      registerAccountEnvType(monaco, accountId, namespaces);

      // Run shortcut: Cmd/Ctrl+Enter. Dispatch the window event rather than
      // calling handleRun directly — Monaco registers this callback once on
      // mount, so a direct call would capture the initial handleRun closure
      // and a stale playground.mode. The window listener in this component
      // re-binds on every handleRun change and always sees current state.
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        window.dispatchEvent(new CustomEvent('kvault:run-playground'));
      });
    },
    [accountId, namespaces, theme],
  );

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(getMonacoThemeName(theme));
    }
  }, [theme]);

  const persistCode = useCallback(
    (code: string) => {
      if (!playground) return;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void updateCode(playground.id, code).catch(() => {
          /* surfaced via toast elsewhere; keep quiet here */
        });
        saveTimerRef.current = null;
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [playground?.id, updateCode],
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const code = value ?? '';
      localCodeRef.current = code;
      persistCode(code);
    },
    [persistCode],
  );

  const handleModeChange = useCallback(
    async (nextMode: PlaygroundMode) => {
      if (!playground) return;
      await updateMode(playground.id, nextMode);
    },
    [playground?.id, updateMode],
  );

  const handleKeyLinkClick = useCallback(
    (namespaceId: string, keyName: string) => {
      openKeyTab(accountId, namespaceId, keyName, false);
    },
    [accountId, openKeyTab],
  );

  const handleRun = useCallback(async () => {
    if (!playground) return;
    const cons = consoleRef.current;
    if (!cons) return;

    // Confirm if one is already in flight.
    if (activeRunRef.current && (status === 'running' || status === 'transpiling')) {
      const proceed = window.confirm(
        'A run is already in progress. Cancel and start a new one?',
      );
      if (!proceed) return;
      await activeRunRef.current.cancel();
    }

    // Ensure the console is visible so the user can see the run output even
    // if they had collapsed the drawer.
    setConsoleOpen(true);

    cons.clear();
    cons.writeSystem(
      `— Running ${playground.mode === 'live' ? 'LIVE' : 'read-only'} —`,
      playground.mode === 'live' ? 'yellow' : 'gray',
    );

    const run = new PlaygroundRun({
      accountId,
      mode: playground.mode,
      code: localCodeRef.current,
      namespaces,
      events: {
        onStatus: setStatus,
        onLog: (level, args) => cons.writeLog(level, args),
        onResult: (value) => cons.writeResult(value),
        onError: (msg, stack) => cons.writeError(msg, stack),
      },
    });
    activeRunRef.current = run;
    await run.start(localCodeRef.current, namespaces);
  }, [accountId, namespaces, playground?.id, playground?.mode, status]);

  const handleStop = useCallback(async () => {
    if (!activeRunRef.current) return;
    await activeRunRef.current.cancel();
  }, []);

  // Register a window handler so the keyboard shortcut / command palette can
  // trigger the active playground tab's run without prop-drilling.
  useEffect(() => {
    const runListener = () => {
      void handleRun();
    };
    const stopListener = () => {
      void handleStop();
    };
    window.addEventListener('kvault:run-playground', runListener);
    window.addEventListener('kvault:stop-playground', stopListener);
    return () => {
      window.removeEventListener('kvault:run-playground', runListener);
      window.removeEventListener('kvault:stop-playground', stopListener);
    };
  }, [handleRun, handleStop]);

  // Confirm before closing the tab if a run is active.
  useEffect(() => {
    if (!playground) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (status === 'running' || status === 'transpiling') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [playground?.id, status]);

  if (!playground) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[var(--text-secondary)]">
        Playground not loaded.
      </div>
    );
  }

  const isRunning = status === 'running' || status === 'transpiling';
  const isEmpty = !localCodeRef.current.trim();

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              type="button"
              onClick={() => void handleStop()}
              className="flex items-center gap-1.5 h-[26px] px-2.5 rounded text-xs bg-[var(--warning)]/15 text-[var(--warning)] hover:bg-[var(--warning)]/25 transition-colors"
              title="Stop (Cmd/Ctrl+.)"
            >
              <Square size={12} />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleRun()}
              className="flex items-center gap-1.5 h-[26px] px-2.5 rounded text-xs bg-[var(--accent)] text-white hover:opacity-90 transition-colors"
              title="Run (Cmd/Ctrl+Enter)"
            >
              <Play size={12} />
              <span>Run</span>
            </button>
          )}
          <span className="text-xs text-[var(--text-secondary)]">
            {status === 'idle' && 'Ready'}
            {status === 'transpiling' && 'Compiling…'}
            {status === 'running' && 'Running…'}
            {status === 'cancelling' && 'Cancelling…'}
            {status === 'done' && 'Done'}
            {status === 'error' && 'Error'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PlaygroundModeToggle
            mode={playground.mode}
            disabled={isRunning}
            onChange={(m) => void handleModeChange(m)}
          />
        </div>
      </div>

      {/* Empty-state banner */}
      {isEmpty && (
        <div className="px-3 py-2 text-xs text-[var(--text-secondary)] border-b border-[var(--border)]">
          Playgrounds let you read and write KV data using the Cloudflare
          Workers <code>env</code> bindings. No network, DOM, or filesystem
          access — just your namespaces.{' '}
          <a
            className="text-[var(--accent)] hover:underline cursor-pointer"
            href="https://uditalias.github.io/kvault/docs/features/playground.html"
            onClick={(e) => {
              e.preventDefault();
              void openUrl('https://uditalias.github.io/kvault/docs/features/playground.html');
            }}
          >
            See docs
          </a>
          .
        </div>
      )}

      {/* Split: editor on top, console on bottom. Console is collapsible via
          the Panel's imperative API so the tree stays stable — Monaco and
          xterm keep their state across toggles. */}
      <div className="flex-1 min-h-0">
        <Group
          orientation="vertical"
          id={`kvault-playground-${playground.id}`}
          className="h-full"
        >
          <Panel defaultSize="65%" minSize={150}>
            <Editor
              height="100%"
              language="typescript"
              path={`playground-${playground.id}.ts`}
              defaultValue={playground.code || SAMPLE_CODE}
              onMount={handleEditorMount}
              onChange={handleChange}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              theme={getMonacoThemeName(theme)}
            />
          </Panel>
          <Separator className="h-0.5 bg-[var(--border)] hover:bg-[var(--accent)] transition-colors cursor-row-resize outline-none" />
          <Panel
            panelRef={consolePanelRef}
            defaultSize="35%"
            minSize={10}
            collapsible
            collapsedSize={`${CONSOLE_HEADER_HEIGHT_PX}px`}
            onResize={(size) => {
              // Keep `consoleOpen` in sync with drag-to-collapse. At or below
              // the header height the panel is effectively collapsed (only
              // the header strip is showing).
              const collapsed = size.inPixels <= CONSOLE_HEADER_HEIGHT_PX + 1;
              if (collapsed && consoleOpen) setConsoleOpen(false);
              else if (!collapsed && !consoleOpen) setConsoleOpen(true);
            }}
          >
            <div className="h-full w-full flex flex-col bg-[var(--bg-secondary)] overflow-hidden">
              <ConsoleHeader
                open={consoleOpen}
                onToggle={() => setConsoleOpen((v) => !v)}
                onClear={() => consoleRef.current?.clear()}
                onCopy={() => void consoleRef.current?.copyAll()}
              />
              {/* Hide the terminal area entirely while collapsed so the
                  xterm viewport (and any scroll track) don't peek out under
                  the header strip. Mount is preserved so scrollback and
                  theme survive toggle cycles; the ResizeObserver inside
                  PlaygroundConsole re-fits on re-show. */}
              <div
                className={`flex-1 min-h-0 pl-2 ${consoleOpen ? '' : 'hidden'}`}
              >
                <PlaygroundConsole
                  ref={consoleRef}
                  onKeyLinkClick={handleKeyLinkClick}
                />
              </div>
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  );
}

// Avoid unused-import warnings when feature flags strip parts.
void useMemo;
