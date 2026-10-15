import { describe, it, expect } from 'vitest';
import { toAgentEstimate } from '../src/modules/agents/helpers.js';

/** Unit coverage for the AC-22/23 estimate math — median over `done` runs,
 *  "no history yet" (null, not 0) when an agent has zero completed runs. */
describe('toAgentEstimate', () => {
  it('computes the median duration/cost over the given runs', () => {
    const est = toAgentEstimate('a1', 'Security', [
      { durationMs: 1000, costUsd: 0.01 },
      { durationMs: 2000, costUsd: 0.02 },
      { durationMs: 3000, costUsd: 0.03 },
    ]);
    expect(est.median_duration_ms).toBe(2000);
    expect(est.median_cost_usd).toBe(0.02);
    expect(est.sample_size).toBe(3);
  });

  it('averages the two middle values for an even-length sample', () => {
    const est = toAgentEstimate('a1', 'Security', [
      { durationMs: 1000, costUsd: null },
      { durationMs: 3000, costUsd: null },
    ]);
    expect(est.median_duration_ms).toBe(2000);
  });

  it('is "no history yet" (null, not 0) for zero completed runs (AC-23)', () => {
    const est = toAgentEstimate('a1', 'Security', []);
    expect(est.median_duration_ms).toBeNull();
    expect(est.median_cost_usd).toBeNull();
    expect(est.sample_size).toBe(0);
  });

  it('computes duration/cost medians independently when one field is partially null', () => {
    const est = toAgentEstimate('a1', 'Security', [
      { durationMs: 1000, costUsd: null },
      { durationMs: 2000, costUsd: 0.02 },
    ]);
    expect(est.median_duration_ms).toBe(1500);
    expect(est.median_cost_usd).toBe(0.02);
  });
});
