/* ConfigureRunView — standalone Configure Run page (AC-4..7). Step 1: pick a
   repo then a PR (reusing the existing useRepos()/usePulls() hooks — there's
   no cross-repo PR endpoint to build one against). Step 2 (disabled until a
   PR is chosen): one agent card per configured agent with its per-agent
   estimate, a "Select all" link, and a bottom bar with the combined estimate
   + the run button. Same submit flow as the PR-page picker. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, EmptyState, Icon, SelectInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useRepos, usePulls } from "@/lib/hooks";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEstimates } from "@/lib/hooks/multi-agent";
import { useRunReview } from "@/lib/hooks/reviews";
import { formatCost, formatDurationShort } from "@/lib/format";
import { combinedEstimate, estimateFor, selectAllIds, toggleOne } from "./helpers";
import { s } from "./styles";

export function ConfigureRunView() {
  const t = useTranslations("multiAgentReview");
  const router = useRouter();

  const { data: repos } = useRepos();
  const [repoId, setRepoId] = React.useState<string>("");
  const { data: pulls } = usePulls(repoId || null);
  const [prId, setPrId] = React.useState<string>("");

  const { data: agentsData } = useAgents();
  const { data: estimatesData } = useAgentEstimates();
  const agents = agentsData ?? [];
  const estimates = estimatesData?.estimates;

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const run = useRunReview();

  const selectedIds = Array.from(selected);
  const estimate = combinedEstimate(estimates, selectedIds);

  const submit = async () => {
    if (!prId || selectedIds.length === 0) return;
    const res = await run.mutateAsync({ prId, agentIds: selectedIds });
    if (res.multi_run_id) router.push(`/multi-agent-review/${res.multi_run_id}`);
  };

  return (
    <AppShell
      crumb={[{ label: t("configureRun.breadcrumbLab") }, { label: t("configureRun.breadcrumb") }]}
    >
      <div style={s.page}>
        <h1 style={s.h1}>{t("configureRun.title")}</h1>

        <div style={s.section}>
          <div style={s.sectionTitle}>{t("configureRun.step1Title")}</div>
          <div style={s.stepRow}>
            <div style={s.field}>
              <span style={s.fieldLabel}>{t("configureRun.step1RepoLabel")}</span>
              {repos && repos.length > 0 ? (
                <SelectInput
                  value={repoId}
                  onChange={(v) => {
                    setRepoId(v);
                    setPrId("");
                  }}
                  options={[{ value: "", label: "—" }, ...repos.map((r) => ({ value: r.id, label: r.full_name }))]}
                />
              ) : (
                <span style={s.fieldLabel}>{t("configureRun.step1NoRepos")}</span>
              )}
            </div>
            <div style={s.field}>
              <span style={s.fieldLabel}>{t("configureRun.step1PrLabel")}</span>
              {repoId && pulls && pulls.length > 0 ? (
                <SelectInput
                  value={prId}
                  onChange={setPrId}
                  options={[
                    { value: "", label: "—" },
                    ...pulls
                      .filter((p) => p.id)
                      .map((p) => ({ value: p.id as string, label: `#${p.number} ${p.title}` })),
                  ]}
                />
              ) : (
                <span style={s.fieldLabel}>
                  {repoId ? t("configureRun.step1NoPrs") : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ ...s.section, ...(prId ? {} : s.sectionDisabled) }}>
          <div style={s.headerRow}>
            <div style={s.sectionTitle}>{t("configureRun.step2Title")}</div>
            {agents.length > 0 && (
              <button type="button" style={s.selectAllBtn} onClick={() => setSelected(selectAllIds(agents))}>
                {t("configureRun.selectAll")}
              </button>
            )}
          </div>

          {agents.length === 0 ? (
            <EmptyState
              icon="Plus"
              title={t("configureRun.noAgentsTitle")}
              body={t("configureRun.noAgentsBody")}
              cta={t("configureRun.noAgentsCta")}
              onCta={() => router.push("/agents")}
            />
          ) : (
            <div style={s.grid}>
              {agents.map((a) => {
                const checked = selected.has(a.id);
                const est = estimateFor(estimates, a.id);
                const estLabel =
                  est && est.sample_size > 0
                    ? `${formatDurationShort(est.median_duration_ms)} · ${formatCost(est.median_cost_usd)}`
                    : t("configureRun.noHistoryYet");
                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    style={s.card(checked)}
                    onClick={() => setSelected(toggleOne(selected, a.id))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelected(toggleOne(selected, a.id));
                    }}
                  >
                    <div style={s.cardHeader}>
                      <Icon.Cpu size={15} />
                      <span style={s.cardName}>{a.name}</span>
                      <Checkbox checked={checked} onChange={() => setSelected(toggleOne(selected, a.id))} />
                    </div>
                    {a.description && <div style={s.cardDescription}>{a.description}</div>}
                    <div style={s.cardEstimate}>{estLabel}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {prId && selected.size > 0 && (
        <div style={s.bottomBar}>
          <span style={s.bottomEstimate}>
            {t("configureRun.estimateLine", {
              time: formatDurationShort(estimate.durationMs),
              cost: formatCost(estimate.costUsd),
            })}
          </span>
          <Button kind="primary" size="md" loading={run.isPending} disabled={run.isPending} onClick={submit}>
            {t("configureRun.runButton", { count: selected.size })}
          </Button>
        </div>
      )}
    </AppShell>
  );
}
