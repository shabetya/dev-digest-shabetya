"use client";

import { useParams } from "next/navigation";
import { MultiAgentReviewView } from "./_components/MultiAgentReviewView";

/* Route: /multi-agent-review/:multiRunId. Top-level (not nested under
   repos/:repoId/pulls/:number) — the multi-run's id alone resolves the PR
   via GET /multi-agent-runs/:id, and Configure Run's own step 1 (pick ANY
   PR) implies this is a dashboard-level feature, not a PR-page sub-view. */
export default function MultiAgentReviewPage() {
  const params = useParams<{ multiRunId: string }>();
  return <MultiAgentReviewView multiRunId={params.multiRunId} />;
}
