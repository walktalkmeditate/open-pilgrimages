export interface TrendPoint {
  year: number;
  count: number;
}

interface StatsLike {
  annualPilgrims?: { trend?: Array<{ year?: number; count?: number } | null> };
}

// Shape-check rather than just nullish-check: this reads files it does not
// control, and a declared type with the wrong shape would otherwise throw
// several calls deeper. One Array.isArray per level is the bound here —
// stats.json is schema-validated upstream, so anything more contrived than
// "not an array" is not worth chasing.
export function trendOf(statsJson: unknown): TrendPoint[] {
  const trend = (statsJson as StatsLike)?.annualPilgrims?.trend;
  const raw = Array.isArray(trend) ? trend : [];

  return raw
    .map((point) => ({ year: point?.year ?? 0, count: point?.count ?? 0 }))
    .sort((a, b) => a.year - b.year);
}

const MINIMUM_RANGE_COUNT = 1;

export function sparklineSvg(trend: TrendPoint[], width = 120, height = 30): string {
  if (trend.length < 2) return "";

  const counts = trend.map((p) => p.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const range = max - min || MINIMUM_RANGE_COUNT;

  const points = trend.map((point, i) => {
    const x = (i / (trend.length - 1)) * width;
    const y = height - ((point.count - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const first = trend[0];
  const last = trend[trend.length - 1];

  return [
    `<svg viewBox="0 0 ${width} ${height}" class="spark" role="img"`,
    ` aria-label="Pilgrims per year, ${first.year} to ${last.year}:`,
    ` ${first.count.toLocaleString("en-US")} rising to ${last.count.toLocaleString("en-US")}">`,
    `<path d="M${points.join(" L")}" class="spark-line" fill="none"/>`,
    `</svg>`,
  ].join("");
}
