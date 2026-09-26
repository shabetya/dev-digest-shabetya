"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Icon, MonoLink } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { BlastRadiusGraph } from "./BlastRadiusGraph";
import { PriorPrsSection } from "./PriorPrsSection";
import { s } from "./styles";

type BlastView = "tree" | "graph";

/** Two bordered buttons, active one highlighted — no existing `@devdigest/ui`
 *  primitive fits this exact segmented-control shape, so it's a small local
 *  one (single consumer: `BlastRadiusCard`). `role="tablist"`/`role="tab"`
 *  since these are two plain buttons standing in for a native widget. */
function ViewToggle({
  view,
  onChange,
  treeLabel,
  graphLabel,
}: {
  view: BlastView;
  onChange: (view: BlastView) => void;
  treeLabel: string;
  graphLabel: string;
}) {
  return (
    <div role="tablist" aria-label="Blast radius view" style={s.viewToggle}>
      {(
        [
          ["tree", treeLabel],
          ["graph", graphLabel],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={view === value}
          style={{ ...s.viewToggleButton, ...(view === value ? s.viewToggleButtonActive : undefined) }}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Blast Radius card — the PR's pre-calculated impact map (changed symbols,
 * their callers, and which HTTP endpoints/cron jobs depend on them), plus
 * prior PRs that touched the same files. Purely read-only presentation of
 * `GET /pulls/:id/blast` — no LLM call, no fresh analysis. Renders nothing
 * before a `prId` is known or while loading (mirrors IntentCard's
 * convention).
 */
export function BlastRadiusCard({
  prId,
  repoId,
  repoFullName,
  headSha,
}: {
  prId: string;
  repoId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const { data: blast, isLoading } = useBlastRadius(prId);
  const t = useTranslations("blast");
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
  const [view, setView] = React.useState<BlastView>("tree");

  if (isLoading || !blast) return null;

  const toggleGroup = (symbol: string) =>
    setOpenGroups((prev) => ({ ...prev, [symbol]: !prev[symbol] }));

  const totalCallers = blast.downstream.reduce((n, group) => n + group.callers.length, 0);
  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();
  for (const group of blast.downstream) {
    for (const e of group.endpoints_affected) allEndpoints.add(e);
    for (const c of group.crons_affected) allCrons.add(c);
  }

  const noDownstream =
    blast.downstream.length === 0 || blast.downstream.every((group) => group.callers.length === 0);

  return (
    <section>
      <SectionLabel icon="Zap">Blast radius</SectionLabel>
      <div style={s.descriptionBox}>
        {blast.degraded && (
          <div style={s.blastDegradedRow}>
            <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
              {t("degraded.message")}
            </Badge>
          </div>
        )}

        <div style={s.blastStatsRow} data-testid="blast-stats">
          <div style={s.blastStatsGroup}>
            <span style={s.blastStat}>
              <Icon.Code size={13} />
              {blast.changed_symbols.length} {t("stat.symbols")}
            </span>
            <span style={s.blastStat}>
              <Icon.ArrowRight size={13} />
              {totalCallers} {t("stat.callers")}
            </span>
            <span style={s.blastStat}>
              <Icon.Globe size={13} />
              {allEndpoints.size} {t("stat.endpoints")}
            </span>
            <span style={s.blastStat}>
              <Icon.Clock size={13} />
              {allCrons.size} {t("stat.crons")}
            </span>
          </div>
          <ViewToggle view={view} onChange={setView} treeLabel={t("view.tree")} graphLabel={t("view.graph")} />
        </div>

        {noDownstream ? (
          <p style={s.blastEmpty}>{t("noDownstream", { count: blast.changed_symbols.length })}</p>
        ) : view === "graph" ? (
          <BlastRadiusGraph downstream={blast.downstream} />
        ) : (
          <div style={s.blastGroups}>
            {blast.downstream.map((group) => {
              const isOpen = openGroups[group.symbol] ?? false;
              return (
                <div key={group.symbol} style={s.blastGroup}>
                  <div
                    style={s.blastGroupHeader}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(group.symbol)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleGroup(group.symbol);
                      }
                    }}
                  >
                    <Icon.ChevronRight
                      size={13}
                      style={{ transform: isOpen ? "rotate(90deg)" : undefined }}
                    />
                    <span style={s.blastGroupSymbol}>
                      <Icon.Code size={13} />
                      {group.symbol}
                    </span>
                    <span style={s.blastGroupCount}>
                      {t("callerCount", { count: group.callers.length })}
                    </span>
                  </div>
                  {isOpen && (
                    <div style={s.blastGroupBody}>
                      {group.callers.length === 0 ? (
                        <div style={s.blastGroupEmpty}>—</div>
                      ) : (
                        group.callers.map((caller, i) => {
                          const href =
                            repoFullName && headSha
                              ? githubBlobUrl(repoFullName, headSha, caller.file, caller.line)
                              : undefined;
                          return (
                            <div key={i} style={s.blastCallerRow}>
                              <span style={s.blastCallerPrefix}>↳</span>
                              <MonoLink href={href}>
                                {caller.file}:{caller.line}
                              </MonoLink>
                            </div>
                          );
                        })
                      )}
                      {(group.endpoints_affected.length > 0 || group.crons_affected.length > 0) && (
                        <div style={s.blastImpactRow}>
                          {group.endpoints_affected.map((endpoint) => (
                            <Badge key={endpoint} mono color="var(--accent)" bg="var(--accent-bg)">
                              {endpoint}
                            </Badge>
                          ))}
                          {group.crons_affected.map((cron) => (
                            <Badge key={cron} mono color="var(--warn)" bg="var(--warn-bg)">
                              {cron}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <PriorPrsSection priorPrs={blast.prior_prs} repoId={repoId} />
      </div>
    </section>
  );
}
