import type { Namespace, PlaygroundMode } from '../tauri';
import * as api from '../tauri';
import { buildWorkerScript } from './runtime';
import { buildNamespaceIdentMap } from './envTypes';
import { handleRpcRequest, type RpcContext } from './rpcHandler';
import type { RuntimeMessage, RpcReply } from './rpcTypes';

// esbuild-wasm is lazy-loaded on first run. The binary is bundled locally
// (imported via Vite's `?url` so it's emitted as a fingerprinted static asset).
import esbuildWasmUrl from 'esbuild-wasm/esbuild.wasm?url';

type EsbuildModule = typeof import('esbuild-wasm');

// esbuild-wasm's `initialize` is process-global — calling it twice throws
// "Cannot call initialize more than once". In dev, Vite's HMR reloads this
// module when runtime code changes, which would wipe a module-scoped cache
// even though the underlying WASM is still initialized. Park the singleton on
// globalThis so it survives module reloads.
const ESBUILD_CACHE_KEY = '__kvaultEsbuild';

interface EsbuildCache {
  mod?: EsbuildModule;
  promise?: Promise<EsbuildModule>;
}

function getCache(): EsbuildCache {
  const g = globalThis as unknown as Record<string, EsbuildCache | undefined>;
  if (!g[ESBUILD_CACHE_KEY]) g[ESBUILD_CACHE_KEY] = {};
  return g[ESBUILD_CACHE_KEY]!;
}

