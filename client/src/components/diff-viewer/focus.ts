/** Deep-link focus for the diff viewer: which file (and optionally which
    right-side line) should be opened, scrolled to and highlighted. Generic —
    the diff viewer knows nothing about who asks for it (a route, a brief…). */
export interface DiffFocus {
  file: string;
  /** Right-side (new file) line number, or null to focus the file only. */
  line: number | null;
}

/** DOM id of a file card, stable per path. */
export function fileAnchorId(path: string): string {
  return `diff-file-${encodeURIComponent(path)}`;
}

/** `scrollIntoView` is missing in some environments (jsdom) — never throw. */
export function scrollIntoViewSafe(el: HTMLElement | null | undefined): void {
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
}
