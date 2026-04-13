import { useEffect, useState } from 'react';
import { Spinner } from '../ui/Spinner';
import { useTabStore } from '../../stores/tabStore';
import { useAccountStore } from '../../stores/accountStore';
import { useSyncStore } from '../../stores/syncStore';

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const DIVIDER_CLASS = 'border-r border-[var(--border)] pr-2 mr-2';

export default function StatusBar() {
  const [, setTick] = useState(0);
  const { tabs, activeTabId } = useTabStore();
  const { accounts, namespacesMap } = useAccountStore();
  const syncStatus = useSyncStore((s) => s.syncStatus);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const account = activeTab
    ? accounts.find((a) => a.id === activeTab.accountId) ?? null
    : null;

  const namespace = activeTab
    ? Object.values(namespacesMap)
        .flat()
        .find((ns) => ns.id === activeTab.namespaceId) ?? null
    : null;

  const syncState = activeTab
    ? syncStatus[activeTab.namespaceId] ?? null
    : null;

  // Refresh relative time every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      role="status"
      className="flex items-center h-6 min-h-6 bg-[var(--bg-tertiary)] border-t border-[var(--border)] px-3 text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]"
    >
      {/* Left segments */}
      <div className="flex items-center min-w-0 flex-1">
        {account && (
          <span className={DIVIDER_CLASS}>{account.name}</span>
        )}

        {namespace && (
          <span className={DIVIDER_CLASS}>{namespace.title}</span>
        )}

        {syncState && syncState.totalKeys > 0 && syncState.status !== 'error' && (
          <span className={DIVIDER_CLASS}>
            {formatNumber(syncState.totalKeys)} keys
          </span>
        )}

        {syncState && syncState.status === 'syncing' && (
          <span className="flex items-center gap-1">
            <Spinner size={12} />
            Syncing {formatNumber(syncState.fetchedKeys)} / {formatNumber(syncState.totalKeys || syncState.fetchedKeys)}
          </span>
        )}

        {syncState && syncState.status === 'idle' && syncState.lastSyncedAt && (
          <span>Synced {relativeTime(syncState.lastSyncedAt)}</span>
        )}

        {syncState && syncState.status === 'error' && (
          <span className="text-[var(--danger)]">Sync error</span>
        )}

        {!activeTab && accounts.length === 0 && (
          <span>No account connected</span>
        )}

        {!activeTab && accounts.length > 0 && (
          <span>No namespace selected</span>
        )}
      </div>

      {/* Right-aligned Cmd+K hint */}
      <span className="ml-auto pl-2 text-[var(--text-tertiary)] opacity-60 shrink-0">
        &#8984;K
      </span>
    </div>
  );
}
