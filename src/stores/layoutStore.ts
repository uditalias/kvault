import { create } from 'zustand';
import type { ActivityView } from '../components/layout/views';

interface LayoutStore {
  activeView: ActivityView;
  setActiveView: (view: ActivityView) => void;
  saveWorkspaceDialogOpen: boolean;
  setSaveWorkspaceDialogOpen: (open: boolean) => void;
  createKeyDialogOpen: boolean;
  setCreateKeyDialogOpen: (open: boolean) => void;
  importDialogOpen: boolean;
  setImportDialogOpen: (open: boolean) => void;
  addAccountDialogOpen: boolean;
  setAddAccountDialogOpen: (open: boolean) => void;
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  activeView: 'accounts',
  setActiveView: (view) => set({ activeView: view }),
  saveWorkspaceDialogOpen: false,
  setSaveWorkspaceDialogOpen: (open) => set({ saveWorkspaceDialogOpen: open }),
  createKeyDialogOpen: false,
  setCreateKeyDialogOpen: (open) => set({ createKeyDialogOpen: open }),
  importDialogOpen: false,
  setImportDialogOpen: (open) => set({ importDialogOpen: open }),
  addAccountDialogOpen: false,
  setAddAccountDialogOpen: (open) => set({ addAccountDialogOpen: open }),
}));
