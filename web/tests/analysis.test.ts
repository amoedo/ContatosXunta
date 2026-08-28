import { describe, expect, it } from 'vitest';

import analysisPayload from '../public/data/analysis.json';
import { combineAnalysisScopes, type AnalysisData } from '../src/lib/analysis';

const analysis = analysisPayload as unknown as AnalysisData;

describe('multi-organism analysis', () => {
  it('recomposes the global analysis exactly from all organism scopes', () => {
    const combined = combineAnalysisScopes(
      Object.values(analysis.organism_scopes).map((organism) => organism.all),
    );

    expect(combined.summary).toEqual(analysis.all.summary);
    expect(combined.timeseries).toEqual(analysis.all.timeseries);
    expect(combined.amounts.percentiles).toEqual(analysis.all.amounts.percentiles);
    expect(combined.amounts.bands).toEqual(analysis.all.amounts.bands);
    expect(combined.amounts.largest_contracts).toEqual(analysis.all.amounts.largest_contracts);
    expect(combined.vendors.concentration).toEqual(analysis.all.vendors.concentration);
    expect(combined.vendors.ranking_by_amount).toEqual(analysis.all.vendors.ranking_by_amount);
    expect(combined.vendors.ranking_by_count).toEqual(analysis.all.vendors.ranking_by_count);
  });

  it('combines compact scopes when released history has no raw composition', () => {
    const scopes = Object.values(analysis.organism_scopes)
      .slice(0, 2)
      .map((organism) => structuredClone(organism.all));
    delete scopes[0].composition;

    const combined = combineAnalysisScopes(scopes);

    expect(combined.summary.record_count).toBe(
      scopes.reduce((sum, scope) => sum + scope.summary.record_count, 0),
    );
    expect(combined.summary.total_amount_eur).toBeCloseTo(
      scopes.reduce((sum, scope) => sum + scope.summary.total_amount_eur, 0),
      2,
    );
    expect(combined.amounts.bands.reduce((sum, band) => sum + band.record_count, 0))
      .toBe(combined.summary.record_count);
  });
});