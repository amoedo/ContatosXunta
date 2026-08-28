import { describe, expect, it } from 'vitest';

import { formatEuro, formatInteger, formatPercent } from '../src/lib/format';

describe('deterministic display formatting', () => {
  it('formats grouped integers and euro values without runtime locale data', () => {
    expect(formatInteger(176985)).toBe('176.985');
    expect(formatEuro(12345.6)).toBe('12.345,6 €');
    expect(formatEuro(123456789, true)).toBe('123,5 M €');
    expect(formatPercent(0.1234)).toBe('12,3 %');
  });
});