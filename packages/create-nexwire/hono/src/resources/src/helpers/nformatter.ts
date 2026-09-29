const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1
});

export function formatCompactNumber(value: number): string | number {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) < 1000) return value;
  return compactFormatter.format(value).replace(/\s/g, "");
}
