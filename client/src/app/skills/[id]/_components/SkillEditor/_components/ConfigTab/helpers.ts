/** Client-side approximate token count for the live counter in the body
    editor (chars/4 — same heuristic fallback the server tokenizer uses when
    the real BPE encoder is unavailable; no reason to ship a BPE encoder to
    the browser just for a live-typing estimate). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
