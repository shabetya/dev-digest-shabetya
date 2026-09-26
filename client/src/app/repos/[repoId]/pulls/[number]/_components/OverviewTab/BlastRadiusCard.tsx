"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Icon, MonoLink } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

/**
 * Blast Radius card — the PR's pre-calculated impact map (changed symbols,
 * their callers, and which HTTP endpoints/cron jobs depend on them). Purely
 * read-only presentation of `GET /pulls/:id/blast` — no LLM call, no fresh
 * analysis. Renders nothing before a `prId` is known or while loading
 * (mirrors IntentCard's convention).
 */
export function BlastRadiusCard({
  prId,
  repoFullName,
  headSha,
}: {
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const { data: blast, isLoading } = useBlastRadius(prId);
  const t = useTranslations("blast");
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});

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
          <span>
            {blast.changed_symbols.length} {t("stat.symbols")}
          </span>
          <span>
            {totalCallers} {t("stat.callers")}
          </span>
          <span>
            {allEndpoints.size} {t("stat.endpoints")}
          </span>
          <span>
            {allCrons.size} {t("stat.crons")}
          </span>
        </div>

        {noDownstream ? (
          <p style={s.blastEmpty}>{t("noDownstream", { count: blast.changed_symbols.length })}</p>
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
                    <span style={s.blastGroupSymbol}>{group.symbol}</span>
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
                            <Badge key={endpoint} mono>
                              {endpoint}
                            </Badge>
                          ))}
                          {group.crons_affected.map((cron) => (
                            <Badge key={cron} mono>
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
      </div>
    </section>
  );
}
