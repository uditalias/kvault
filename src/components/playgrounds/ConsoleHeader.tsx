import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react';

interface ConsoleHeaderProps {
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  onCopy: () => void;
}

export function ConsoleHeader({ open, onToggle, onClear, onCopy }: ConsoleHeaderProps) {
  return (
    <div className="flex items-center justify-between h-[38px] px-2 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
      <span className="text-[11px] tracking-wider uppercase font-medium text-[var(--text-secondary)] select-none">
        Console
      </span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onClear}
          className="flex items-center justify-center w-6 h-6 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors"
          title="Clear console"
          aria-label="Clear console"
        >
          <Trash2 size={13} />
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center justify-center w-6 h-6 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors"
          title="Copy output"
          aria-label="Copy output"
        >
          <Copy size={13} />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center justify-center w-6 h-6 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors"
          title={open ? 'Hide console' : 'Show console'}
          aria-label={open ? 'Hide console' : 'Show console'}
        >
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
    </div>
  );
}
