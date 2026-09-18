import type { Skill, SkillType } from "@devdigest/shared";

export type ConfigState = {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
};

export type ConfigAction = {
  [K in keyof ConfigState]: { field: K; value: ConfigState[K] };
}[keyof ConfigState];

/** Seed form state from the server record. Passed as useReducer's init
    function; the caller keys <ConfigTab key={skill.id}> so a new skill means
    a fresh mount, never a mid-life reset. */
export function initialConfigState(skill: Skill): ConfigState {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
    enabled: skill.enabled,
  };
}

export function configReducer(state: ConfigState, action: ConfigAction): ConfigState {
  return { ...state, [action.field]: action.value };
}
