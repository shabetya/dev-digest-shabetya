"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { VersionDiff } from "./_components/VersionDiff";
import { s } from "./styles";

/** Version history — every content-changing save snapshots a `skill_versions`
    row (server: SkillsRepository.update). Restore replays an earlier body
    through the normal PUT /skills/:id, which itself bumps to a new version —
    there's no separate "revert" endpoint, restoring IS just another save. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [diffOpen, setDiffOpen] = React.useState<number | null>(null);

  if (isLoading || !versions) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <div style={{ marginTop: 14 }}>
          <Skeleton height={48} />
        </div>
      </div>
    );
  }

  const restore = (version: number, body: string) => {
    if (!window.confirm(t("editor.versions.confirmRestore", { version }))) return;
    update.mutate(
      { id: skill.id, patch: { body } },
      {
        onSuccess: (data) =>
          toast.success(t("editor.versions.restored", { version: data.version })),
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("editor.versions.title")}</h2>
        <span style={s.count}>{t("editor.versions.count", { count: versions.length })}</span>
      </div>

      {versions.length === 0 && <p style={s.empty}>{t("editor.versions.empty")}</p>}

      {versions.map((v, i) => {
        const isCurrent = v.version === skill.version;
        const prev = versions[i + 1];
        const showingDiff = diffOpen === v.version;
        return (
          <React.Fragment key={v.version}>
            <div style={s.row}>
              <span style={s.versionTag}>v{v.version}</span>
              {isCurrent && <Badge color="var(--ok)">{t("editor.versions.current")}</Badge>}
              <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                {prev && (
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="GitCompare"
                    active={showingDiff}
                    onClick={() => setDiffOpen(showingDiff ? null : v.version)}
                  >
                    {t("editor.versions.diff")}
                  </Button>
                )}
                {!isCurrent && (
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    onClick={() => restore(v.version, v.body)}
                    disabled={update.isPending}
                  >
                    {update.isPending ? t("editor.versions.restoring") : t("editor.versions.restore")}
                  </Button>
                )}
              </div>
            </div>
            {showingDiff && prev && <VersionDiff oldBody={prev.body} newBody={v.body} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
