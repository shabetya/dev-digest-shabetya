/* Collapsible section card: header is a button with aria-expanded. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function SectionCard({
  id,
  title,
  expanded,
  onToggle,
  busy,
  children,
}: {
  id: string;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const bodyId = `${id}-body`;
  const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <section id={id} style={{ ...s.card, opacity: busy ? 0.6 : 1 }} aria-busy={busy || undefined}>
      <h2 style={{ margin: 0 }}>
        <button type="button" style={s.cardHeader} aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle}>
          <Chevron size={16} aria-hidden />
          {title}
        </button>
      </h2>
      {expanded && (
        <div id={bodyId} style={s.cardBody}>
          {children}
        </div>
      )}
    </section>
  );
}
