// Ambient type declarations for the KV binding inside playgrounds. Registered
// with Monaco via addExtraLib so users get autocomplete and hover docs.
// Mirrors the Cloudflare Workers KVNamespace surface — read/write/delete/list —
// exactly as documented at https://developers.cloudflare.com/kv/api/.

declare type KVValueType = 'text' | 'json' | 'arrayBuffer' | 'stream';

declare interface KVNamespaceListKey<Metadata = unknown> {
  name: string;
  expiration?: number;
  metadata?: Metadata;
}

declare interface KVNamespaceListResult<Metadata = unknown> {
  keys: KVNamespaceListKey<Metadata>[];
  list_complete: boolean;
  cursor?: string;
}

declare interface KVNamespaceListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

declare interface KVNamespaceGetOptions {
  type?: KVValueType;
  cacheTtl?: number;
}

declare interface KVNamespaceGetWithMetadataResult<Value, Metadata = unknown> {
  value: Value | null;
  metadata: Metadata | null;
}

declare interface KVNamespacePutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: unknown;
}

declare interface KVNamespace {
  // --- get: single key ---
  get(key: string, type?: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<unknown | null>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  get(key: string, options?: KVNamespaceGetOptions): Promise<string | null>;

  // --- get: bulk ---
  get(keys: string[], type?: 'text'): Promise<Map<string, string | null>>;
  get(keys: string[], type: 'json'): Promise<Map<string, unknown | null>>;
  get(keys: string[], options?: KVNamespaceGetOptions): Promise<Map<string, string | null>>;

  // --- getWithMetadata: single key ---
  getWithMetadata<Metadata = unknown>(
    key: string,
    type?: 'text',
  ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: 'json',
  ): Promise<KVNamespaceGetWithMetadataResult<unknown, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: 'arrayBuffer',
  ): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: 'stream',
  ): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    options?: KVNamespaceGetOptions,
  ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;

  // --- getWithMetadata: bulk ---
  getWithMetadata<Metadata = unknown>(
    keys: string[],
    type?: 'text',
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
  getWithMetadata<Metadata = unknown>(
    keys: string[],
    type: 'json',
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<unknown, Metadata>>>;

  // --- put ---
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVNamespacePutOptions,
  ): Promise<void>;

  // --- delete ---
  delete(key: string): Promise<void>;

  // --- list ---
  list<Metadata = unknown>(
    options?: KVNamespaceListOptions,
  ): Promise<KVNamespaceListResult<Metadata>>;
}

// `env` is declared per-account in envTypes.ts with the concrete namespace
// bindings. We intentionally do NOT declare a wildcard `[name: string]: KVNamespace`
// index signature here — that would silence the type error on a mistyped
// binding name (env.reporting when the real binding is env.Reporting), letting
// the user ship a script that fails at runtime instead of compile time.
