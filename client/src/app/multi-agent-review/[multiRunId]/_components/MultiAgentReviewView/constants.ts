import type { TabDef } from "@devdigest/ui";

/** View-mode switcher (Columns vs. Tabs+detail) — reuses the existing `Tabs`
   primitive rather than a bespoke toggle. */
export const VIEW_MODE_TABS: TabDef[] = [
  { key: "columns", label: "Columns", icon: "Layers" },
  { key: "tabs", label: "Tabs", icon: "ListChecks" },
];
