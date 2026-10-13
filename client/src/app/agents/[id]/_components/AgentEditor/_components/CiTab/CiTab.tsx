/* CiTab (agent) — SPEC-05 AC-18/AC-19: a status badge ("Active in N repos"),
   one row per installed repo (target-type badge, last-run status/time), the
   "Fail CI on" control (reuses PUT /agents/:id — no new setting), and the
   "Add repository" / "Update CI config" / "+ Add to CI" entry points into
   the Export Wizard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, FormField, SelectInput, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallation } from "@devdigest/shared";
import { useAgentCi, useRefreshAgentCi } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { CI_FAIL_ON_VALUES } from "../ConfigTab/constants";
import { ExportWizard } from "./ExportWizard";
import { UpdateConfigDialog } from "./UpdateConfigDialog";
import { s } from "./styles";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const tAgents = useTranslations("agents");
  const { data, isLoading, isError, refetch } = useAgentCi(agent.id);
  const refresh = useRefreshAgentCi(agent.id);
  const updateAgent = useUpdateAgent();
  // `wizard` opens the full 4-step ExportWizard (new install: "+ Add to CI" /
  // "Add repository"); `updateFor` opens the lighter UpdateConfigDialog for
  // an ALREADY-installed repo's "Update CI config" shortcut (Fix C).
  const [wizard, setWizard] = React.useState<{ repo?: string } | null>(null);
  const [updateFor, setUpdateFor] = React.useState<CiInstallation | null>(null);

  const installations = data?.installations ?? [];
  const runs = data?.runs ?? [];
  const lastRunFor = (installationId: string) => runs.find((r) => r.ci_installation_id === installationId);

  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: tAgents(`config.ciFailOnOptions.${v}`) }));

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div>
          <h2 style={s.h2}>{t("ciTab.heading")}</h2>
          <p style={s.sub}>{t("ciTab.subtitle")}</p>
        </div>
        {installations.length > 0 && (
          <Badge color="var(--ok)">{t("ciTab.activeInRepos", { count: installations.length })}</Badge>
        )}
      </div>

      <FormField label={tAgents("config.ciFailOn")} hint={tAgents("config.ciFailOnHint")}>
        <SelectInput
          value={agent.ci_fail_on}
          onChange={(v) => updateAgent.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
          options={ciFailOnOptions}
        />
      </FormField>

      {isLoading ? (
        <Skeleton height={120} />
      ) : isError ? (
        <ErrorState title={t("runs.emptyTitle")} onRetry={() => refetch()} />
      ) : installations.length === 0 ? (
        <EmptyState
          icon="Workflow"
          title={t("ciTab.heading")}
          body={t("ciTab.empty")}
          cta={t("ciTab.addToCi")}
          onCta={() => setWizard({})}
        />
      ) : (
        <>
          <div style={s.actions}>
            <Button kind="secondary" icon="RefreshCw" loading={refresh.isPending} onClick={() => refresh.mutate()}>
              {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
            </Button>
            <Button kind="secondary" onClick={() => setWizard({})}>
              {t("ciTab.addRepository")}
            </Button>
          </div>
          <ul style={s.list}>
            {installations.map((inst) => {
              const last = lastRunFor(inst.id);
              return (
                <li key={inst.id} style={s.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.repoName}>{inst.repo}</div>
                    <div style={s.sub}>
                      {t("ciTab.installed", { date: new Date(inst.installed_at).toLocaleDateString() })}
                    </div>
                  </div>
                  <Badge mono>{inst.target_type}</Badge>
                  <div style={s.sub}>
                    {last?.ran_at
                      ? t("ciTab.lastRun", { date: new Date(last.ran_at).toLocaleString() })
                      : t("ciTab.neverRun")}
                  </div>
                  <Button kind="ghost" size="sm" onClick={() => setUpdateFor(inst)}>
                    {t("ciTab.update")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {wizard && <ExportWizard agent={agent} initialRepo={wizard.repo} onClose={() => setWizard(null)} />}
      {updateFor && <UpdateConfigDialog agent={agent} installation={updateFor} onClose={() => setUpdateFor(null)} />}
    </div>
  );
}
