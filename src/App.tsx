import { useEffect, useState, useMemo, useCallback } from "react";
import PanelLayout from "./components/layout/PanelLayout";
import CommandPalette from "./components/command-palette/CommandPalette";
import SaveWorkspaceDialog from "./components/workspaces/SaveWorkspaceDialog";
import { useKeyboard } from "./hooks/useKeyboard";
import { useAccountStore } from "./stores/accountStore";
import { useSyncStore } from "./stores/syncStore";
import { useLayoutStore } from "./stores/layoutStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useTabStore } from "./stores/tabStore";
import { useKeyStore } from "./stores/keyStore";
import { useUpdateStore } from "./stores/updateStore";
import { useToastStore } from "./stores/toastStore";
import ToastContainer from "./components/ui/ToastContainer";
import UpdateDialog from "./components/update/UpdateDialog";
import { onCheckForUpdatesRequested } from "./lib/tauri";

function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const saveWorkspaceDialogOpen = useLayoutStore((s) => s.saveWorkspaceDialogOpen);
  const setSaveWorkspaceDialogOpen = useLayoutStore((s) => s.setSaveWorkspaceDialogOpen);

  useEffect(() => {
    useAccountStore.getState().loadAccounts();
    useSettingsStore.getState().initSettings();
  }, []);

  // Launch update check: init dismissed version, then non-forced check after 1.5s
  useEffect(() => {
    useUpdateStore.getState().init();
    const timer = setTimeout(() => {
      useUpdateStore
        .getState()
        .check(false)
        .then((info) => {
          if (!info || !info.isUpdateAvailable) return;
          const dismissed = useUpdateStore.getState().dismissedVersion;
          if (dismissed === info.latestVersion) return;
          useToastStore.getState().addToast(
            `Update available: v${info.latestVersion}`,
            'info',
            {
              durationMs: 8000,
              action: {
                label: 'View',
                onClick: () =>
                  window.dispatchEvent(new CustomEvent('kvault:open-update-dialog')),
              },
            },
          );
        });
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Wire update triggers: Tauri menu, custom window events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onCheckForUpdatesRequested(() => {
      setUpdateDialogOpen(true);
      useUpdateStore.getState().check(true);
    }).then((fn) => { unlisten = fn; });

    const fromWindow = () => setUpdateDialogOpen(true);
    const fromPalette = () => {
      setUpdateDialogOpen(true);
      useUpdateStore.getState().check(true);
    };
    window.addEventListener('kvault:open-update-dialog', fromWindow);
    window.addEventListener('kvault:check-for-updates-from-palette', fromPalette);

    return () => {
      unlisten?.();
      window.removeEventListener('kvault:open-update-dialog', fromWindow);
      window.removeEventListener('kvault:check-for-updates-from-palette', fromPalette);
    };
  }, []);

  useEffect(() => {
    const cleanup = useSyncStore.getState().initEventListeners();
    return cleanup;
  }, []);

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);

  // Listen for custom event to open command palette (from welcome screen, etc.)
  useEffect(() => {
    const handler = () => setCommandPaletteOpen(true);
    window.addEventListener('kvault:open-command-palette', handler);
    return () => window.removeEventListener('kvault:open-command-palette', handler);
  }, []);

  const onOpenSettings = useCallback(() => {
    useTabStore.getState().openSettingsTab();
  }, []);

  const onCreateKey = useCallback(() => {
    const { tabs, activeTabId } = useTabStore.getState();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab?.namespaceId) return;

    // If viewing a key, switch to namespace tab first so KeyList mounts
    if (activeTab.type === 'key') {
      const namespacesMap = useAccountStore.getState().namespacesMap;
      const namespaces = namespacesMap[activeTab.accountId] ?? [];
      const ns = namespaces.find((n) => n.id === activeTab.namespaceId);
      if (ns) {
        useTabStore.getState().openNamespaceTab(activeTab.accountId, activeTab.namespaceId, ns.title);
      }
      // Ensure flag is reset first, then set after KeyList mounts
      useLayoutStore.getState().setCreateKeyDialogOpen(false);
      requestAnimationFrame(() => {
        useLayoutStore.getState().setCreateKeyDialogOpen(true);
      });
    } else {
      // Already on a namespace tab — reset first in case it was stuck
      useLayoutStore.getState().setCreateKeyDialogOpen(false);
      requestAnimationFrame(() => {
        useLayoutStore.getState().setCreateKeyDialogOpen(true);
      });
    }
  }, []);

  const onImportKeys = useCallback(() => {
    const { tabs, activeTabId } = useTabStore.getState();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab?.namespaceId) return;

    if (activeTab.type === 'key') {
      const namespacesMap = useAccountStore.getState().namespacesMap;
      const namespaces = namespacesMap[activeTab.accountId] ?? [];
      const ns = namespaces.find((n) => n.id === activeTab.namespaceId);
      if (ns) {
        useTabStore.getState().openNamespaceTab(activeTab.accountId, activeTab.namespaceId, ns.title);
      }
      useLayoutStore.getState().setImportDialogOpen(false);
      requestAnimationFrame(() => {
        useLayoutStore.getState().setImportDialogOpen(true);
      });
    } else {
      useLayoutStore.getState().setImportDialogOpen(false);
      requestAnimationFrame(() => {
        useLayoutStore.getState().setImportDialogOpen(true);
      });
    }
  }, []);

  const onAddAccount = useCallback(() => {
    useLayoutStore.getState().setAddAccountDialogOpen(true);
  }, []);

  const onDeleteSelectedKeys = useCallback(() => {
    const { tabs, activeTabId } = useTabStore.getState();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (activeTab?.type !== 'namespace') return;
    const selected = useKeyStore.getState().selectedKeys[activeTab.namespaceId] ?? [];
    if (selected.length > 0) {
      // Trigger bulk delete via keyStore — BulkActionBar handles the confirmation
      // We dispatch a custom event that KeyList can listen to
      window.dispatchEvent(new CustomEvent('kvault:delete-selected'));
    }
  }, []);

  const onExportSelectedKeys = useCallback(() => {
    window.dispatchEvent(new CustomEvent('kvault:export-selected'));
  }, []);

  const onSaveCurrentValue = useCallback(() => {
    window.dispatchEvent(new CustomEvent('kvault:save-current-value'));
  }, []);

  const onSaveWorkspace = useCallback(() => {
    setSaveWorkspaceDialogOpen(true);
  }, []);

  const onLoadWorkspace = useCallback(() => {
    useLayoutStore.getState().setActiveView('workspaces');
  }, []);

  const commandCallbacks = useMemo(
    () => ({
      openCommandPalette,
      closeCommandPalette,
      onCreateKey,
      onDeleteSelectedKeys,
      onExportSelectedKeys,
      onImportKeys,
      onSaveCurrentValue,
      onOpenSettings,
      onAddAccount,
      onSaveWorkspace,
      onLoadWorkspace,
    }),
    [openCommandPalette, closeCommandPalette, onCreateKey, onDeleteSelectedKeys, onExportSelectedKeys, onImportKeys, onSaveCurrentValue, onOpenSettings, onAddAccount, onSaveWorkspace, onLoadWorkspace],
  );

  useKeyboard(
    useMemo(
      () => ({
        openCommandPalette,
        openQuickNamespace: openCommandPalette,
        focusKeyFilter: () => window.dispatchEvent(new CustomEvent('kvault:focus-key-filter')),
        saveCurrentValue: onSaveCurrentValue,
        createKey: onCreateKey,
        deleteSelectedKeys: onDeleteSelectedKeys,
        exportSelectedKeys: onExportSelectedKeys,
        openSettings: onOpenSettings,
        addAccount: onAddAccount,
      }),
      [openCommandPalette, onSaveCurrentValue, onCreateKey, onDeleteSelectedKeys, onExportSelectedKeys, onOpenSettings, onAddAccount],
    ),
  );

  return (
    <>
      <PanelLayout />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        callbacks={commandCallbacks}
      />
      <SaveWorkspaceDialog
        open={saveWorkspaceDialogOpen}
        onClose={() => setSaveWorkspaceDialogOpen(false)}
      />
      <UpdateDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
      />
      <ToastContainer />
    </>
  );
}

export default App;
