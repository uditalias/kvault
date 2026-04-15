import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Spinner } from '../ui/Spinner';
import { useAccountStore } from '../../stores/accountStore';

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddAccountDialog({ open, onClose }: AddAccountDialogProps) {
  const [name, setName] = useState('');
  const [cfAccountId, setCfAccountId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const titleId = 'add-account-dialog-title';
  const errorId = 'add-account-dialog-error';

  const addAccount = useAccountStore((s) => s.addAccount);

  // Reset form state when dialog opens
  useEffect(() => {
    if (open) {
      setName('');
      setCfAccountId('');
      setApiToken('');
      setLoading(false);
      setError('');
      // Focus the first input after the dialog renders
      requestAnimationFrame(() => {
        firstInputRef.current?.focus();
      });
    }
  }, [open]);

  // Focus trap
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusable = dialog.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit = name.trim() && cfAccountId.trim() && apiToken.trim() && !loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');

    try {
      await addAccount(name.trim(), cfAccountId.trim(), apiToken.trim());
      onClose();
    } catch (err) {
      let message: string;
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      } else if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
        message = (err as { message: string }).message;
      } else {
        message = 'Failed to validate account. Check your credentials and try again.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeySubmit(e: KeyboardEvent) {
    if (e.key === 'Enter' && canSubmit) {
      handleSubmit(e);
    }
  }

  const inputClasses =
    'w-full rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] px-3 py-2 text-[length:var(--font-size-base)] outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-colors placeholder:text-[var(--text-tertiary)]';

  const labelClasses =
    'block text-[length:var(--font-size-sm)] font-medium text-[var(--text-secondary)] mb-1';

  const helperClasses =
    'text-[length:var(--font-size-sm)] text-[var(--text-tertiary)] mt-1';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[480px] mx-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl"
        onKeyDown={handleKeySubmit}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2
            id={titleId}
            className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]"
          >
            Add Account
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded"
            aria-label="Close dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Account Name */}
          <div>
            <label htmlFor="account-name" className={labelClasses}>
              Account Name
            </label>
            <input
              ref={firstInputRef}
              id="account-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Production"'
              className={inputClasses}
            />
          </div>

          {/* Cloudflare Account ID */}
          <div>
            <label htmlFor="cf-account-id" className={labelClasses}>
              Cloudflare Account ID
            </label>
            <input
              id="cf-account-id"
              type="text"
              required
              value={cfAccountId}
              onChange={(e) => setCfAccountId(e.target.value)}
              placeholder="e.g. abc123def456..."
              className={inputClasses}
            />
            <p className={helperClasses}>Find this in your CF dashboard URL</p>
          </div>

          {/* API Token */}
          <div>
            <label htmlFor="api-token" className={labelClasses}>
              API Token
            </label>
            <input
              id="api-token"
              type="password"
              required
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Paste your API token"
              className={inputClasses}
              aria-describedby={error ? errorId : undefined}
            />
            <p className={helperClasses}>Create a token with KV read/write permissions</p>
          </div>

          {/* Error message */}
          {error && (
            <p id={errorId} className="text-[length:var(--font-size-sm)] text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[length:var(--font-size-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading && (
                <Spinner size={16} />
              )}
              {loading ? 'Validating...' : 'Validate & Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
