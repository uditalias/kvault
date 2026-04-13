import { useMemo, useRef, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Copy, Check } from 'lucide-react';

export interface HexViewerProps {
  data: number[];
}

const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 24;

/** Detect image type from magic bytes */
function detectImageType(data: number[]): string | null {
  if (data.length < 4) return null;

  // PNG: 89 50 4E 47
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: 47 49 46 38
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) {
    return 'image/gif';
  }

  return null;
}

/** Convert a byte to a 2-digit hex string */
function byteToHex(b: number): string {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

/** Convert a byte to printable ASCII or '.' */
function byteToAscii(b: number): string {
  return b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
}

/** Format offset as 8-digit hex */
function formatOffset(offset: number): string {
  return offset.toString(16).padStart(8, '0').toUpperCase();
}

export function HexViewer({ data }: HexViewerProps) {
  const [copied, setCopied] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const totalRows = Math.ceil(data.length / BYTES_PER_ROW) || 1;

  const imageType = useMemo(() => detectImageType(data), [data]);

  const imageUrl = useMemo(() => {
    if (!imageType) return null;
    const blob = new Blob([new Uint8Array(data)], { type: imageType });
    return URL.createObjectURL(blob);
  }, [data, imageType]);

  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const handleCopyBase64 = useCallback(async () => {
    try {
      const bytes = new Uint8Array(data);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      await navigator.clipboard.writeText(base64);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed silently
    }
  }, [data]);

  const renderRow = useCallback(
    (rowIndex: number) => {
      const offset = rowIndex * BYTES_PER_ROW;
      const rowBytes = data.slice(offset, offset + BYTES_PER_ROW);

      // Build hex string with gap between bytes 7-8
      const hexParts: string[] = [];
      for (let i = 0; i < BYTES_PER_ROW; i++) {
        if (i === 8) hexParts.push('');
        if (i < rowBytes.length) {
          hexParts.push(byteToHex(rowBytes[i]));
        } else {
          hexParts.push('  ');
        }
      }
      const hexStr = hexParts.join(' ');

      // Build ASCII string
      const asciiStr = rowBytes.map(byteToAscii).join('');
      const paddedAscii = asciiStr.padEnd(BYTES_PER_ROW, ' ');

      return (
        <>
          <span className="text-[var(--text-tertiary)] select-none">{formatOffset(offset)}</span>
          <span className="text-[var(--text-primary)]">  {hexStr}</span>
          <span className="text-[var(--text-secondary)]">  {paddedAscii}</span>
        </>
      );
    },
    [data],
  );

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-primary)]">
        <button
          onClick={handleCopyBase64}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md
            bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]
            border border-[var(--border-primary)] hover:border-[var(--border-secondary)]
            transition-colors cursor-pointer"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy as Base64'}
        </button>
        <span className="text-[11px] text-[var(--text-tertiary)] ml-auto">
          {data.length} byte{data.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Image preview */}
      {imageUrl && (
        <div className="flex justify-center p-3 border-b border-[var(--border-primary)] bg-[var(--bg-surface)]">
          <img
            src={imageUrl}
            alt="Binary preview"
            className="max-h-[200px] object-contain rounded"
            onLoad={() => {
              // revoke not needed immediately; keep for display
            }}
          />
        </div>
      )}

      {/* Header row */}
      <div
        className="px-3 text-[12px] leading-[24px] font-[family-name:var(--font-mono)] whitespace-pre select-none
          text-[var(--text-tertiary)] border-b border-[var(--border-primary)]"
      >
        <span>{'Offset  '}</span>
        <span>
          {'  00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F'}
        </span>
        <span>{'  ASCII'}</span>
      </div>

      {/* Virtualized hex rows */}
      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="px-3 text-[12px] leading-[24px] font-[family-name:var(--font-mono)] whitespace-pre
                hover:bg-[var(--bg-surface)] transition-colors"
            >
              {renderRow(virtualRow.index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
