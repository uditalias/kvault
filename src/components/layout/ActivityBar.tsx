import { Settings } from "lucide-react";
import { viewConfigs, type ActivityView } from "./views";
import { useTabStore } from "../../stores/tabStore";

export type { ActivityView };

interface ActivityBarProps {
  activeView: ActivityView;
  onViewChange: (view: ActivityView) => void;
}

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const openSettingsTab = useTabStore((s) => s.openSettingsTab);

  return (
    <nav aria-label="Activity Bar" className="flex flex-col items-center w-12 min-w-12 h-full bg-[var(--bg-tertiary)] border-r border-[var(--border)] py-2 gap-1">
      {viewConfigs.map(({ view, icon: Icon, label }) => (
        <button
          key={view}
          onClick={() => onViewChange(view)}
          aria-label={label}
          aria-current={activeView === view ? "true" : undefined}
          title={label}
          className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors cursor-pointer ${
            activeView === view
              ? "text-[var(--text-primary)] bg-[var(--bg-surface)]"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]/50"
          }`}
        >
          <Icon size={20} />
        </button>
      ))}

      <div className="flex-1" />

      <button
        onClick={openSettingsTab}
        aria-label="Settings"
        title="Settings"
        className="flex items-center justify-center w-10 h-10 rounded-md transition-colors cursor-pointer text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]/50"
      >
        <Settings size={20} />
      </button>
    </nav>
  );
}
