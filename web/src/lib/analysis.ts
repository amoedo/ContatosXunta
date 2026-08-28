export type RankedEntity = {
  id: string;
  name: string;
  record_count: number;
  total_amount_eur: number;
  mean_amount_eur: number;
};

export type SeriesPoint = {
  key: string;
  record_count: number;
  total_amount_eur: number;
};

export type ContractExcerpt = {
  record_id: string;
  publication_date: string;
  subject: string;
  vendor_name: string;
  organism_name: string;
  amount_eur: number;
  source_url: string;
};

export type AnalysisScope = {
  summary: {
    record_count: number;
    total_amount_eur: number;
    mean_amount_eur: number;
    median_amount_eur: number;
    unique_vendor_names: number;
    active_organism_count: number;
  };
  timeseries: { monthly: SeriesPoint[]; yearly: SeriesPoint[] };
  vendors: {
    ranking_limit: number;
    ranking_by_amount: RankedEntity[];
    ranking_by_count: RankedEntity[];
    concentration: { top1_share: number; top5_share: number; top10_share: number };
  };
  organisms: RankedEntity[];
  categories: RankedEntity[];
  amounts: {
    percentiles: Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90' | 'p95', number>;
    minimum_eur: number;
    maximum_eur: number;
    bands: Array<{ band: string; record_count: number }>;
    largest_contracts: ContractExcerpt[];
  };
};

export type ComposableAnalysisScope = AnalysisScope & {
  composition: {
    amount_values_eur: number[];
    vendors: RankedEntity[];
  };
};

export type AnalysisBreakdown = {
  all: AnalysisScope;
  years: Record<string, AnalysisScope>;
};

export type OrganismAnalysis = {
  organism_id: number;
  name: string;
  category: string;
  all: ComposableAnalysisScope;
  years: Record<string, ComposableAnalysisScope>;
};

