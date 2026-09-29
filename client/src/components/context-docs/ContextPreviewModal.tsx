/* ContextPreviewModal — read-only Markdown preview of one project-context doc
   (raw HTML stays off: the shared Markdown primitive has no rehype-raw). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Markdown, Modal, Skeleton } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { useContextPreview } from "@/lib/hooks/context";
import { s } from "./styles";

export function ContextPreviewModal({
  repoId,
  path,
  file,
  attached,
  onClose,
}: {
  repoId: string;
  path: string;
  file?: SpecFile;
  attached: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextPreview(repoId, path);
  return (
    <Modal
      width={860}
      title={<span className="mono">{path}</span>}
      onClose={onClose}
      footer={
        <Button kind="secondary" size="sm" onClick={onClose}>
          {t("close")}
        </Button>
      }
    >
      <div style={s.previewMeta}>
        <Badge>{t("readOnly")}</Badge>
        {file && <Badge>{t("tokens", { count: file.tokens })}</Badge>}
        {attached && (
          <Badge color="var(--ok)" bg="var(--ok-bg)">
            {t("attached")}
          </Badge>
        )}
        {file && <Badge>{t("usedBy", { count: file.used_by_agents })}</Badge>}
      </div>
      {isLoading ? (
        <Skeleton height={160} />
      ) : isError || !data ? (
        <ErrorState title={t("previewLoadError")} onRetry={() => refetch()} />
      ) : (
        <div style={s.previewBody}>
          <Markdown>{data.content}</Markdown>
        </div>
      )}
    </Modal>
  );
}
