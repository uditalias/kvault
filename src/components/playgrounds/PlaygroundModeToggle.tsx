import { useLayoutEffect, useRef, useState } from 'react';
import type { PlaygroundMode } from '../../lib/tauri';

interface Props {
  mode: PlaygroundMode;
  disabled?: boolean;
  onChange: (mode: PlaygroundMode) => void;
}

/**
 * Segmented switch between Read-only and Live. Rendered as two pill segments
 * inside a single rounded container. A single sliding indicator pill slides
 * between the active segment's position and cross-fades its color (green
 * ↔ red), while the text and dot colors transition alongside.
 */
export function PlaygroundModeToggle({ mode, disabled, onChange }: Props) {
  const [hovering, setHovering] = useState(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const isReadOnly = mode === 'read-only';

  const readOnlyRef = useRef<HTMLButtonElement>(null);
  const liveRef = useRef<HTMLButtonElement>(null);

  // Keep the sliding indicator aligned with the active segment. useLayoutEffect
  // (not useEffect) so the initial position paints synchronously — no flash
  // of an unplaced indicator on mount.
  useLayoutEffect(() => {
    const btn = isReadOnly ? readOnlyRef.current : liveRef.current;
    if (!btn) return;
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [isReadOnly]);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div
        role="tablist"
        aria-label="Playground mode"
        className={`relative inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] p-0.5 text-xs ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        {/* Sliding indicator — position + color animate together. */}
        <div
          aria-hidden
          className={`absolute top-0.5 bottom-0.5 rounded-full transition-[left,width,background-color] duration-200 ease-out ${
            isReadOnly ? 'bg-green-500/20' : 'bg-red-500/20'
          } ${indicator ? '' : 'opacity-0'}`}
          style={
            indicator
              ? { left: `${indicator.left}px`, width: `${indicator.width}px` }
              : undefined
          }
        />

        <button
          ref={readOnlyRef}
          type="button"
          role="tab"
          aria-selected={isReadOnly}
          disabled={disabled}
          onClick={() => {
            if (!isReadOnly) onChange('read-only');
          }}
          className={`relative z-10 flex items-center gap-1.5 h-6 px-2.5 rounded-full transition-colors ${
            isReadOnly
              ? 'text-green-500'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              isReadOnly ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'
            }`}
          />
          <span>Read-only</span>
        </button>
        <button
          ref={liveRef}
          type="button"
          role="tab"
          aria-selected={!isReadOnly}
          disabled={disabled}
          onClick={() => {
            if (isReadOnly) onChange('live');
          }}
          className={`relative z-10 flex items-center gap-1.5 h-6 px-2.5 rounded-full transition-colors ${
            !isReadOnly
              ? 'text-red-500'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              !isReadOnly ? 'bg-red-500' : 'bg-[var(--text-tertiary)]'
            }`}
          />
          <span>Live</span>
        </button>
      </div>

      {hovering && !disabled && (
        <div className="absolute top-full mt-1 right-0 z-10 w-64 px-2.5 py-1.5 text-xs leading-snug rounded bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-lg pointer-events-none">
          {isReadOnly
            ? 'Read-only: put() and delete() are blocked. Click Live to enable writes.'
            : 'Live: writes go directly to Cloudflare. Click Read-only to disable writes.'}
        </div>
      )}
    </div>
  );
}
