import { useCallback, useEffect, useRef } from 'react';
import { useTabStore, type Tab } from '../../stores/tabStore';
import { useSyncStore } from '../../stores/syncStore';
import { useKeyStore } from '../../stores/keyStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useAccountStore } from '../../stores/accountStore';
import { KeyList } from '../keys/KeyList';
import { AlertTriangle } from 'lucide-react';
import { ValueEditor } from '../editor/ValueEditor';
import { SettingsPanel } from '../settings/SettingsPanel';
import { ShortcutButton } from '../ui/ShortcutButton';

/** How long before we consider a sync "stale" and re-trigger (5 minutes). */
const STALE_MS = 5 * 60 * 1000;

function isSyncNeeded(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() > STALE_MS;
}

function EmptyState() {
  const handleCommandPalette = useCallback(() => {
    window.dispatchEvent(new CustomEvent('kvault:open-command-palette'));
  }, []);

  const handleAddAccount = useCallback(() => {
    useLayoutStore.getState().setAddAccountDialogOpen(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    useTabStore.getState().openSettingsTab();
  }, []);

  const handleRefreshNamespaces = useCallback(() => {
    const { accounts } = useAccountStore.getState();
    for (const account of accounts) {
      useAccountStore.getState().refreshNamespaces(account.id).catch(() => {});
    }
  }, []);

  const handleReopenClosedTab = useCallback(() => {
    useTabStore.getState().reopenLastClosedTab();
  }, []);

  const shortcuts = [
    { label: 'Command Palette', keys: ['⌘', 'K'], action: handleCommandPalette },
    { label: 'Add Account', keys: ['⌘', '⇧', 'A'], action: handleAddAccount },
    { label: 'Open Settings', keys: ['⌘', ','], action: handleOpenSettings },
    { label: 'Refresh Namespaces', keys: ['⌘', '⇧', 'N'], action: handleRefreshNamespaces },
    { label: 'Reopen Closed Tab', keys: ['⌘', '⇧', 'T'], action: handleReopenClosedTab },
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center select-none">
      {/* Logo watermark */}
      <img
        src="/kvault.svg"
        alt=""
        className="w-40 h-40 mb-8 opacity-[0.06] grayscale brightness-200"
        draggable={false}
      />

      {/* Shortcuts list */}
      <div className="flex flex-col gap-1">
        {shortcuts.map((s) => (
          <ShortcutButton key={s.label} label={s.label} keys={s.keys} onClick={s.action} />
        ))}
      </div>
    </div>
  );
}

function DeletedBanner({ tab }: { tab: Tab }) {
  const label = tab.type === 'namespace' ? 'Namespace' : 'Key';
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-[var(--warning)]/10 border border-[var(--warning)]/30">
        <AlertTriangle size={18} className="text-[var(--warning)] flex-shrink-0" />
        <span className="text-sm text-[var(--warning)]">
          {label} "{tab.title}" has been deleted
        </span>
      </div>
    </div>
  );
}

function KeyTabContent({ tab }: { tab: Tab }) {
  return (
    <ValueEditor
      accountId={tab.accountId}
      namespaceId={tab.namespaceId}
      keyName={tab.keyName!}
      isDeleted={tab.isDeleted}
    />
  );
}

function NamespaceContent({ tab }: { tab: Tab }) {
  const startSync = useSyncStore((s) => s.startSync);
  const getSyncState = useSyncStore((s) => s.getSyncState);
  const loadKeys = useKeyStore((s) => s.loadKeys);
  const syncTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    // Avoid re-triggering sync for the same namespace within this component lifecycle
    if (syncTriggeredRef.current === tab.namespaceId) return;

    const syncState = getSyncState(tab.namespaceId);

    if (syncState.status === 'syncing') {
      // Already syncing — just mark as triggered so we don't re-kick
      syncTriggeredRef.current = tab.namespaceId;
      return;
    }

    if (isSyncNeeded(syncState.lastSyncedAt)) {
      syncTriggeredRef.current = tab.namespaceId;
      startSync(tab.accountId, tab.namespaceId);
    } else {
      // Data is fresh — just make sure keys are loaded
      syncTriggeredRef.current = tab.namespaceId;
      loadKeys(tab.namespaceId);
    }
  }, [tab.namespaceId, tab.accountId, startSync, getSyncState, loadKeys]);

  // When sync completes, reload keys
  const syncStatus = useSyncStore((s) => s.syncStatus[tab.namespaceId]);
  const prevStatusRef = useRef(syncStatus?.status);

  useEffect(() => {
    const currentStatus = syncStatus?.status;
    if (prevStatusRef.current === 'syncing' && currentStatus === 'idle') {
      loadKeys(tab.namespaceId);
    }
    prevStatusRef.current = currentStatus;
  }, [syncStatus?.status, tab.namespaceId, loadKeys]);

  return <KeyList namespaceId={tab.namespaceId} accountId={tab.accountId} />;
}

export default function MainContent() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  if (!activeTab) {
    return <EmptyState />;
  }

  if (activeTab.isDeleted) {
    return <DeletedBanner tab={activeTab} />;
  }

  if (activeTab.type === 'settings') {
    return <SettingsPanel />;
  }

  if (activeTab.type === 'key') {
    return <KeyTabContent tab={activeTab} />;
  }

  // type === 'namespace'
  return <NamespaceContent tab={activeTab} />;
}
