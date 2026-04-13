import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { useWorkspaceStore, type Workspace } from '../../stores/workspaceStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useToastStore } from '../../stores/toastStore';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ScrollArea } from '../ui/ScrollArea';

interface ContextMenu {
  workspaceId: string;
  x: number;
  y: number;
}

function relativeTime(iso: string): string {
  // SQLite datetime('now') returns UTC without 'Z' suffix — append it so JS parses as UTC
  const utcIso = iso.endsWith('Z') ? iso : iso + 'Z';
  const diff = Date.now() - new Date(utcIso).getTime();
  if (isNaN(diff)) return 'unknown';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function WorkspaceList() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);

  const addToast = useToastStore((s) => s.addToast);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Load workspaces on mount
  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Re-render relative times every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Close context menu on click outside or ESC
  useEffect(() => {
    if (!contextMenu) return;

    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId) {
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renamingId]);

  const handleContextMenu = useCallback((e: React.MouseEvent, workspaceId: string) => {
    e.preventDefault();
    setContextMenu({ workspaceId, x: e.clientX, y: e.clientY });
  }, []);

  const handleLoad = useCallback(
    (id: string) => {
      loadWorkspace(id).catch((err) => {
        addToast(err instanceof Error ? err.message : 'Failed to load workspace', 'error');
      });
    },
    [loadWorkspace, addToast],
  );

  const handleUpdate = useCallback(
    (id: string) => {
      updateWorkspace(id).catch((err) => {
        addToast(err instanceof Error ? err.message : 'Failed to update workspace', 'error');
      });
      setContextMenu(null);
    },
    [updateWorkspace, addToast],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const ws = workspaces.find((w) => w.id === id);
      setDeleteConfirm({ id, name: ws?.name ?? id });
      setContextMenu(null);
    },
    [workspaces],
  );

  const confirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    deleteWorkspace(deleteConfirm.id).catch((err) => {
      addToast(err instanceof Error ? err.message : 'Failed to delete workspace', 'error');
    });
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteWorkspace, addToast]);

  const handleStartRename = useCallback(
    (id: string) => {
      const ws = workspaces.find((w) => w.id === id);
      if (ws) {
        setRenamingId(id);
        setRenameValue(ws.name);
      }
      setContextMenu(null);
    },
    [workspaces],
  );

  const handleCommitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameWorkspace(renamingId, renameValue.trim()).catch((err) => {
        addToast(err instanceof Error ? err.message : 'Failed to rename workspace', 'error');
      });
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, renameWorkspace]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCommitRename();
      } else if (e.key === 'Escape') {
        setRenamingId(null);
        setRenameValue('');
      }
    },
    [handleCommitRename],
  );

  // Sort workspaces by updatedAt descending
  const sortedWorkspaces = useMemo(
    () =>
      [...workspaces].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [workspaces],
  );

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1"><div className="py-1">
        {sortedWorkspaces.map((ws: Workspace) => {
          const isActive = ws.id === activeWorkspaceId;

          return (
            <div
              key={ws.id}
              className={`group flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-[var(--bg-surface)] rounded-sm mx-1 ${
                isActive ? 'bg-[var(--bg-surface)]' : ''
              }`}
              onClick={() => {
                if (renamingId !== ws.id) handleLoad(ws.id);
              }}
              onContextMenu={(e) => handleContextMenu(e, ws.id)}
            >
              <Save size={14} className="flex-shrink-0 text-[var(--text-tertiary)]" />
              <div className="flex-1 min-w-0">
                {renamingId === ws.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleCommitRename}
                    onKeyDown={handleRenameKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Rename workspace"
                    className="w-full bg-[var(--bg-surface)] border border-[var(--accent)] rounded px-1 py-0 text-[length:var(--font-size-base)] text-[var(--text-primary)] outline-none"
                  />
                ) : (
                  <>
                    <div className="truncate text-[length:var(--font-size-base)] text-[var(--text-primary)]">
                      {ws.name}
                    </div>
                    <div className="truncate text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]">
                      {relativeTime(ws.updatedAt)}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {workspaces.length === 0 && (
          <div className="px-4 py-6 text-center text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]">
            No saved workspaces. Save your current layout to get started.
          </div>
        )}
      </div></ScrollArea>

      {/* Save Current as Workspace button */}
      <div className="border-t border-[var(--border)] p-2">
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 text-[length:var(--font-size-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded-sm transition-colors"
          onClick={() => useLayoutStore.getState().setSaveWorkspaceDialogOpen(true)}
        >
          <Plus size={14} />
          Save Current as Workspace
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] rounded-md border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-colors"
            onClick={() => handleStartRename(contextMenu.workspaceId)}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-colors"
            onClick={() => handleUpdate(contextMenu.workspaceId)}
          >
            Update
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--bg-primary)] transition-colors"
            onClick={() => handleDelete(contextMenu.workspaceId)}
          >
            Delete
          </button>
        </div>
      )}

      {/* Delete Workspace Confirmation */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Delete Workspace"
        message={`Delete workspace "${deleteConfirm?.name}"?`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
