/* CompareRunsModal — SPEC-04 AC-28: old → new metrics with signed deltas (icon +
   text + colour by good/bad), a line-level system-prompt diff with a +/− gutter,
   fixed/regressed cases and "Promote vX" (confirmed; hidden when the snapshot
   already equals the agent's current config). All text is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { useAgent, useAgentSkillLinks } from "@/lib/hooks/agents";
import { useCompareRuns, usePromoteSnapshot } from "@/lib/hooks/eval";
import { useModalA11y } from "@/components/eval/useModalA11y";
import { deltaTone, formatCost, formatPct, formatSigned, TONE_COLOR } from "@/components/eval/format";
import { diffLines, snapshotEqualsAgent } from "./helpers";
import { s } from "./styles";

type MetricKey = "recall" | "precision" | "citation_accuracy";
const METRICS: MetricKey[] = ["recall", "precision", "citation_accuracy"];

export function CompareRunsModal({ a, b, agentId, onClose }: { a: string; b: string; agentId: string; onClose: () => void }) {
  const t = useTranslations("eval");
  const ref = useModalA11y(onClose);
  const { data, isLoading, isError, refetch } = useCompareRuns(a, b);
  const { data: agent } = useAgent(agentId);
  const { data: links } = useAgentSkillLinks(agentId);
  const promote = usePromoteSnapshot();

  const skillIds = React.useMemo(() => [...(links ?? [])].sort((x, y) => x.order - y.order).map((l) => l.skill_id), [links]);

  const onPromote = (run: EvalSuiteRun) => {
    if (window.confirm(t("compare.confirmPromote", { version: run.agent_version }))) {
      promote.mutate({ agentId, config: run.config_snapshot });
    }
  };

  return (
    <div ref={ref}>
      <Modal width={820} title={t("compare.title")} subtitle={data ? t("compare.subtitle", { a: data.a.agent_version, b: data.b.agent_version }) : undefined} onClose={onClose}>
        <div style={s.body}>
          {isLoading ? (
            <Skeleton height={220} />
          ) : isError || !data ? (
            <ErrorState title={t("compare.loadError")} onRetry={() => refetch()} />
          ) : (
            <>
              <section>
                <h3 style={s.h3}>{t("compare.metrics")}</h3>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th scope="col" style={s.th}>{t("compare.metric")}</th>
                      <th scope="col" style={s.th}>v{data.a.agent_version}</th>
                      <th scope="col" style={s.th}>v{data.b.agent_version}</th>
                      <th scope="col" style={s.th}>{t("compare.delta")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((m) => (
                      <tr key={m}>
                        <th scope="row" style={{ ...s.td, textAlign: "left" }}>{t(`compare.labels.${m}`)}</th>
                        <td style={s.td}>{formatPct(data.a[m])}</td>
                        <td style={s.td}>{formatPct(data.b[m])}</td>
                        <td style={s.td}><Delta value={data.delta[m]} goodWhen="up" unit="pts" /></td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row" style={{ ...s.td, textAlign: "left" }}>{t("compare.labels.cost")}</th>
                      <td style={s.td}>{formatCost(data.a.cost_usd)}</td>
                      <td style={s.td}>{formatCost(data.b.cost_usd)}</td>
                      <td style={s.td}><Delta value={data.delta.cost_usd} goodWhen="down" unit="usd" /></td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section>
                <h3 style={s.h3}>{t("compare.promptDiff")}</h3>
                <div className="mono" style={s.diff} role="group" aria-label={t("compare.promptDiff")}>
                  {diffLines(data.a.config_snapshot.system_prompt, data.b.config_snapshot.system_prompt).map((l, i) => (
                    <div key={i} style={s.diffLine(l.type)}>
                      <span style={s.gutter} aria-label={t(`compare.diffMark.${l.type}`)}>{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
                      <span>{l.text}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 style={s.h3}>{t("compare.cases")}</h3>
                <CaseList label={t("compare.fixed")} items={data.fixed} empty={t("compare.none")} />
                <CaseList label={t("compare.regressed")} items={data.regressed} empty={t("compare.none")} />
                {data.only_in_a.length > 0 && <CaseList label={t("compare.onlyInA", { version: data.a.agent_version })} items={data.only_in_a} empty="" />}
                {data.only_in_b.length > 0 && <CaseList label={t("compare.onlyInB", { version: data.b.agent_version })} items={data.only_in_b} empty="" />}
              </section>

              <div style={s.footer}>
                {agent &&
                  [data.a, data.b].map((run) =>
                    snapshotEqualsAgent(run.config_snapshot, agent, skillIds) ? null : (
                      <Button key={run.id} kind="secondary" icon="Upload" loading={promote.isPending} disabled={promote.isPending} onClick={() => onPromote(run)}>
                        {t("compare.promote", { version: run.agent_version })}
                      </Button>
                    ),
                  )}
                <span role="status">{promote.isSuccess ? t("compare.promoted") : ""}</span>
                {promote.isError && <span role="alert" style={s.err}>{t("compare.promoteError")}</span>}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Delta({ value, goodWhen, unit }: { value: number | null; goodWhen: "up" | "down"; unit: "pts" | "usd" }) {
  const t = useTranslations("eval");
  if (value == null) return <span>—</span>;
  const tone = deltaTone(value, goodWhen);
  const Ic = tone === "flat" ? Icon.Slash : value > 0 ? Icon.ArrowUp : Icon.ArrowDown;
  const text = unit === "pts" ? t("common.pts", { value: formatSigned(value) }) : `${value > 0 ? "+" : value < 0 ? "-" : ""}$${Math.abs(value).toFixed(4)}`;
  return (
    <span style={s.delta(TONE_COLOR[tone])}>
      <Ic size={12} aria-hidden="true" />
      {text}
    </span>
  );
}

function CaseList({ label, items, empty }: { label: string; items: { case_id: string; case_name: string }[]; empty: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label} ({items.length})</div>
      {items.length === 0 ? (
        empty && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{empty}</div>
      ) : (
        <ul style={s.list}>
          {items.map((c) => (
            <li key={c.case_id}>{c.case_name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
