import type { IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

/** Skill type → icon + chip colour. */
export const TYPE_ICON: Record<SkillType, IconName> = {
  rubric: "ListChecks",
  convention: "Wrench",
  security: "Shield",
  custom: "Code",
};

export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#8b5cf6",
};
