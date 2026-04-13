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
import ToastContainer from "./components/ui/ToastContainer";

function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const saveWorkspaceDialogOpen = useLayoutStore((s) => s.saveWorkspaceDialogOpen);
  const setSaveWorkspaceDialogOpen = useLayoutStore((s) => s.setSaveWorkspaceDialogOpen);

  useEffect(() => {
    useAccountStore.getState().loadAccounts();
    useSettingsStore.getState().initSettings();
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
      <ToastContainer />
    </>
  );
}

export default App;
