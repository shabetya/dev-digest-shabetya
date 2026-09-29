"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingFirstTask } from "@devdigest/shared";
import { s } from "./styles";

export function FirstTasksSection({
  tasks,
  hrefFor,
}: {
  tasks: OnboardingFirstTask[];
  hrefFor: (path: string) => string | null;
}) {
  const t = useTranslations("onboarding");
  if (tasks.length === 0) return <p style={s.empty}>{t("empty")}</p>;
  return (
    <div>
      {tasks.map((task, i) => (
        <div key={i} style={s.taskCard}>
          <h3 style={s.taskTitle}>{task.title}</h3>
          {task.description && <p style={s.meta}>{task.description}</p>}
          <div style={s.chips} aria-label={t("firstTasks.files")}>
            {task.files.map((file) => {
              const href = hrefFor(file);
              return href ? (
                <a key={file} href={href} target="_blank" rel="noopener noreferrer" style={s.chipLink}>
                  {file}
                </a>
              ) : (
                <span key={file} style={s.chip}>
                  {file}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
