import type * as Monaco from 'monaco-editor';
import type { Namespace } from '../tauri';
import kvBindingSource from './kv-binding.d.ts?raw';

const STATIC_LIB_PATH = 'file:///kvault/kv-binding.d.ts';

let staticRegistered = false;
const perAccountDisposers = new Map<string, Monaco.IDisposable>();

/**
 * Normalize a Cloudflare namespace title into a valid JS identifier.
 * Rules:
 *   - preserve original case (so what the user sees in the tree matches what they type)
 *   - non [A-Za-z0-9_] → '_'
 *   - if leading char is a digit, prefix with '_'
 *   - if the identifier collides with another (case-sensitive), suffix '_<n>'
 */
export function normalizeNamespaceTitle(
  title: string,
  existing: Set<string>,
): string {
  let ident = title.replace(/[^A-Za-z0-9_]/g, '_');
  if (!ident) ident = '_';
  if (/^[0-9]/.test(ident)) ident = `_${ident}`;

  if (!existing.has(ident)) return ident;
  let i = 2;
  while (existing.has(`${ident}_${i}`)) i++;
  return `${ident}_${i}`;
}

/**
 * Build an identifier map for the given namespaces. Exposed so the runtime
 * and the UI can share the same mapping (title → JS identifier).
 */
export function buildNamespaceIdentMap(
  namespaces: Namespace[],
): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const ns of namespaces) {
    const ident = normalizeNamespaceTitle(ns.title, used);
    used.add(ident);
    map.set(ns.id, ident);
  }
  return map;
}

/**
 * Register the static KVNamespace / Env declarations with Monaco. Idempotent.
 *
 * Monaco 0.55 only exposes the TypeScript API at `monaco.languages.typescript`
 * at runtime — the new top-level `monaco.typescript` is type-only in this
 * version. Cast past the deprecated-typed access.
 */
export function ensureStaticBindingRegistered(
  monaco: typeof Monaco,
): void {
  if (staticRegistered) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts: any = (monaco.languages as any).typescript;
  ts.typescriptDefaults.addExtraLib(kvBindingSource, STATIC_LIB_PATH);
  staticRegistered = true;
}

/**
 * Register (or replace) the per-account concrete Env type with Monaco. The
 * previous registration for this account is disposed before the new one is
 * added, so stale namespaces don't linger in autocomplete.
 */
export function registerAccountEnvType(
  monaco: typeof Monaco,
  accountId: string,
  namespaces: Namespace[],
): Map<string, string> {
  ensureStaticBindingRegistered(monaco);

  const identMap = buildNamespaceIdentMap(namespaces);

  const lines: string[] = [
    `// Auto-generated from namespaces on account ${accountId}.`,
    `// Regenerated whenever the namespace list for this account changes.`,
    `interface Env {`,
  ];
  for (const ns of namespaces) {
    const ident = identMap.get(ns.id)!;
    lines.push(`  /** ${ns.title} (${ns.id}) */`);
    lines.push(`  ${ident}: KVNamespace;`);
  }
  lines.push(`}`);
  lines.push(`declare const env: Env;`);
  // `self` in a Worker is the global — we expose the same bindings on it so
  // scripts written against the original mental model (self.MY_NS) also work.
  lines.push(`declare const self: Env & typeof globalThis;`);

  const src = lines.join('\n');
  const libPath = `file:///kvault/env-${accountId}.d.ts`;

  // Dispose previous registration for this account before adding the new one.
  const prev = perAccountDisposers.get(accountId);
  if (prev) {
    prev.dispose();
    perAccountDisposers.delete(accountId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts: any = (monaco.languages as any).typescript;
  const disposable = ts.typescriptDefaults.addExtraLib(src, libPath);
  perAccountDisposers.set(accountId, disposable);

  return identMap;
}

/**
 * Drop the Env registration for an account (called when the account is removed).
 */
export function unregisterAccountEnvType(accountId: string): void {
  const prev = perAccountDisposers.get(accountId);
  if (prev) {
    prev.dispose();
    perAccountDisposers.delete(accountId);
  }
}
