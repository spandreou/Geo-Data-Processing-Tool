import type { Property } from "../types/property";

type PriceTrendChartProps = {
  properties: Property[];
};

type MonthPoint = {
  key: string;
  label: string;
  value: number;
};

function buildLast12MonthsTrend(properties: Property[]): MonthPoint[] {
  const now = new Date();
  const months: { key: string; label: string }[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "short" });
    months.push({ key, label });
  }

  const buckets = new Map<string, { total: number; count: number }>();
  for (const month of months) {
    buckets.set(month.key, { total: 0, count: 0 });
  }

  for (const property of properties) {
    const date = new Date(property.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += property.price;
    bucket.count += 1;
  }

  const fallback =
    properties.length > 0
      ? properties.reduce((acc, item) => acc + item.price, 0) / properties.length
      : 0;

  return months.map((month) => {
    const bucket = buckets.get(month.key)!;
    const avg = bucket.count > 0 ? bucket.total / bucket.count : fallback;
    return { key: month.key, label: month.label, value: avg };
  });
}

export function PriceTrendChart({ properties }: PriceTrendChartProps) {
  if (properties.length === 0) {
    return (
      <div className="trend-empty">
        No data for current filters. Adjust filters to see market movement.
      </div>
    );
  }

  const trend = buildLast12MonthsTrend(properties);
  const values = trend.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  const polylinePoints = trend
    .map((point, idx) => {
      const x = (idx / (trend.length - 1)) * 100;
      const y = 100 - ((point.value - min) / range) * 82 - 9;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,100 ${polylinePoints} 100,100`;

  return (
    <div className="trend-chart">
      <div className="trend-chart__meta">
        <span>Low: EUR {Math.round(min).toLocaleString()}</span>
        <span>High: EUR {Math.round(max).toLocaleString()}</span>
      </div>

      <svg
        className="trend-chart__svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label="Price trend for the last 12 months"
      >
        <defs>
          <linearGradient id="trendAreaFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(80, 178, 255, 0.5)" />
            <stop offset="100%" stopColor="rgba(80, 178, 255, 0)" />
          </linearGradient>
        </defs>
        <path d={`M ${areaPoints}`} fill="url(#trendAreaFill)" />
        <polyline points={polylinePoints} fill="none" stroke="#7fd4ff" strokeWidth="1.4" />
      </svg>

      <div className="trend-chart__labels">
        {trend.map((point) => (
          <span key={point.key}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}
