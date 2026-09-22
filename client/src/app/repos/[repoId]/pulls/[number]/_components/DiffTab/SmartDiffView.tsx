/* SmartDiffView — the "Smart order" rendering of the Files-changed tab: the
   PR's files grouped by role (core/tests/wiring/docs/boilerplate), each group
   showing a file count + how many of its files carry a finding, with
   docs/boilerplate collapsed by default. Reuses FileCard (same component the
   flat DiffViewer renders) so inline comments + Smart Diff finding
   annotations work identically in both orders. Whole categories fold/unfold
   (not just individual files) via a chevron on the group header, alongside a
   colored role swatch, matching the reference design. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { FileCard, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { s, chevronForGroup } from "./styles";

/** Groups collapsed by default (whole category, not just its files) —
    everything else starts expanded, with each file still following its own
    auto-expand-if-small rule (passed `initialOpen={undefined}`). */
const COLLAPSED_BY_DEFAULT = new Set<SmartDiffRole>(["docs", "boilerplate"]);

const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "coreLabel",
  tests: "testsLabel",
  wiring: "wiringLabel",
  docs: "docsLabel",
  boilerplate: "boilerplateLabel",
};

/** One swatch color per role. core/wiring/boilerplate reuse the reference
    design's blue/orange/gray via existing semantic tokens; tests/docs get a
    green/purple of their own (`--role-docs` is the one role-specific token —
    everything else already existed for severity/status elsewhere). */
const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--warn)",
  docs: "var(--role-docs)",
  boilerplate: "var(--info)",
};

export function SmartDiffView({
  smartDiff,
  files,
  commenting,
  findingsApi,
}: {
  smartDiff: SmartDiffResponse;
  files: PrFile[];
  commenting?: DiffCommentApi;
  findingsApi?: DiffFindingsApi;
}) {
  const t = useTranslations("prReview");

  // Whole-category open/closed state, one entry per role, initialized from
  // COLLAPSED_BY_DEFAULT — independent of each file's own auto-expand state.
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const role of Object.keys(ROLE_LABEL_KEY)) init[role] = !COLLAPSED_BY_DEFAULT.has(role as SmartDiffRole);
    return init;
  });
  const toggleGroup = (role: SmartDiffRole) => setOpenGroups((prev) => ({ ...prev, [role]: !prev[role] }));

  const filesByPath = React.useMemo(() => {
    const map = new Map<string, PrFile>();
    for (const f of files) map.set(f.path, f);
    return map;
  }, [files]);

  return (
    <div style={s.groups}>
      <div style={s.caption} data-testid="smart-diff-caption">
        {t("smartDiff.groupedByRole")}
      </div>
      {smartDiff.groups.map((group) => {
        const roleFiles = group.files
          .map((sf) => filesByPath.get(sf.path))
          .filter((f): f is PrFile => !!f);
        // The smart-diff response's own `finding_lines` is the source of
        // truth for "this file has a finding" — prefer it over
        // cross-referencing usePrReviews (which is only needed to render the
        // findings' actual content, via `findingsApi`).
        const filesWithFindings = group.files.filter((f) => f.finding_lines.length > 0).length;
        const isOpen = openGroups[group.role] ?? true;

        return (
          <div key={group.role} style={s.group} data-testid={`smart-diff-group-${group.role}`}>
            <div
              style={s.groupHeader}
              onClick={() => toggleGroup(group.role)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleGroup(group.role);
                }
              }}
            >
              <Icon.ChevronRight size={13} style={chevronForGroup(isOpen)} />
              <span style={{ ...s.roleDot, background: ROLE_COLOR[group.role] }} />
              <span style={s.groupLabel}>{t(`smartDiff.${ROLE_LABEL_KEY[group.role]}`)}</span>
              <span style={s.groupCount}>{t("smartDiff.filesCount", { count: group.files.length })}</span>
              {filesWithFindings > 0 && (
                <span style={s.groupFindings}>{t("smartDiff.findingLines", { count: filesWithFindings })}</span>
              )}
            </div>
            {isOpen && (
              <div style={s.groupBody}>
                {roleFiles.length === 0 ? (
                  <div style={s.groupEmpty}>—</div>
                ) : (
                  roleFiles.map((file, i) => (
                    <FileCard
                      key={i}
                      file={file}
                      commenting={commenting}
                      findingsApi={findingsApi}
                      initialOpen={COLLAPSED_BY_DEFAULT.has(group.role) ? false : undefined}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
