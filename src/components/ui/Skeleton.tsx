import type { CSSProperties } from 'react';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

/**
 * A single shimmer bar. Use inside a shimmer-container for synced animation.
 *
 * NOTE: tw-shimmer requires BOTH `shimmer` and `shimmer-bg` for background
 * shimmer — `shimmer-bg` alone only sets defaults; `shimmer` carries the
 * keyframes and gradient. The README's `shimmer-bg`-only example is misleading.
 */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`shimmer shimmer-bg bg-[var(--bg-surface)] rounded ${className}`}
      style={style}
    />
  );
}
