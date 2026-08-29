import { describe, expect, it } from 'vitest';

import analysisPayload from '../public/data/analysis.json';
import {
  combineAnalysisScopes,
  matchesRepeatPattern,
  normalizePatternText,
  type AnalysisData,
  type RepeatPatternFilter,
} from '../src/lib/analysis';

const analysis = analysisPayload as unknown as AnalysisData;

it('normalizes alert subjects consistently with the pipeline', () => {
  expect(normalizePatternText('Mantemento do sistéma.')).toBe('mantemento do sistema');
});

it('matches only contracts inside every alert boundary', () => {
  const filter: RepeatPatternFilter = {
    subject: 'mantemento do sistema',
    label: 'Mantemento do sistema',
    vendor: 'Empresa Test',
    dateStart: '2026-01-01',
    dateEnd: '2026-01-30',
  };
  const contract = {
    subject: 'MANTEMENTO DO SISTÉMA.',
    vendor_name: 'Empresa Test',
    publication_date: '2026-01-15',
  };

  expect(matchesRepeatPattern(contract, filter)).toBe(true);
  expect(matchesRepeatPattern({ ...contract, vendor_name: 'Outra Empresa' }, filter)).toBe(false);
  expect(matchesRepeatPattern({ ...contract, publication_date: '2026-01-31' }, filter)).toBe(false);
});

describe('multi-organism analysis', () => {
  it('recomposes a year exactly from organism scopes with raw composition', () => {
    const year = Object.keys(analysis.years).find((yearKey) =>
      Object.values(analysis.organism_scopes).some(
        (organism) => organism.years[yearKey]?.composition !== undefined,
      ));
    expect(year).toBeDefined();
    const expected = analysis.years[year!];
    const combined = combineAnalysisScopes(
      Object.values(analysis.organism_scopes)
        .flatMap((organism) => organism.years[year!] ? [organism.years[year!]] : []),
    );

    expect(combined.summary).toEqual(expected.summary);
    expect(combined.timeseries).toEqual(expected.timeseries);
    expect(combined.amounts.percentiles).toEqual(expected.amounts.percentiles);
    expect(combined.amounts.bands).toEqual(expected.amounts.bands);
    expect(combined.amounts.largest_contracts).toEqual(expected.amounts.largest_contracts);
    expect(combined.vendors.concentration).toEqual(expected.vendors.concentration);
    expect(combined.vendors.ranking_by_amount).toEqual(expected.vendors.ranking_by_amount);
    expect(combined.vendors.ranking_by_count).toEqual(expected.vendors.ranking_by_count);
    expect(combined.patterns).toEqual(expected.patterns);
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