export type CsvLanguage = 'gl' | 'es';

export type CsvContract = {
  source_id: number;
  publication_date: string;
  subject: string;
  vendor_name: string;
  organism_name: string;
  amount_eur: number;
  duration: string;
  source_url: string;
};

const headers = {
  gl: ['ID fonte', 'Data de publicación', 'Obxecto', 'Adxudicatario', 'Organismo', 'Importe EUR', 'Duración', 'Fonte oficial'],
  es: ['ID fuente', 'Fecha de publicación', 'Objeto', 'Adjudicatario', 'Organismo', 'Importe EUR', 'Duración', 'Fuente oficial'],
} as const;

function escapeCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildContractsCsv(records: CsvContract[], language: CsvLanguage) {
  const rows = records.map((record) => [
    record.source_id,
    record.publication_date,
    record.subject,
    record.vendor_name,
    record.organism_name,
    record.amount_eur.toFixed(2),
    record.duration,
    record.source_url,
  ]);
  return `\uFEFF${[headers[language], ...rows]
    .map((row) => row.map(escapeCell).join(','))
    .join('\r\n')}\r\n`;
}
