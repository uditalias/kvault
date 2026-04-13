import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: number;
  className?: string;
}

/**
 * Centered spinner using Loader2 icon.
 * Wraps the SVG in an inline-flex container with explicit transform-origin
 * to prevent wobble caused by SVG baseline alignment in flex layouts.
 */
export function Spinner({ size = 16, className = '' }: SpinnerProps) {
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <Loader2 size={size} className="animate-spin" />
    </span>
  );
}
