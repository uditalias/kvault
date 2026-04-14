import { useAccountStore } from '../../stores/accountStore';
import { useTabStore } from '../../stores/tabStore';
import { useSyncStore } from '../../stores/syncStore';
import { useKeyStore } from '../../stores/keyStore';

export interface Command {
  id: string;
  label: string;
  category: 'Actions' | 'Namespaces' | 'Accounts' | 'Keys';
  shortcut?: string[];
  execute: () => void;
  enabled?: () => boolean;
}

function getActiveNamespaceTab() {
  const { tabs, activeTabId } = useTabStore.getState();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  if (activeTab?.type === 'namespace') return activeTab;
  return null;
}

function getActiveTab() {
  const { tabs, activeTabId } = useTabStore.getState();
  return tabs.find((t) => t.id === activeTabId) ?? null;
}

export function getCommands(callbacks: {
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  onCreateKey: () => void;
  onDeleteSelectedKeys: () => void;
  onExportSelectedKeys: () => void;
  onImportKeys: () => void;
  onSaveCurrentValue: () => void;
  onOpenSettings: () => void;
  onAddAccount: () => void;
  onSaveWorkspace: () => void;
  onLoadWorkspace: () => void;
}): Command[] {
  const { accounts, namespacesMap } = useAccountStore.getState();

  const commands: Command[] = [];

  // --- Accounts ---
  for (const account of accounts) {
    commands.push({
      id: `switch-account-${account.id}`,
      label: `Switch to ${account.name}`,
      category: 'Accounts',
      execute: () => {
        useAccountStore.getState().setActiveAccount(account.id);
        callbacks.closeCommandPalette();
      },
    });
  }

  commands.push({
    id: 'add-account',
    label: 'Add Account',
    category: 'Accounts',
    shortcut: ['⌘', '⇧', 'A'],
    execute: () => {
      callbacks.onAddAccount();
      callbacks.closeCommandPalette();
    },
  });

  // --- Namespaces ---
  for (const account of accounts) {
    const namespaces = namespacesMap[account.id] ?? [];
    for (const ns of namespaces) {
      commands.push({
        id: `open-namespace-${ns.id}`,
        label: `${ns.title} (${account.name})`,
        category: 'Namespaces',
        execute: () => {
          useTabStore.getState().openNamespaceTab(account.id, ns.id, ns.title);
          callbacks.closeCommandPalette();
        },
      });
    }
  }

  // --- Keys ---
  commands.push({
    id: 'create-key',
    label: 'Create Key',
    category: 'Keys',
    shortcut: ['⌘', 'N'],
    execute: () => {
      callbacks.onCreateKey();
      callbacks.closeCommandPalette();
    },
    enabled: () => getActiveNamespaceTab() !== null,
  });

  commands.push({
    id: 'delete-selected-keys',
    label: 'Delete Selected Keys',
    category: 'Keys',
    shortcut: ['⌘', '⌫'],
    execute: () => {
      callbacks.onDeleteSelectedKeys();
      callbacks.closeCommandPalette();
    },
    enabled: () => {
      const nsTab = getActiveNamespaceTab();
      if (!nsTab) return false;
      const sel = useKeyStore.getState().selectedKeys[nsTab.namespaceId] ?? [];
      return sel.length > 0;
    },
  });

  commands.push({
    id: 'export-selected-keys',
    label: 'Export Selected Keys',
    category: 'Keys',
    shortcut: ['⌘', '⇧', 'E'],
    execute: () => {
      callbacks.onExportSelectedKeys();
      callbacks.closeCommandPalette();
    },
    enabled: () => {
      const nsTab = getActiveNamespaceTab();
      if (!nsTab) return false;
      const sel = useKeyStore.getState().selectedKeys[nsTab.namespaceId] ?? [];
      return sel.length > 0;
    },
  });

  commands.push({
    id: 'import-keys',
    label: 'Import Keys',
    category: 'Keys',
    shortcut: undefined,
    execute: () => {
      callbacks.onImportKeys();
      callbacks.closeCommandPalette();
    },
    enabled: () => getActiveNamespaceTab() !== null,
  });

  // --- Actions ---
  commands.push({
    id: 'resync-namespace',
    label: 'Re-sync Namespace',
    category: 'Actions',
    shortcut: ['⌘', '⇧', 'R'],
    execute: () => {
      const nsTab = getActiveNamespaceTab();
      if (nsTab) {
        useSyncStore.getState().startSync(nsTab.accountId, nsTab.namespaceId);
      }
      callbacks.closeCommandPalette();
    },
    enabled: () => getActiveNamespaceTab() !== null,
  });

  commands.push({
    id: 'refresh-namespaces',
    label: 'Refresh Namespaces',
    category: 'Actions',
    shortcut: ['⌘', '⇧', 'N'],
    execute: () => {
      const { accounts } = useAccountStore.getState();
      for (const account of accounts) {
        useAccountStore.getState().refreshNamespaces(account.id).catch(() => {});
      }
      callbacks.closeCommandPalette();
    },
  });

  commands.push({
    id: 'save',
    label: 'Save',
    category: 'Actions',
    shortcut: ['⌘', 'S'],
    execute: () => {
      callbacks.onSaveCurrentValue();
      callbacks.closeCommandPalette();
    },
    enabled: () => {
      const activeTab = getActiveTab();
      return activeTab?.type === 'key' && activeTab.isDirty === true;
    },
  });

  commands.push({
    id: 'settings',
    label: 'Settings',
    category: 'Actions',
    shortcut: ['⌘', ','],
    execute: () => {
      callbacks.onOpenSettings();
      callbacks.closeCommandPalette();
    },
  });

  commands.push({
    id: 'save-workspace',
    label: 'Save Workspace',
    category: 'Actions',
    execute: () => {
      callbacks.onSaveWorkspace();
      callbacks.closeCommandPalette();
    },
  });

  commands.push({
    id: 'load-workspace',
    label: 'Load Workspace',
    category: 'Actions',
    execute: () => {
      callbacks.onLoadWorkspace();
      callbacks.closeCommandPalette();
    },
  });

  commands.push({
    id: 'check-for-updates',
    label: 'Check for updates…',
    category: 'Actions',
    execute: () => {
      window.dispatchEvent(new CustomEvent('kvault:check-for-updates-from-palette'));
      callbacks.closeCommandPalette();
    },
  });

  return commands;
}
