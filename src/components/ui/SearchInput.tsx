import { useCallback, useEffect, useRef } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (value: boolean) => void;
  wholeWord: boolean;
  onWholeWordChange: (value: boolean) => void;
  regex: boolean;
  onRegexChange: (value: boolean) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex items-center justify-center w-5 h-5 rounded text-[length:var(--font-size-sm)] font-mono leading-none cursor-pointer select-none transition-colors ${
        active
          ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

export default function SearchInput({
  value,
  onChange,
  caseSensitive,
  onCaseSensitiveChange,
  wholeWord,
  onWholeWordChange,
  regex,
  onRegexChange,
  placeholder = 'Search...',
  autoFocus = false,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onChange(val);
      }, 200);
    },
    [onChange],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 h-[26px] focus-within:border-[var(--accent)]">
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none text-[length:var(--font-size-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
      />
      <div className="flex items-center gap-0.5 ml-1">
        <ToggleButton
          active={caseSensitive}
          onClick={() => onCaseSensitiveChange(!caseSensitive)}
          title="Match Case"
        >
          Aa
        </ToggleButton>
        <ToggleButton
          active={wholeWord}
          onClick={() => onWholeWordChange(!wholeWord)}
          title="Match Whole Word"
        >
          <span className="underline underline-offset-2">ab</span>
        </ToggleButton>
        <ToggleButton
          active={regex}
          onClick={() => onRegexChange(!regex)}
          title="Use Regular Expression"
        >
          .*
        </ToggleButton>
      </div>
    </div>
  );
}
