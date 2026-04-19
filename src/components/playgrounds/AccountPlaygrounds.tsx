import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  FileCode2,
  Plus,
  Upload,
} from 'lucide-react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useTabStore } from '../../stores/tabStore';
import { useToastStore } from '../../stores/toastStore';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { Playground } from '../../lib/tauri';

interface Props {
  accountId: string;
}

interface PgContextMenu {
  playgroundId: string;
  x: number;
  y: number;
}

export function AccountPlaygrounds({ accountId }: Props) {
  const playgrounds = usePlaygroundStore((s) => s.playgroundsMap[accountId]);
  const loadPlaygrounds = usePlaygroundStore((s) => s.loadPlaygrounds);
  const createPlayground = usePlaygroundStore((s) => s.createPlayground);
  const deletePlaygroundStore = usePlaygroundStore((s) => s.deletePlayground);
  const updateNameStore = usePlaygroundStore((s) => s.updateName);
  const exportPlaygroundContent = usePlaygroundStore((s) => s.exportPlaygroundContent);
  const importPlaygroundStore = usePlaygroundStore((s) => s.importPlayground);
  const openPlaygroundTab = useTabStore((s) => s.openPlaygroundTab);
  const closePlaygroundTab = useTabStore((s) => s.closePlaygroundTab);
  const renamePlaygroundTab = useTabStore((s) => s.renamePlaygroundTab);
  const addToast = useToastStore((s) => s.addToast);
  const activeTab = useTabStore((s) =>
    s.tabs.find((t) => t.id === s.activeTabId),
  );

  const [expanded, setExpanded] = useState(true);
  const [contextMenu, setContextMenu] = useState<PgContextMenu | null>(null);
  const [renameTarget, setRenameTarget] = useState<Playground | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Playground | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Lazy-load on first expand.
  useEffect(() => {
    if (playgrounds === undefined) {
      void loadPlaygrounds(accountId).catch((err) => {
        addToast(
          err instanceof Error ? err.message : 'Failed to load playgrounds',
          'error',
        );
      });
    }
  }, [accountId, playgrounds, loadPlaygrounds, addToast]);

  // Close context menu on outside click / Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const handleCreate = useCallback(async () => {
    try {
      const pg = await createPlayground(accountId, 'Untitled playground');
      openPlaygroundTab(accountId, pg.id, pg.name);
      setExpanded(true);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Failed to create playground',
        'error',
      );
    }
  }, [accountId, createPlayground, openPlaygroundTab, addToast]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // reset so picking the same file twice re-fires change
      if (!file) return;
      try {
        const code = await file.text();
        const name = file.name.replace(/\.ts$/i, '') || 'Imported playground';
        const pg = await importPlaygroundStore(accountId, name, code);
        openPlaygroundTab(accountId, pg.id, pg.name);
        setExpanded(true);
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : 'Failed to import playground',
          'error',
        );
      }
    },
    [accountId, importPlaygroundStore, openPlaygroundTab, addToast],
  );

  const handleOpen = useCallback(
    (pg: Playground) => {
      openPlaygroundTab(accountId, pg.id, pg.name);
    },
    [accountId, openPlaygroundTab],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, pg: Playground) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ playgroundId: pg.id, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleRename = useCallback(
    (pg: Playground) => {
      setRenameTarget(pg);
      setRenameValue(pg.name);
      setContextMenu(null);
    },
    [],
  );

  const submitRename = useCallback(async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    try {
      await updateNameStore(renameTarget.id, trimmed);
      renamePlaygroundTab(renameTarget.id, trimmed);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Failed to rename',
        'error',
      );
    } finally {
      setRenameTarget(null);
    }
  }, [renameTarget, renameValue, updateNameStore, renamePlaygroundTab, addToast]);

  const handleExport = useCallback(
    async (pg: Playground) => {
      setContextMenu(null);
      try {
        const content = await exportPlaygroundContent(pg.id);
        const blob = new Blob([content], { type: 'text/typescript' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${pg.name}.ts`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : 'Failed to export playground',
          'error',
        );
      }
    },
    [exportPlaygroundContent, addToast],
  );

  const handleDeleteRequest = useCallback((pg: Playground) => {
    setDeleteTarget(pg);
    setContextMenu(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      closePlaygroundTab(deleteTarget.id);
      await deletePlaygroundStore(deleteTarget.id);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Failed to delete playground',
        'error',
      );
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, closePlaygroundTab, deletePlaygroundStore, addToast]);

  const list = playgrounds ?? [];

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ts,text/plain"
        className="hidden"
        onChange={(e) => void handleFileSelected(e)}
      />
      {/* Section header — nested under the account, not a sibling of it */}
      <div
        className="group/pgh flex items-center gap-1 py-1 cursor-pointer hover:bg-[var(--bg-surface)]"
        style={{ paddingLeft: '20px', paddingRight: '8px' }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="flex-shrink-0 text-[var(--text-tertiary)]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="flex-1 truncate text-[length:var(--font-size-sm)] text-[var(--text-secondary)] uppercase tracking-wide">
          Playgrounds {list.length > 0 ? `(${list.length})` : ''}
        </span>
        <button
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0 invisible group-hover/pgh:visible"
          title="Import playground from file"
          onClick={(e) => {
            e.stopPropagation();
            void handleImport();
          }}
        >
          <Upload size={12} />
        </button>
        <button
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0 invisible group-hover/pgh:visible"
          title="New playground"
          onClick={(e) => {
            e.stopPropagation();
            void handleCreate();
          }}
        >
          <Plus size={12} />
        </button>
      </div>

      {expanded && list.length === 0 && (
        <div
          className="py-1 mx-1 text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]"
          style={{ paddingLeft: '44px' }}
        >
          No playgrounds
        </div>
      )}

      {expanded &&
        list.map((pg) => {
          const isActive =
            activeTab?.type === 'playground' && activeTab.playgroundId === pg.id;
          return (
            <div
              key={pg.id}
              className={`group/pg flex items-center gap-1.5 py-1 cursor-pointer ${
                isActive
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                  : 'hover:bg-[var(--bg-surface)]'
              }`}
              style={{ paddingLeft: '44px', paddingRight: '8px' }}
              onClick={() => handleOpen(pg)}
              onContextMenu={(e) => handleContextMenu(e, pg)}
            >
              <FileCode2
                size={14}
                className="flex-shrink-0 text-[var(--accent)]"
              />
              <span className="flex-1 truncate text-[13px] text-[var(--text-primary)]">
                {pg.name}
              </span>
              {pg.mode === 'live' && (
                <span
                  className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"
                  title="Live mode"
                />
              )}
            </div>
          );
        })}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] rounded-md border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {(() => {
            const pg = list.find((p) => p.id === contextMenu.playgroundId);
            if (!pg) return null;
            return (
              <>
                <button
                  className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-colors"
                  onClick={() => handleRename(pg)}
                >
                  Rename…
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-colors"
                  onClick={() => void handleExport(pg)}
                >
                  Export to file…
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--bg-primary)] transition-colors"
                  onClick={() => handleDeleteRequest(pg)}
                >
                  Delete
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* Rename dialog */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setRenameTarget(null)}
        >
          <div
            className="bg-[var(--bg-surface)] rounded-md shadow-lg border border-[var(--border)] p-4 min-w-[280px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">
              Rename playground
            </h3>
            <input
              autoFocus
              className="w-full px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent)]"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename();
                else if (e.key === 'Escape') setRenameTarget(null);
              }}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                className="px-3 py-1 text-sm rounded hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 text-sm rounded bg-[var(--accent)] text-white"
                onClick={() => void submitRename()}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Playground"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
