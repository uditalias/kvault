import { create } from 'zustand';
import * as api from '../lib/tauri';
import type { KeyRow, SavedFilter } from '../lib/tauri';

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  isRegex: boolean;
}

const DEFAULT_SEARCH_OPTIONS: SearchOptions = { caseSensitive: false, wholeWord: false, isRegex: false };

interface KeyState {
  keysMap: Record<string, KeyRow[]>; // namespaceId -> keys
  totalMap: Record<string, number>; // namespaceId -> total key count (unfiltered)
  selectedKeys: Record<string, string[]>; // namespaceId -> selected key names (array for serialization)
  filterMap: Record<string, string>; // namespaceId -> active filter string
  searchOptionsMap: Record<string, SearchOptions>; // namespaceId -> search options
  savedFilters: Record<string, SavedFilter[]>; // namespaceId -> saved filters

  loadKeys: (namespaceId: string, filter?: string, options?: SearchOptions) => Promise<void>;
  setFilter: (namespaceId: string, filter: string) => void;
  setSearchOptions: (namespaceId: string, options: SearchOptions) => void;
  getSearchOptions: (namespaceId: string) => SearchOptions;
  toggleKeySelection: (namespaceId: string, keyName: string) => void;
  selectRange: (namespaceId: string, fromIndex: number, toIndex: number) => void;
  selectAll: (namespaceId: string) => void;
  clearSelection: (namespaceId: string) => void;
  getSelectedSet: (namespaceId: string) => Set<string>;
  loadSavedFilters: (namespaceId: string) => Promise<void>;
  saveFilter: (namespaceId: string, name: string, filterType: string, filterValue: string) => Promise<void>;
  deleteFilter: (namespaceId: string, filterId: string) => Promise<void>;
  applyFilter: (namespaceId: string, filterId: string) => void;
}

export const useKeyStore = create<KeyState>((set, get) => ({
  keysMap: {},
  totalMap: {},
  selectedKeys: {},
  filterMap: {},
  searchOptionsMap: {},
  savedFilters: {},

  loadKeys: async (namespaceId, filter, options) => {
    const filterStr = filter ?? get().filterMap[namespaceId] ?? '';
    const opts = options ?? get().searchOptionsMap[namespaceId] ?? DEFAULT_SEARCH_OPTIONS;
    const result = await api.getCachedKeys(
      namespaceId,
      filterStr || null,
      0,
      100000,
      opts.caseSensitive,
      opts.wholeWord,
      opts.isRegex,
    );

    // If we loaded with a filter, also load total count (unfiltered)
    let total = result.total;
    if (filterStr) {
      const fullResult = await api.getCachedKeys(namespaceId, null, 0, 0);
      total = fullResult.total;
    }

    set((state) => ({
      keysMap: {
        ...state.keysMap,
        [namespaceId]: result.keys,
      },
      totalMap: {
        ...state.totalMap,
        [namespaceId]: total,
      },
    }));
  },

  setFilter: (namespaceId, filter) => {
    set((state) => ({
      filterMap: {
        ...state.filterMap,
        [namespaceId]: filter,
      },
    }));
  },

  setSearchOptions: (namespaceId, options) => {
    set((state) => ({
      searchOptionsMap: {
        ...state.searchOptionsMap,
        [namespaceId]: options,
      },
    }));
  },

  getSearchOptions: (namespaceId) => {
    return get().searchOptionsMap[namespaceId] ?? { ...DEFAULT_SEARCH_OPTIONS };
  },

  toggleKeySelection: (namespaceId, keyName) => {
    set((state) => {
      const current = state.selectedKeys[namespaceId] ?? [];
      const idx = current.indexOf(keyName);
      const next = idx >= 0
        ? current.filter((k) => k !== keyName)
        : [...current, keyName];

      return {
        selectedKeys: {
          ...state.selectedKeys,
          [namespaceId]: next,
        },
      };
    });
  },

  selectRange: (namespaceId, fromIndex, toIndex) => {
    const keys = get().keysMap[namespaceId] ?? [];
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const rangeNames = keys.slice(start, end + 1).map((k) => k.key_name);

    set((state) => {
      const current = new Set(state.selectedKeys[namespaceId] ?? []);
      for (const name of rangeNames) {
        current.add(name);
      }

      return {
        selectedKeys: {
          ...state.selectedKeys,
          [namespaceId]: Array.from(current),
        },
      };
    });
  },

  selectAll: (namespaceId) => {
    const keys = get().keysMap[namespaceId] ?? [];
    set((state) => ({
      selectedKeys: {
        ...state.selectedKeys,
        [namespaceId]: keys.map((k) => k.key_name),
      },
    }));
  },

  clearSelection: (namespaceId) => {
    set((state) => ({
      selectedKeys: {
        ...state.selectedKeys,
        [namespaceId]: [],
      },
    }));
  },

  getSelectedSet: (namespaceId) => {
    return new Set(get().selectedKeys[namespaceId] ?? []);
  },

  loadSavedFilters: async (namespaceId) => {
    const filters = await api.listSavedFilters(namespaceId);
    set((state) => ({
      savedFilters: {
        ...state.savedFilters,
        [namespaceId]: filters,
      },
    }));
  },

  saveFilter: async (namespaceId, name, filterType, filterValue) => {
    try {
      await api.saveFilter(namespaceId, name, filterType, filterValue);
      await get().loadSavedFilters(namespaceId);
    } catch (err) {
      console.error('Failed to save filter:', err);
      throw err;
    }
  },

  deleteFilter: async (namespaceId, filterId) => {
    try {
      await api.deleteSavedFilter(filterId);
      await get().loadSavedFilters(namespaceId);
    } catch (err) {
      console.error('Failed to delete filter:', err);
      throw err;
    }
  },

  applyFilter: (namespaceId, filterId) => {
    const filters = get().savedFilters[namespaceId] ?? [];
    const filter = filters.find((f) => f.id === filterId);
    if (filter) {
      get().setFilter(namespaceId, filter.filter_value);
      get().loadKeys(namespaceId, filter.filter_value);
    }
  },
}));
