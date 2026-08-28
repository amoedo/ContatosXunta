import { describe, expect, it } from 'vitest';

import { formatDate } from '../src/components/ContractsExplorer';

describe('formatDate', () => {
  it('uses deterministic Galician and Spanish month names', () => {
    expect(formatDate('2026-01-01', 'gl')).toBe('1 xan. 2026');
    expect(formatDate('2026-09-28', 'es')).toBe('28 sept. 2026');
    expect(formatDate(null, 'gl')).toBe('—');
  });
});