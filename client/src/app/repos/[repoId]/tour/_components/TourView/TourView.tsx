/* TourView — Onboarding Tour page body (/repos/:repoId/tour): loading, first-visit
   CTA, error banner, "On this page" nav and five collapsible section cards. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { onboardingErrorReason, useGenerateOnboarding, useOnboarding } from "@/lib/hooks/onboarding";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ArchitectureSection } from "./ArchitectureSection";
import { CriticalPathsSection } from "./CriticalPathsSection";
import { FirstTasksSection } from "./FirstTasksSection";
import { ReadingPathSection } from "./ReadingPathSection";
import { RunLocallySection } from "./RunLocallySection";
import { SectionCard } from "./SectionCard";
import { SectionNav } from "./SectionNav";
import { TourHeader } from "./TourHeader";
import { SECTION_IDS, isSectionId, type SectionId } from "./constants";
import { fileUrl, scrollWithinContainer } from "./helpers";
import { s } from "./styles";

export function TourView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: tour, isLoading, isError, refetch } = useOnboarding(repoId);
  const generate = useGenerateOnboarding();
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<SectionId>>(new Set());
  const [scrollTarget, setScrollTarget] = React.useState<SectionId | null>(null);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("crumb") }];
  const hasTour = !!tour;

  const reveal = React.useCallback((id: SectionId) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setScrollTarget(id);
  }, []);

  // Deep link: once the tour has rendered, honour a section hash on the URL.
  React.useEffect(() => {
    if (!hasTour) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (isSectionId(hash)) reveal(hash);
  }, [hasTour, reveal]);

  // Scroll after the (possibly just re-expanded) section is in the DOM.
  React.useEffect(() => {
    if (!scrollTarget) return;
    const el = document.getElementById(scrollTarget);
    if (el) scrollWithinContainer(el);
    setScrollTarget(null);
  }, [scrollTarget]);

  const selectSection = (id: SectionId) => {
    window.history.replaceState(null, "", `#${id}`);
    reveal(id);
  };

  const toggle = (id: SectionId) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const branch = activeRepo?.default_branch;
  const hrefFor = (path: string) => (activeRepo && branch ? fileUrl(activeRepo.full_name, branch, path) : null);

  const reason = onboardingErrorReason(generate.error);
  const errorMessage = generate.isError
    ? reason
      ? t(`error.${reason}`)
      : t("error.unknown", { message: generate.error instanceof ApiError ? generate.error.message : String(generate.error) })
    : null;
  const banner = errorMessage && (
    <div role="alert" style={s.banner}>
      {errorMessage}
    </div>
  );
  const regenerate = () => generate.mutate(repoId);

  return (
    <AppShell crumb={crumb}>
      <TourHeader repoId={repoId} repoName={repoName} tour={tour} pending={generate.isPending} onRegenerate={regenerate} />
      <div style={s.content}>
        {isLoading ? (
          <Skeleton height={220} />
        ) : isError ? (
          <ErrorState title={t("loadError.title")} onRetry={() => refetch()} />
        ) : !tour ? (
          <>
            {banner}
            <EmptyState
              icon="Workflow"
              title={t("generate.title")}
              body={generate.isPending ? t("generate.generating") : t("generate.body")}
              cta={t("generate.cta")}
              ctaLoading={generate.isPending}
              onCta={regenerate}
            />
          </>
        ) : (
          <>
            {banner}
            <div style={s.layout}>
              <SectionNav onSelect={selectSection} />
              <div style={s.sections}>
                {SECTION_IDS.map((id) => (
                  <SectionCard
                    key={id}
                    id={id}
                    title={t(`sections.${id}`)}
                    expanded={!collapsed.has(id)}
                    onToggle={() => toggle(id)}
                    busy={generate.isPending}
                  >
                    {id === "architecture" && <ArchitectureSection data={tour.sections.architecture} />}
                    {id === "critical-paths" && (
                      <CriticalPathsSection items={tour.sections.critical_paths} hrefFor={hrefFor} />
                    )}
                    {id === "run-locally" && <RunLocallySection steps={tour.sections.run_locally} />}
                    {id === "reading-path" && <ReadingPathSection items={tour.sections.reading_path} />}
                    {id === "first-tasks" && <FirstTasksSection tasks={tour.sections.first_tasks} hrefFor={hrefFor} />}
                  </SectionCard>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
