/* SkillsTab — attach/detach + reorder skills on an agent. Order (up/down, not
   drag-and-drop — no DnD library is a dependency here) determines the
   sequence of skill blocks in the assembled prompt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, IconBtn, Badge, Skeleton } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { TYPE_COLOR, TYPE_ICON } from "./constants";
import { initialSkillsTabState, skillsTabReducer } from "./reducer";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const { data: skills, isLoading: loadingSkills } = useSkills();
  const { data: links, isLoading: loadingLinks } = useAgentSkillLinks(agent.id);

  if (loadingSkills || loadingLinks || !skills || !links) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <div style={{ marginTop: 14 }}>
          <Skeleton height={48} />
        </div>
      </div>
    );
  }

  return <SkillsTabBody key={agent.id} agent={agent} skills={skills} initialLinks={links} />;
}

function SkillsTabBody({
  agent,
  skills,
  initialLinks,
}: {
  agent: Agent;
  skills: Skill[];
  initialLinks: { agent_id: string; skill_id: string; order: number }[];
}) {
  const t = useTranslations("agents");
  const toast = useToast();
  const setSkills = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");
  const [state, dispatch] = React.useReducer(skillsTabReducer, initialLinks, initialSkillsTabState);

  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linkedFirst = [
    ...state.selectedIds,
    ...skills.map((sk) => sk.id).filter((id) => !state.selectedIds.includes(id)),
  ];
  const q = filter.trim().toLowerCase();
  const visible = linkedFirst.filter((id) => {
    const sk = byId.get(id);
    return sk && (!q || `${sk.name} ${sk.description}`.toLowerCase().includes(q));
  });

  const save = () =>
    setSkills.mutate(
      { agentId: agent.id, skillIds: state.selectedIds },
      { onSuccess: () => toast.success(t("skills.title") + ": saved") },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>
          {t("skills.enabledCount", { linked: state.selectedIds.length, total: skills.length })}
        </span>
      </div>
      <div style={s.hint}>{t("skills.orderHint")}</div>

      <div style={s.filter}>
        <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          style={s.filterInput}
        />
      </div>

      {visible.map((id) => {
        const sk = byId.get(id)!;
        const linked = state.selectedIds.includes(id);
        const color = TYPE_COLOR[sk.type];
        return (
          <div key={id} style={s.row}>
            <Checkbox checked={linked} onChange={() => dispatch({ type: "TOGGLE", skillId: id })} />
            <div style={s.iconBox(color)}>{React.createElement(Icon[TYPE_ICON[sk.type]], { size: 13 })}</div>
            <span style={s.name}>{sk.name}</span>
            <Badge color={color}>{sk.type}</Badge>
            {!sk.enabled && <span style={s.disabledNote}>disabled</span>}
            {linked && (
              <div style={s.moveBtns}>
                <IconBtn
                  icon="ArrowUp"
                  label="Move up"
                  size={22}
                  onClick={() => dispatch({ type: "MOVE", skillId: id, direction: "up" })}
                />
                <IconBtn
                  icon="ArrowDown"
                  label="Move down"
                  size={22}
                  onClick={() => dispatch({ type: "MOVE", skillId: id, direction: "down" })}
                />
              </div>
            )}
          </div>
        );
      })}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={setSkills.isPending}>
          {setSkills.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {setSkills.isSuccess && <span style={s.savedNote}>{t("config.saved", { version: agent.version })}</span>}
      </div>
    </div>
  );
}
