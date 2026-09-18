/* PR Detail — /repos/:repoId/pulls/:number. F2 shell extended by A2 with:
   - Findings panel (VerdictBanner + FindingCards)
   - RunReviewDropdown (run all / a specific agent) + live SSE RunStatus
   - Basic file-by-file diff viewer in the Files tab
   Tab state lives in query (?tab). Orchestration lives in
   _components/PrDetailView. */
"use client";

import { useParams } from "next/navigation";
import { PrDetailView } from "./_components/PrDetailView";

export default function PRDetailPage() {
  const params = useParams<{ repoId: string; number: string }>();
  return <PrDetailView repoId={params.repoId} number={params.number} />;
}
