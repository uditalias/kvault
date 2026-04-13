import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useKeyStore } from '../../stores/keyStore';
import { useTabStore } from '../../stores/tabStore';
import { KeyFilterBar } from './KeyFilterBar';
import { KeyContextMenu } from './KeyContextMenu';
import { BulkActionBar } from './BulkActionBar';
import CreateKeyDialog, { type CreateKeyInitialValues } from './CreateKeyDialog';
import ImportDialog from './ImportDialog';
import { useSyncStore } from '../../stores/syncStore';
import { Skeleton } from '../ui/Skeleton';
import { useLayoutStore } from '../../stores/layoutStore';
import * as api from '../../lib/tauri';
import { useToastStore } from '../../stores/toastStore';
import { exportKeys, copyToClipboard, downloadAsFile, type ExportFormat } from '../../lib/export';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ShortcutButton } from '../ui/ShortcutButton';

interface KeyListProps {
  namespaceId: string;
  accountId: string;
}

const ROW_HEIGHT = 32;
const EMPTY_KEYS: string[] = [];
const EMPTY_KEY_ROWS: import('../../lib/tauri').KeyRow[] = [];

function formatExpiration(expiration: number | null): string | null {
  if (expiration === null) return null;
  const date = new Date(expiration * 1000);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return 'expired';

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export function KeyList({ namespaceId, accountId }: KeyListProps) {
  const keys = useKeyStore((s) => s.keysMap[namespaceId]) ?? EMPTY_KEY_ROWS;
  const loadKeys = useKeyStore((s) => s.loadKeys);
  const toggleKeySelection = useKeyStore((s) => s.toggleKeySelection);
  const selectAll = useKeyStore((s) => s.selectAll);
  const clearSelection = useKeyStore((s) => s.clearSelection);
  const openKeyTab = useTabStore((s) => s.openKeyTab);
  const markKeyTabDeleted = useTabStore((s) => s.markKeyTabDeleted);

  const syncStatus = useSyncStore((s) => s.syncStatus[namespaceId]);
  const isSyncing = syncStatus?.status === 'syncing';
  const isSyncError = syncStatus?.status === 'error';

  const selectedKeys = useKeyStore((s) => s.selectedKeys[namespaceId]) ?? EMPTY_KEYS;
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const allSelected = keys.length > 0 && selectedSet.size === keys.length;
  const someSelected = selectedSet.size > 0 && selectedSet.size < keys.length;

  const parentRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    keyName: string;
    index: number;
  } | null>(null);

  // Export state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Import state
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Duplicate key state
  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean;
    initialValues?: CreateKeyInitialValues;
  }>({ open: false });

  // Create key state
  const [showCreateKeyDialog, setShowCreateKeyDialog] = useState(false);

  // Single key delete confirmation
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);

  const addToast = useToastStore((s) => s.addToast);

  // Listen for global events from command palette / keyboard shortcuts
  useEffect(() => {
    const handleExportSelected = () => {
      const { tabs, activeTabId } = useTabStore.getState();
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.type === 'namespace' && activeTab.namespaceId === namespaceId) {
        const selected = useKeyStore.getState().selectedKeys[namespaceId] ?? [];
        if (selected.length > 0) {
          setShowExportDialog(true);
        }
      }
    };

    window.addEventListener('kvault:export-selected', handleExportSelected);

    // Listen for layout store create key / import triggers
    const unsub = useLayoutStore.subscribe((state, prev) => {
      if (state.createKeyDialogOpen && !prev.createKeyDialogOpen) {
        const { tabs, activeTabId } = useTabStore.getState();
        const activeTab = tabs.find((t) => t.id === activeTabId);
        if (activeTab?.type === 'namespace' && activeTab.namespaceId === namespaceId) {
          setShowCreateKeyDialog(true);
          useLayoutStore.getState().setCreateKeyDialogOpen(false);
        }
      }
      if (state.importDialogOpen && !prev.importDialogOpen) {
        const { tabs, activeTabId } = useTabStore.getState();
        const activeTab = tabs.find((t) => t.id === activeTabId);
        if (activeTab?.type === 'namespace' && activeTab.namespaceId === namespaceId) {
          setShowImportDialog(true);
          useLayoutStore.getState().setImportDialogOpen(false);
        }
      }
    });

    return () => {
      window.removeEventListener('kvault:export-selected', handleExportSelected);
      unsub();
    };
  }, [namespaceId]);

  // Load keys on mount and after sync completes
  const syncStatusRef = useRef(syncStatus?.status);
  useEffect(() => {
    const prevStatus = syncStatusRef.current;
    syncStatusRef.current = syncStatus?.status;

    // Always load on mount, or when sync just completed
    if (!prevStatus || (prevStatus === 'syncing' && syncStatus?.status === 'idle')) {
      loadKeys(namespaceId).then(() => {
        // After reloading, mark tabs for keys no longer in cache
        const currentKeys = new Set(
          (useKeyStore.getState().keysMap[namespaceId] ?? []).map((k) => k.key_name)
        );
        const { tabs } = useTabStore.getState();
        for (const tab of tabs) {
          if (
            tab.type === 'key' &&
            tab.namespaceId === namespaceId &&
            !tab.isDeleted &&
            tab.keyName &&
            !currentKeys.has(tab.keyName)
          ) {
            markKeyTabDeleted(namespaceId, tab.keyName);
          }
        }
      });
    }
  }, [namespaceId, loadKeys, syncStatus?.status, markKeyTabDeleted]);

  const virtualizer = useVirtualizer({
    count: keys.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const handleRowClick = useCallback(
    (keyName: string) => {
      openKeyTab(accountId, namespaceId, keyName, true);
    },
    [namespaceId, accountId, openKeyTab],
  );

  const handleRowDoubleClick = useCallback(
    (keyName: string) => {
      openKeyTab(accountId, namespaceId, keyName, false);
    },
    [accountId, namespaceId, openKeyTab],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, index: number, keyName: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, keyName, index });
    },
    [],
  );

  const handleSelectAllToggle = useCallback(() => {
    if (allSelected) {
      clearSelection(namespaceId);
    } else {
      selectAll(namespaceId);
    }
  }, [allSelected, namespaceId, clearSelection, selectAll]);

  // Export handler
  const handleExport = useCallback(() => {
    if (selectedKeys.length === 0) return;
    setShowExportDialog(true);
  }, [selectedKeys.length]);

  const performExport = useCallback(async (format: ExportFormat, mode: 'clipboard' | 'file') => {
    setExporting(true);
    setExportProgress('Fetching values...');

    try {
      const result = await exportKeys(
        accountId,
        namespaceId,
        selectedKeys,
        keys,
        format,
        (p) => setExportProgress(`Fetching values: ${p.fetched}/${p.total}`),
      );

      if (mode === 'clipboard') {
        await copyToClipboard(result);
        addToast('Export copied to clipboard', 'success');
      } else {
        const ext = format === 'json' ? 'json' : 'csv';
        downloadAsFile(result, `kvault-export.${ext}`);
        addToast('Export complete', 'success');
      }

      setShowExportDialog(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      addToast(msg, 'error');
      setExportProgress(`Error: ${msg}`);
      setTimeout(() => setExportProgress(null), 3000);
      return;
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [accountId, namespaceId, selectedKeys, keys]);

  // Delete single key from context menu
  const handleDeleteSingleKey = useCallback((keyName: string) => {
    setDeleteConfirmKey(keyName);
  }, []);

  const confirmDeleteSingleKey = useCallback(async () => {
    if (!deleteConfirmKey) return;
    try {
      await api.deleteKey(accountId, namespaceId, deleteConfirmKey);
      markKeyTabDeleted(namespaceId, deleteConfirmKey);
      await loadKeys(namespaceId);
      addToast('Key deleted', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
    setDeleteConfirmKey(null);
  }, [deleteConfirmKey, accountId, namespaceId, markKeyTabDeleted, loadKeys, addToast]);

  // Duplicate key from context menu
  const handleDuplicateKey = useCallback(async (keyName: string) => {
    try {
      const result = await api.getValue(accountId, namespaceId, keyName);
      const decoder = new TextDecoder();
      const valueStr = decoder.decode(new Uint8Array(result.data));

      // Detect content mode
      let contentMode: 'json' | 'text' = 'text';
      if (result.is_json) {
        contentMode = 'json';
      }

      // Find the key row for TTL
      const keyRow = keys.find((k) => k.key_name === keyName);
      const ttlStr = keyRow?.expiration ? String(keyRow.expiration) : '';

      setDuplicateDialog({
        open: true,
        initialValues: {
          keyName: `${keyName}-copy`,
          value: valueStr,
          contentMode,
          ttl: ttlStr,
        },
      });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to duplicate key', 'error');
    }
  }, [accountId, namespaceId, keys]);

  const activeFilter = useKeyStore((s) => s.filterMap[namespaceId] ?? '');
  const totalKeys = useKeyStore((s) => s.totalMap[namespaceId] ?? 0);

  const existingKeyNames = new Set(keys.map((k) => k.key_name));

  const showEmptyState = keys.length === 0 && !isSyncing;
  const emptyMessage = activeFilter
    ? 'No keys matching filter'
    : isSyncError
      ? `Sync failed: ${syncStatus?.error ?? 'Unknown error'}`
      : totalKeys === 0
        ? 'No keys in this namespace'
        : '';

  return (
    <div className="flex flex-col h-full relative">
      <KeyFilterBar namespaceId={namespaceId} accountId={accountId} onCreateKey={() => setShowCreateKeyDialog(true)} onImport={() => setShowImportDialog(true)} />

      {/* Header row */}
      <div
        className="flex items-center gap-2 px-2 py-1 border-b border-[var(--border)] text-[length:var(--font-size-sm)] text-[var(--text-secondary)]"
        style={{ height: ROW_HEIGHT }}
      >
        <label className="flex items-center justify-center w-5 h-5 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={handleSelectAllToggle}
            className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
          />
        </label>
        <span className="flex-1">Key Name</span>
        <span className="w-16 text-right">TTL</span>
      </div>

      {/* Syncing indicator */}
      {isSyncing && keys.length === 0 && (
        <div className="shimmer-container flex-1 px-2 py-1">
          <div className="space-y-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${55 + ((i * 37) % 40)}%` }} />
                <Skeleton className="h-3.5 w-10" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {showEmptyState && emptyMessage && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <span className="text-[length:var(--font-size-base)] text-[var(--text-tertiary)]">
            {emptyMessage}
          </span>
          {!activeFilter && !isSyncError && (
            <div className="flex flex-col gap-1">
              <ShortcutButton label="Create Key" keys={['⌘', 'N']} onClick={() => setShowCreateKeyDialog(true)} />
              <ShortcutButton label="Re-sync Namespace" keys={['⌘', '⇧', 'R']} onClick={() => useSyncStore.getState().startSync(accountId, namespaceId)} />
            </div>
          )}
        </div>
      )}

      {/* Virtualized list */}
      <div ref={parentRef} className={`flex-1 overflow-auto ${(showEmptyState && emptyMessage) || (isSyncing && keys.length === 0) ? 'hidden' : ''}`}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const key = keys[virtualRow.index];
            if (!key) return null;

            const isSelected = selectedSet.has(key.key_name);
            const ttlLabel = formatExpiration(key.expiration);

            return (
              <div
                key={key.key_name}
                data-index={virtualRow.index}
                className={`absolute left-0 w-full flex items-center gap-2 px-2 cursor-default select-none ${
                  isSelected
                    ? 'bg-[var(--accent)]/10'
                    : 'hover:bg-[var(--bg-surface)]'
                }`}
                style={{
                  height: `${virtualRow.size}px`,
                  top: `${virtualRow.start}px`,
                }}
                onClick={() => handleRowClick(key.key_name)}
                onDoubleClick={() => handleRowDoubleClick(key.key_name)}
                onContextMenu={(e) =>
                  handleContextMenu(e, virtualRow.index, key.key_name)
                }
              >
                <label
                  className="flex items-center justify-center w-5 h-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() =>
                      toggleKeySelection(namespaceId, key.key_name)
                    }
                    className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
                  />
                </label>
                <span
                  className="flex-1 truncate font-mono text-[var(--text-primary)] text-[length:var(--font-size-sm)]"
                  title={key.key_name}
                >
                  {key.key_name}
                </span>
                {ttlLabel && (
                  <span className="w-16 text-right">
                    <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--warning)]/20 text-[var(--warning)]">
                      {ttlLabel}
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        namespaceId={namespaceId}
        accountId={accountId}
        onExport={handleExport}
      />

      {/* Context menu */}
      {contextMenu && (
        <KeyContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          keyName={contextMenu.keyName}
          onClose={() => setContextMenu(null)}
          onOpenInNewTab={() => {
            openKeyTab(accountId, namespaceId, contextMenu.keyName, false);
          }}
          onCopyKeyName={() => {
            navigator.clipboard.writeText(contextMenu.keyName);
          }}
          onSelectAll={() => selectAll(namespaceId)}
          onDuplicateKey={() => handleDuplicateKey(contextMenu.keyName)}
          onDeleteKey={() => handleDeleteSingleKey(contextMenu.keyName)}
          onExportSelected={handleExport}
          hasSelection={selectedKeys.length > 0}
        />
      )}

      {/* Export dialog */}
      {showExportDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowExportDialog(false);
          }}
        >
          <div className="w-full max-w-[400px] mx-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]">
                Export {selectedKeys.length} Key{selectedKeys.length !== 1 ? 's' : ''}
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <span className="block text-[length:var(--font-size-sm)] font-medium text-[var(--text-secondary)] mb-2">
                  Format
                </span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
                    <input
                      type="radio"
                      name="export-format"
                      value="json"
                      checked={exportFormat === 'json'}
                      onChange={() => setExportFormat('json')}
                      className="accent-[var(--accent)]"
                    />
                    JSON
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
                    <input
                      type="radio"
                      name="export-format"
                      value="csv"
                      checked={exportFormat === 'csv'}
                      onChange={() => setExportFormat('csv')}
                      className="accent-[var(--accent)]"
                    />
                    CSV
                  </label>
                </div>
              </div>

              {exportProgress && (
                <p className="text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
                  {exportProgress}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExportDialog(false)}
                  disabled={exporting}
                  className="px-4 py-2 text-[length:var(--font-size-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => performExport(exportFormat, 'clipboard')}
                  disabled={exporting}
                  className="px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-50 transition-colors"
                >
                  Copy to Clipboard
                </button>
                <button
                  type="button"
                  onClick={() => performExport(exportFormat, 'file')}
                  disabled={exporting}
                  className="px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                >
                  Save File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import dialog */}
      <ImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        accountId={accountId}
        namespaceId={namespaceId}
        existingKeyNames={existingKeyNames}
      />

      {/* Create new key dialog */}
      <CreateKeyDialog
        open={showCreateKeyDialog}
        onClose={() => setShowCreateKeyDialog(false)}
        accountId={accountId}
        namespaceId={namespaceId}
      />

      {/* Duplicate key dialog (reuses CreateKeyDialog) */}
      <CreateKeyDialog
        open={duplicateDialog.open}
        onClose={() => setDuplicateDialog({ open: false })}
        accountId={accountId}
        namespaceId={namespaceId}
        initialValues={duplicateDialog.initialValues}
      />

      {/* Delete single key confirmation */}
      <ConfirmDialog
        open={deleteConfirmKey !== null}
        title="Delete Key"
        message={`Delete key "${deleteConfirmKey}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteSingleKey}
        onCancel={() => setDeleteConfirmKey(null)}
      />
    </div>
  );
}
