/* RunReviewDropdown — checkbox multi-select panel (on Popover, not Dropdown —
   see client/INSIGHTS.md: Dropdown's `position:absolute` panel gets clipped
   by an `overflow:hidden` ancestor; Popover's `position:fixed` panel doesn't).
   Lists every configured agent with a per-agent time estimate (AC-1), lets
   the user check/uncheck a subset, and POSTs that subset via `agentIds` on
   submit — navigating to the Multi-Agent Review results page for the run it
   creates (AC-3). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, Popover } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useRunReview } from "@/lib/hooks/reviews";
import { useAgentEstimates } from "@/lib/hooks/multi-agent";
import { formatDurationShort } from "@/lib/format";
import { notify } from "@/lib/toast";
import { defaultSelection, estimateFor, selectAll, toggleOne } from "./helpers";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agentsData } = useAgents();
  const { data: estimatesData } = useAgentEstimates();
  const run = useRunReview();
  const agents = agentsData ?? [];
  const estimates = estimatesData?.estimates;

  const [selected, setSelected] = React.useState<Set<string> | null>(null);
  // Initialize (and re-sync) the default selection once the agent list loads —
  // not derived-from-render state, since the user then mutates it locally.
  React.useEffect(() => {
    if (selected == null && agents.length > 0) setSelected(defaultSelection(agents));
  }, [agents, selected]);
  const checked = selected ?? new Set<string>();

  const kick = async () => {
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, agentIds: Array.from(checked) });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
      if (res.multi_run_id) {
        router.push(`/multi-agent-review/${res.multi_run_id}`);
      } else {
        // N=1: AC-11 only creates a multi_agent_runs row for 2+ targets, so
        // there's nothing to navigate to — stay on the PR page (same as the
        // old single-agent flow), but still confirm the run started. Without
        // this, a caller that doesn't wire onRunStart/onRunsStarted (every
        // current call site does, but the component shouldn't depend on
        // that) would make it look like the button did nothing.
        notify.success(t("runReview.singleAgentStarted"));
      }
    } finally {
      onRunSettled?.();
    }
  };

  const panel = (
    <div>
      {warnMerged && (
        <div style={s.mergedWarning}>
          <Icon.AlertTriangle size={14} />
          {t("runReview.mergedWarning")}
        </div>
      )}
      <div style={s.headerRow}>
        <span style={s.header}>{t("runReview.pickAgents")}</span>
        {agents.length > 0 && (
          <button type="button" style={s.selectAllBtn} onClick={() => setSelected(selectAll(agents))}>
            {t("runReview.selectAll")}
          </button>
        )}
      </div>

      {agents.length === 0 ? (
        <div style={s.row}>
          <button
            type="button"
            style={s.footerLink}
            onClick={() => router.push("/agents")}
          >
            <Icon.Plus size={14} />
            {t("runReview.noAgentsYet")}
          </button>
        </div>
      ) : (
        <>
          <div style={s.list}>
            {agents.map((a) => {
              const est = estimateFor(estimates, a.id);
              const label = est && est.sample_size > 0 ? `~${formatDurationShort(est.median_duration_ms)}` : t("runReview.noHistoryYet");
              return (
                <div key={a.id} style={s.row}>
                  <Checkbox
                    checked={checked.has(a.id)}
                    onChange={() => setSelected(toggleOne(checked, a.id))}
                    label={<span style={s.rowName}>{a.name}</span>}
                  />
                  <span style={s.rowEstimate}>{label}</span>
                </div>
              );
            })}
          </div>

          <div style={s.divider} />
          <Button full kind="primary" size="md" loading={run.isPending} disabled={checked.size === 0 || run.isPending} onClick={kick}>
            {t("runReview.runMultiAgentReview", { count: checked.size })}
          </Button>
        </>
      )}

      <div style={s.divider} />
      <button type="button" style={s.footerLink} onClick={() => router.push("/configure-run")}>
        <Icon.Sparkles size={14} />
        {t("runReview.configureRun")}
      </button>
      <button type="button" style={s.footerLink} onClick={() => router.push("/agents")}>
        <Icon.Settings size={14} />
        {t("runReview.configureAgents")}
      </button>
    </div>
  );

  return (
    <Popover
      align="right"
      content={panel}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={run.isPending}>
            {run.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      }
    />
  );
}
