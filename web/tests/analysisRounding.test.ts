import { describe, expect, it } from 'vitest';

import { combineAnalysisScopes, type ComposableAnalysisScope } from '../src/lib/analysis';

function scope(amounts: number[]): ComposableAnalysisScope {
  return {
    ...combineAnalysisScopes([]),
    composition: { amount_values_eur: amounts, vendors: [] },
  };
}

describe('analysis rounding matches the Python pipeline', () => {
  it('preserves the quarter percentile that blocked the October data refresh', () => {
    const combined = combineAnalysisScopes([scope([415.19]), scope([415.21])]);

    expect(combined.amounts.percentiles.p25).toBe(415.19);
  });

  it.each([
    [2.675, 2.67],
    [1.125, 1.12],
    [1.375, 1.38],
    [-1.125, -1.12],
    [-1.375, -1.38],
  ])('rounds a median of %s to %s', (amount, expected) => {
    const combined = combineAnalysisScopes([scope([amount]), scope([amount])]);

    expect(combined.summary.median_amount_eur).toBe(expected);
    expect(combined.amounts.percentiles.p50).toBe(expected);
  });
});
