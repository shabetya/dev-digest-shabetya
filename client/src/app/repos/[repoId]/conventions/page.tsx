/* Conventions page — /repos/:repoId/conventions (Skills Lab). Scans the repo
   for candidate house-rules, lets the user Accept/Reject each one, then
   merges accepted candidates into a Skill via CreateSkillModal. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Skeleton, EmptyState, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import {
  useConventionCandidates,
  useExtractConventions,
  useConventionAction,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { s } from "./styles";

const SKELETON_ROWS = 3;

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: candidates, isLoading, isError, error, refetch } = useConventionCandidates(repoId);
  const extract = useExtractConventions();
  const action = useConventionAction();
  const [showCreateSkill, setShowCreateSkill] = React.useState(false);

  const repoName = activeRepo?.full_name ?? repoId;
  const accepted = (candidates ?? []).filter((c) => c.status === "accepted");

  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: repoName, mono: true }, { label: t("page.crumbConventions") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: repoName, mono: true }, { label: t("page.crumbConventions") }]}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>
            {t("page.headingPrefix")}
            <span style={s.repoName}>{repoName}</span>
          </h1>
          <p style={s.pageSubtitle}>{t("page.subtitle")}</p>
        </div>
        <div style={s.headerActions}>
          <Button
            kind="secondary"
            icon="RefreshCw"
            loading={extract.isPending}
            disabled={extract.isPending}
            onClick={() => extract.mutate(repoId)}
          >
            {extract.isPending ? t("page.scanning") : t("page.rescan")}
          </Button>
        </div>
      </div>

      <div style={s.content}>
        {isLoading ? (
          <div style={s.list}>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} height={120} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : t("page.loadError")}
            onRetry={() => refetch()}
          />
        ) : (candidates ?? []).length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            ctaLoading={extract.isPending}
            onCta={() => extract.mutate(repoId)}
          />
        ) : (
          <>
            <div style={s.toolbar}>
              <span style={s.acceptedCount}>
                {t("page.acceptedCount", { accepted: accepted.length, total: candidates!.length })}
              </span>
              <Button
                kind="primary"
                icon="Sparkles"
                disabled={accepted.length === 0}
                onClick={() => setShowCreateSkill(true)}
              >
                {t("page.createSkill")}
              </Button>
            </div>
            <div style={s.list}>
              {candidates!.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  pending={action.isPending}
                  onAction={(act) => action.mutate({ candidateId: c.id, action: act, repoId })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {showCreateSkill && (
        <CreateSkillModal
          accepted={accepted}
          repoFullName={activeRepo?.full_name ?? repoName}
          onClose={() => setShowCreateSkill(false)}
        />
      )}
    </AppShell>
  );
}
