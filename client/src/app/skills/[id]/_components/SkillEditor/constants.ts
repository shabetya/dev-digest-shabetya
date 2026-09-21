import type { IconName } from "@devdigest/ui";

export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** All 5 tabs render (matches the design); Evals/Stats show a reserved
    placeholder rather than real data — see ReservedTab. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];
