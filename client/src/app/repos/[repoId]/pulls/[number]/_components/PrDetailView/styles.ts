import type { CSSProperties } from "react";
import { CONTENT_MAX_WIDTH } from "./constants";

/** Co-located styles for PrDetailView (extracted from inline styles). */
export const s = {
  loadingWrap: {
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: CONTENT_MAX_WIDTH,
    margin: "0 auto",
  } satisfies CSSProperties,
  body: {
    padding: "24px 32px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    maxWidth: CONTENT_MAX_WIDTH,
    margin: "0 auto",
  } satisfies CSSProperties,
} as const;
