import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Spinner } from '../ui/Spinner';
import { useWorkspaceStore } from '../../stores/workspaceStore';

interface SaveWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SaveWorkspaceDialog({ open, onClose }: SaveWorkspaceDialogProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const titleId = 'save-workspace-dialog-title';
  const errorId = 'save-workspace-dialog-error';

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const saveWorkspace = useWorkspaceStore((s) => s.saveWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);

  // Reset form state when dialog opens
  useEffect(() => {
    if (open) {
      setName('');
      setLoading(false);
      setError('');
      setConfirmOverwrite(false);
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
          'input, button, [tabindex]:not([tabindex="-1"])',
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

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !loading;
  const existingWorkspace = workspaces.find(
    (w) => w.name.toLowerCase() === trimmedName.toLowerCase(),
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    // If a workspace with this name exists and we haven't confirmed overwrite yet
    if (existingWorkspace && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (existingWorkspace && confirmOverwrite) {
        // Overwrite: update the existing workspace with current state
        await updateWorkspace(existingWorkspace.id);
      } else {
        await saveWorkspace(trimmedName);
      }
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save workspace.';
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

  // Reset overwrite confirmation when name changes
  function handleNameChange(value: string) {
    setName(value);
    setConfirmOverwrite(false);
  }

  const inputClasses =
    'w-full rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] px-3 py-2 text-[length:var(--font-size-base)] outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-colors placeholder:text-[var(--text-tertiary)]';

  const labelClasses =
    'block text-[length:var(--font-size-sm)] font-medium text-[var(--text-secondary)] mb-1';

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
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2
            id={titleId}
            className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]"
          >
            Save Workspace
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded"
            aria-label="Close dialog"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Workspace Name */}
          <div>
            <label htmlFor="workspace-name" className={labelClasses}>
              Workspace Name
            </label>
            <input
              ref={firstInputRef}
              id="workspace-name"
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder='e.g. "My Project"'
              aria-describedby={error ? errorId : undefined}
              className={inputClasses}
            />
          </div>

          {/* Overwrite confirmation */}
          {confirmOverwrite && existingWorkspace && (
            <p
              className="text-[length:var(--font-size-sm)] text-[var(--warning,var(--danger))]"
              role="alert"
            >
              A workspace named "{existingWorkspace.name}" already exists. Click Save again to
              overwrite it.
            </p>
          )}

          {/* Error message */}
          {error && (
            <p
              id={errorId}
              className="text-[length:var(--font-size-sm)] text-[var(--danger)]"
              role="alert"
            >
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
              {loading ? 'Saving...' : confirmOverwrite ? 'Overwrite' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