export type AnalysisData = AnalysisBreakdown & {
  grouping_note: string;
  organism_scopes: Record<string, OrganismAnalysis>;
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percentile(orderedValues: number[], fraction: number) {
  if (orderedValues.length === 0) return 0;
  const position = (orderedValues.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, orderedValues.length - 1);
  const weight = position - lower;
  return orderedValues[lower] * (1 - weight) + orderedValues[upper] * weight;
}

function mergeRanked(groups: RankedEntity[][]) {
  const merged = new Map<string, RankedEntity>();
  for (const items of groups) {
    for (const item of items) {
      const current = merged.get(item.id) ?? {
        id: item.id,
        name: item.name,
        record_count: 0,
        total_amount_eur: 0,
        mean_amount_eur: 0,
      };
      current.record_count += item.record_count;
      current.total_amount_eur += item.total_amount_eur;
      merged.set(item.id, current);
    }
  }
  return [...merged.values()].map((item) => ({
    ...item,
    total_amount_eur: round(item.total_amount_eur),
    mean_amount_eur: round(item.total_amount_eur / item.record_count),
  }));
}

function mergeSeries(groups: SeriesPoint[][]) {
  const merged = new Map<string, SeriesPoint>();
  for (const points of groups) {
    for (const point of points) {
      const current = merged.get(point.key) ?? { key: point.key, record_count: 0, total_amount_eur: 0 };
      current.record_count += point.record_count;
      current.total_amount_eur += point.total_amount_eur;
      merged.set(point.key, current);
    }
  }
  return [...merged.values()]
    .map((point) => ({ ...point, total_amount_eur: round(point.total_amount_eur) }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function combineAnalysisScopes(scopes: ComposableAnalysisScope[]): AnalysisScope {
  if (scopes.length === 1) return scopes[0];

  const amountValues = scopes.flatMap((scope) => scope.composition.amount_values_eur)
    .sort((left, right) => left - right);
  const totalAmount = round(amountValues.reduce((sum, amount) => sum + amount, 0));
  const vendors = mergeRanked(scopes.map((scope) => scope.composition.vendors))
    .sort((left, right) => right.total_amount_eur - left.total_amount_eur
      || right.record_count - left.record_count || left.name.localeCompare(right.name));
  const vendorsByCount = [...vendors].sort((left, right) => right.record_count - left.record_count
    || right.total_amount_eur - left.total_amount_eur || left.name.localeCompare(right.name));
  const organisms = mergeRanked(scopes.map((scope) => scope.organisms))
    .sort((left, right) => right.total_amount_eur - left.total_amount_eur
      || right.record_count - left.record_count || left.name.localeCompare(right.name));
  const categories = mergeRanked(scopes.map((scope) => scope.categories))
    .sort((left, right) => right.total_amount_eur - left.total_amount_eur
      || right.record_count - left.record_count || left.name.localeCompare(right.name));
  const bandCounts = new Map<string, number>();
  for (const scope of scopes) {
    for (const item of scope.amounts.bands) {
      bandCounts.set(item.band, (bandCounts.get(item.band) ?? 0) + item.record_count);
    }
  }
  const concentration = (limit: number) => totalAmount === 0
    ? 0
    : round(vendors.slice(0, limit).reduce((sum, item) => sum + item.total_amount_eur, 0) / totalAmount, 4);
  const rankingLimit = Math.max(...scopes.map((scope) => scope.vendors.ranking_limit), 100);

  return {
    summary: {
      record_count: amountValues.length,
      total_amount_eur: totalAmount,
      mean_amount_eur: amountValues.length ? round(totalAmount / amountValues.length) : 0,
      median_amount_eur: round(percentile(amountValues, 0.5)),
      unique_vendor_names: vendors.length,
      active_organism_count: organisms.length,
    },
    timeseries: {
      monthly: mergeSeries(scopes.map((scope) => scope.timeseries.monthly)),
      yearly: mergeSeries(scopes.map((scope) => scope.timeseries.yearly)),
    },
    vendors: {
      ranking_limit: rankingLimit,
      ranking_by_amount: vendors.slice(0, rankingLimit),
      ranking_by_count: vendorsByCount.slice(0, rankingLimit),
      concentration: {
        top1_share: concentration(1),
        top5_share: concentration(5),
        top10_share: concentration(10),
      },
    },
    organisms,
    categories,
    amounts: {
      percentiles: {
        p10: round(percentile(amountValues, 0.1)),
        p25: round(percentile(amountValues, 0.25)),
        p50: round(percentile(amountValues, 0.5)),
        p75: round(percentile(amountValues, 0.75)),
        p90: round(percentile(amountValues, 0.9)),
        p95: round(percentile(amountValues, 0.95)),
      },
      minimum_eur: amountValues[0] ?? 0,
      maximum_eur: amountValues.at(-1) ?? 0,
      bands: scopes[0]?.amounts.bands.map((item) => ({
        band: item.band,
        record_count: bandCounts.get(item.band) ?? 0,
      })) ?? [],
      largest_contracts: scopes.flatMap((scope) => scope.amounts.largest_contracts)
        .sort((left, right) => right.amount_eur - left.amount_eur
          || left.record_id.localeCompare(right.record_id))
        .slice(0, 20),
    },
  };
}

export function selectAnalysisBreakdown(analysis: AnalysisData, organismIds: string[]): AnalysisBreakdown {
  const selected = organismIds
    .map((id) => analysis.organism_scopes[id])
    .filter((scope): scope is OrganismAnalysis => scope !== undefined);
  if (selected.length === 0) return analysis;
  if (selected.length === 1) return selected[0];

  const yearKeys = new Set(selected.flatMap((scope) => Object.keys(scope.years)));
  return {
    all: combineAnalysisScopes(selected.map((scope) => scope.all)),
    years: Object.fromEntries([...yearKeys].map((yearKey) => [
      yearKey,
      combineAnalysisScopes(selected.flatMap((scope) => scope.years[yearKey] ? [scope.years[yearKey]] : [])),
    ])),
  };
}