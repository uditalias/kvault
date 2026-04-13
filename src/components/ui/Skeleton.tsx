import type { CSSProperties } from 'react';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

/** A single shimmer bar. Use inside a shimmer-container for synced animation. */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`shimmer-bg bg-[var(--bg-surface)] rounded ${className}`}
      style={style}
    />
  );
}
