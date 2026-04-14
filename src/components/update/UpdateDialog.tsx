import { useEffect } from 'react';
import { useUpdateStore } from '../../stores/updateStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UpdateDialog({ open, onClose }: Props) {
  const status = useUpdateStore((s) => s.status);
  const latest = useUpdateStore((s) => s.latest);
  const error = useUpdateStore((s) => s.error);
  const check = useUpdateStore((s) => s.check);
  const openRelease = useUpdateStore((s) => s.openRelease);
  const dismiss = useUpdateStore((s) => s.dismiss);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[480px] max-h-[70vh] mx-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl flex flex-col">
        {status === 'checking' && (
          <div className="px-6 py-5 text-[length:var(--font-size-base)] text-[var(--text-secondary)]">
            Checking for updates…
          </div>
        )}

        {status === 'up-to-date' && latest && (
          <>
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]">
                You're up to date
              </h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-[length:var(--font-size-base)] text-[var(--text-secondary)]">
                Running v{latest.currentVersion} — the latest release.
              </p>
            </div>
            <div className="px-6 py-3 border-t border-[var(--border)] flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] cursor-pointer transition-opacity"
              >
                OK
              </button>
            </div>
          </>
        )}

        {status === 'available' && latest && (
          <>
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]">
                KVault v{latest.latestVersion} is available
              </h2>
              <p className="text-[length:var(--font-size-sm)] text-[var(--text-tertiary)] mt-1">
                You have v{latest.currentVersion}
              </p>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4 whitespace-pre-wrap text-[length:var(--font-size-base)] text-[var(--text-secondary)]">
              {latest.notes || 'No release notes.'}
            </div>
            <div className="px-6 py-3 border-t border-[var(--border)] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={async () => { await dismiss(); onClose(); }}
                className="px-4 py-2 text-[length:var(--font-size-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded cursor-pointer"
              >
                Remind me later
              </button>
              <button
                type="button"
                onClick={async () => { await openRelease(); onClose(); }}
                className="px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] cursor-pointer transition-opacity"
              >
                Download
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]">
                Update check failed
              </h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-[length:var(--font-size-base)] text-[var(--text-secondary)]">
                {error ?? 'Unknown error'}
              </p>
            </div>
            <div className="px-6 py-3 border-t border-[var(--border)] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[length:var(--font-size-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => check(true)}
                className="px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] cursor-pointer transition-opacity"
              >
                Try again
              </button>
            </div>
          </>
        )}

        {status === 'idle' && (
          <div className="px-6 py-5 text-[length:var(--font-size-base)] text-[var(--text-secondary)]">
            Preparing update check…
          </div>
        )}
      </div>
    </div>
  );
}
