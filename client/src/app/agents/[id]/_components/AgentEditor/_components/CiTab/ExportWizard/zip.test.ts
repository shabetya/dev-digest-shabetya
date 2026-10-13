import { describe, it, expect } from "vitest";
import { buildZip } from "./zip";

/** Minimal manual STORED-zip reader — enough to assert `buildZip`'s output round-trips, with no zip library dependency. */
function readStoredZip(bytes: Uint8Array): { path: string; contents: string }[] {
  const decoder = new TextDecoder();
  const out: { path: string; contents: string }[] = [];
  let i = 0;
  while (i < bytes.length) {
    const sig = bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24);
    if (sig !== 0x04034b50) break; // reached the central directory
    const compSize = bytes[i + 18]! | (bytes[i + 19]! << 8) | (bytes[i + 20]! << 16) | (bytes[i + 21]! << 24);
    const nameLen = bytes[i + 26]! | (bytes[i + 27]! << 8);
    const extraLen = bytes[i + 28]! | (bytes[i + 29]! << 8);
    const nameStart = i + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const path = decoder.decode(bytes.slice(nameStart, nameStart + nameLen));
    const contents = decoder.decode(bytes.slice(dataStart, dataStart + compSize));
    out.push({ path, contents });
    i = dataStart + compSize;
  }
  return out;
}

describe("buildZip", () => {
  it("round-trips multiple text files, including one with YAML-like special characters", () => {
    const entries = [
      { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security Reviewer\nmodel: gpt-4.1\n" },
      { path: ".devdigest/skills/secrets-scan.md", contents: "# Secrets Scan\n\nFlag hardcoded secrets." },
      { path: ".devdigest/memory.jsonl", contents: "" },
    ];
    const zip = buildZip(entries);

    // Starts with the local-file-header magic bytes.
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);

    const read = readStoredZip(zip);
    expect(read).toEqual(entries);
  });

  it("produces an empty-but-valid archive for zero files", () => {
    const zip = buildZip([]);
    expect(zip.length).toBeGreaterThan(0);
    expect(readStoredZip(zip)).toEqual([]);
  });
});
