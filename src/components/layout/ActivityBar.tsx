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
    <nav
      aria-label="Activity Bar"
      className="flex flex-col items-center w-[52px] min-w-[52px] h-full bg-[var(--bg-tertiary)] border-r border-[var(--border)]"
    >
      {viewConfigs.map(({ view, icon: Icon, label }) => {
        const isActive = activeView === view;
        return (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            aria-label={label}
            aria-current={isActive ? 'true' : undefined}
            title={label}
            className={`relative flex items-center justify-center w-[52px] h-[48px] transition-colors cursor-pointer ${
              isActive
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {/* VS Code-style full-height left-edge indicator for the active item */}
            {isActive && (
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--text-primary)]"
              />
            )}
            <Icon size={24} strokeWidth={1.5} />
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={openSettingsTab}
        aria-label="Settings"
        title="Settings"
        className="flex items-center justify-center w-[52px] h-[48px] transition-colors cursor-pointer text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <Settings size={24} strokeWidth={1.5} />
      </button>
    </nav>
  );
}
