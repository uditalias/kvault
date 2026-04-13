import { Users, Search, Layout, type LucideIcon } from "lucide-react";

export type ActivityView = "accounts" | "search" | "workspaces";

export interface ViewConfig {
  view: ActivityView;
  icon: LucideIcon;
  label: string;
}

export const viewConfigs: ViewConfig[] = [
  { view: "accounts", icon: Users, label: "Accounts" },
  { view: "search", icon: Search, label: "Search" },
  { view: "workspaces", icon: Layout, label: "Workspaces" },
];

export const viewLabels: Record<ActivityView, string> = Object.fromEntries(
  viewConfigs.map(({ view, label }) => [view, label])
) as Record<ActivityView, string>;
