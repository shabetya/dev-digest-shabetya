"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Toggle } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { SmartDiffView } from "./SmartDiffView";
import { FindingCard } from "../FindingCard";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Needed by the reused FindingCard to build a GitHub blob deep-link. */
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const findingAction = useFindingAction();
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // Smart Diff's grouped view is the default whenever it's loaded; "Original
  // order" falls back to the flat DiffViewer — today's unchanged rendering.
  const [smartOrder, setSmartOrder] = React.useState(true);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  // Only the LATEST review's findings feed the inline annotations — an older,
  // superseded review's findings must never appear current (reviews come back
  // newest-first from `usePrReviews`).
  const latestFindings = reviews?.[0]?.findings ?? [];
  const findingsApi: DiffFindingsApi | undefined = prId
    ? {
        findings: latestFindings,
        pending: findingAction.isPending,
        onAction: (findingId, action) => findingAction.mutate({ findingId, action, prId }),
        repoFullName,
        headSha,
        // diff-viewer is a shared, cross-tab component — it must not import
        // this route's private FindingCard itself. This route (the only
        // consumer that knows what a "finding card" looks like here) injects
        // the render instead, wired to the same action/link props as before.
        renderFinding: (finding) => (
          <FindingCard
            f={finding}
            defaultExpanded
            pending={findingAction.isPending}
            repoFullName={repoFullName}
            headSha={headSha}
            onAction={(action) => findingAction.mutate({ findingId: finding.id, action, prId })}
          />
        ),
      }
    : undefined;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.headerActions}>
            {smartDiff && (
              <div style={s.toggleGroup}>
                {t(smartOrder ? "smartDiff.smartOrder" : "smartDiff.originalOrder")}
                <Toggle on={smartOrder} onChange={setSmartOrder} size={16} />
              </div>
            )}
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {smartDiff && smartOrder ? (
        <SmartDiffView smartDiff={smartDiff} files={files} commenting={commenting} findingsApi={findingsApi} />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
