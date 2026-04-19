import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Database, RefreshCw, ArrowDownAZ, ArrowUpAZ, Filter, X } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { Skeleton } from '../ui/Skeleton';
import { useAccountStore } from '../../stores/accountStore';
import { useTabStore } from '../../stores/tabStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useToastStore } from '../../stores/toastStore';
import { useSyncStore } from '../../stores/syncStore';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useSettingsStore } from '../../stores/settingsStore';
import AddAccountDialog from './AddAccountDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ScrollArea } from '../ui/ScrollArea';
import { AccountPlaygrounds } from '../playgrounds/AccountPlaygrounds';
import type { Namespace } from '../../lib/tauri';
import type { NamespaceSortOrder } from '../../stores/settingsStore';

type ContextMenu =
  | { kind: 'account'; accountId: string; x: number; y: number }
  | { kind: 'namespace'; accountId: string; namespaceId: string; x: number; y: number };

function getDisplayedNamespaces(
  namespaces: Namespace[],
  filter: string,
  order: NamespaceSortOrder,
): Namespace[] {
  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? namespaces.filter((ns) => ns.title.toLowerCase().includes(needle))
    : namespaces;
  const sorted = [...filtered].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  );
  if (order === 'title-desc') sorted.reverse();
  return sorted;
}

