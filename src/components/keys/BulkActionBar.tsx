import { useState, useCallback, useEffect } from 'react';
import { Trash2, Download, X } from 'lucide-react';
import { useKeyStore } from '../../stores/keyStore';
import { useTabStore } from '../../stores/tabStore';
import * as api from '../../lib/tauri';

interface BulkActionBarProps {
  namespaceId: string;
  accountId: string;
  namespaceName?: string;
  onExport: () => void;
}

const SKIP_CONFIRM_KEY = 'kvault:skipBulkDeleteConfirm';
const EMPTY_KEYS: string[] = [];

export function BulkActionBar({
  namespaceId,
  accountId,
  namespaceName,
  onExport,
}: BulkActionBarProps) {
  const selectedKeys = useKeyStore((s) => s.selectedKeys[namespaceId]) ?? EMPTY_KEYS;
  const clearSelection = useKeyStore((s) => s.clearSelection);
  const loadKeys = useKeyStore((s) => s.loadKeys);
  const markKeyTabDeleted = useTabStore((s) => s.markKeyTabDeleted);

  const [showConfirm, setShowConfirm] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const count = selectedKeys.length;

  // Listen for global delete-selected event from command palette / keyboard shortcut
  useEffect(() => {
    const handler = () => {
      const { tabs, activeTabId } = useTabStore.getState();
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.type === 'namespace' && activeTab.namespaceId === namespaceId && count > 0) {
        handleDeleteClick();
      }
    };
    window.addEventListener('kvault:delete-selected', handler);
    return () => window.removeEventListener('kvault:delete-selected', handler);
  }, [namespaceId, count]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteClick = useCallback(() => {
    const skipConfirm = localStorage.getItem(SKIP_CONFIRM_KEY) === 'true';
    if (skipConfirm) {
      performDelete();
    } else {
      setShowConfirm(true);
    }
  }, [selectedKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  const performDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    setShowConfirm(false);
    setProgress(`Deleting ${count} keys...`);

    if (dontAskAgain) {
      localStorage.setItem(SKIP_CONFIRM_KEY, 'true');
    }

    try {
      const keyNames = [...selectedKeys];
      const result = await api.bulkDeleteKeys(accountId, namespaceId, keyNames);

      // Mark tabs for deleted keys
      for (const keyName of keyNames) {
        if (!result.failed.includes(keyName)) {
          markKeyTabDeleted(namespaceId, keyName);
        }
      }

      // Refresh key list
      await loadKeys(namespaceId);
      clearSelection(namespaceId);

      if (result.failed.length > 0) {
        setProgress(`Deleted ${result.deleted} keys. ${result.failed.length} failed.`);
        setTimeout(() => setProgress(null), 3000);
      } else {
        setProgress(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      setProgress(`Error: ${msg}`);
      setTimeout(() => setProgress(null), 4000);
    } finally {
      setDeleting(false);
    }
  }, [selectedKeys, count, dontAskAgain, deleting, accountId, namespaceId, markKeyTabDeleted, loadKeys, clearSelection]);

  if (count === 0 && !progress) return null;

  const displayName = namespaceName ?? namespaceId;

  return (
    <>
      {/* Floating bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] shadow-lg">
        {progress ? (
          <span className="text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
            {progress}
          </span>
        ) : (
          <>
            <span className="text-[length:var(--font-size-sm)] text-[var(--text-secondary)] whitespace-nowrap">
              {count} key{count !== 1 ? 's' : ''} selected
            </span>

            <div className="w-px h-4 bg-[var(--border)]" />

            <button
              onClick={handleDeleteClick}
              disabled={deleting}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[length:var(--font-size-sm)] text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors disabled:opacity-50"
              title="Delete selected keys"
            >
              <Trash2 size={14} />
              Delete
            </button>

            <button
              onClick={onExport}
              disabled={deleting}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[length:var(--font-size-sm)] text-[var(--text-primary)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
              title="Export selected keys"
            >
              <Download size={14} />
              Export
            </button>

            <div className="w-px h-4 bg-[var(--border)]" />

            <button
              onClick={() => clearSelection(namespaceId)}
              className="flex items-center justify-center p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirm(false);
          }}
        >
          <div className="w-full max-w-[400px] mx-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]">
                Confirm Delete
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[length:var(--font-size-base)] text-[var(--text-secondary)]">
                Delete {count} key{count !== 1 ? 's' : ''} from{' '}
                <span className="font-mono text-[var(--text-primary)]">{displayName}</span>?
                This cannot be undone.
              </p>

              <label className="flex items-center gap-2 cursor-pointer text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]">
                <input
                  type="checkbox"
                  checked={dontAskAgain}
                  onChange={(e) => setDontAskAgain(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                />
                Don't ask again
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 text-[length:var(--font-size-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={performDelete}
                  className="px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md bg-[var(--danger)] text-white hover:opacity-90 transition-opacity"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
