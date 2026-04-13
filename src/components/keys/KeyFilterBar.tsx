import { useCallback, useRef, useState } from 'react';
import { Star, Upload, Plus, RefreshCw } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { useKeyStore, type SearchOptions } from '../../stores/keyStore';
import { useSyncStore } from '../../stores/syncStore';
import { SavedFilterDropdown } from './SavedFilterDropdown';
import SearchInput from '../ui/SearchInput';

interface KeyFilterBarProps {
  namespaceId: string;
  accountId: string;
  onImport?: () => void;
  onCreateKey?: () => void;
}

export function KeyFilterBar({ namespaceId, accountId, onImport, onCreateKey }: KeyFilterBarProps) {
  const totalMap = useKeyStore((s) => s.totalMap);
  const keysMap = useKeyStore((s) => s.keysMap);
  const filterMap = useKeyStore((s) => s.filterMap);
  const setFilter = useKeyStore((s) => s.setFilter);
  const loadKeys = useKeyStore((s) => s.loadKeys);
  const searchOptionsMap = useKeyStore((s) => s.searchOptionsMap);
  const setSearchOptions = useKeyStore((s) => s.setSearchOptions);

  const nsSyncStatus = useSyncStore((s) => s.syncStatus[namespaceId]?.status);
  const startSync = useSyncStore((s) => s.startSync);
  const isSyncing = nsSyncStatus === 'syncing';

  const [showSavedFilters, setShowSavedFilters] = useState(false);
  const starButtonRef = useRef<HTMLButtonElement>(null);

  const keys = keysMap[namespaceId] ?? [];
  const total = totalMap[namespaceId] ?? 0;
  const activeFilter = filterMap[namespaceId] ?? '';
  const filteredCount = keys.length;
  const opts: SearchOptions = searchOptionsMap[namespaceId] ?? { caseSensitive: false, wholeWord: false, isRegex: false };

  const handleSearchChange = useCallback(
    (value: string) => {
      setFilter(namespaceId, value);
      loadKeys(namespaceId, value);
    },
    [namespaceId, setFilter, loadKeys],
  );

  const handleOptionChange = useCallback(
    (newOpts: SearchOptions) => {
      setSearchOptions(namespaceId, newOpts);
      const currentFilter = useKeyStore.getState().filterMap[namespaceId] ?? '';
      if (currentFilter) {
        loadKeys(namespaceId, currentFilter, newOpts);
      }
    },
    [namespaceId, setSearchOptions, loadKeys],
  );

  const formatCount = (n: number) => n.toLocaleString();

  const countText = activeFilter
    ? `${formatCount(filteredCount)} / ${formatCount(total)} keys`
    : `${formatCount(total)} keys`;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--border)]">
      <div className="flex-1 min-w-0">
        <SearchInput
          value={activeFilter}
          onChange={handleSearchChange}
          caseSensitive={opts.caseSensitive}
          onCaseSensitiveChange={(v) => handleOptionChange({ ...opts, caseSensitive: v })}
          wholeWord={opts.wholeWord}
          onWholeWordChange={(v) => handleOptionChange({ ...opts, wholeWord: v })}
          regex={opts.isRegex}
          onRegexChange={(v) => handleOptionChange({ ...opts, isRegex: v })}
          placeholder="Filter keys..."
        />
      </div>
      <div className="relative">
        <button
          ref={starButtonRef}
          onClick={() => setShowSavedFilters((prev) => !prev)}
          aria-expanded={showSavedFilters}
          aria-haspopup="true"
          className="flex items-center justify-center p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          title="Saved filters"
        >
          <Star size={14} />
        </button>
        {showSavedFilters && (
          <SavedFilterDropdown
            namespaceId={namespaceId}
            onClose={() => setShowSavedFilters(false)}
            anchorRef={starButtonRef}
          />
        )}
      </div>
      <button
        onClick={() => startSync(accountId, namespaceId)}
        disabled={isSyncing}
        className="flex items-center justify-center p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:cursor-default"
        title="Re-sync namespace"
      >
        {isSyncing ? <Spinner size={14} /> : <RefreshCw size={14} />}
      </button>
      <span className="text-[length:var(--font-size-sm)] text-[var(--text-secondary)] whitespace-nowrap">
        {countText}
      </span>
      {onCreateKey && (
        <button
          onClick={onCreateKey}
          className="flex items-center justify-center p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          title="Create key"
        >
          <Plus size={14} />
        </button>
      )}
      {onImport && (
        <button
          onClick={onImport}
          className="flex items-center justify-center p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          title="Import keys"
        >
          <Upload size={14} />
        </button>
      )}
    </div>
  );
}
