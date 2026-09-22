/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, an inline composer, and
   (Smart Diff) any anchored finding annotations. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, type DiffFindingsApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

/** CRITICAL/WARNING/SUGGESTION → the severity-line i18n key; INFO falls back
    to "suggestion" (no dedicated copy for it). */
const SEVERITY_LINE_KEY: Record<string, "blocker" | "warning" | "suggestion"> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
  INFO: "suggestion",
};

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  findingsApi,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Findings anchored to this line (Smart Diff inline annotations). */
  findings?: FindingRecord[];
  findingsApi?: DiffFindingsApi;
}) {
  const t = useTranslations("prReview");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}

      {findings && findings.length > 0 && (
        <div style={cs.findingsWrap}>
          {findings.map((f) => {
            const sevColor = SEV[f.severity]?.c ?? SEV.INFO.c;
            return (
              <div key={f.id} style={cs.findingRow}>
                <div style={cs.findingSeverityBar(sevColor)}>
                  <span style={cs.findingSeverityLabel(sevColor)}>
                    {t(`smartDiff.severityLine.${SEVERITY_LINE_KEY[f.severity] ?? "suggestion"}`)}
                  </span>
                </div>
                {findingsApi?.renderFinding(f)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
