import { create } from 'zustand';
import {
  checkForUpdates,
  dismissUpdateVersion,
  getDismissedVersion,
  openReleasePage,
  UpdateInfo,
} from '../lib/tauri';

type Status = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';

interface UpdateState {
  status: Status;
  latest: UpdateInfo | null;
  error: string | null;
  dismissedVersion: string | null;
  inFlight: boolean;

  init: () => Promise<void>;
  check: (force?: boolean) => Promise<UpdateInfo | null>;
  dismiss: () => Promise<void>;
  openRelease: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  latest: null,
  error: null,
  dismissedVersion: null,
  inFlight: false,

  init: async () => {
    try {
      const d = await getDismissedVersion();
      set({ dismissedVersion: d ?? null });
    } catch {
      // ignore
    }
  },

  check: async (force = false) => {
    if (get().inFlight) return get().latest;
    set({ inFlight: true, status: 'checking', error: null });
    try {
      const info = await checkForUpdates(force);
      set({
        latest: info,
        status: info.isUpdateAvailable ? 'available' : 'up-to-date',
        inFlight: false,
      });
      return info;
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message?: string }).message ?? err)
          : String(err);
      set({ status: 'error', error: msg, inFlight: false });
      return null;
    }
  },

  dismiss: async () => {
    const v = get().latest?.latestVersion;
    if (!v) return;
    await dismissUpdateVersion(v);
    set({ dismissedVersion: v });
  },

  openRelease: async () => {
    const url = get().latest?.releaseUrl;
    if (!url) return;
    await openReleasePage(url);
  },
}));
