"use client";

import React from "react";
import { SectionLabel, Badge, Button } from "@devdigest/ui";
import { usePrIntent, useExtractIntent } from "@/lib/hooks/intent";
import { s } from "./styles";

/**
 * Intent Layer card — the PR's derived intent/scope, a low-confidence
 * indicator, an "inaccessible plan link" note, and a manual "Re-evaluate"
 * trigger. Renders nothing before a `prId` is known; degrades to an
 * empty-but-actionable state before the first Intent has been computed
 * (either automatically by a review run, or by pressing Re-evaluate here).
 */
export function IntentCard({ prId }: { prId: string }) {
  const { data: intent, isLoading } = usePrIntent(prId);
  const extract = useExtractIntent();

  if (isLoading) return null;

  return (
    <section>
      <SectionLabel icon="Target">Intent</SectionLabel>
      <div style={s.descriptionBox}>
        {intent ? (
          <>
            <div style={s.intentHeaderRow}>
              <p style={s.intentSummary}>{intent.summary}</p>
              <div style={s.intentBadges}>
                {intent.low_confidence && (
                  <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
                    Low confidence
                  </Badge>
                )}
                {intent.plan_link_status === "inaccessible" && (
                  <Badge icon="Link" color="var(--text-muted)" bg="var(--bg-hover)">
                    Plan link inaccessible
                  </Badge>
                )}
              </div>
            </div>

            {intent.in_scope.length > 0 && (
              <div style={s.intentScopeGroup}>
                <span style={s.intentScopeLabel}>In scope</span>
                <ul style={s.intentScopeList}>
                  {intent.in_scope.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {intent.out_of_scope.length > 0 && (
              <div style={s.intentScopeGroup}>
                <span style={s.intentScopeLabel}>Out of scope</span>
                <ul style={s.intentScopeList}>
                  {intent.out_of_scope.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p style={s.intentEmpty}>
            No intent computed yet — it runs automatically with the next review, or trigger it now.
          </p>
        )}

        <div style={s.intentFooter}>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={extract.isPending}
            disabled={extract.isPending}
            onClick={() => extract.mutate(prId)}
          >
            {extract.isPending ? "Re-evaluating…" : "Re-evaluate"}
          </Button>
        </div>
      </div>
    </section>
  );
}
