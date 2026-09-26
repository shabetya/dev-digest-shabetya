import { describe, it, expect } from 'vitest';
import { mapBlastResult } from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

describe('mapBlastResult', () => {
  it('groups callers by the changed symbol they reach, aggregates endpoints/crons per group from factsByFile, and includes a zero-caller symbol', () => {
    const result: BlastResult = {
      changedSymbols: [
        { file: 'src/service.ts', name: 'chargeCard', kind: 'function' },
        { file: 'src/service.ts', name: 'refundCard', kind: 'function' },
        { file: 'src/service.ts', name: 'unusedHelper', kind: 'function' },
      ],
      callers: [
        { file: 'src/routes/payments.ts', symbol: 'handlePayment', viaSymbol: 'chargeCard', line: 10, rank: 5 },
        {
          file: 'src/jobs/retryJob.ts',
          symbol: 'retryFailedCharges',
          viaSymbol: 'chargeCard',
          line: 22,
          rank: 2,
        },
        { file: 'src/routes/refunds.ts', symbol: 'handleRefund', viaSymbol: 'refundCard', line: 8, rank: 5 },
      ],
      impactedEndpoints: ['POST /payments', 'POST /refunds'],
      factsByFile: {
        'src/routes/payments.ts': { endpoints: ['POST /payments'], crons: [] },
        'src/jobs/retryJob.ts': { endpoints: [], crons: ['retry-failed-charges'] },
        'src/routes/refunds.ts': { endpoints: ['POST /refunds'], crons: [] },
      },
      degraded: false,
    };

    const mapped = mapBlastResult(result);

    expect(mapped.degraded).toBe(false);
    expect(mapped.degraded_reason).toBeNull();
    expect(mapped.changed_symbols).toEqual([
      { name: 'chargeCard', file: 'src/service.ts', kind: 'function' },
      { name: 'refundCard', file: 'src/service.ts', kind: 'function' },
      { name: 'unusedHelper', file: 'src/service.ts', kind: 'function' },
    ]);
    expect(mapped.downstream).toHaveLength(3);

    const bySymbol = Object.fromEntries(mapped.downstream.map((d) => [d.symbol, d]));
    expect(bySymbol.chargeCard!.callers).toEqual([
      { name: 'handlePayment', file: 'src/routes/payments.ts', line: 10 },
      { name: 'retryFailedCharges', file: 'src/jobs/retryJob.ts', line: 22 },
    ]);
    expect(bySymbol.chargeCard!.endpoints_affected).toEqual(['POST /payments']);
    expect(bySymbol.chargeCard!.crons_affected).toEqual(['retry-failed-charges']);

    expect(bySymbol.refundCard!.callers).toEqual([
      { name: 'handleRefund', file: 'src/routes/refunds.ts', line: 8 },
    ]);
    expect(bySymbol.refundCard!.endpoints_affected).toEqual(['POST /refunds']);
    expect(bySymbol.refundCard!.crons_affected).toEqual([]);

    // Zero-caller symbol is a real entry, not omitted.
    expect(bySymbol.unusedHelper).toEqual({
      symbol: 'unusedHelper',
      callers: [],
      endpoints_affected: [],
      crons_affected: [],
    });

    expect(mapped.summary).toBe('3 changed symbol(s), 3 caller(s), 2 endpoint(s)/1 cron(s) affected.');
  });

  it('dedupes endpoints/crons shared by two callers reaching the same symbol', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/service.ts', name: 'chargeCard', kind: 'function' }],
      callers: [
        { file: 'src/routes/payments.ts', symbol: 'handlePayment', viaSymbol: 'chargeCard', line: 10, rank: 5 },
        { file: 'src/routes/checkout.ts', symbol: 'handleCheckout', viaSymbol: 'chargeCard', line: 4, rank: 3 },
      ],
      impactedEndpoints: ['POST /payments'],
      factsByFile: {
        'src/routes/payments.ts': { endpoints: ['POST /payments'], crons: [] },
        'src/routes/checkout.ts': { endpoints: ['POST /payments'], crons: [] },
      },
    };

    const mapped = mapBlastResult(result);
    expect(mapped.downstream[0]!.endpoints_affected).toEqual(['POST /payments']);
  });

  it('treats an absent factsByFile (degraded/ripgrep path) as no facts rather than throwing', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/service.ts', name: 'chargeCard', kind: 'function' }],
      callers: [
        { file: 'src/routes/payments.ts', symbol: 'handlePayment', viaSymbol: 'chargeCard', line: 10, rank: 0 },
      ],
      impactedEndpoints: [],
      degraded: true,
      reason: 'flag_off',
    };

    const mapped = mapBlastResult(result);
    expect(mapped.downstream[0]!.endpoints_affected).toEqual([]);
    expect(mapped.downstream[0]!.crons_affected).toEqual([]);
    expect(mapped.degraded).toBe(true);
    expect(mapped.degraded_reason).toBe('flag_off');
  });

  it('KNOWN LIMITATION: merges caller lists for two changed symbols that share a name in different files', () => {
    // `viaSymbol` identifies a changed symbol by name only (see the doc
    // comment on `BlastCallerRow.viaSymbol` in repo-intel/types.ts) — both
    // repo-intel query paths resolve callers by name, so two changed symbols
    // with the same name in different files are indistinguishable upstream.
    // This test pins the CURRENT (ambiguous) behavior so a future fix that
    // keys by (file, name) has a red test to turn green, rather than this
    // gap silently regressing further unnoticed.
    const result: BlastResult = {
      changedSymbols: [
        { file: 'src/handlers/a.ts', name: 'handler', kind: 'function' },
        { file: 'src/handlers/b.ts', name: 'handler', kind: 'function' },
      ],
      callers: [
        { file: 'src/routes/a.ts', symbol: 'callA', viaSymbol: 'handler', line: 1, rank: 1 },
      ],
      impactedEndpoints: [],
    };

    const mapped = mapBlastResult(result);

    expect(mapped.downstream).toHaveLength(2);
    // Both same-named symbols get the identical caller list — the caller of
    // `src/handlers/a.ts`'s `handler` is indistinguishable from a caller of
    // `src/handlers/b.ts`'s `handler` given only a name to group by.
    expect(mapped.downstream[0]!.callers).toEqual(mapped.downstream[1]!.callers);
    expect(mapped.downstream[0]!.callers).toEqual([{ name: 'callA', file: 'src/routes/a.ts', line: 1 }]);
  });

  it('passes through an empty, non-degraded result (no changed symbols)', () => {
    const result: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };
    const mapped = mapBlastResult(result);
    expect(mapped).toEqual({
      changed_symbols: [],
      downstream: [],
      summary: '0 changed symbol(s), 0 caller(s), 0 endpoint(s)/0 cron(s) affected.',
      degraded: false,
      degraded_reason: null,
    });
  });
});
