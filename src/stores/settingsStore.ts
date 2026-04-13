import { create } from 'zustand';
import { getTheme, applyTheme, DEFAULT_THEME_ID } from '../themes';

export interface Settings {
  theme: string;
  editorFontSize: number;
  editorWordWrap: 'on' | 'off';
  editorMinimap: boolean;
  autoSyncOnOpen: boolean;
  confirmDelete: boolean;
}

interface SettingsState extends Settings {
  // Actions
  setTheme: (theme: string) => void;
  setEditorFontSize: (size: number) => void;
  setEditorWordWrap: (wrap: 'on' | 'off') => void;
  setEditorMinimap: (enabled: boolean) => void;
  setAutoSyncOnOpen: (enabled: boolean) => void;
  setConfirmDelete: (enabled: boolean) => void;
  initSettings: () => void;
}

const STORAGE_KEY = 'kvault-settings';

const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME_ID,
  editorFontSize: 13,
  editorWordWrap: 'off',
  editorMinimap: false,
  autoSyncOnOpen: true,
  confirmDelete: true,
};

function loadFromStorage(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Settings>;

    // Migrate old 'dark'/'light' theme values
    if (parsed.theme === 'dark') parsed.theme = 'catppuccin-mocha';
    if (parsed.theme === 'light') parsed.theme = 'catppuccin-latte';

    return parsed;
  } catch {
    return {};
  }
}

function persistSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Silently ignore storage errors
  }
}

function getSettingsSnapshot(state: SettingsState): Settings {
  return {
    theme: state.theme,
    editorFontSize: state.editorFontSize,
    editorWordWrap: state.editorWordWrap,
    editorMinimap: state.editorMinimap,
    autoSyncOnOpen: state.autoSyncOnOpen,
    confirmDelete: state.confirmDelete,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const saved = loadFromStorage();
  const initial: Settings = { ...DEFAULT_SETTINGS, ...saved };

  // Apply theme immediately at store creation to avoid flash of unstyled content
  applyTheme(getTheme(initial.theme));

  return {
    ...initial,

    setTheme: (theme) => {
      set({ theme });
      applyTheme(getTheme(theme));
      persistSettings(getSettingsSnapshot({ ...get(), theme }));
    },

    setEditorFontSize: (editorFontSize) => {
      set({ editorFontSize });
      persistSettings(getSettingsSnapshot({ ...get(), editorFontSize }));
    },

    setEditorWordWrap: (editorWordWrap) => {
      set({ editorWordWrap });
      persistSettings(getSettingsSnapshot({ ...get(), editorWordWrap }));
    },

    setEditorMinimap: (editorMinimap) => {
      set({ editorMinimap });
      persistSettings(getSettingsSnapshot({ ...get(), editorMinimap }));
    },

    setAutoSyncOnOpen: (autoSyncOnOpen) => {
      set({ autoSyncOnOpen });
      persistSettings(getSettingsSnapshot({ ...get(), autoSyncOnOpen }));
    },

    setConfirmDelete: (confirmDelete) => {
      set({ confirmDelete });
      persistSettings(getSettingsSnapshot({ ...get(), confirmDelete }));
    },

    initSettings: () => {
      applyTheme(getTheme(get().theme));
    },
  };
});
