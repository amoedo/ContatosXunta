function decimal(value: number, maximumFractionDigits: number) {
  const fixed = value.toFixed(maximumFractionDigits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/, '');
  const [integer, fraction] = fixed.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction ? `${grouped},${fraction}` : grouped;
}

export function formatInteger(value: number) {
  return decimal(Math.round(value), 0);
}

export function formatEuro(value: number, compact = false) {
  if (!compact) return `${decimal(value, 2)} €`;
  if (Math.abs(value) >= 1_000_000_000) return `${decimal(value / 1_000_000_000, 1)} mil M €`;
  if (Math.abs(value) >= 1_000_000) return `${decimal(value / 1_000_000, 1)} M €`;
  if (Math.abs(value) >= 1_000) return `${decimal(value / 1_000, 1)} mil €`;
  return `${decimal(value, 1)} €`;
}

export function formatPercent(value: number) {
  return `${decimal(value * 100, 1)} %`;
}