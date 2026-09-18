"use client";

import React from "react";
import { diffLines } from "@/lib/text-diff";
import { s, lineStyleFor, signStyleFor } from "./styles";

/** Line-level diff between two version bodies, rendered inline under a
    version row (Diff button in VersionsTab). Unchanged lines render as plain
    context so the reader can still place the change in the document. */
export function VersionDiff({ oldBody, newBody }: { oldBody: string; newBody: string }) {
  const lines = React.useMemo(() => diffLines(oldBody, newBody), [oldBody, newBody]);

  return (
    <div style={s.wrap} className="mono">
      {lines.map((ln, i) => (
        <div key={i} style={lineStyleFor(ln.kind)}>
          <span style={signStyleFor(ln.kind)}>{ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : " "}</span>
          <span style={s.text}>{ln.text || " "}</span>
        </div>
      ))}
    </div>
  );
}
