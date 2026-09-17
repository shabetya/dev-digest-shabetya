import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractJson, parseWithRepair } from '../src/llm/structured.js';

/**
 * Direct unit coverage for the "never trust the model's JSON" helpers
 * (previously only exercised indirectly through run.test.ts's end-to-end
 * cases). `extractJson` normalizes common LLM response quirks; `parseWithRepair`
 * is the last line of defense before a model's structured output is trusted.
 */

const schema = z.object({ name: z.string(), count: z.number() });

describe('extractJson', () => {
  it('returns already-clean JSON unchanged (modulo trim)', () => {
    expect(extractJson('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('strips a ```json fenced code block', () => {
    const text = 'Sure, here you go:\n```json\n{"a":1,"b":[1,2]}\n```\nHope that helps.';
    expect(extractJson(text)).toBe('{"a":1,"b":[1,2]}');
  });

  it('strips a bare ``` fenced code block (no "json" tag)', () => {
    const text = '```\n{"a":1}\n```';
    expect(extractJson(text)).toBe('{"a":1}');
  });

  it('extracts the first balanced object when there is surrounding prose', () => {
    const text = 'The result is {"a":{"nested":1},"b":2} — done.';
    expect(extractJson(text)).toBe('{"a":{"nested":1},"b":2}');
  });

  it('extracts a top-level array when it appears before any object', () => {
    const text = 'Findings: [1,2,{"a":1}] end';
    expect(extractJson(text)).toBe('[1,2,{"a":1}]');
  });

  it('returns the trimmed input verbatim when no brace/bracket is found', () => {
    expect(extractJson('  no json here  ')).toBe('no json here');
  });
});

describe('parseWithRepair', () => {
  it('accepts valid JSON matching the schema', () => {
    const result = parseWithRepair(schema, '{"name":"a","count":1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ name: 'a', count: 1 });
  });

  it('accepts JSON wrapped in a markdown code fence (falls back to extractJson)', () => {
    const raw = '```json\n{"name":"a","count":2}\n```';
    const result = parseWithRepair(schema, raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ name: 'a', count: 2 });
  });

  it('fails with a reprompt message on malformed JSON', () => {
    const result = parseWithRepair(schema, '{name: "a", count: }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not valid JSON/);
      expect(result.repromptMessage).toMatch(/valid JSON object/);
    }
  });

  it('fails with per-field issues on well-formed JSON that violates the schema', () => {
    const result = parseWithRepair(schema, '{"name":"a","count":"not-a-number"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/count/);
      expect(result.repromptMessage).toMatch(/did not match the required schema/);
    }
  });
});
