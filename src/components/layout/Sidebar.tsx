import AccountTree from "../accounts/AccountTree";
import SearchPanel from "../search/SearchPanel";
import WorkspaceList from "../workspaces/WorkspaceList";
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

export default function Sidebar({ activeView }: SidebarProps) {
  return (
    <div className="h-full bg-[var(--bg-secondary)] flex flex-col">
      <div className="flex items-center px-4 h-[40px] min-h-[40px] text-[length:var(--font-size-sm)] font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]">
        {viewLabels[activeView]}
      </div>
      <div className="flex-1 overflow-hidden">
        <SidebarContent activeView={activeView} />
      </div>
    </div>
  );
}
