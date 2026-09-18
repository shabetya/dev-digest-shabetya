"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, MetricCard, Donut, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { CATEGORY_COLOR } from "./constants";
import { s } from "./styles";

/** Formats a 0..1 rate (or null) as a whole-number percentage, "—" when
    there's no denominator yet (e.g. no done runs with a review). */
function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Real per-skill usage/acceptance numbers, scoped to runs where this skill
    was linked+enabled (server: run_skills join). No fabricated numbers —
    an empty run_skills history (a skill never run, or only run before this
    feature existed) renders the empty state, not zeroes dressed up as data. */
export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading } = useSkillStats(skill.id);

  if (isLoading || !stats) {
    return (
      <div style={s.wrap}>
        <div style={s.skeletonTiles}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
      </div>
    );
  }

  if (stats.runs_total === 0) {
    return (
      <div style={s.wrap}>
        <EmptyState icon="BarChart" title={t("editor.stats.emptyTitle")} body={t("editor.stats.emptyBody")} />
      </div>
    );
  }

  const donutSegments = stats.findings_by_category.map((c) => ({
    label: c.category,
    value: c.count,
    color: CATEGORY_COLOR[c.category] ?? "var(--text-muted)",
  }));

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <MetricCard label={t("editor.stats.usedBy")} value={stats.used_by_agents.length} suffix={` ${t("editor.stats.agentsSuffix")}`} />
        <MetricCard label={t("editor.stats.pullFrequency")} value={pct(stats.request_changes_rate)} />
        <MetricCard label={t("editor.stats.acceptRate")} value={pct(stats.accept_rate)} />
        <MetricCard label={t("editor.stats.findings30d")} value={stats.findings_last_30d} />
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("editor.stats.agentsHeading")}</div>
        <div style={s.card}>
          {stats.used_by_agents.map((a) => (
            <div key={a.agent_id} style={s.agentRow}>
              <span style={s.agentName}>{a.agent_name}</span>
              <Link href={`/agents/${a.agent_id}`} style={s.openLink}>
                {t("editor.stats.openAgent")}
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("editor.stats.categoryHeading")}</div>
        <div style={s.card}>
          {donutSegments.length > 0 ? (
            <Donut segments={donutSegments} valuePrefix="" decimals={0} />
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("editor.stats.noCategoryData")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
