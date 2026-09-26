"use client";

import React from "react";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import RunTraceDrawer from "../RunTraceDrawer";
import { usePrDetailPage } from "./usePrDetailPage";
import { s } from "./styles";

/** PR Detail — /repos/:repoId/pulls/:number. Renders the F2 shell (header +
    tabs + trace drawer); all data/state orchestration lives in usePrDetailPage. */
export function PrDetailView({ repoId, number }: { repoId: string; number: string }) {
  const page = usePrDetailPage(repoId, number);

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (page.repoNotFound) {
    return (
      <AppShell crumb={page.crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (page.isLoading) {
    return (
      <AppShell crumb={page.crumb}>
        <div style={s.loadingWrap}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (page.isError || !page.pr) {
    return (
      <AppShell crumb={page.crumb}>
        <ErrorState
          fullScreen
          title="Couldn't load this pull request"
          body={page.error instanceof ApiError ? page.error.message : `PR #${number} could not be loaded.`}
          onRetry={() => page.refetch()}
        />
      </AppShell>
    );
  }

  const pr = page.pr;

  return (
    <AppShell crumb={page.crumb}>
      <PrDetailHeader
        pr={pr}
        prId={page.prId}
        tab={page.tab}
        findingsCount={page.findingsCount}
        githubUrl={page.repoFullName ? githubPrUrl(page.repoFullName, pr.number) : null}
        onSetTab={page.setTab}
        onRunStart={() => page.setTab("findings")}
        onRunsStarted={() => page.invalidateActiveRuns()}
      />

      <div style={s.body}>
        {page.tab === "overview" && (
          <OverviewTab
            prBody={pr.body}
            prId={page.prId}
            repoId={repoId}
            repoFullName={page.repoFullName}
            headSha={pr.head_sha}
          />
        )}

        {page.tab === "findings" && (
          <FindingsTab
            prId={page.prId}
            liveRunIds={page.liveRunIds}
            reviewRunning={page.reviewRunning}
            lethalTrifecta={page.lethalTrifecta}
            runs={page.runs}
            prRuns={page.prRuns}
            prCommits={pr.commits}
            repoFullName={page.repoFullName}
            headSha={pr.head_sha}
            cancelMutation={page.cancel}
            onOpenTrace={(id) => page.setParam("trace", id)}
            onDelete={(id) => {
              if (window.confirm("Delete this run from history? (its logs are removed too)"))
                page.deleteRun.mutate(id);
            }}
            onRunDone={() => {
              page.invalidateActiveRuns();
              page.invalidateRunHistory();
              page.refetchReviews();
            }}
          />
        )}

        {page.tab === "diff" && (
          <DiffTab
            prId={page.prId}
            filesCount={pr.files_count}
            files={pr.files}
            canComment={pr.status === "open"}
            repoFullName={page.repoFullName}
            headSha={pr.head_sha}
          />
        )}
      </div>

      {page.prId && page.traceRunId && (
        <RunTraceDrawer
          runId={page.traceRunId}
          prNumber={pr.number}
          findings={page.runs.find((r) => r.run_id === page.traceRunId)?.findings ?? []}
          agentName={page.runs.find((r) => r.run_id === page.traceRunId)?.agent_name ?? null}
          onClose={() => page.setParam("trace", null)}
        />
      )}
    </AppShell>
  );
}