async function getEsbuild(): Promise<EsbuildModule> {
  const cache = getCache();
  if (cache.mod) return cache.mod;
  if (cache.promise) return cache.promise;
  cache.promise = (async () => {
    const mod = (await import('esbuild-wasm')) as unknown as EsbuildModule;
    // Fetch + compile the WASM on the main thread rather than letting esbuild's
    // internal machinery do it. Tauri's production custom scheme under
    // WKWebView silently hangs esbuild's worker path; running esbuild
    // in-process with a pre-compiled Module avoids it. Content-Type from the
    // scheme isn't always application/wasm so avoid compileStreaming.
    const res = await fetch(esbuildWasmUrl);
    if (!res.ok) throw new Error(`Failed to load esbuild wasm: ${res.status}`);
    const wasmModule = await WebAssembly.compile(await res.arrayBuffer());
    try {
      await mod.initialize({ wasmModule, worker: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/more than once/i.test(msg)) throw err;
    }
    cache.mod = mod;
    return mod;
  })();
  return cache.promise;
}

export type RunStatus =
  | 'idle'
  | 'transpiling'
  | 'running'
  | 'cancelling'
  | 'done'
  | 'error';

export interface RunEvents {
  onStatus: (status: RunStatus) => void;
  onLog: (level: 'log' | 'info' | 'warn' | 'error' | 'debug', args: unknown[]) => void;
  onResult: (returnValue: unknown) => void;
  onError: (message: string, stack?: string) => void;
}

export interface RunParams {
  accountId: string;
  mode: PlaygroundMode;
  code: string;
  namespaces: Namespace[];
  events: RunEvents;
}

function randomRunId(): string {
  // Crypto.randomUUID is available in modern webviews.
  if (
    typeof crypto !== 'undefined' &&
    'randomUUID' in crypto &&
    typeof crypto.randomUUID === 'function'
  ) {
    return (crypto as Crypto).randomUUID();
  }
  return 'run-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class PlaygroundRun {
  readonly runId: string;
  readonly mode: PlaygroundMode;
  private readonly accountId: string;
  private readonly events: RunEvents;
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private messageListener: ((ev: MessageEvent) => void) | null = null;
  private errorListener: ((ev: ErrorEvent) => void) | null = null;
  private teardownCalled = false;
  private status: RunStatus = 'idle';

  constructor(params: RunParams) {
    this.runId = randomRunId();
    this.mode = params.mode;
    this.accountId = params.accountId;
    this.events = params.events;
  }

  private setStatus(s: RunStatus) {
    this.status = s;
    this.events.onStatus(s);
  }

  async start(code: string, namespaces: Namespace[]): Promise<void> {
    this.setStatus('transpiling');
    let transpiled: string;
    try {
      const esbuild = await getEsbuild();
      // Wrap the user's source in an async function BEFORE transpiling so that
      // top-level `return <value>` is syntactically inside a function body —
      // otherwise esbuild rejects it as "A return statement cannot be used
      // here". Top-level `await` is also valid in this wrapper's body.
      // The runtime template then calls __kvaultMain() and captures its return.
      const wrapped = `async function __kvaultMain() {\n${code}\n}`;
      const result = await esbuild.transform(wrapped, {
        loader: 'ts',
        target: 'es2022',
        sourcemap: 'inline',
      });
      transpiled = result.code;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.events.onError(`Compile error: ${msg}`);
      this.setStatus('error');
      return;
    }

    const identMap = buildNamespaceIdentMap(namespaces);
    const bindings: Array<{ ident: string; namespaceId: string }> = [];
    for (const ns of namespaces) {
      const ident = identMap.get(ns.id);
      if (ident) bindings.push({ ident, namespaceId: ns.id });
    }

    const workerScript = buildWorkerScript({
      transpiledCode: transpiled,
      bindings,
    });

    // Worker-as-sandbox: blob: worker URL is allowed by our CSP
    // (worker-src 'self' blob:). The worker has no DOM, no window, no
    // __TAURI__ — the only escape is postMessage back to us.
    const blob = new Blob([workerScript], { type: 'text/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    this.worker = worker;
    this.workerUrl = workerUrl;

    const rpcCtx: RpcContext = {
      runId: this.runId,
      accountId: this.accountId,
      mode: this.mode,
    };

    const listener = async (ev: MessageEvent) => {
      const msg = ev.data as RuntimeMessage;
      if (!msg || typeof msg !== 'object') return;
      if (msg.kind === 'ready') {
        this.setStatus('running');
        return;
      }
      if (msg.kind === 'log') {
        this.events.onLog(msg.level, msg.args);
        return;
      }
      if (msg.kind === 'done') {
        this.events.onResult(msg.returnValue);
        this.setStatus('done');
        await this.cleanup();
        return;
      }
      if (msg.kind === 'error') {
        this.events.onError(msg.message, msg.stack);
        this.setStatus('error');
        await this.cleanup();
        return;
      }
      if (msg.kind === 'rpc') {
        const reply: RpcReply = {
          kind: 'rpc-reply',
          id: msg.id,
          ok: true,
        };
        try {
          reply.result = await handleRpcRequest(rpcCtx, msg);
        } catch (err) {
          reply.ok = false;
          reply.error = err instanceof Error ? err.message : String(err);
        }
        if (!this.teardownCalled && this.worker) {
          this.worker.postMessage(reply);
        }
      }
    };
    this.messageListener = listener;
    worker.addEventListener('message', listener);

    // Surface uncaught worker errors (syntax errors, thrown-but-unhandled,
    // etc.) so the user gets a real message instead of a silent hang.
    const onError = (ev: ErrorEvent) => {
      if (this.teardownCalled) return;
      const msg = ev.message || 'Uncaught worker error';
      this.events.onError(msg);
      this.setStatus('error');
      void this.cleanup();
    };
    this.errorListener = onError;
    worker.addEventListener('error', onError);
  }

  async cancel(): Promise<void> {
    if (this.status === 'done' || this.status === 'error' || this.status === 'cancelling') {
      return;
    }
    this.setStatus('cancelling');
    try {
      await api.pgCancelRun(this.runId);
    } catch {
      // Best effort — even if the cancel command fails, we still tear down locally.
    }
    await this.cleanup();
    this.events.onLog('log', ['%cRun cancelled.']);
    this.setStatus('error'); // terminal; not a natural 'done'
  }

  private async cleanup(): Promise<void> {
    if (this.teardownCalled) return;
    this.teardownCalled = true;
    if (this.worker) {
      try {
        this.worker.postMessage({ kind: 'teardown' });
      } catch {
        // ignore
      }
      if (this.messageListener) {
        this.worker.removeEventListener('message', this.messageListener);
      }
      if (this.errorListener) {
        this.worker.removeEventListener('error', this.errorListener);
      }
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    this.messageListener = null;
    this.errorListener = null;
    if (this.workerUrl) {
      try {
        URL.revokeObjectURL(this.workerUrl);
      } catch {
        // ignore
      }
      this.workerUrl = null;
    }
    // Let Rust drop the cancellation token from its registry.
    try {
      await api.pgRunComplete(this.runId);
    } catch {
      // Best effort cleanup
    }
  }
}
