import { create } from 'zustand';
import * as api from '../lib/tauri';
import { useAccountStore } from './accountStore';
import { useTabStore } from './tabStore';
import { useKeyStore } from './keyStore';
import { useLayoutStore } from './layoutStore';
import type { Tab } from './tabStore';

export interface WorkspaceState {
  accountIds: string[];
  openTabs: Tab[];
  activeTabId: string | null;
  filterMap: Record<string, string>;
  sidebarView: string;
}

export interface Workspace {
  id: string;
  name: string;
  state: WorkspaceState;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;

  loadWorkspaces: () => Promise<void>;
  saveWorkspace: (name: string) => Promise<void>;
  loadWorkspace: (id: string) => Promise<void>;
  updateWorkspace: (id: string) => Promise<void>;
  renameWorkspace: (id: string, newName: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
}

function parseWorkspaceRow(row: api.WorkspaceRow): Workspace {
  let state: WorkspaceState;
  try {
    state = JSON.parse(row.state_json);
  } catch (e) {
    console.warn(`Failed to parse workspace state for "${row.id}":`, e);
    state = {
      accountIds: [],
      openTabs: [],
      activeTabId: null,
      filterMap: {},
      sidebarView: 'accounts',
    };
  }
  return {
    id: row.id,
    name: row.name,
    state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function captureCurrentState(): WorkspaceState {
  const tabState = useTabStore.getState();
  const keyState = useKeyStore.getState();

  // Collect unique account IDs from open tabs
  const accountIds = Array.from(
    new Set(tabState.tabs.map((t) => t.accountId)),
  );

  return {
    accountIds,
    openTabs: tabState.tabs,
    activeTabId: tabState.activeTabId,
    filterMap: { ...keyState.filterMap },
    sidebarView: useLayoutStore.getState().activeView,
  };
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,

  loadWorkspaces: async () => {
    const rows = await api.listWorkspaces();
    const workspaces = rows.map(parseWorkspaceRow);
    set({ workspaces });
  },

  saveWorkspace: async (name: string) => {
    const state = captureCurrentState();
    const stateJson = JSON.stringify(state);
    const row = await api.saveWorkspace(name, stateJson);
    const workspace = parseWorkspaceRow(row);
    set((s) => ({
      workspaces: [...s.workspaces, workspace],
      activeWorkspaceId: workspace.id,
    }));
  },

  loadWorkspace: async (id: string) => {
    const workspace = get().workspaces.find((w) => w.id === id);
    if (!workspace) throw new Error(`Workspace not found: ${id}`);

    const { state } = workspace;
    const tabStore = useTabStore.getState();
    const keyStore = useKeyStore.getState();

    // Close all current tabs first
    tabStore.closeAllTabs();

    // Restore tabs — gracefully skip tabs whose accounts no longer exist
    const existingAccountIds = new Set(
      useAccountStore.getState().accounts.map((a) => a.id),
    );

    for (const tab of state.openTabs) {
      if (!existingAccountIds.has(tab.accountId)) continue;

      if (tab.type === 'namespace') {
        tabStore.openNamespaceTab(tab.accountId, tab.namespaceId, tab.title);
      } else if (tab.type === 'key' && tab.keyName) {
        tabStore.openKeyTab(
          tab.accountId,
          tab.namespaceId,
          tab.keyName,
          tab.isPreview,
        );
      }
    }

    // Restore active tab
    if (state.activeTabId) {
      const currentTabs = useTabStore.getState().tabs;
      const exists = currentTabs.some((t) => t.id === state.activeTabId);
      if (exists) {
        tabStore.setActiveTab(state.activeTabId);
      }
    }

    // Restore filter map
    for (const [namespaceId, filter] of Object.entries(state.filterMap)) {
      keyStore.setFilter(namespaceId, filter);
    }

    set({ activeWorkspaceId: id });
  },

  updateWorkspace: async (id: string) => {
    const workspace = get().workspaces.find((w) => w.id === id);
    if (!workspace) throw new Error(`Workspace not found: ${id}`);

    const state = captureCurrentState();
    const stateJson = JSON.stringify(state);
    await api.updateWorkspace(id, workspace.name, stateJson);

    // Refresh from DB to avoid timestamp format mismatch
    await get().loadWorkspaces();
  },

  renameWorkspace: async (id: string, newName: string) => {
    const workspace = get().workspaces.find((w) => w.id === id);
    if (!workspace) throw new Error(`Workspace not found: ${id}`);

    const stateJson = JSON.stringify(workspace.state);
    await api.updateWorkspace(id, newName, stateJson);

    // Refresh from DB
    await get().loadWorkspaces();
  },

  deleteWorkspace: async (id: string) => {
    await api.deleteWorkspace(id);
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId:
        s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
    }));
  },
}));
