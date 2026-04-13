import { useEffect, useRef } from 'react';

interface KeyContextMenuProps {
  x: number;
  y: number;
  keyName: string;
  onClose: () => void;
  onOpenInNewTab: () => void;
  onCopyKeyName: () => void;
  onSelectAll: () => void;
  onDuplicateKey: () => void;
  onDeleteKey: () => void;
  onExportSelected: () => void;
  hasSelection: boolean;
}

export function KeyContextMenu({
  x,
  y,
  keyName: _keyName,
  onClose,
  onOpenInNewTab,
  onCopyKeyName,
  onSelectAll,
  onDuplicateKey,
  onDeleteKey,
  onExportSelected,
  hasSelection,
}: KeyContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;

    if (rect.right > window.innerWidth) {
      el.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  const menuItems: Array<
    | { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }
    | { separator: true }
  > = [
    {
      label: 'Open in new tab',
      onClick: () => {
        onOpenInNewTab();
        onClose();
      },
    },
    {
      label: 'Copy key name',
      onClick: () => {
        onCopyKeyName();
        onClose();
      },
    },
    {
      label: 'Duplicate key',
      onClick: () => {
        onDuplicateKey();
        onClose();
      },
    },
    { separator: true },
    {
      label: 'Delete key',
      onClick: () => {
        onDeleteKey();
        onClose();
      },
      danger: true,
    },
    { separator: true },
    {
      label: 'Select all',
      onClick: () => {
        onSelectAll();
        onClose();
      },
    },
    {
      label: 'Export selected',
      onClick: () => {
        onExportSelected();
        onClose();
      },
      disabled: !hasSelection,
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] py-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded shadow-lg"
      style={{ left: x, top: y }}
    >
      {menuItems.map((item, i) => {
        if ('separator' in item) {
          return (
            <div
              key={`sep-${i}`}
              className="my-1 border-t border-[var(--border)]"
            />
          );
        }

        return (
          <button
            key={item.label}
            onClick={item.onClick}
            disabled={item.disabled}
            className={`w-full px-3 py-1 text-left text-[length:var(--font-size-sm)] hover:bg-[var(--accent)]/10 disabled:text-[var(--text-tertiary)] disabled:hover:bg-transparent cursor-default ${
              item.danger
                ? 'text-[var(--danger)]'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
