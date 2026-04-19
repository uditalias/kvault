import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useToastStore } from '../../stores/toastStore';

export interface PlaygroundConsoleHandle {
  clear: () => void;
  writeLog: (level: 'log' | 'info' | 'warn' | 'error' | 'debug', args: unknown[]) => void;
  writeResult: (value: unknown) => void;
  writeError: (message: string, stack?: string) => void;
  writeSystem: (text: string, color?: 'gray' | 'yellow') => void;
  copyAll: () => Promise<void>;
}

interface PlaygroundConsoleProps {
  /** Click-through handler for key references rendered as web links. */
  onKeyLinkClick?: (namespaceId: string, keyName: string) => void;
}

// ANSI escape sequences for colored output in xterm.
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const C = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightYellow: '\x1b[93m',
};

const LEARN_MORE_URL =
  'https://uditalias.github.io/kvault/docs/features/playground.html#limitations';

function formatArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function colorForLevel(level: 'log' | 'info' | 'warn' | 'error' | 'debug'): string {
  switch (level) {
    case 'error':
      return C.red;
    case 'warn':
      return C.yellow;
    case 'info':
      return C.cyan;
    case 'debug':
      return C.gray;
    default:
      return '';
  }
}

function prettyJson(value: unknown): string {
  // ANSI-colorize a JSON dump a la node's util.inspect for visual scan-ability.
  const raw = (() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();
  if (raw === undefined) return '';
  return raw
    .replace(/("(?:\\.|[^"\\])*")(\s*:)/g, `${C.cyan}$1${RESET}$2`) // keys
    .replace(/: ("(?:\\.|[^"\\])*")/g, `: ${C.green}$1${RESET}`) // string values
    .replace(/: (-?\d+(?:\.\d+)?)/g, `: ${C.yellow}$1${RESET}`) // numbers
    .replace(/: (true|false|null)/g, `: ${C.magenta}$1${RESET}`);
}

export const PlaygroundConsole = forwardRef<
  PlaygroundConsoleHandle,
  PlaygroundConsoleProps
>(function PlaygroundConsole({ onKeyLinkClick }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      convertEol: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: '#00000000',
        foreground: '#d4d4d4',
      },
      allowProposedApi: true,
      scrollback: 5000,
      cursorBlink: false,
      disableStdin: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new SearchAddon());
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        // Custom handler: intercept kvault: scheme, forward ordinary URLs to OS.
        if (uri.startsWith('kvault:key:')) {
          const rest = uri.slice('kvault:key:'.length);
          const idx = rest.indexOf(':');
          if (idx !== -1) {
            const nsId = rest.slice(0, idx);
            const keyName = rest.slice(idx + 1);
            onKeyLinkClick?.(nsId, keyName);
            return;
          }
        }
        // Regular URL: hand off to the Tauri opener plugin so the OS browser
        // handles it. `window.open` is a no-op in packaged Tauri webviews.
        void openUrl(uri);
      }),
    );
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const obs = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* noop */
      }
    });
    obs.observe(containerRef.current);
    resizeObsRef.current = obs;

    return () => {
      obs.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      resizeObsRef.current = null;
    };
  }, [onKeyLinkClick]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        termRef.current?.clear();
      },
      writeLog: (level, args) => {
        const t = termRef.current;
        if (!t) return;
        const color = colorForLevel(level);
        const prefix = level === 'log' ? '' : `[${level}] `;
        const text = args.map(formatArg).join(' ');
        t.writeln(`${color}${prefix}${text}${RESET}`);
      },
      writeResult: (value) => {
        const t = termRef.current;
        if (!t) return;
        if (value === undefined) {
          t.writeln(`${DIM}(no return value)${RESET}`);
          return;
        }
        t.writeln(`${DIM}—— return value ——${RESET}`);
        const lines = prettyJson(value).split('\n');
        for (const line of lines) t.writeln(line);
      },
      writeError: (message, stack) => {
        const t = termRef.current;
        if (!t) return;
        t.writeln(`${C.brightRed}${message}${RESET}`);
        if (stack) {
          const stackLines = stack.split('\n').slice(1); // drop first line (duplicate of message)
          for (const line of stackLines) {
            t.writeln(`${C.gray}${line}${RESET}`);
          }
        }
        // Surface the docs link as a clickable URL.
        if (message.includes('not available')) {
          t.writeln(`${C.gray}Learn more: ${LEARN_MORE_URL}${RESET}`);
        }
      },
      writeSystem: (text, color = 'gray') => {
        const t = termRef.current;
        if (!t) return;
        const ansi = color === 'yellow' ? C.brightYellow : C.gray;
        t.writeln(`${ansi}${text}${RESET}`);
      },
      copyAll: async () => {
        const t = termRef.current;
        if (!t) return;
        t.selectAll();
        const text = t.getSelection();
        t.clearSelection();
        const trimmed = text.trimEnd();
        const { addToast } = useToastStore.getState();
        if (!trimmed) {
          addToast('Console is empty', 'info');
          return;
        }
        try {
          await navigator.clipboard.writeText(trimmed);
          addToast('Output copied', 'success');
        } catch {
          addToast('Copy failed', 'error');
        }
      },
    }),
    [],
  );

  return <div ref={containerRef} className="w-full h-full" />;
});
