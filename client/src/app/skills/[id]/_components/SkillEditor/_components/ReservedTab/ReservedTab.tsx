"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

/** Structural placeholder for a tab reserved for a later lesson (Evals,
    Stats) — same "ships the shell, not the data" pattern already used for
    the Agent Editor's un-built tabs. No real aggregation/attribution exists
    yet (e.g. no mechanism ties a finding to the skill that caused it), so
    this renders honestly rather than fabricating numbers. */
export function ReservedTab({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const I = Icon[icon];
  return (
    <div style={s.wrap}>
      <div style={s.iconBox}>
        <I size={22} />
      </div>
      <h2 style={s.title}>{title}</h2>
      <p style={s.body}>{body}</p>
    </div>
  );
}
