import { create } from 'zustand';
import * as api from '../lib/tauri';
import type { Account, Namespace, NamespaceRefreshResult } from '../lib/tauri';

interface AccountState {
  accounts: Account[];
  activeAccountId: string | null;
  namespacesMap: Record<string, Namespace[]>; // accountId -> namespaces
  connectionStatus: Record<string, 'connected' | 'error' | 'loading'>; // accountId -> status

  // Actions
  loadAccounts: () => Promise<void>;
  addAccount: (name: string, cfAccountId: string, apiToken: string) => Promise<Account>;
  removeAccount: (id: string) => Promise<void>;
  updateAccount: (id: string, name: string, cfAccountId: string, apiToken?: string) => Promise<void>;
  setActiveAccount: (id: string) => void;
  loadNamespaces: (accountId: string) => Promise<void>;
  refreshNamespaces: (accountId: string) => Promise<NamespaceRefreshResult>;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  namespacesMap: {},
  connectionStatus: {},

  loadAccounts: async () => {
    const accounts = await api.listAccounts();
    set({ accounts });

    // Auto-load namespaces for each account
    for (const account of accounts) {
      get().loadNamespaces(account.id).catch(() => {
        // Error is already handled inside loadNamespaces (connectionStatus set to 'error')
      });
    }
  },

  addAccount: async (name, cfAccountId, apiToken) => {
    const account = await api.addAccount(name, cfAccountId, apiToken);

    set((state) => ({
      accounts: [...state.accounts, account],
      connectionStatus: {
        ...state.connectionStatus,
        [account.id]: 'connected',
      },
    }));

    // Auto-load namespaces for the new account
    get().loadNamespaces(account.id).catch(() => {
      // Error is already handled inside loadNamespaces
    });

    return account;
  },

  removeAccount: async (id) => {
    await api.removeAccount(id);

    set((state) => {
      const { [id]: _ns, ...restNamespaces } = state.namespacesMap;
      const { [id]: _status, ...restStatus } = state.connectionStatus;

      return {
        accounts: state.accounts.filter((a) => a.id !== id),
        namespacesMap: restNamespaces,
        connectionStatus: restStatus,
        activeAccountId: state.activeAccountId === id ? null : state.activeAccountId,
      };
    });
  },

  updateAccount: async (id, name, cfAccountId, apiToken?) => {
    await api.updateAccount(id, name, cfAccountId, apiToken);

    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.id === id
          ? { ...a, name, cloudflare_account_id: cfAccountId, updated_at: new Date().toISOString() }
          : a,
      ),
    }));
  },

  setActiveAccount: (id) => {
    set({ activeAccountId: id });
  },

  loadNamespaces: async (accountId) => {
    set((state) => ({
      connectionStatus: {
        ...state.connectionStatus,
        [accountId]: 'loading',
      },
    }));

    try {
      const result = await api.refreshNamespaces(accountId);

      set((state) => ({
        namespacesMap: {
          ...state.namespacesMap,
          [accountId]: result.current,
        },
        connectionStatus: {
          ...state.connectionStatus,
          [accountId]: 'connected',
        },
      }));
    } catch (error) {
      set((state) => ({
        connectionStatus: {
          ...state.connectionStatus,
          [accountId]: 'error',
        },
      }));
      throw error;
    }
  },

  refreshNamespaces: async (accountId) => {
    set((state) => ({
      connectionStatus: {
        ...state.connectionStatus,
        [accountId]: 'loading',
      },
    }));

    try {
      const result = await api.refreshNamespaces(accountId);

      set((state) => ({
        namespacesMap: {
          ...state.namespacesMap,
          [accountId]: result.current,
        },
        connectionStatus: {
          ...state.connectionStatus,
          [accountId]: 'connected',
        },
      }));

      return result;
    } catch (error) {
      set((state) => ({
        connectionStatus: {
          ...state.connectionStatus,
          [accountId]: 'error',
        },
      }));
      throw error;
    }
  },
}));
