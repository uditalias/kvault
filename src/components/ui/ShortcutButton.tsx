import { Kbd } from './Kbd';

interface ShortcutButtonProps {
  label: string;
  keys: string[];
  onClick: () => void;
}

export function ShortcutButton({ label, keys, onClick }: ShortcutButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-8 px-3 py-1.5 rounded-md text-[length:var(--font-size-base)] text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
    >
      <span className="text-left">{label}</span>
      <span className="ml-auto">
        <Kbd keys={keys} />
      </span>
    </button>
  );
}
