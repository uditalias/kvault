import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useKeyStore } from '../../stores/keyStore';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface SavedFilterDropdownProps {
  namespaceId: string;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

export function SavedFilterDropdown({
  namespaceId,
  onClose,
  anchorRef,
}: SavedFilterDropdownProps) {
  const {
    savedFilters,
    filterMap,
    loadSavedFilters,
    saveFilter,
    deleteFilter,
    applyFilter,
  } = useKeyStore();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showNameInput, setShowNameInput] = useState(false);
  const [filterName, setFilterName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const filters = savedFilters[namespaceId] ?? [];
  const currentFilter = filterMap[namespaceId] ?? '';
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    loadSavedFilters(namespaceId);
  }, [namespaceId, loadSavedFilters]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, anchorRef]);

  useEffect(() => {
    if (showNameInput && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showNameInput]);

  const handleSave = useCallback(async () => {
    if (!filterName.trim() || !currentFilter.trim()) return;
    await saveFilter(namespaceId, filterName.trim(), 'filter', currentFilter);
    setFilterName('');
    setShowNameInput(false);
  }, [namespaceId, filterName, currentFilter, saveFilter]);

  const handleApply = useCallback(
    (filterId: string) => {
      applyFilter(namespaceId, filterId);
      onClose();
    },
    [namespaceId, applyFilter, onClose],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, filterId: string) => {
      e.stopPropagation();
      const filter = filters.find((f) => f.id === filterId);
      setDeleteConfirm({ id: filterId, name: filter?.name ?? filterId });
    },
    [filters],
  );

  const confirmDeleteFilter = useCallback(async () => {
    if (!deleteConfirm) return;
    await deleteFilter(namespaceId, deleteConfirm.id);
    setDeleteConfirm(null);
  }, [deleteConfirm, namespaceId, deleteFilter]);

  // Position below the anchor button
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [anchorRef]);

  // Adjust if overflowing viewport
  useEffect(() => {
    if (!dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const el = dropdownRef.current;

    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${position.top - rect.height - 8}px`;
    }
  }, [position, filters, showNameInput]);

  return (
    <div
      ref={dropdownRef}
      role="menu"
      aria-label="Saved filters"
      className="fixed z-50 min-w-[220px] max-w-[320px] py-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded shadow-lg"
      style={{ left: position.left, top: position.top }}
    >
      {filters.length === 0 && !showNameInput && (
        <div className="px-3 py-2 text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]">
          No saved filters
        </div>
      )}

      {filters.map((filter) => (
        <div
          key={filter.id}
          role="menuitem"
          tabIndex={0}
          onClick={() => handleApply(filter.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleApply(filter.id);
          }}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[length:var(--font-size-sm)] text-[var(--text-primary)] hover:bg-[var(--accent)]/10 cursor-default group"
        >
          <div className="flex flex-col min-w-0">
            <span className="truncate font-medium">{filter.name}</span>
            <span className="truncate text-[var(--text-tertiary)]">
              {filter.filter_value}
            </span>
          </div>
          <button
            onClick={(e) => handleDelete(e, filter.id)}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] transition-opacity"
            title="Delete filter"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {(filters.length > 0 || showNameInput) && (
        <div className="my-1 border-t border-[var(--border)]" />
      )}

      {showNameInput ? (
        <div className="px-3 py-1.5 flex items-center gap-1">
          <input
            ref={nameInputRef}
            type="text"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setShowNameInput(false);
                setFilterName('');
              }
            }}
            placeholder="Filter name..."
            className="flex-1 px-2 py-0.5 text-[length:var(--font-size-sm)] bg-[var(--bg-primary)] border border-[var(--border)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={handleSave}
            disabled={!filterName.trim()}
            className="px-2 py-0.5 text-[length:var(--font-size-sm)] bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNameInput(true)}
          disabled={!currentFilter.trim()}
          className="w-full px-3 py-1.5 text-left text-[length:var(--font-size-sm)] text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:text-[var(--text-tertiary)] disabled:hover:bg-transparent cursor-default"
        >
          Save current filter...
        </button>
      )}

      {/* Delete Filter Confirmation */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Delete Filter"
        message={`Delete saved filter "${deleteConfirm?.name}"?`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteFilter}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
