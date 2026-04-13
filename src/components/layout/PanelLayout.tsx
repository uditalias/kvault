import { Panel, Group, Separator } from "react-resizable-panels";
import ActivityBar from "./ActivityBar";
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";
import StatusBar from "./StatusBar";
import MainContent from "./MainContent";
import { useLayoutStore } from "../../stores/layoutStore";

const separatorClassName = "w-0.5 bg-[var(--border)] hover:bg-[var(--accent)] transition-colors cursor-col-resize outline-none";

export default function PanelLayout() {
  const activeView = useLayoutStore((s) => s.activeView);
  const setActiveView = useLayoutStore((s) => s.setActiveView);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-secondary)]">
      <div className="flex flex-1 min-h-0">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />

        <Group orientation="horizontal" id="kvault-panels-v3" className="flex-1">
          <Panel defaultSize="20%" minSize={200} maxSize="50%">
            <Sidebar activeView={activeView} />
          </Panel>

          <Separator className={separatorClassName} />

          <Panel defaultSize="80%" minSize={400}>
            <div className="flex flex-col h-full">
              <TabBar />
              <div className="flex-1 min-h-0 bg-[var(--bg-primary)]">
                <MainContent />
              </div>
            </div>
          </Panel>
        </Group>
      </div>

      <StatusBar />
    </div>
  );
}
