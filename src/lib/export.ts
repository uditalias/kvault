import * as api from './tauri';

export type ExportFormat = 'json' | 'csv';

export interface ExportProgress {
  fetched: number;
  total: number;
}

interface KeyValueEntry {
  key: string;
  value: string;
  ttl: number | null;
}

/**
 * Fetch values for all given keys, reporting progress via callback.
 */
async function fetchKeyValues(
  accountId: string,
  namespaceId: string,
  keyNames: string[],
  keys: api.KeyRow[],
  onProgress?: (progress: ExportProgress) => void,
): Promise<KeyValueEntry[]> {
  const keyMap = new Map(keys.map((k) => [k.key_name, k]));
  const entries: KeyValueEntry[] = [];

  for (let i = 0; i < keyNames.length; i++) {
    const keyName = keyNames[i];
    onProgress?.({ fetched: i, total: keyNames.length });

    try {
      const result = await api.getValue(accountId, namespaceId, keyName);
      const decoder = new TextDecoder();
      const valueStr = decoder.decode(new Uint8Array(result.data));
      const keyRow = keyMap.get(keyName);
      entries.push({
        key: keyName,
        value: valueStr,
        ttl: keyRow?.expiration ?? null,
      });
    } catch {
      // Skip keys that fail to fetch
      entries.push({
        key: keyName,
        value: '',
        ttl: null,
      });
    }
  }

  onProgress?.({ fetched: keyNames.length, total: keyNames.length });
  return entries;
}

/**
 * Build JSON export string.
 * Produces { "key1": value1, "key2": value2 } where values are parsed as JSON if possible.
 */
function buildJsonExport(entries: KeyValueEntry[]): string {
  const obj: Record<string, unknown> = {};
  for (const entry of entries) {
    try {
      obj[entry.key] = JSON.parse(entry.value);
    } catch {
      obj[entry.key] = entry.value;
    }
  }
  return JSON.stringify(obj, null, 2);
}

/**
 * Escape a value for CSV: wrap in quotes and double any existing quotes.
 */
function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build CSV export string.
 */
function buildCsvExport(entries: KeyValueEntry[]): string {
  const lines = ['key,value,ttl'];
  for (const entry of entries) {
    const ttlStr = entry.ttl !== null ? String(entry.ttl) : '';
    lines.push(`${csvEscape(entry.key)},${csvEscape(entry.value)},${ttlStr}`);
  }
  return lines.join('\n');
}

/**
 * Export selected keys to a string in the given format.
 */
export async function exportKeys(
  accountId: string,
  namespaceId: string,
  keyNames: string[],
  keys: api.KeyRow[],
  format: ExportFormat,
  onProgress?: (progress: ExportProgress) => void,
): Promise<string> {
  const entries = await fetchKeyValues(accountId, namespaceId, keyNames, keys, onProgress);

  if (format === 'json') {
    return buildJsonExport(entries);
  }
  return buildCsvExport(entries);
}

/**
 * Copy text to clipboard.
 */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/**
 * Trigger a file download in the browser.
 */
export function downloadAsFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
