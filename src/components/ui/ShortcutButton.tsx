import type { ReactNode } from 'react';
import { Kbd } from './Kbd';

interface ShortcutButtonProps {
  label: string;
  /** Keyboard shortcut to show on the right. Ignored if `rightSlot` is provided. */
  keys?: string[];
  /** Custom right-side content (e.g. an external-link icon) in place of the Kbd. */
  rightSlot?: ReactNode;
  onClick: () => void;
}

export function ShortcutButton({ label, keys, rightSlot, onClick }: ShortcutButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-8 px-3 py-1.5 rounded-md text-[length:var(--font-size-base)] text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
    >
      <span className="text-left">{label}</span>
      <span className="ml-auto">
        {rightSlot ?? (keys ? <Kbd keys={keys} /> : null)}
      </span>
    </button>
  );
}
