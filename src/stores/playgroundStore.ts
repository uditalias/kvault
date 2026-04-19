import { create } from 'zustand';
import * as api from '../lib/tauri';
import type { Playground, PlaygroundMode } from '../lib/tauri';

interface PlaygroundState {
  // accountId → list of playgrounds (newest-first); undefined = not loaded yet
  playgroundsMap: Record<string, Playground[]>;
  // id → playground (flat index for fast lookup from tabs)
  byId: Record<string, Playground>;

  loadPlaygrounds: (accountId: string) => Promise<void>;
  createPlayground: (accountId: string, name: string) => Promise<Playground>;
  updateCode: (id: string, code: string) => Promise<void>;
  updateName: (id: string, name: string) => Promise<void>;
  updateMode: (id: string, mode: PlaygroundMode) => Promise<void>;
  deletePlayground: (id: string) => Promise<void>;
  exportPlaygroundContent: (id: string) => Promise<string>;
  importPlayground: (accountId: string, name: string, code: string) => Promise<Playground>;

  getPlayground: (id: string) => Playground | undefined;
}

function upsertInList(list: Playground[], pg: Playground): Playground[] {
  const idx = list.findIndex((p) => p.id === pg.id);
  if (idx === -1) return [pg, ...list];
  const next = list.slice();
  next[idx] = pg;
  return next;
}

function removeFromList(list: Playground[], id: string): Playground[] {
  return list.filter((p) => p.id !== id);
}

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  playgroundsMap: {},
  byId: {},

  loadPlaygrounds: async (accountId) => {
    const pgs = await api.listPlaygrounds(accountId);
    set((state) => {
      const nextById = { ...state.byId };
      for (const pg of pgs) nextById[pg.id] = pg;
      return {
        playgroundsMap: { ...state.playgroundsMap, [accountId]: pgs },
        byId: nextById,
      };
    });
  },

  createPlayground: async (accountId, name) => {
    const pg = await api.createPlayground(accountId, name);
    set((state) => ({
      playgroundsMap: {
        ...state.playgroundsMap,
        [accountId]: upsertInList(state.playgroundsMap[accountId] ?? [], pg),
      },
      byId: { ...state.byId, [pg.id]: pg },
    }));
    return pg;
  },

  updateCode: async (id, code) => {
    await api.updatePlaygroundCode(id, code);
    set((state) => {
      const existing = state.byId[id];
      if (!existing) return state;
      const updated: Playground = {
        ...existing,
        code,
        updated_at: new Date().toISOString(),
      };
      return {
        byId: { ...state.byId, [id]: updated },
        playgroundsMap: {
          ...state.playgroundsMap,
          [existing.account_id]: upsertInList(
            state.playgroundsMap[existing.account_id] ?? [],
            updated,
          ),
        },
      };
    });
  },

  updateName: async (id, name) => {
    await api.updatePlaygroundName(id, name);
    set((state) => {
      const existing = state.byId[id];
      if (!existing) return state;
      const updated: Playground = { ...existing, name, updated_at: new Date().toISOString() };
      return {
        byId: { ...state.byId, [id]: updated },
        playgroundsMap: {
          ...state.playgroundsMap,
          [existing.account_id]: upsertInList(
            state.playgroundsMap[existing.account_id] ?? [],
            updated,
          ),
        },
      };
    });
  },

  updateMode: async (id, mode) => {
    await api.updatePlaygroundMode(id, mode);
    set((state) => {
      const existing = state.byId[id];
      if (!existing) return state;
      const updated: Playground = { ...existing, mode, updated_at: new Date().toISOString() };
      return {
        byId: { ...state.byId, [id]: updated },
        playgroundsMap: {
          ...state.playgroundsMap,
          [existing.account_id]: upsertInList(
            state.playgroundsMap[existing.account_id] ?? [],
            updated,
          ),
        },
      };
    });
  },

  deletePlayground: async (id) => {
    const existing = get().byId[id];
    await api.deletePlayground(id);
    set((state) => {
      const { [id]: _removed, ...restById } = state.byId;
      if (!existing) return { byId: restById };
      return {
        byId: restById,
        playgroundsMap: {
          ...state.playgroundsMap,
          [existing.account_id]: removeFromList(
            state.playgroundsMap[existing.account_id] ?? [],
            id,
          ),
        },
      };
    });
  },

  exportPlaygroundContent: async (id) => {
    return api.exportPlaygroundContent(id);
  },

  importPlayground: async (accountId, name, code) => {
    const pg = await api.importPlayground(accountId, name, code);
    set((state) => ({
      playgroundsMap: {
        ...state.playgroundsMap,
        [accountId]: upsertInList(state.playgroundsMap[accountId] ?? [], pg),
      },
      byId: { ...state.byId, [pg.id]: pg },
    }));
    return pg;
  },

  getPlayground: (id) => get().byId[id],
}));
