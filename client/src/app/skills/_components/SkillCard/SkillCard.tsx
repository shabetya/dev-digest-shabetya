/* SkillCard — type + source badges, description, enabled toggle. Reused by
   both the Skills grid (list page) and the skill-switcher column in the Skill
   editor, exactly like AgentCard is reused by /agents and /agents/:id. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { TYPE_COLOR, TYPE_ICON } from "./constants";
import { s } from "./styles";

export function SkillCard({
  sk,
  active,
  onClick,
  onToggle,
}: {
  sk: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const color = TYPE_COLOR[sk.type];
  const needsVetting = sk.source !== "manual" && !sk.enabled;

  return (
    <div onClick={onClick} style={s.card(!!active, sk.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(color)}>
          {React.createElement(Icon[TYPE_ICON[sk.type]], { size: 14 })}
        </div>
        <span style={s.name}>{sk.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={sk.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete skill "${sk.name}"? This cannot be undone.`)) del.mutate(sk.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{sk.description}</div>
      <div style={s.metaRow}>
        <Badge color={color}>{t(`listItem.type.${sk.type}`)}</Badge>
        {sk.source !== "manual" && (
          <span title={needsVetting ? t("listItem.vettingTitle") : undefined}>
            <Badge
              color={needsVetting ? "var(--warn, #f59e0b)" : "var(--text-muted)"}
              icon={needsVetting ? "AlertTriangle" : undefined}
            >
              {t(`listItem.source.${sk.source}`)}
              {needsVetting ? ` · ${t("listItem.needsVetting")}` : ""}
            </Badge>
          </span>
        )}
      </div>
    </div>
  );
}
