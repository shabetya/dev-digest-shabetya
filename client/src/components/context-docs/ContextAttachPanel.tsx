/* ContextAttachPanel — Context tab body shared by the Agent and Skill editors:
   attach/detach project-context docs of the active repo, reorder (drag or
   arrows), preview, and see the deduplicated token total. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, EmptyState, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import { useContextFiles } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";
import { dedupePaths, moveItem } from "@/lib/context-paths";
import { ContextPreviewModal } from "./ContextPreviewModal";
import { sumTokens } from "./helpers";
import { s } from "./styles";

export interface ContextAttachPanelProps {
  /** Saved own attached paths, ordered. Remount (key) when they change. */
  paths: string[];
  /** Paths inherited from linked skills (agent editor only); read-only. */
  inherited?: string[];
  saving: boolean;
  saved: boolean;
  onSave: (paths: string[]) => void;
}

export function ContextAttachPanel({ paths, inherited = [], saving, saved, onSave }: ContextAttachPanelProps) {
  const t = useTranslations("context");
  const { repoId } = useActiveRepo();
  const { data, isLoading, isError, refetch } = useContextFiles(repoId);
  const [draft, setDraft] = React.useState<string[]>(paths);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  if (!repoId) {
    return (
      <div style={s.wrap}>
        <EmptyState icon="FileText" title={t("tab.noRepoTitle")} body={t("tab.noRepoBody")} />
        <div style={s.actions}>
          <Button kind="primary" icon="Check" disabled>
            {t("tab.save")}
          </Button>
        </div>
      </div>
    );
  }
  if (isLoading) return <Skeleton height={48} />;
  if (isError || !data) return <ErrorState title={t("tab.loadError")} onRetry={() => refetch()} />;

  const files = data.files;
  const byPath = new Map(files.map((f) => [f.path, f]));
  const inheritedOnly = inherited.filter((p) => !draft.includes(p));
  const unattached = files.filter((f) => !draft.includes(f.path) && !inheritedOnly.includes(f.path));
  const effective = dedupePaths([...draft, ...inheritedOnly]);
  const foundCount = effective.filter((p) => byPath.has(p)).length;
  const dirty = draft.join("\n") !== paths.join("\n");

  const toggle = (p: string) => setDraft((d) => (d.includes(p) ? d.filter((x) => x !== p) : [...d, p]));
  const move = (from: number, to: number) => setDraft((d) => moveItem(d, from, to));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("tab.title")}</h2>
        <span style={s.count}>{t("tab.count", { attached: foundCount, total: files.length })}</span>
        <span style={s.count}>{t("tab.total", { count: sumTokens(effective, files) })}</span>
      </div>
      <div style={s.hint}>{t("tab.hint")}</div>

      {data.reason === "no_clone" ? (
        <EmptyState icon="FileText" title={t("noClone.title")} body={t("noClone.body")} />
      ) : files.length === 0 && draft.length === 0 && inheritedOnly.length === 0 ? (
        <div style={s.hint}>{t("tab.noDocs")}</div>
      ) : null}

      {draft.map((p, i) => {
        const f = byPath.get(p);
        return (
          <div
            key={p}
            style={{ ...s.row, ...(dragOver === i && dragFrom !== i ? s.rowDrop : null) }}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(i);
            }}
            onDrop={() => {
              if (dragFrom !== null) move(dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
          >
            <span style={s.grip} title={t("tab.drag")} aria-hidden>
              <Icon.Menu size={14} />
            </span>
            <Checkbox checked onChange={() => toggle(p)} label={<span className="mono" style={s.path}>{p}</span>} />
            <span style={{ flex: 1 }} />
            {f ? (
              <>
                <Badge>{f.group}</Badge>
                <span style={s.meta}>{t("tokens", { count: f.tokens })}</span>
              </>
            ) : (
              <span style={s.warn}>{t("tab.notFound")}</span>
            )}
            {f && (
              <Button kind="ghost" size="sm" icon="Eye" onClick={() => setPreviewPath(p)}>
                {t("preview")}
              </Button>
            )}
            <div style={s.moveBtns}>
              <IconBtn icon="ArrowUp" label={t("tab.moveUp")} size={22} onClick={() => move(i, i - 1)} />
              <IconBtn icon="ArrowDown" label={t("tab.moveDown")} size={22} onClick={() => move(i, i + 1)} />
            </div>
          </div>
        );
      })}

      {inheritedOnly.map((p) => {
        const f = byPath.get(p);
        return (
          <div key={`inh:${p}`} style={s.row} title={t("tab.inheritedHint")}>
            <Checkbox checked label={<span className="mono" style={s.path}>{p}</span>} />
            <span style={{ flex: 1 }} />
            <Badge color="var(--accent-text)">{t("tab.inherited")}</Badge>
            {f ? <span style={s.meta}>{t("tokens", { count: f.tokens })}</span> : <span style={s.warn}>{t("tab.notFound")}</span>}
            {f && (
              <Button kind="ghost" size="sm" icon="Eye" onClick={() => setPreviewPath(p)}>
                {t("preview")}
              </Button>
            )}
          </div>
        );
      })}

      {unattached.map((f) => (
        <div key={f.path} style={s.row}>
          <Checkbox checked={false} onChange={() => toggle(f.path)} label={<span className="mono" style={s.path}>{f.path}</span>} />
          <span style={{ flex: 1 }} />
          <Badge>{f.group}</Badge>
          <span style={s.meta}>{t("tokens", { count: f.tokens })}</span>
          <Button kind="ghost" size="sm" icon="Eye" onClick={() => setPreviewPath(f.path)}>
            {t("preview")}
          </Button>
        </div>
      ))}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" disabled={!dirty || saving} onClick={() => onSave(draft)}>
          {saving ? t("tab.saving") : t("tab.save")}
        </Button>
        {saved && !dirty && <span style={s.savedNote}>{t("tab.saved")}</span>}
      </div>

      {previewPath && (
        <ContextPreviewModal
          repoId={repoId}
          path={previewPath}
          file={byPath.get(previewPath)}
          attached={effective.includes(previewPath)}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
