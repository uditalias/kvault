import { create } from 'zustand';
import { searchKeysGlobal } from '../lib/tauri';
import type { GlobalSearchResult } from '../lib/tauri';

interface SearchStore {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  results: GlobalSearchResult[] | null;
  loading: boolean;
  error: string | null;
  collapsedGroups: Set<string>;
  searchId: number;

  setQuery: (query: string) => void;
  setCaseSensitive: (value: boolean) => void;
  setWholeWord: (value: boolean) => void;
  setRegex: (value: boolean) => void;
  toggleGroup: (namespaceId: string) => void;
  runSearch: () => Promise<void>;
  clear: () => void;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  query: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  results: null,
  loading: false,
  error: null,
  collapsedGroups: new Set(),
  searchId: 0,

  setQuery: (query) => set({ query }),
  setCaseSensitive: (caseSensitive) => set({ caseSensitive }),
  setWholeWord: (wholeWord) => set({ wholeWord }),
  setRegex: (regex) => set({ regex }),

  toggleGroup: (namespaceId) => {
    const prev = get().collapsedGroups;
    const next = new Set(prev);
    if (next.has(namespaceId)) {
      next.delete(namespaceId);
    } else {
      next.add(namespaceId);
    }
    set({ collapsedGroups: next });
  },

  runSearch: async () => {
    const { query, caseSensitive, wholeWord, regex } = get();
    if (!query.trim()) {
      set({ results: null, error: null, loading: false });
      return;
    }

    const id = get().searchId + 1;
    set({ searchId: id, loading: true, error: null });

    try {
      const res = await searchKeysGlobal(query, caseSensitive, wholeWord, regex, 50);
      if (id === get().searchId) {
        set({ results: res, loading: false });
      }
    } catch (err) {
      if (id === get().searchId) {
        set({
          error: err instanceof Error ? err.message : String(err),
          results: null,
          loading: false,
        });
      }
    }
  },

  clear: () =>
    set({
      query: '',
      results: null,
      loading: false,
      error: null,
      collapsedGroups: new Set(),
    }),
}));
