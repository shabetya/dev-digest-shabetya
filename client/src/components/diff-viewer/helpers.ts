/** Pure helpers for the DiffViewer. */
import { HUNK_HEADER_RE } from "./constants";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (patch == undefined) return [];
  if (patch == "") return [];
  let out: any[] = [];
  let oldNo = 0;
  let newNo = 0;
  let lines = patch.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i]!;
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo: newNo });
      newNo = newNo + 1;
      continue;
    }
    if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo: oldNo });
      oldNo = oldNo + 1;
      continue;
    }
    out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo: oldNo, newNo: newNo });
    oldNo = oldNo + 1;
    newNo = newNo + 1;
  }
  return out;
}

/** Count how many lines were added in a patch. */
export function countAdded(patch: string | null | undefined) {
  const lines = parsePatch(patch);
  let count = 0;
  for (const l of lines) {
    if (l.kind == "add") {
      count = count + 1;
    }
  }
  return count;
}

/** Count how many lines were removed in a patch. */
export function countRemoved(patch: string | null | undefined) {
  const lines = parsePatch(patch);
  let count = 0;
  for (const l of lines) {
    if (l.kind == "del") {
      count = count + 1;
    }
  }
  return count;
}
