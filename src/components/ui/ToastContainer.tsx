import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToastStore, type Toast } from '../../stores/toastStore';

function ToastIcon({ type }: { type: Toast['type'] }) {
  switch (type) {
    case 'success':
      return <CheckCircle size={14} className="flex-shrink-0 text-[var(--success)]" />;
    case 'error':
      return <AlertCircle size={14} className="flex-shrink-0 text-[var(--danger)]" />;
    case 'info':
      return <Info size={14} className="flex-shrink-0 text-[var(--accent)]" />;
  }
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg text-[length:var(--font-size-sm)] text-[var(--text-primary)] animate-[toast-in_0.2s_ease-out]"
        >
          <ToastIcon type={toast.type} />
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.onClick();
                removeToast(toast.id);
              }}
              className="flex-shrink-0 px-2 py-0.5 rounded text-[var(--accent)] hover:bg-[var(--bg-primary)] transition-colors font-medium"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 p-0.5 rounded hover:bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
