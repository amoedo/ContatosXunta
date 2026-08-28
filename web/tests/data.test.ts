import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import analysis from '../public/data/analysis.json';
import dashboard from '../public/data/dashboard.json';
import manifest from '../public/data/explorer/manifest.json';

describe('generated public data', () => {
  it('reconciles all explorer shards and excludes tax identifiers', () => {
    const recordIds: string[] = [];
    let shardRecordCount = 0;

    for (const year of manifest.years) {
      let yearRecordCount = 0;
      const yearShardPaths = new Set(year.shards.map((shard) => shard.path));
      const monthShardPaths = new Set<string>();
      expect(year.months.reduce((sum, month) => sum + month.record_count, 0)).toBe(year.record_count);
      for (const month of year.months) {
        expect(month.shards.reduce((sum, shard) => sum + shard.record_count, 0)).toBe(month.record_count);
        for (const shard of month.shards) {
          expect(shard.date_start.startsWith(month.month)).toBe(true);
          expect(shard.date_end.startsWith(month.month)).toBe(true);
          monthShardPaths.add(shard.path);
        }
      }
      expect(monthShardPaths).toEqual(yearShardPaths);
      for (const shard of year.shards) {
        const content = readFileSync(join('public', 'data', shard.path));
        const payload = JSON.parse(content.toString('utf-8')) as {
          year: number;
          records: Array<{ record_id: string; publication_date: string; source_id: number; source_url: string }>;
        };
        const serialized = content.toString('utf-8').toLowerCase();

        expect(content.byteLength).toBe(shard.byte_size);
        expect(content.byteLength).toBeLessThanOrEqual(manifest.max_shard_bytes);
        expect(createHash('sha256').update(content).digest('hex')).toBe(shard.sha256);
        expect(payload.records).toHaveLength(shard.record_count);
        expect(payload.records.every((record) => record.publication_date.startsWith(`${year.year}-`))).toBe(true);
        expect(payload.records.every((record) => record.source_url === `https://www.contratosdegalicia.gal/licitacion?N=${record.source_id}`)).toBe(true);
        expect(serialized).not.toContain('"nif"');
        expect(serialized).not.toContain('"cif"');

        yearRecordCount += payload.records.length;
        recordIds.push(...payload.records.map((record) => record.record_id));
      }
      expect(yearRecordCount).toBe(year.record_count);
      shardRecordCount += yearRecordCount;
    }

    expect(shardRecordCount).toBe(manifest.total_available);
    expect(manifest.total_available).toBe(dashboard.record_count);
    expect(new Set(recordIds).size).toBe(recordIds.length);
  });

  it('reconciles bounded analytics with dashboard and year totals', () => {
    const scope = analysis.all;
    const concentration = scope.vendors.concentration;
    const largestAmounts = scope.amounts.largest_contracts.map((item) => item.amount_eur);
    const serialized = JSON.stringify(analysis).toLowerCase();

    expect(scope.summary.record_count).toBe(dashboard.record_count);
    expect(scope.summary.total_amount_eur).toBe(dashboard.total_amount_eur);
    expect(scope.timeseries.monthly.reduce((sum, item) => sum + item.record_count, 0)).toBe(dashboard.record_count);
    expect(scope.timeseries.yearly.reduce((sum, item) => sum + item.record_count, 0)).toBe(dashboard.record_count);
    expect(scope.amounts.bands.reduce((sum, item) => sum + item.record_count, 0)).toBe(dashboard.record_count);
    expect(scope.vendors.ranking_by_amount.length).toBeLessThanOrEqual(scope.vendors.ranking_limit);
    expect(scope.vendors.ranking_by_count.length).toBeLessThanOrEqual(scope.vendors.ranking_limit);
    expect(concentration.top1_share).toBeLessThanOrEqual(concentration.top5_share);
    expect(concentration.top5_share).toBeLessThanOrEqual(concentration.top10_share);
    expect(concentration.top10_share).toBeLessThanOrEqual(1);
    expect(largestAmounts).toEqual([...largestAmounts].sort((left, right) => right - left));
    expect(serialized).not.toContain('/api/v1/organismos/');
    expect(serialized).toContain('https://www.contratosdegalicia.gal/licitacion?n=');
    const organismScopes = Object.values(analysis.organism_scopes);
    expect(organismScopes).toHaveLength(dashboard.active_organism_count);
    expect(organismScopes.reduce((sum, item) => sum + item.all.summary.record_count, 0)).toBe(dashboard.record_count);
    expect(organismScopes.reduce((sum, item) => sum + item.all.summary.total_amount_eur, 0)).toBeCloseTo(dashboard.total_amount_eur, 2);
    for (const organism of organismScopes) {
      expect(organism.all.summary.active_organism_count).toBe(1);
      expect(organism.all.organisms).toHaveLength(1);
      expect(organism.all.organisms[0].id).toBe(String(organism.organism_id));
      expect(Object.values(organism.years).reduce((sum, item) => sum + item.summary.record_count, 0)).toBe(organism.all.summary.record_count);
    }
    for (const year of manifest.years) {
      expect(analysis.years[String(year.year) as keyof typeof analysis.years].summary.record_count).toBe(year.record_count);
    }
    expect(serialized).not.toContain('"nif"');
    expect(serialized).not.toContain('"cif"');
  });
});