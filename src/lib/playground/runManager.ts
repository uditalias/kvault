import type { Namespace, PlaygroundMode } from '../tauri';
import * as api from '../tauri';
import { buildIframeSrcdoc } from './runtime';
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
    // internal Web Worker do it. Inside a blob: worker on Tauri's custom app
    // scheme, the fetch can hang — pre-compiling here and passing the
    // WebAssembly.Module skips the worker-side fetch path entirely.
    const res = await fetch(esbuildWasmUrl);
    if (!res.ok) throw new Error(`Failed to load esbuild wasm: ${res.status}`);
    const wasmModule =
      'compileStreaming' in WebAssembly
        ? await WebAssembly.compileStreaming(res)
        : await WebAssembly.compile(await res.arrayBuffer());
    try {
      await mod.initialize({ wasmModule, worker: true });
    } catch (err) {
      // Defensive: another caller may have already initialized this WASM
      // instance. Treat "already initialized" as success and proceed.
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
  private iframe: HTMLIFrameElement | null = null;
  private messageListener: ((ev: MessageEvent) => void) | null = null;
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

    const srcdoc = buildIframeSrcdoc({
      transpiledCode: transpiled,
      bindings,
    });

    // Create an off-screen iframe attached to the document so window.parent
    // postMessages work.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.position = 'fixed';
    iframe.style.left = '-10000px';
    iframe.style.top = '-10000px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.srcdoc = srcdoc;
    this.iframe = iframe;

    const rpcCtx: RpcContext = {
      runId: this.runId,
      accountId: this.accountId,
      mode: this.mode,
    };

    const listener = async (ev: MessageEvent) => {
      if (!iframe.contentWindow || ev.source !== iframe.contentWindow) return;
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
        // Iframe may have been torn down while we awaited Rust.
        if (!this.teardownCalled && iframe.contentWindow) {
          iframe.contentWindow.postMessage(reply, '*');
        }
      }
    };
    this.messageListener = listener;
    window.addEventListener('message', listener);

    document.body.appendChild(iframe);
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
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
    if (this.iframe) {
      try {
        this.iframe.contentWindow?.postMessage({ kind: 'teardown' }, '*');
      } catch {
        // ignore
      }
      try {
        this.iframe.remove();
      } catch {
        // ignore
      }
      this.iframe = null;
    }
    // Let Rust drop the cancellation token from its registry.
    try {
      await api.pgRunComplete(this.runId);
    } catch {
      // Best effort cleanup
    }
  }
}
