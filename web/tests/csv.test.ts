import { describe, expect, it } from 'vitest';

import { buildContractsCsv, type CsvContract } from '../src/lib/contractsCsv';

describe('contract CSV export', () => {
  it('escapes spreadsheet content and projects only public fields', () => {
    const record = {
      source_id: 42,
      publication_date: '2026-04-02',
      subject: 'Servizo, con "comiñas"\ne detalle',
      vendor_name: '=DANGEROUS()',
      organism_name: 'Presidencia',
      amount_eur: 1234.5,
      duration: '-2 meses',
      source_url: 'https://example.test/42',
      nif: 'B15855703',
    } as CsvContract & { nif: string };

    const csv = buildContractsCsv([record], 'gl');

    expect(csv).toMatch(/^\uFEFF"ID fonte"/);
    expect(csv).toContain('"Servizo, con ""comiñas""\ne detalle"');
    expect(csv).toContain('"\'=DANGEROUS()"');
    expect(csv).toContain('"\'-2 meses"');
    expect(csv).toContain('"1234.50"');
    expect(csv).not.toContain(record.nif);
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
