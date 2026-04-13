export interface ImportEntry {
  key: string;
  value: string;
  ttl?: number;
}

export type ImportFormat = 'json' | 'csv';

export interface ImportParseResult {
  format: ImportFormat;
  entries: ImportEntry[];
}

/**
 * Detect format and parse import data.
 */
export function parseImportData(content: string): ImportParseResult {
  const trimmed = content.trim();

  // Try JSON first
  if (trimmed.startsWith('{')) {
    return { format: 'json', entries: parseJsonImport(trimmed) };
  }

  // Try CSV
  if (trimmed.startsWith('key,') || trimmed.startsWith('key\t')) {
    return { format: 'csv', entries: parseCsvImport(trimmed) };
  }

  // Default to trying JSON
  return { format: 'json', entries: parseJsonImport(trimmed) };
}

/**
 * Parse JSON import: expects { "key": value, ... }
 */
function parseJsonImport(content: string): ImportEntry[] {
  const obj = JSON.parse(content);

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new Error('JSON import must be an object with key-value pairs');
  }

  const entries: ImportEntry[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    entries.push({ key, value: valueStr });
  }
  return entries;
}

/**
 * Parse CSV import: expects key,value,ttl headers
 */
function parseCsvImport(content: string): ImportEntry[] {
  const lines = content.split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row');
  }

  // Skip header
  const entries: ImportEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    if (fields.length < 2) continue;

    const entry: ImportEntry = {
      key: fields[0],
      value: fields[1],
    };

    if (fields.length >= 3 && fields[2]) {
      const ttl = parseInt(fields[2], 10);
      if (!isNaN(ttl) && ttl > 0) {
        entry.ttl = ttl;
      }
    }

    entries.push(entry);
  }

  return entries;
}

/**
 * Parse a single CSV line respecting quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}
