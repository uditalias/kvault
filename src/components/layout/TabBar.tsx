import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Database, FileText, Settings } from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { ScrollArea } from '../ui/ScrollArea';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

export default function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
  const closeAllTabs = useTabStore((s) => s.closeAllTabs);
  const pinPreviewTab = useTabStore((s) => s.pinPreviewTab);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dirtyCloseTabId, setDirtyCloseTabId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (!activeTabId) return;
    const el = tabRefs.current.get(activeTabId);
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, [activeTabId]);

  // Close context menu on outside click or escape
  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const requestCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.isDirty) {
        setDirtyCloseTabId(tabId);
      } else {
        closeTab(tabId);
      }
    },
    [tabs, closeTab],
  );

  // Listen for close-tab requests from keyboard shortcuts
  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent).detail?.tabId;
      if (tabId) requestCloseTab(tabId);
    };
    window.addEventListener('kvault:request-close-tab', handler);
    return () => window.removeEventListener('kvault:request-close-tab', handler);
  }, [requestCloseTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      // Middle-click to close
      if (e.button === 1) {
        e.preventDefault();
        requestCloseTab(tabId);
      }
    },
    [requestCloseTab],
  );

  const handleCloseClick = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      requestCloseTab(tabId);
    },
    [requestCloseTab],
  );

  if (tabs.length === 0) {
    return null;
  }

  return (
    <>
      <div className="relative h-[40px] min-h-[40px] bg-[var(--bg-tertiary)]">
        {/* Bottom border on top of everything; active tab sits above it via z-20 */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-[var(--border)] z-10 pointer-events-none" />
        <ScrollArea orientation="horizontal" className="h-[40px]">
      <div
        ref={containerRef}
        role="tablist"
        className="flex items-center h-[40px]"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              ref={(el) => { if (el) tabRefs.current.set(tab.id, el); else tabRefs.current.delete(tab.id); }}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => { if (tab.isPreview) pinPreviewTab(tab.id); }}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              className={`group flex items-center h-full px-3 text-sm cursor-pointer select-none shrink-0 border-r border-[var(--border)] border-t-2 ${
                isActive
                  ? 'sticky left-0 right-0 z-20 bg-[var(--bg-primary)] text-[var(--text-primary)] border-t-[var(--accent)]'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-t-transparent'
              }`}
            >
              {tab.isDirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mr-1.5 shrink-0" />
              )}
              <span className="shrink-0 text-[var(--text-tertiary)] mr-1.5">
                {tab.type === 'namespace' && <Database size={14} />}
                {tab.type === 'key' && <FileText size={14} />}
                {tab.type === 'settings' && <Settings size={14} />}
              </span>
              <span
                className={`truncate max-w-[140px] ${tab.isPreview ? 'italic' : ''} ${
                  tab.isDeleted ? 'line-through text-[var(--danger)]' : ''
                }`}
              >
                {tab.title}
              </span>
              <button
                onClick={(e) => handleCloseClick(e, tab.id)}
                className="ml-2 w-5 h-5 flex items-center justify-center rounded invisible group-hover:visible text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] shrink-0"
                aria-label={`Close ${tab.title}`}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      </ScrollArea>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 py-1 min-w-[140px] bg-[var(--bg-primary)] border border-[var(--border)] rounded shadow-lg text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
            onClick={() => {
              requestCloseTab(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            Close
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
            onClick={() => {
              closeOtherTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            Close Others
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
            onClick={() => {
              closeAllTabs();
              setContextMenu(null);
            }}
          >
            Close All
          </button>
        </div>
      )}

      {/* Unsaved changes confirmation */}
      <ConfirmDialog
        open={dirtyCloseTabId !== null}
        title="Unsaved Changes"
        message={`"${tabs.find((t) => t.id === dirtyCloseTabId)?.title ?? ''}" has unsaved changes. Do you want to discard them and close?`}
        confirmLabel="Discard & Close"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          if (dirtyCloseTabId) closeTab(dirtyCloseTabId);
          setDirtyCloseTabId(null);
        }}
        onCancel={() => setDirtyCloseTabId(null)}
      />
    </>
  );
}
