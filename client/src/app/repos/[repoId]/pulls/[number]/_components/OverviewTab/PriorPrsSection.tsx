"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PriorPr } from "@devdigest/shared";
import { s } from "./styles";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compact relative date for a prior PR's `date` (ISO or null). Colocated
 * here rather than reused from the PR-list route's own `relativeTime`
 * helper — that helper is route-private to `pulls/`, and this is a
 * different route's feature; see frontend-architecture's colocation-first
 * rule ("sharing is earned"). Duplication of one small function is cheaper
 * than a cross-route coupling for a single caller.
 */
function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const days = Math.max(0, Math.round((Date.now() - then) / MS_PER_DAY));
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/**
 * "Prior PRs touching these files" — collapsible, defaults closed (matches
 * this card's own per-symbol group default and this app's
 * low-signal-collapsed convention). Purely presentational over
 * `blast.prior_prs`, which the parent card already has from its one fetch —
 * no second fetch here.
 */
export function PriorPrsSection({ priorPrs, repoId }: { priorPrs: PriorPr[]; repoId: string }) {
  const t = useTranslations("blast");
  const [isOpen, setIsOpen] = React.useState(false);

  if (priorPrs.length === 0) return null;

  const toggle = () => setIsOpen((v) => !v);

  return (
    <div style={s.priorPrsSection}>
      <div
        style={s.priorPrsHeader}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <Icon.ChevronRight size={13} style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />
        <span style={s.priorPrsTitle}>{t("priorPrs.title")}</span>
        <span style={s.priorPrsCount}>{priorPrs.length}</span>
      </div>
      {isOpen && (
        <div style={s.priorPrsBody}>
          {priorPrs.map((pr) => (
            <div key={pr.number} style={s.priorPrRow}>
              <Link href={`/repos/${repoId}/pulls/${pr.number}`} style={s.priorPrLink}>
                #{pr.number} {pr.title}
              </Link>
              <div style={s.priorPrMeta}>
                {pr.author} · {relativeDate(pr.date)}
              </div>
              {pr.takeaway && <div style={s.priorPrTakeaway}>{pr.takeaway}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
