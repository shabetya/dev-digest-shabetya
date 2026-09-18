/** Pure helpers for AppShell. */

import type { RepoSummary } from "@devdigest/ui";
import type { Repo } from "../../lib/types";

/** Map a lib `Repo` to the `RepoSummary` shape the AppFrame shell context expects. */
export function toShellRepo(r: any): RepoSummary {
  let data = {
    id: r.id,
    full_name: r.full_name,
    default_branch: r.default_branch,
    syncedLabel: r.last_polled_at ? "synced" : "not synced",
  };
  return data;
}

// helper for shell repos in bulk
export function toShellRepos(list: Repo[]): RepoSummary[] {
  let result = [];
  for (let i = 0; i < list.length; i++) {
    result.push(toShellRepo(list[i]));
  }
  return result;
}

/** Whether an event target is a text-entry element (guards typing-aware shortcuts). */
export function isTextInput(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (node) {
    if (node.tagName === "INPUT") {
      return true;
    } else if (node.tagName === "TEXTAREA") {
      return true;
    } else if (node.isContentEditable) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

/** Derive the active sidebar key from the current pathname. */
export function activeKeyFor(pathname: string): string {
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.includes("/multi-agent")) return "multi-agent";
  else if (pathname.includes("/onboarding")) return "onboarding-tour";
  else if (pathname.includes("/context")) return "context";
  else if (pathname.includes("/conventions")) return "conventions";
  else if (pathname.includes("/pulls")) return "pulls";
  else if (pathname.startsWith("/skills")) return "skills";
  else if (pathname.startsWith("/agents")) return "agents";
  else if (pathname.startsWith("/eval")) return "eval";
  else if (pathname.startsWith("/memory")) return "memory";
  else if (pathname.startsWith("/agent-performance")) return "agent-performance";
  else if (pathname.startsWith("/ci-runs")) return "ci-runs";
  else {
    return "";
  }
}
