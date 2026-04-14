import { useEffect, useRef } from 'react';
import { useUpdateStore } from '../../stores/updateStore';

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function UpdatePopover({ open, onClose, anchorRef }: Props) {
  const latest = useUpdateStore((s) => s.latest);
  const openRelease = useUpdateStore((s) => s.openRelease);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current && !ref.current.contains(target) &&
        anchorRef.current && !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !latest) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Update available"
      className="absolute bottom-7 left-0 z-50 w-96 max-h-80 flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg text-[length:var(--font-size-sm)]"
    >
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <div className="font-medium text-[var(--text-primary)]">
          KVault v{latest.latestVersion} is available
        </div>
        <div className="text-[var(--text-tertiary)]">
          You have v{latest.currentVersion}
        </div>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2 whitespace-pre-wrap text-[var(--text-secondary)]">
        {latest.notes || 'No release notes.'}
      </div>
      <div className="px-3 py-2 border-t border-[var(--border)] flex items-center justify-end gap-2">
        <button
          onClick={async () => { await dismiss(); onClose(); }}
          className="px-2 py-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          Remind me later
        </button>
        <button
          onClick={async () => { await openRelease(); onClose(); }}
          className="px-3 py-1 rounded bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] cursor-pointer font-medium"
        >
          Download
        </button>
      </div>
    </div>
  );
}
