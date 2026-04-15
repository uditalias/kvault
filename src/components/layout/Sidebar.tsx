import { Plus } from "lucide-react";
import AccountTree from "../accounts/AccountTree";
import SearchPanel from "../search/SearchPanel";
import WorkspaceList from "../workspaces/WorkspaceList";
import { useLayoutStore } from "../../stores/layoutStore";
import { viewLabels, type ActivityView } from "./views";

interface SidebarProps {
  activeView: ActivityView;
}

function SidebarContent({ activeView }: { activeView: ActivityView }) {
  switch (activeView) {
    case "accounts":
      return <AccountTree />;
    case "search":
      return <SearchPanel />;
    case "workspaces":
      return <WorkspaceList />;
    default:
      return (
        <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-sm h-full">
          {viewLabels[activeView]} panel
        </div>
      );
  }
}

function SidebarHeaderAction({ activeView }: { activeView: ActivityView }) {
  if (activeView === "accounts") {
    return (
      <button
        className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors leading-none"
        title="Add Account"
        aria-label="Add Account"
        onClick={() => useLayoutStore.getState().setAddAccountDialogOpen(true)}
      >
        <Plus size={14} />
      </button>
    );
  }
  if (activeView === "workspaces") {
    return (
      <button
        className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors leading-none"
        title="Save Current as Workspace"
        aria-label="Save Current as Workspace"
        onClick={() => useLayoutStore.getState().setSaveWorkspaceDialogOpen(true)}
      >
        <Plus size={14} />
      </button>
    );
  }
  return null;
}

export default function Sidebar({ activeView }: SidebarProps) {
  return (
    <div className="h-full bg-[var(--bg-secondary)] flex flex-col">
      <div className="flex items-center justify-between pl-4 pr-2 h-[40px] min-h-[40px] text-[length:var(--font-size-sm)] font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] leading-none">
        <span>{viewLabels[activeView]}</span>
        <SidebarHeaderAction activeView={activeView} />
      </div>
      <div className="flex-1 overflow-hidden">
        <SidebarContent activeView={activeView} />
      </div>
    </div>
  );
}