export default function AccountTree() {
  const accounts = useAccountStore((s) => s.accounts);
  const namespacesMap = useAccountStore((s) => s.namespacesMap);
  const connectionStatus = useAccountStore((s) => s.connectionStatus);
  const refreshNamespaces = useAccountStore((s) => s.refreshNamespaces);
  const removeAccount = useAccountStore((s) => s.removeAccount);

  const syncStatus = useSyncStore((s) => s.syncStatus);
  const startSync = useSyncStore((s) => s.startSync);

  // Active tab namespace highlighting
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const activeNamespaceId = activeTab?.namespaceId ?? null;
  const activeNamespaceRef = useRef<HTMLDivElement>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Per-account collapse state for the NAMESPACES subsection. Defaults to
  // expanded so first-time users don't have to dig for their namespaces.
  const [namespacesOpen, setNamespacesOpen] = useState<Record<string, boolean>>({});
  const [namespaceFilter, setNamespaceFilter] = useState<Record<string, string>>({});
  const [filterOpen, setFilterOpen] = useState<Record<string, boolean>>({});
  const namespaceSortOrder = useSettingsStore((s) => s.namespaceSortOrder);
  const setNamespaceSortOrder = useSettingsStore((s) => s.setNamespaceSortOrder);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [removeConfirm, setRemoveConfirm] = useState<{ accountId: string; name: string } | null>(null);

  // Listen for command palette "Add Account" trigger
  useEffect(() => {
    return useLayoutStore.subscribe((state, prev) => {
      if (state.addAccountDialogOpen && !prev.addAccountDialogOpen) {
        setDialogOpen(true);
        useLayoutStore.getState().setAddAccountDialogOpen(false);
      }
    });
  }, []);

  // Track initial account load
  useEffect(() => {
    // Give the initial loadAccounts a moment to populate
    const timer = setTimeout(() => setInitialLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Default all accounts to expanded
  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const account of accounts) {
        if (!(account.id in next)) {
          next[account.id] = true;
        }
      }
      return next;
    });
  }, [accounts]);

  // Auto-expand account (and namespaces subsection) and scroll to namespace when active tab changes
  useEffect(() => {
    if (!activeNamespaceId) return;

    // Find the account that owns this namespace and expand it
    for (const account of accounts) {
      const namespaces = namespacesMap[account.id] ?? [];
      if (namespaces.some((ns) => ns.id === activeNamespaceId)) {
        setExpanded((prev) => ({ ...prev, [account.id]: true }));
        setNamespacesOpen((prev) => ({ ...prev, [account.id]: true }));
        break;
      }
    }

    // Scroll to the namespace row after a tick (to allow expand to render)
    requestAnimationFrame(() => {
      activeNamespaceRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [activeNamespaceId, activeTabId, accounts, namespacesMap]);

  const toggleNamespacesOpen = useCallback((accountId: string) => {
    setNamespacesOpen((prev) => ({ ...prev, [accountId]: prev[accountId] === false }));
  }, []);

  const toggleSortOrder = useCallback(() => {
    setNamespaceSortOrder(namespaceSortOrder === 'title-asc' ? 'title-desc' : 'title-asc');
  }, [namespaceSortOrder, setNamespaceSortOrder]);

  const toggleFilterOpen = useCallback((accountId: string) => {
    setFilterOpen((prev) => {
      const wasOpen = prev[accountId] === true;
      if (wasOpen) {
        setNamespaceFilter((f) => ({ ...f, [accountId]: '' }));
      }
      return { ...prev, [accountId]: !wasOpen };
    });
    setNamespacesOpen((prev) => ({ ...prev, [accountId]: true }));
  }, []);

  const handleFilterChange = useCallback((accountId: string, value: string) => {
    setNamespaceFilter((prev) => ({ ...prev, [accountId]: value }));
  }, []);

  // Close context menu on click outside or ESC
  useEffect(() => {
    if (!contextMenu) return;

    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const toggleExpanded = useCallback((accountId: string) => {
    setExpanded((prev) => ({ ...prev, [accountId]: !prev[accountId] }));
  }, []);

  const addToast = useToastStore((s) => s.addToast);

  const handleRefresh = useCallback(
    (accountId: string) => {
      refreshNamespaces(accountId).catch((err) => {
        addToast(err instanceof Error ? err.message : 'Failed to refresh namespaces', 'error');
      });
    },
    [refreshNamespaces, addToast],
  );

  const handleRemove = useCallback(
    (accountId: string) => {
      const account = accounts.find((a) => a.id === accountId);
      setRemoveConfirm({ accountId, name: account?.name ?? accountId });
      setContextMenu(null);
    },
    [accounts],
  );

  const confirmRemove = useCallback(() => {
    if (!removeConfirm) return;
    removeAccount(removeConfirm.accountId).catch((err) => {
      addToast(err instanceof Error ? err.message : 'Failed to remove account', 'error');
    });
    setRemoveConfirm(null);
  }, [removeConfirm, removeAccount, addToast]);

  const handleResyncNamespace = useCallback(
    (e: React.MouseEvent, accountId: string, namespaceId: string) => {
      e.stopPropagation();
      startSync(accountId, namespaceId);
    },
    [startSync],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, accountId: string) => {
    e.preventDefault();
    setContextMenu({ kind: 'account', accountId, x: e.clientX, y: e.clientY });
  }, []);

  const handleNamespaceContextMenu = useCallback(
    (e: React.MouseEvent, accountId: string, namespaceId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ kind: 'namespace', accountId, namespaceId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleCopyNamespaceId = useCallback(
    (namespaceId: string) => {
      navigator.clipboard
        .writeText(namespaceId)
        .then(() => addToast('Namespace ID copied', 'success'))
        .catch(() => addToast('Failed to copy namespace ID', 'error'));
      setContextMenu(null);
    },
    [addToast],
  );

  const openNamespaceTab = useTabStore((s) => s.openNamespaceTab);
  const openPlaygroundTab = useTabStore((s) => s.openPlaygroundTab);
  const createPlayground = usePlaygroundStore((s) => s.createPlayground);

  const handleNamespaceClick = useCallback((accountId: string, namespaceId: string, title: string) => {
    openNamespaceTab(accountId, namespaceId, title);
  }, [openNamespaceTab]);

  const handleNewPlayground = useCallback(
    async (accountId: string) => {
      setContextMenu(null);
      try {
        const pg = await createPlayground(accountId, 'Untitled playground');
        openPlaygroundTab(accountId, pg.id, pg.name);
        setExpanded((prev) => ({ ...prev, [accountId]: true }));
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : 'Failed to create playground',
          'error',
        );
      }
    },
    [createPlayground, openPlaygroundTab, addToast],
  );

  function statusDot(status: 'connected' | 'error' | 'loading' | undefined) {
    let colorClass: string;
    switch (status) {
      case 'connected':
        colorClass = 'bg-[var(--success)]';
        break;
      case 'error':
        colorClass = 'bg-[var(--danger)]';
        break;
      default:
        colorClass = 'bg-[var(--text-tertiary)]';
        break;
    }
    return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colorClass}`} />;
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1"><div className="py-1">
        {accounts.map((account) => {
          const isExpanded = expanded[account.id] ?? true;
          const status = connectionStatus[account.id];
          const namespaces = namespacesMap[account.id] ?? [];

          return (
            <div key={account.id}>
              {/* Account row */}
              <div
                className="group flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[var(--bg-surface)]"
                onClick={() => toggleExpanded(account.id)}
                onContextMenu={(e) => handleContextMenu(e, account.id)}
              >
                <span className="flex-shrink-0 text-[var(--text-tertiary)]">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className={`flex-1 truncate text-[length:var(--font-size-base)] ${status === 'loading' ? 'shimmer text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
                  {account.name}
                </span>
                <button
                  className={`w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0 ${status === 'loading' ? 'visible' : 'invisible group-hover:visible'}`}
                  title="Refresh namespaces"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRefresh(account.id);
                  }}
                >
                  {status === 'loading' ? (
                    <Spinner size={12} />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                </button>
                {statusDot(status)}
              </div>

              {/* Playgrounds section (above namespaces, per spec) */}
              {isExpanded && <AccountPlaygrounds accountId={account.id} />}

              {/* Namespaces section */}
              {isExpanded && (() => {
                const nsOpen = namespacesOpen[account.id] !== false;
                const isFilterOpen = filterOpen[account.id] === true;
                const filterValue = namespaceFilter[account.id] ?? '';
                const displayedNamespaces = getDisplayedNamespaces(
                  namespaces,
                  filterValue,
                  namespaceSortOrder,
                );
                const hasActiveFilter = filterValue.trim().length > 0;
                const countLabel = hasActiveFilter
                  ? `(${displayedNamespaces.length}/${namespaces.length})`
                  : namespaces.length > 0 ? `(${namespaces.length})` : '';
                return (
                  <>
                    <div
                      className="group/nsh flex items-center gap-1 py-1 cursor-pointer hover:bg-[var(--bg-surface)]"
                      style={{ paddingLeft: '20px', paddingRight: '8px' }}
                      onClick={() => toggleNamespacesOpen(account.id)}
                    >
                      <span className="flex-shrink-0 text-[var(--text-tertiary)]">
                        {nsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <span className="flex-1 truncate text-[length:var(--font-size-sm)] text-[var(--text-secondary)] uppercase tracking-wide">
                        Namespaces {countLabel}
                      </span>
                      {namespaces.length > 0 && (
                        <>
                          <button
                            className={`w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] shrink-0 ${
                              isFilterOpen || hasActiveFilter
                                ? 'text-[var(--accent)] visible'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] invisible group-hover/nsh:visible'
                            }`}
                            title={isFilterOpen ? 'Hide filter' : 'Filter namespaces'}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFilterOpen(account.id);
                            }}
                          >
                            <Filter size={12} />
                          </button>
                          <button
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0 invisible group-hover/nsh:visible"
                            title={`Sort ${namespaceSortOrder === 'title-asc' ? 'A→Z (click for Z→A)' : 'Z→A (click for A→Z)'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSortOrder();
                            }}
                          >
                            {namespaceSortOrder === 'title-asc' ? (
                              <ArrowDownAZ size={12} />
                            ) : (
                              <ArrowUpAZ size={12} />
                            )}
                          </button>
                        </>
                      )}
                      <button
                        className={`w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0 ${status === 'loading' ? 'visible' : 'invisible group-hover/nsh:visible'}`}
                        title="Refresh namespaces"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRefresh(account.id);
                        }}
                      >
                        {status === 'loading' ? <Spinner size={12} /> : <RefreshCw size={12} />}
                      </button>
                    </div>

                    {nsOpen && isFilterOpen && (
                      <div
                        className="py-1"
                        style={{ paddingLeft: '44px', paddingRight: '8px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 h-[24px] focus-within:border-[var(--accent)]">
                          <input
                            type="text"
                            autoFocus
                            value={filterValue}
                            onChange={(e) => handleFilterChange(account.id, e.target.value)}
                            placeholder="Filter namespaces..."
                            className="flex-1 min-w-0 bg-transparent outline-none text-[length:var(--font-size-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
                          />
                          {hasActiveFilter && (
                            <button
                              className="flex items-center justify-center w-4 h-4 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                              title="Clear filter"
                              onClick={() => handleFilterChange(account.id, '')}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {nsOpen && status === 'loading' && namespaces.length === 0 && (
                      <div
                        className="shimmer-container space-y-1.5 py-1 mx-1"
                        style={{ paddingLeft: '44px', paddingRight: '8px' }}
                      >
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3.5 w-1/2" />
                        <Skeleton className="h-3.5 w-2/3" />
                      </div>
                    )}
                    {nsOpen && status !== 'loading' && namespaces.length === 0 && (
                      <div
                        className="py-1 mx-1 text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]"
                        style={{ paddingLeft: '44px' }}
                      >
                        No namespaces found
                      </div>
                    )}
                    {nsOpen && status !== 'loading' && namespaces.length > 0 && displayedNamespaces.length === 0 && (
                      <div
                        className="py-1 mx-1 text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]"
                        style={{ paddingLeft: '44px' }}
                      >
                        No matches
                      </div>
                    )}
                    {nsOpen &&
                      displayedNamespaces.map((ns) => {
                        const isActiveNs = ns.id === activeNamespaceId;
                        const nsSyncStatus = syncStatus[ns.id]?.status;
                        const isSyncing = nsSyncStatus === 'syncing';
                        return (
                          <div
                            key={ns.id}
                            ref={isActiveNs ? activeNamespaceRef : undefined}
                            className={`group/ns flex items-center gap-1.5 py-1 cursor-pointer ${
                              isActiveNs
                                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                                : 'hover:bg-[var(--bg-surface)]'
                            }`}
                            style={{ paddingLeft: '44px', paddingRight: '8px' }}
                            title={`${ns.title} · ${ns.id}`}
                            onClick={() => handleNamespaceClick(account.id, ns.id, ns.title)}
                            onContextMenu={(e) => handleNamespaceContextMenu(e, account.id, ns.id)}
                          >
                            <Database size={14} className="flex-shrink-0 text-[var(--success)]" />
                            <span className={`flex-1 truncate text-[13px] font-[family-name:var(--font-mono)] ${isSyncing ? 'shimmer text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
                              {ns.title}
                            </span>
                            <button
                              className={`w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0 ${isSyncing ? 'visible' : 'invisible group-hover/ns:visible'}`}
                              title="Re-sync namespace"
                              onClick={(e) => handleResyncNamespace(e, account.id, ns.id)}
                            >
                              {isSyncing ? <Spinner size={12} /> : <RefreshCw size={12} />}
                            </button>
                          </div>
                        );
                      })}
                  </>
                );
              })()}
            </div>
          );
        })}

        {accounts.length === 0 && initialLoading && (
          <div className="shimmer-container space-y-3 px-3 py-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        )}

        {accounts.length === 0 && !initialLoading && (
          <div className="px-4 py-6 text-center text-[length:var(--font-size-sm)] text-[var(--text-tertiary)]">
            Get started by adding a Cloudflare account
          </div>
        )}
      </div></ScrollArea>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] rounded-md border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.kind === 'account' ? (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-colors"
                onClick={() => void handleNewPlayground(contextMenu.accountId)}
              >
                New Playground…
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-colors"
                onClick={() => {
                  handleRefresh(contextMenu.accountId);
                  setContextMenu(null);
                }}
              >
                Refresh Namespaces
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--bg-primary)] transition-colors"
                onClick={() => handleRemove(contextMenu.accountId)}
              >
                Remove Account
              </button>
            </>
          ) : (
            <button
              className="w-full text-left px-3 py-1.5 text-[length:var(--font-size-sm)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-colors"
              onClick={() => handleCopyNamespaceId(contextMenu.namespaceId)}
            >
              Copy Namespace ID
            </button>
          )}
        </div>
      )}

      {/* Add Account Dialog */}
      <AddAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      {/* Remove Account Confirmation */}
      <ConfirmDialog
        open={removeConfirm !== null}
        title="Remove Account"
        message={`Remove "${removeConfirm?.name}"? This will delete all cached data for this account.`}
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setRemoveConfirm(null)}
      />
    </div>
  );
}
