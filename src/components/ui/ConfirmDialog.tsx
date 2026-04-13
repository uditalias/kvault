interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-[400px] mx-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-[length:var(--font-size-base)] text-[var(--text-secondary)]">
            {message}
          </p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-[length:var(--font-size-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded cursor-pointer"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md transition-opacity cursor-pointer ${
                danger
                  ? 'bg-[var(--danger)] text-white hover:opacity-90'
                  : 'bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)]'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
