import { useEffect, useRef, useState, useCallback, type FormEvent } from 'react';
import { Upload } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { parseImportData, type ImportEntry, type ImportFormat } from '../../lib/import';
import * as api from '../../lib/tauri';
import { useKeyStore } from '../../stores/keyStore';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
  namespaceId: string;
  existingKeyNames: Set<string>;
}

export default function ImportDialog({
  open,
  onClose,
  accountId,
  namespaceId,
  existingKeyNames,
}: ImportDialogProps) {
  const [rawInput, setRawInput] = useState('');
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [format, setFormat] = useState<ImportFormat | null>(null);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadKeys = useKeyStore((s) => s.loadKeys);

  const titleId = 'import-dialog-title';

  // Reset on open
  useEffect(() => {
    if (open) {
      setRawInput('');
      setEntries([]);
      setFormat(null);
      setParseError('');
      setImporting(false);
      setProgress(null);
      setError('');
    }
  }, [open]);

  // Focus trap & Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleParse = useCallback(() => {
    setParseError('');
    setEntries([]);
    setFormat(null);

    if (!rawInput.trim()) {
      setParseError('Paste JSON data to import');
      return;
    }

    try {
      const result = parseImportData(rawInput);
      if (result.entries.length === 0) {
        setParseError('No keys found in the input');
        return;
      }
      setEntries(result.entries);
      setFormat(result.format);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse input';
      setParseError(msg);
    }
  }, [rawInput]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setRawInput(text);
        // Auto-parse after loading
        try {
          const result = parseImportData(text);
          if (result.entries.length > 0) {
            setEntries(result.entries);
            setFormat(result.format);
            setParseError('');
          } else {
            setParseError('No keys found in the file');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to parse file';
          setParseError(msg);
        }
      }
    };
    reader.readAsText(file);

    // Reset input so re-selecting the same file triggers change
    e.target.value = '';
  }, []);

  const newKeys = entries.filter((e) => !existingKeyNames.has(e.key));
  const existingKeys = entries.filter((e) => existingKeyNames.has(e.key));

  const handleImport = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (entries.length === 0 || importing) return;

    setImporting(true);
    setError('');

    try {
      const encoder = new TextEncoder();
      let imported = 0;

      for (const entry of entries) {
        setProgress(`Importing: ${imported + 1}/${entries.length}`);
        const bytes = Array.from(encoder.encode(entry.value));
        await api.createKey(accountId, namespaceId, entry.key, bytes, entry.ttl);
        imported++;
      }

      await loadKeys(namespaceId);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setError(msg);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }, [entries, importing, accountId, namespaceId, loadKeys, onClose]);

  if (!open) return null;

  const inputClasses =
    'w-full rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] px-3 py-2 text-[length:var(--font-size-base)] outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-colors placeholder:text-[var(--text-tertiary)] font-mono';

  const labelClasses =
    'block text-[length:var(--font-size-sm)] font-medium text-[var(--text-secondary)] mb-1';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[560px] mx-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2
            id={titleId}
            className="text-[length:var(--font-size-lg)] font-semibold text-[var(--text-primary)]"
          >
            Import Keys
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded"
            aria-label="Close dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleImport} className="px-6 py-5 space-y-4">
          {/* File input or paste */}
          <div>
            <label className={labelClasses}>Paste JSON or load a file</label>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={'{\n  "key1": "value1",\n  "key2": { "nested": true }\n}'}
              rows={6}
              className={inputClasses}
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={handleParse}
                className="px-3 py-1.5 text-[length:var(--font-size-sm)] font-medium rounded-md bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] transition-colors"
              >
                Parse
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-md transition-colors"
              >
                <Upload size={13} />
                Load file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Parse error */}
          {parseError && (
            <p className="text-[length:var(--font-size-sm)] text-[var(--danger)]">{parseError}</p>
          )}

          {/* Preview */}
          {entries.length > 0 && (
            <div className="space-y-2">
              <p className="text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
                Detected format: <span className="font-mono text-[var(--accent)]">{format?.toUpperCase()}</span>
              </p>

              <div className="max-h-[160px] overflow-auto rounded border border-[var(--border)] bg-[var(--bg-primary)]">
                <table className="w-full text-[length:var(--font-size-sm)]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-tertiary)]">
                      <th className="px-3 py-1.5 text-left font-medium">Key</th>
                      <th className="px-3 py-1.5 text-left font-medium">Value (preview)</th>
                      <th className="px-3 py-1.5 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.slice(0, 50).map((entry) => {
                      const isExisting = existingKeyNames.has(entry.key);
                      return (
                        <tr key={entry.key} className="border-b border-[var(--border)]/50">
                          <td className="px-3 py-1 font-mono text-[var(--text-primary)] truncate max-w-[160px]">
                            {entry.key}
                          </td>
                          <td className="px-3 py-1 font-mono text-[var(--text-secondary)] truncate max-w-[200px]">
                            {entry.value.length > 60
                              ? entry.value.slice(0, 60) + '...'
                              : entry.value}
                          </td>
                          <td className="px-3 py-1">
                            {isExisting ? (
                              <span className="text-[var(--warning)]">overwrite</span>
                            ) : (
                              <span className="text-[var(--success)]">new</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {entries.length > 50 && (
                  <p className="px-3 py-1 text-[var(--text-tertiary)] text-[length:var(--font-size-sm)]">
                    ...and {entries.length - 50} more
                  </p>
                )}
              </div>

              <p className="text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">
                <span className="text-[var(--success)]">{newKeys.length} new</span>
                {existingKeys.length > 0 && (
                  <>, <span className="text-[var(--warning)]">{existingKeys.length} existing (will overwrite)</span></>
                )}
              </p>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <p className="text-[length:var(--font-size-sm)] text-[var(--text-secondary)]">{progress}</p>
          )}

          {/* Error */}
          {error && (
            <p className="text-[length:var(--font-size-sm)] text-[var(--danger)]">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[length:var(--font-size-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={entries.length === 0 || importing}
              className="px-4 py-2 text-[length:var(--font-size-base)] font-medium rounded-md bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {importing && (
                <Spinner size={16} />
              )}
              {importing ? 'Importing...' : `Import ${entries.length} key${entries.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
