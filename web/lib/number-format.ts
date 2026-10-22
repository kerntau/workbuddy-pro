/** Shared display rules. Kept independent of React/i18n for boundary tests. */
export function compactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const units = ['', 'K', 'M', 'B', 'T'];
  let scaled = Math.abs(value);
  let unit = 0;
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  scaled = Math.round(scaled * 100) / 100;
  if (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  return `${value < 0 ? '-' : ''}${scaled.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    useGrouping: false,
  })}${units[unit]}`;
}

export function creditNumber(value: number | null | undefined, locale: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (Math.abs(value) < 0.00000001) {
    const minimum = (0.00000001).toLocaleString(locale, {maximumFractionDigits: 8});
    return value < 0 ? `>−${minimum}` : `<${minimum}`;
  }
  return value.toLocaleString(locale, Math.abs(value) >= 1
    ? {minimumFractionDigits: 2, maximumFractionDigits: 2}
    : {maximumFractionDigits: 8});
}
