import { useCallback, useEffect, useRef } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import { ScrollArea } from '../ui/ScrollArea';
import { ActionButton } from '../ui/ActionButton';
import SearchInput from '../ui/SearchInput';
import type { GlobalSearchResult, KeyRow } from '../../lib/tauri';
import { useTabStore } from '../../stores/tabStore';
import { useAccountStore } from '../../stores/accountStore';
import { useSearchStore } from '../../stores/searchStore';

function formatExpiration(expiration: number | null): string | null {
  if (expiration === null) return null;
  const date = new Date(expiration * 1000);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return 'expired';

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function NamespaceGroup({
  result,
  accountName,
  collapsed,
  onToggle,
  onKeyClick,
}: {
  result: GlobalSearchResult;
  accountName: string;
  collapsed: boolean;
  onToggle: () => void;
  onKeyClick: (accountId: string, namespaceId: string, keyName: string) => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-2 py-1.5 hover:bg-[var(--bg-surface)] cursor-pointer select-none"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-[var(--text-tertiary)] transition-transform ${
            collapsed ? '' : 'rotate-90'
          }`}
        />
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="truncate text-[length:var(--font-size-sm)] font-semibold text-[var(--text-primary)]">
            {result.namespace_title}
          </span>
          <span className="text-[length:var(--font-size-sm)] text-[var(--text-tertiary)] truncate">
            {accountName}
          </span>
        </div>
        <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] bg-[var(--accent)]/15 text-[var(--accent)]">
          {result.total_matches}
        </span>
      </button>
      {!collapsed && (
        <div>
          {result.keys.map((key) => (
            <KeyResultRow
              key={key.key_name}
              keyRow={key}
              onClick={() =>
                onKeyClick(result.account_id, result.namespace_id, key.key_name)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KeyResultRow({
  keyRow,
  onClick,
}: {
  keyRow: KeyRow;
  onClick: () => void;
}) {
  const ttlLabel = formatExpiration(keyRow.expiration);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 pl-7 pr-2 h-[26px] cursor-pointer select-none hover:bg-[var(--bg-surface)]"
    >
      <span
        className="flex-1 truncate font-[family-name:var(--font-mono)] text-[length:var(--font-size-sm)] text-[var(--text-primary)]"
        title={keyRow.key_name}
      >
        {keyRow.key_name}
      </span>
      {ttlLabel && (
        <span className="shrink-0">
          <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--warning)]/20 text-[var(--warning)]">
            {ttlLabel}
          </span>
        </span>
      )}
    </div>
  );
}

export default function SearchPanel() {
  const query = useSearchStore((s) => s.query);
  const caseSensitive = useSearchStore((s) => s.caseSensitive);
  const wholeWord = useSearchStore((s) => s.wholeWord);
  const regex = useSearchStore((s) => s.regex);
  const results = useSearchStore((s) => s.results);
  const loading = useSearchStore((s) => s.loading);
  const error = useSearchStore((s) => s.error);
  const collapsedGroups = useSearchStore((s) => s.collapsedGroups);

  const setQuery = useSearchStore((s) => s.setQuery);
  const setCaseSensitive = useSearchStore((s) => s.setCaseSensitive);
  const setWholeWord = useSearchStore((s) => s.setWholeWord);
  const setRegex = useSearchStore((s) => s.setRegex);
  const toggleGroup = useSearchStore((s) => s.toggleGroup);
  const runSearch = useSearchStore((s) => s.runSearch);
  const clear = useSearchStore((s) => s.clear);

  const openKeyTab = useTabStore((s) => s.openKeyTab);
  const accounts = useAccountStore((s) => s.accounts);

  const accountNameMap = new Map(accounts.map((a) => [a.id, a.name]));

  const prevSearchRef = useRef({ query, caseSensitive, wholeWord, regex });

  useEffect(() => {
    const prev = prevSearchRef.current;
    if (
      prev.query !== query ||
      prev.caseSensitive !== caseSensitive ||
      prev.wholeWord !== wholeWord ||
      prev.regex !== regex
    ) {
      prevSearchRef.current = { query, caseSensitive, wholeWord, regex };
      runSearch();
    }
  }, [query, caseSensitive, wholeWord, regex, runSearch]);

  const handleKeyClick = useCallback(
    (accountId: string, namespaceId: string, keyName: string) => {
      openKeyTab(accountId, namespaceId, keyName, true);
    },
    [openKeyTab],
  );

  const hasQuery = query.trim().length > 0;
  const totalResults = results?.reduce((sum, g) => sum + g.total_matches, 0) ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          caseSensitive={caseSensitive}
          onCaseSensitiveChange={setCaseSensitive}
          wholeWord={wholeWord}
          onWholeWordChange={setWholeWord}
          regex={regex}
          onRegexChange={setRegex}
          placeholder="Search keys across all namespaces..."
          autoFocus
        />
      </div>

      {/* Results header with count and clear */}
      {hasQuery && !loading && results && results.length > 0 && (
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]">
            {totalResults.toLocaleString()} result{totalResults !== 1 ? 's' : ''} in {results.length} namespace{results.length !== 1 ? 's' : ''}
          </span>
          <ActionButton icon={X} label="Clear" onClick={clear} />
        </div>
      )}

      <ScrollArea className="flex-1">
        {loading && (
          <div className="shimmer-container px-3 py-3 space-y-3">
            {Array.from({ length: 3 }).map((_, g) => (
              <div key={g} className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <div className="pl-3 space-y-1">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="px-3 py-4 text-[length:var(--font-size-sm)] text-[var(--error,#ef4444)]">
            {error}
          </div>
        )}

        {!loading && !error && !hasQuery && (
          <div className="px-3 py-4 text-[var(--text-tertiary)] text-[length:var(--font-size-sm)] text-center">
            Type to search key names across all namespaces
          </div>
        )}

        {!loading && !error && hasQuery && results && results.length === 0 && (
          <div className="px-3 py-4 text-[var(--text-tertiary)] text-[length:var(--font-size-sm)] text-center">
            No results
          </div>
        )}

        {!loading && !error && results && results.length > 0 && (
          <div>
            {results.map((group) => (
              <NamespaceGroup
                key={group.namespace_id}
                result={group}
                accountName={accountNameMap.get(group.account_id) ?? group.account_id}
                collapsed={collapsedGroups.has(group.namespace_id)}
                onToggle={() => toggleGroup(group.namespace_id)}
                onKeyClick={handleKeyClick}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
