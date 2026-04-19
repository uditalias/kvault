import * as api from '../tauri';
import type { PlaygroundMode } from '../tauri';
import type { RpcRequest } from './rpcTypes';

export interface RpcContext {
  runId: string;
  accountId: string;
  /** Mode snapshot captured at run start. Mid-run toggles don't affect the active run. */
  mode: PlaygroundMode;
}

const READ_ONLY_MSG =
  'KVault: playground is in Read-only mode. Toggle the mode in the tab header to enable writes.';

export async function handleRpcRequest(
  ctx: RpcContext,
  req: RpcRequest,
): Promise<unknown> {
  switch (req.method) {
    case 'get': {
      if (Array.isArray(req.keys)) {
        return api.pgGetBulk(ctx.runId, ctx.accountId, req.namespaceId, req.keys);
      }
      return api.pgGet(ctx.runId, ctx.accountId, req.namespaceId, req.keys);
    }
    case 'getWithMetadata': {
      if (Array.isArray(req.keys)) {
        return api.pgGetBulkWithMetadata(
          ctx.runId,
          ctx.accountId,
          req.namespaceId,
          req.keys,
        );
      }
      return api.pgGetWithMetadata(
        ctx.runId,
        ctx.accountId,
        req.namespaceId,
        req.keys,
      );
    }
    case 'put': {
      if (ctx.mode === 'read-only') {
        throw new Error(READ_ONLY_MSG);
      }
      await api.pgPut(
        ctx.runId,
        ctx.accountId,
        req.namespaceId,
        req.key,
        req.value,
        req.options.expiration,
        req.options.expirationTtl,
        req.options.metadata,
      );
      return null;
    }
    case 'delete': {
      if (ctx.mode === 'read-only') {
        throw new Error(READ_ONLY_MSG);
      }
      await api.pgDelete(ctx.runId, ctx.accountId, req.namespaceId, req.key);
      return null;
    }
    case 'list': {
      return api.pgList(
        ctx.runId,
        ctx.accountId,
        req.namespaceId,
        req.options.prefix,
        req.options.limit,
        req.options.cursor,
      );
    }
    default: {
      const _exhaustive: never = req;
      throw new Error(`Unknown RPC method: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
