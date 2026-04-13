interface KbdProps {
  keys: string[];
}

export function Kbd({ keys }: KbdProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, i) => (
        <kbd
          key={i}
          className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)] text-[11px] font-medium font-sans shadow-[0_1px_0_var(--border)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
