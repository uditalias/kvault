import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// === Types (must match Rust structs) ===

export interface Account {
  id: string;
  name: string;
  cloudflare_account_id: string;
  created_at: string;
  updated_at: string;
}

export interface Namespace {
  id: string;
  account_id: string;
  title: string;
  created_at: string;
}

export interface NamespaceRefreshResult {
  current: Namespace[];
  added: string[];
  removed: string[];
}

export interface KeyRow {
  id: number;
  namespace_id: string;
  key_name: string;
  expiration: number | null;
  synced_at: string;
}

export interface KeyListResult {
  keys: KeyRow[];
  total: number;
}

export interface ValueResult {
  data: number[]; // Vec<u8> serialized as number array
  is_json: boolean;
  size: number;
}

export interface BulkDeleteResult {
  deleted: number;
  failed: string[];
}

export interface SyncStatus {
  namespace_id: string;
  last_synced_at: string | null;
  total_keys: number;
  status: string; // 'idle' | 'syncing' | 'error'
}

// Event payloads

export interface SyncProgressEvent {
  namespace_id: string;
  fetched: number;
  total_estimate: number | null;
}

export interface SyncCompleteEvent {
  namespace_id: string;
  total_keys: number;
}

export interface SyncErrorEvent {
  namespace_id: string;
  error: string;
}

// === Account Commands ===

export const addAccount = (name: string, cfAccountId: string, apiToken: string) =>
  invoke<Account>('add_account', { name, cfAccountId, apiToken });

export const listAccounts = () =>
  invoke<Account[]>('list_accounts');

export const updateAccount = (id: string, name: string, cfAccountId: string, apiToken?: string) =>
  invoke<void>('update_account', { id, name, cfAccountId, apiToken });

export const removeAccount = (id: string) =>
  invoke<void>('remove_account', { id });

export const validateToken = (cfAccountId: string, apiToken: string) =>
  invoke<boolean>('validate_token', { cfAccountId, apiToken });

// === Namespace Commands ===

export const listNamespaces = (accountId: string) =>
  invoke<Namespace[]>('list_namespaces', { accountId });

export const refreshNamespaces = (accountId: string) =>
  invoke<NamespaceRefreshResult>('refresh_namespaces', { accountId });

export interface GlobalSearchResult {
  namespace_id: string;
  namespace_title: string;
  account_id: string;
  keys: KeyRow[];
  total_matches: number;
}

// === Key Commands ===

export const getCachedKeys = (
  namespaceId: string,
  filter: string | null,
  offset: number,
  limit: number,
  caseSensitive: boolean = false,
  wholeWord: boolean = false,
  isRegex: boolean = false,
) =>
  invoke<KeyListResult>('get_cached_keys', { namespaceId, filter, offset, limit, caseSensitive, wholeWord, isRegex });

export const searchKeysGlobal = (query: string, caseSensitive: boolean, wholeWord: boolean, isRegex: boolean, limit: number) =>
  invoke<GlobalSearchResult[]>('search_keys_global', { query, caseSensitive, wholeWord, isRegex, limit });

export const getValue = (accountId: string, namespaceId: string, keyName: string) =>
  invoke<ValueResult>('get_value', { accountId, namespaceId, keyName });

export const putValue = (accountId: string, namespaceId: string, keyName: string, value: number[], ttl?: number) =>
  invoke<void>('put_value', { accountId, namespaceId, keyName, value, ttl });

export const deleteKey = (accountId: string, namespaceId: string, keyName: string) =>
  invoke<void>('delete_key', { accountId, namespaceId, keyName });

export const bulkDeleteKeys = (accountId: string, namespaceId: string, keyNames: string[]) =>
  invoke<BulkDeleteResult>('bulk_delete_keys', { accountId, namespaceId, keyNames });

export const createKey = (accountId: string, namespaceId: string, keyName: string, value: number[], ttl?: number) =>
  invoke<void>('create_key', { accountId, namespaceId, keyName, value, ttl });

// === Sync Commands ===

export const startSync = (accountId: string, namespaceId: string) =>
  invoke<void>('start_sync', { accountId, namespaceId });

export const getSyncStatus = (namespaceId: string) =>
  invoke<SyncStatus>('get_sync_status', { namespaceId });

// === Workspace Commands ===

export interface WorkspaceRow {
  id: string;
  name: string;
  state_json: string;
  created_at: string;
  updated_at: string;
}

export const listWorkspaces = () =>
  invoke<WorkspaceRow[]>('list_workspaces');

export const saveWorkspace = (name: string, stateJson: string) =>
  invoke<WorkspaceRow>('save_workspace', { name, stateJson });

export const updateWorkspace = (id: string, name: string, stateJson: string) =>
  invoke<void>('update_workspace', { id, name, stateJson });

export const deleteWorkspace = (id: string) =>
  invoke<void>('delete_workspace', { id });

// === Saved Filter Commands ===

export interface SavedFilter {
  id: string;
  namespace_id: string;
  name: string;
  filter_type: string;
  filter_value: string;
  created_at: string;
}

export const listSavedFilters = (namespaceId: string) =>
  invoke<SavedFilter[]>('list_saved_filters', { namespaceId });

export const saveFilter = (namespaceId: string, name: string, filterType: string, filterValue: string) =>
  invoke<SavedFilter>('save_filter', { namespaceId, name, filterType, filterValue });

export const deleteSavedFilter = (id: string) =>
  invoke<void>('delete_saved_filter', { id });

// === Event Listeners ===

export const onSyncProgress = (callback: (payload: SyncProgressEvent) => void) =>
  listen<SyncProgressEvent>('sync-progress', (event) => callback(event.payload));

export const onSyncComplete = (callback: (payload: SyncCompleteEvent) => void) =>
  listen<SyncCompleteEvent>('sync-complete', (event) => callback(event.payload));

export const onSyncError = (callback: (payload: SyncErrorEvent) => void) =>
  listen<SyncErrorEvent>('sync-error', (event) => callback(event.payload));
