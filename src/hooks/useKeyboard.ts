import { useEffect, useCallback } from 'react';
import { useTabStore } from '../stores/tabStore';
import { useSyncStore } from '../stores/syncStore';
import { useAccountStore } from '../stores/accountStore';

interface KeyboardCallbacks {
  openCommandPalette: () => void;
  openQuickNamespace: () => void;
  focusKeyFilter: () => void;
  saveCurrentValue: () => void;
  createKey: () => void;
  deleteSelectedKeys: () => void;
  exportSelectedKeys: () => void;
  openSettings: () => void;
  addAccount: () => void;
}

/**
 * Returns true if `mod` matches the platform modifier key.
 * mod = Cmd on macOS, Ctrl on Windows/Linux.
 */
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

function isModKey(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

/**
 * Returns true when the focus is inside a Monaco editor.
 */
function isMonacoFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  return active.closest('.monaco-editor') !== null;
}

function getActiveNamespaceTab() {
  const { tabs, activeTabId } = useTabStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  return tab?.type === 'namespace' ? tab : null;
}

export function useKeyboard(callbacks: KeyboardCallbacks) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isModKey(e)) return;

      const key = e.key.toLowerCase();

      // --- Always-global shortcuts (override Monaco) ---

      // Cmd+K — command palette
      if (key === 'k' && !e.shiftKey) {
        e.preventDefault();
        callbacks.openCommandPalette();
        return;
      }

      // Cmd+S — save
      if (key === 's' && !e.shiftKey) {
        e.preventDefault();
        callbacks.saveCurrentValue();
        return;
      }

      // Cmd+W — close active tab (with dirty check via TabBar)
      if (key === 'w' && !e.shiftKey) {
        e.preventDefault();
        const { activeTabId } = useTabStore.getState();
        if (activeTabId) {
          window.dispatchEvent(new CustomEvent('kvault:request-close-tab', { detail: { tabId: activeTabId } }));
        }
        return;
      }

      // --- Shortcuts that defer to Monaco when it is focused ---
      if (isMonacoFocused()) return;

      // Cmd+P — quick namespace open (same as command palette pre-filtered)
      if (key === 'p' && !e.shiftKey) {
        e.preventDefault();
        callbacks.openQuickNamespace();
        return;
      }

      // Cmd+F — focus key filter
      if (key === 'f' && !e.shiftKey) {
        e.preventDefault();
        callbacks.focusKeyFilter();
        return;
      }

      // Cmd+Shift+R — resync namespace
      if (key === 'r' && e.shiftKey) {
        e.preventDefault();
        const nsTab = getActiveNamespaceTab();
        if (nsTab) {
          useSyncStore.getState().startSync(nsTab.accountId, nsTab.namespaceId);
        }
        return;
      }

      // Cmd+Shift+N — refresh all namespaces
      if (key === 'n' && e.shiftKey) {
        e.preventDefault();
        const { accounts } = useAccountStore.getState();
        for (const account of accounts) {
          useAccountStore.getState().refreshNamespaces(account.id).catch(() => {});
        }
        return;
      }

      // Cmd+N — create key
      if (key === 'n' && !e.shiftKey) {
        e.preventDefault();
        callbacks.createKey();
        return;
      }

      // Cmd+Backspace — delete selected keys
      if (key === 'backspace' && !e.shiftKey) {
        e.preventDefault();
        callbacks.deleteSelectedKeys();
        return;
      }

      // Cmd+Shift+E — export selected keys
      if (key === 'e' && e.shiftKey) {
        e.preventDefault();
        callbacks.exportSelectedKeys();
        return;
      }

      // Cmd+, — settings
      if (key === ',' && !e.shiftKey) {
        e.preventDefault();
        callbacks.openSettings();
        return;
      }

      // Cmd+Shift+A — add account
      if (key === 'a' && e.shiftKey) {
        e.preventDefault();
        callbacks.addAccount();
        return;
      }

      // Cmd+Shift+T — reopen last closed tab
      if (key === 't' && e.shiftKey) {
        e.preventDefault();
        useTabStore.getState().reopenLastClosedTab();
        return;
      }
    },
    [callbacks],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
