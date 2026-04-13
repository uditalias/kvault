import { useState, useCallback } from 'react';
import { Copy, Check, Save, Undo2 } from 'lucide-react';
import { ActionButton } from '../ui/ActionButton';

export interface MetadataHeaderProps {
  keyName: string;
  contentType: 'json' | 'text' | 'binary';
  size: number;
  expiration: number | null;
  viewMode: 'formatted' | 'raw';
  onViewModeChange: (mode: 'formatted' | 'raw') => void;
  isDirty?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const badgeColors: Record<string, string> = {
  json: 'bg-[var(--accent)]/20 text-[var(--accent)]',
  text: 'bg-[var(--text-tertiary)]/20 text-[var(--text-secondary)]',
  binary: 'bg-[var(--warning)]/20 text-[var(--warning)]',
};

export function MetadataHeader({
  keyName,
  contentType,
  size,
  expiration,
  viewMode,
  onViewModeChange,
  isDirty,
  onSave,
  onDiscard,
}: MetadataHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(keyName).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [keyName]);

  const ttlLabel = (() => {
    if (expiration == null) return 'No expiration';
    const now = Date.now() / 1000;
    const diff = expiration - now;
    if (diff <= 0) return 'Expired';
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `Expires in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Expires in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Expires in ${days}d`;
  })();

  return (
    <div
      className="flex items-center gap-3 px-3 h-10 min-h-[40px] bg-[var(--bg-secondary)] border-b border-[var(--border)] text-[length:var(--font-size-sm)]"
    >
      {/* Key name */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 font-mono text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors truncate max-w-[300px] cursor-pointer"
        title="Click to copy key name"
      >
        <span className="truncate">{keyName}</span>
        {copied ? (
          <Check size={12} className="text-[var(--success)] flex-shrink-0" />
        ) : (
          <Copy size={12} className="flex-shrink-0 opacity-50" />
        )}
      </button>

      {/* Content type badge */}
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${badgeColors[contentType]}`}
      >
        {contentType}
      </span>

      {/* Size */}
      <span className="text-[var(--text-tertiary)]">{formatSize(size)}</span>

      {/* TTL */}
      <span className="text-[var(--text-tertiary)]">{ttlLabel}</span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save / Discard buttons — only when dirty */}
      {isDirty && onSave && (
        <ActionButton icon={Save} label="Save" onClick={onSave} title="Save (⌘S)" />
      )}
      {isDirty && onDiscard && (
        <ActionButton icon={Undo2} label="Discard" onClick={onDiscard} title="Discard changes" />
      )}

      {/* View mode toggle (JSON only) */}
      {contentType === 'json' && (
        <div className="flex items-center rounded overflow-hidden border border-[var(--border)]">
          <button
            onClick={() => onViewModeChange('formatted')}
            className={`px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
              viewMode === 'formatted'
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Formatted
          </button>
          <button
            onClick={() => onViewModeChange('raw')}
            className={`px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
              viewMode === 'raw'
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Raw
          </button>
        </div>
      )}
    </div>
  );
}
