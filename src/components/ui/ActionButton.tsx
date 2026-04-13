import type { LucideIcon } from 'lucide-react';

interface ActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

export function ActionButton({ icon: Icon, label, onClick, disabled, title }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[length:var(--font-size-sm)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
    >
      <Icon size={12} />
      <span>{label}</span>
    </button>
  );
}
