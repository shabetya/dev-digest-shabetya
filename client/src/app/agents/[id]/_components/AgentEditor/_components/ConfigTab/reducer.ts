import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";

/** The 9 fields are one cohesive piece of form state (all part of the same
    "agent config" edit), so they're held in a single reducer rather than 9
    independent useState calls. */
export type ConfigState = {
  name: string;
  description: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  enabled: boolean;
};

export type ConfigAction = {
  [K in keyof ConfigState]: { field: K; value: ConfigState[K] };
}[keyof ConfigState];

/** Seed form state from the server record. Passed as useReducer's init
    function; the caller keys <ConfigTab key={agent.id}> so a new agent means
    a fresh mount (and a fresh call to this), never a mid-life reset. */
export function initialConfigState(agent: Agent): ConfigState {
  return {
    name: agent.name,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.system_prompt,
    strategy: agent.strategy,
    ciFailOn: agent.ci_fail_on,
    repoIntel: agent.repo_intel,
    enabled: agent.enabled,
  };
}

export function configReducer(state: ConfigState, action: ConfigAction): ConfigState {
  return { ...state, [action.field]: action.value };
}
