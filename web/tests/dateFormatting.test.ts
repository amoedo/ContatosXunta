import { describe, expect, it } from 'vitest';

import { formatDate, sortContracts } from '../src/components/ContractsExplorer';

describe('formatDate', () => {
  it('uses deterministic Galician and Spanish month names', () => {
    expect(formatDate('2026-01-01', 'gl')).toBe('1 xan. 2026');
    expect(formatDate('2026-09-28', 'es')).toBe('28 sept. 2026');
    expect(formatDate(null, 'gl')).toBe('—');
  });
});

describe('contract amount ordering', () => {
  const contracts = [
    { source_id: 3, publication_date: '2026-01-03', amount_eur: 100 },
    { source_id: 2, publication_date: '2026-01-02', amount_eur: 300 },
    { source_id: 1, publication_date: '2026-01-01', amount_eur: 100 },
  ];

  it('preserves source order by default and sorts both amount directions', () => {
    expect(sortContracts(contracts, '')).toBe(contracts);
    expect(sortContracts(contracts, 'amount-desc').map((item) => item.source_id)).toEqual([2, 3, 1]);
    expect(sortContracts(contracts, 'amount-asc').map((item) => item.source_id)).toEqual([3, 1, 2]);
  });
});