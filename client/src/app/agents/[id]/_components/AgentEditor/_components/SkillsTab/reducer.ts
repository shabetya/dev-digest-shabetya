import type { AgentSkillLink } from "@devdigest/shared";

/** Local, ordered "which skills are linked" state for the Skills tab. Seeded
    from the agent's current links; saved as one replace-all call. */
export interface SkillsTabState {
  selectedIds: string[];
}

export type SkillsTabAction =
  | { type: "TOGGLE"; skillId: string }
  | { type: "MOVE"; skillId: string; direction: "up" | "down" };

/** Seed from the agent's current links, ordered. Passed as useReducer's init
    function; the caller keys the body component on `agent.id` so switching
    agents remounts it and resets state naturally. */
export function initialSkillsTabState(links: AgentSkillLink[]): SkillsTabState {
  return {
    selectedIds: [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id),
  };
}

export function skillsTabReducer(state: SkillsTabState, action: SkillsTabAction): SkillsTabState {
  switch (action.type) {
    case "TOGGLE": {
      const linked = state.selectedIds.includes(action.skillId);
      return {
        selectedIds: linked
          ? state.selectedIds.filter((id) => id !== action.skillId)
          : [...state.selectedIds, action.skillId],
      };
    }
    case "MOVE": {
      const idx = state.selectedIds.indexOf(action.skillId);
      if (idx === -1) return state;
      const swapWith = action.direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= state.selectedIds.length) return state;
      const next = [...state.selectedIds];
      [next[idx], next[swapWith]] = [next[swapWith]!, next[idx]!];
      return { selectedIds: next };
    }
    default:
      return state;
  }
}
