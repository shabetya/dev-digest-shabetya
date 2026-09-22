/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count, Smart Diff finding dot) and, when open, its parsed lines plus any
   outdated comments and (Smart Diff) inline finding annotations. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  findingKey,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
  type DiffFindingsApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Worst-first severity order, for picking the finding-dot color. */
const SEVERITY_RANK: Record<FindingRecord["severity"], number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

/** The color of the worst severity among a file's findings (defaults to
    SUGGESTION's color if the list is empty — callers only render the dot
    when it's non-empty). */
function worstSeverityColor(findings: FindingRecord[]): string {
  let worst: FindingRecord["severity"] = "SUGGESTION";
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst]) worst = f.severity;
  }
  return SEV[worst]?.c ?? SEV.INFO.c;
}

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings anchored to a given parsed line (always the RIGHT/new side —
    findings have no `line` field, only `start_line`). */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] {
  if (matched.size === 0) return [];
  const out: FindingRecord[] = [];
  for (const key of keysForLine(ln)) {
    if (!key.startsWith("RIGHT:")) continue;
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  initialOpen,
  findingsApi,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** When provided, used as the open/closed initializer instead of the
      default auto-expand-if-small rule (e.g. Smart Diff collapsing docs/
      boilerplate groups by default). */
  initialOpen?: boolean;
  /** Smart Diff: this file's findings + the accept/dismiss action wiring. */
  findingsApi?: DiffFindingsApi;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    initialOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const fileFindings = React.useMemo(
    () => findingsApi?.findings.filter((f) => f.file === file.path) ?? [],
    [findingsApi, file.path]
  );
  const matchedFindings = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const f of fileFindings) {
      const key = findingKey(f);
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return map;
  }, [fileFindings]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        {fileFindings.length > 0 && (
          <span
            title={`${fileFindings.length} finding(s)`}
            aria-label={`${fileFindings.length} finding(s)`}
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: worstSeverityColor(fileFindings),
              flexShrink: 0,
            }}
          />
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln, matchedFindings)}
                findingsApi={findingsApi}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
