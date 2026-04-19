// Message shapes exchanged between the playground iframe and the parent
// renderer. These are the ONLY way the iframe can do KV work — the iframe has
// no network access, so every read/write must come through here.

export type KVGetType = 'text' | 'json' | 'arrayBuffer' | 'stream';

export type RpcRequest =
  | {
      kind: 'rpc';
      id: string;
      method: 'get' | 'getWithMetadata';
      namespaceId: string;
      keys: string | string[];
      type: KVGetType;
    }
  | {
      kind: 'rpc';
      id: string;
      method: 'put';
      namespaceId: string;
      key: string;
      value: number[];
      options: {
        expiration?: number;
        expirationTtl?: number;
        metadata?: unknown;
      };
    }
  | {
      kind: 'rpc';
      id: string;
      method: 'delete';
      namespaceId: string;
      key: string;
    }
  | {
      kind: 'rpc';
      id: string;
      method: 'list';
      namespaceId: string;
      options: { prefix?: string; limit?: number; cursor?: string };
    };

export interface RpcReply {
  kind: 'rpc-reply';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type RuntimeMessage =
  | RpcRequest
  | { kind: 'ready' }
  | {
      kind: 'log';
      level: 'log' | 'info' | 'warn' | 'error' | 'debug';
      args: unknown[];
    }
  | { kind: 'done'; returnValue?: unknown }
  | { kind: 'error'; message: string; stack?: string };
