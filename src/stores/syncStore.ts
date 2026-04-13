import { create } from 'zustand';
import * as api from '../lib/tauri';

interface NamespaceSyncState {
  status: 'idle' | 'syncing' | 'error';
  lastSyncedAt: string | null;
  totalKeys: number;
  fetchedKeys: number;
  error?: string;
}

const DEFAULT_SYNC_STATE: NamespaceSyncState = {
  status: 'idle',
  lastSyncedAt: null,
  totalKeys: 0,
  fetchedKeys: 0,
};

interface SyncState {
  syncStatus: Record<string, NamespaceSyncState>; // namespaceId -> state

  // Actions
  startSync: (accountId: string, namespaceId: string) => Promise<void>;
  getSyncState: (namespaceId: string) => NamespaceSyncState;
  initEventListeners: () => () => void; // returns cleanup function
}

export const useSyncStore = create<SyncState>((set, get) => ({
  syncStatus: {},

  startSync: async (accountId, namespaceId) => {
    set((state) => ({
      syncStatus: {
        ...state.syncStatus,
        [namespaceId]: {
          ...DEFAULT_SYNC_STATE,
          ...state.syncStatus[namespaceId],
          status: 'syncing',
          fetchedKeys: 0,
          error: undefined,
        },
      },
    }));

    // Kick off the sync — don't await the full process, just the invoke call
    api.startSync(accountId, namespaceId).catch((error) => {
      set((state) => ({
        syncStatus: {
          ...state.syncStatus,
          [namespaceId]: {
            ...state.syncStatus[namespaceId],
            ...DEFAULT_SYNC_STATE,
            status: 'error',
            error: String(error),
          },
        },
      }));
    });
  },

  getSyncState: (namespaceId) => {
    return get().syncStatus[namespaceId] ?? { ...DEFAULT_SYNC_STATE };
  },

  initEventListeners: () => {
    const unlistenPromises: Promise<() => void>[] = [];

    unlistenPromises.push(
      api.onSyncProgress((payload) => {
        set((state) => ({
          syncStatus: {
            ...state.syncStatus,
            [payload.namespace_id]: {
              ...DEFAULT_SYNC_STATE,
              ...state.syncStatus[payload.namespace_id],
              fetchedKeys: payload.fetched,
              totalKeys: payload.total_estimate ?? state.syncStatus[payload.namespace_id]?.totalKeys ?? 0,
            },
          },
        }));
      }),
    );

    unlistenPromises.push(
      api.onSyncComplete((payload) => {
        set((state) => ({
          syncStatus: {
            ...state.syncStatus,
            [payload.namespace_id]: {
              status: 'idle',
              lastSyncedAt: new Date().toISOString(),
              totalKeys: payload.total_keys,
              fetchedKeys: payload.total_keys,
              error: undefined,
            },
          },
        }));
      }),
    );

    unlistenPromises.push(
      api.onSyncError((payload) => {
        set((state) => ({
          syncStatus: {
            ...state.syncStatus,
            [payload.namespace_id]: {
              ...DEFAULT_SYNC_STATE,
              ...state.syncStatus[payload.namespace_id],
              status: 'error',
              error: payload.error,
            },
          },
        }));
      }),
    );

    // Return cleanup function that calls all unlistens
    return () => {
      unlistenPromises.forEach((promise) => {
        promise.then((unlisten) => unlisten()).catch(() => {
          // Listener already cleaned up
        });
      });
    };
  },
}));
