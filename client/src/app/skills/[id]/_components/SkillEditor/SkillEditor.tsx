/* SkillEditor — Config/Preview/Evals/Stats/Versions tabs. Evals stays a
   reserved placeholder (no eval-runner exists yet); Config, Preview, Stats
   and Versions are all fully functional. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { ReservedTab } from "./_components/ReservedTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  let body: React.ReactNode;
  switch (tab) {
    case "preview":
      body = <PreviewTab skill={skill} />;
      break;
    case "evals":
      body = (
        <ReservedTab
          icon="FlaskConical"
          title={t("editor.reserved.evalsTitle")}
          body={t("editor.reserved.evalsBody")}
        />
      );
      break;
    case "stats":
      body = <StatsTab skill={skill} />;
      break;
    case "versions":
      body = <VersionsTab skill={skill} />;
      break;
    default:
      body = <ConfigTab skill={skill} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body} key={skill.id + tab}>
        {body}
      </div>
    </div>
  );
}
