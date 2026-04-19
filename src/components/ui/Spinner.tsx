import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 16 }: SpinnerProps) {
  return (
      <Loader2
        size={size}
        className="animate-spin block"
      />
  );
}
