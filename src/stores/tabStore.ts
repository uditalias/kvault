import { create } from 'zustand';

export interface Tab {
  id: string;
  type: 'namespace' | 'key' | 'settings';
  title: string;
  namespaceId: string;
  accountId: string;
  keyName?: string;
  isPreview: boolean;
  isDirty: boolean;
  isDeleted: boolean;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  recentlyClosedTabs: Tab[];

  // Actions
  openSettingsTab: () => void;
  openNamespaceTab: (accountId: string, namespaceId: string, namespaceTitle: string) => void;
  openKeyTab: (accountId: string, namespaceId: string, keyName: string, preview?: boolean) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (tabId: string) => void;
  setTabDirty: (tabId: string, dirty: boolean) => void;
  markTabsDeleted: (namespaceId: string) => void;
  markKeyTabDeleted: (namespaceId: string, keyName: string) => void;
  pinPreviewTab: (tabId: string) => void;
  reopenLastClosedTab: () => void;
}

const MAX_RECENTLY_CLOSED = 10;

function makeNamespaceTabId(namespaceId: string): string {
  return `ns:${namespaceId}`;
}

function makeKeyTabId(namespaceId: string, keyName: string): string {
  return `key:${namespaceId}:${keyName}`;
}

/**
 * After closing a tab, pick the nearest remaining tab to activate.
 * Prefers the right neighbor, then the left neighbor.
 */
function pickNextActiveTabId(tabs: Tab[], closedIndex: number): string | null {
  if (tabs.length === 0) return null;
  if (closedIndex < tabs.length) return tabs[closedIndex].id;
  return tabs[tabs.length - 1].id;
}

function addToRecentlyClosed(recentlyClosedTabs: Tab[], tab: Tab): Tab[] {
  return [tab, ...recentlyClosedTabs].slice(0, MAX_RECENTLY_CLOSED);
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  recentlyClosedTabs: [],

  openSettingsTab: () => {
    const tabId = 'settings';
    const { tabs } = get();

    // If settings tab already exists, just activate it
    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    const newTab: Tab = {
      id: tabId,
      type: 'settings',
      title: 'Settings',
      namespaceId: '',
      accountId: '',
      isPreview: false,
      isDirty: false,
      isDeleted: false,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
    }));
  },

  openNamespaceTab: (accountId, namespaceId, namespaceTitle) => {
    const tabId = makeNamespaceTabId(namespaceId);
    const { tabs } = get();

    // Duplicate detection: activate existing tab
    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    const newTab: Tab = {
      id: tabId,
      type: 'namespace',
      title: namespaceTitle,
      namespaceId,
      accountId,
      isPreview: false,
      isDirty: false,
      isDeleted: false,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
    }));
  },

  openKeyTab: (accountId, namespaceId, keyName, preview = false) => {
    const tabId = makeKeyTabId(namespaceId, keyName);
    const { tabs } = get();

    // Duplicate detection: activate existing tab (and pin if not preview)
    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      set((state) => ({
        activeTabId: tabId,
        tabs: !preview
          ? state.tabs.map((t) => (t.id === tabId ? { ...t, isPreview: false } : t))
          : state.tabs,
      }));
      return;
    }

    if (preview) {
      // Replace the existing preview tab (only one preview at a time)
      const existingPreview = tabs.find((t) => t.isPreview);
      if (existingPreview) {
        const newTab: Tab = {
          id: tabId,
          type: 'key',
          title: keyName,
          namespaceId,
          accountId,
          keyName,
          isPreview: true,
          isDirty: false,
          isDeleted: false,
        };

        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === existingPreview.id ? newTab : t)),
          activeTabId: tabId,
        }));
        return;
      }
    }

    const newTab: Tab = {
      id: tabId,
      type: 'key',
      title: keyName,
      namespaceId,
      accountId,
      keyName,
      isPreview: preview,
      isDirty: false,
      isDeleted: false,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
    }));
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    const closedTab = tabs[index];
    const remaining = tabs.filter((t) => t.id !== tabId);

    const nextActiveTabId =
      activeTabId === tabId ? pickNextActiveTabId(remaining, index) : activeTabId;

    set((state) => ({
      tabs: remaining,
      activeTabId: nextActiveTabId,
      recentlyClosedTabs: addToRecentlyClosed(state.recentlyClosedTabs, closedTab),
    }));
  },

  closeOtherTabs: (tabId) => {
    set((state) => {
      const kept = state.tabs.filter((t) => t.id === tabId);
      const closed = state.tabs.filter((t) => t.id !== tabId);
      const newRecentlyClosed = [...closed, ...state.recentlyClosedTabs].slice(
        0,
        MAX_RECENTLY_CLOSED,
      );

      return {
        tabs: kept,
        activeTabId: kept.length > 0 ? tabId : null,
        recentlyClosedTabs: newRecentlyClosed,
      };
    });
  },

  closeAllTabs: () => {
    set((state) => ({
      tabs: [],
      activeTabId: null,
      recentlyClosedTabs: [...state.tabs, ...state.recentlyClosedTabs].slice(
        0,
        MAX_RECENTLY_CLOSED,
      ),
    }));
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  setTabDirty: (tabId, dirty) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isDirty: dirty } : t)),
    }));
  },

  markTabsDeleted: (namespaceId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.namespaceId === namespaceId ? { ...t, isDeleted: true } : t,
      ),
    }));
  },

  markKeyTabDeleted: (namespaceId, keyName) => {
    const tabId = makeKeyTabId(namespaceId, keyName);
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isDeleted: true } : t)),
    }));
  },

  pinPreviewTab: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isPreview: false } : t)),
    }));
  },

  reopenLastClosedTab: () => {
    const { recentlyClosedTabs, tabs } = get();
    if (recentlyClosedTabs.length === 0) return;

    const [tabToReopen, ...remaining] = recentlyClosedTabs;

    // If a tab with the same ID already exists, just activate it
    const existing = tabs.find((t) => t.id === tabToReopen.id);
    if (existing) {
      set({
        activeTabId: existing.id,
        recentlyClosedTabs: remaining,
      });
      return;
    }

    set({
      tabs: [...tabs, { ...tabToReopen, isDeleted: false }],
      activeTabId: tabToReopen.id,
      recentlyClosedTabs: remaining,
    });
  },
}));
