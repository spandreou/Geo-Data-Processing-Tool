import React from 'react'

function buildLast12MonthsTrend(properties) {
  const now = new Date()
  const months = []

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('en-US', { month: 'short' })
    months.push({ key, label })
  }

  const buckets = new Map()
  for (const month of months) {
    buckets.set(month.key, { total: 0, count: 0 })
  }

  for (const property of properties) {
    const date = new Date(property.createdAt)
    if (Number.isNaN(date.getTime())) continue
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.total += property.price
    bucket.count += 1
  }

  const fallback =
    properties.length > 0
      ? properties.reduce((acc, item) => acc + item.price, 0) / properties.length
      : 0

  return months.map((month) => {
    const bucket = buckets.get(month.key)
    const avg = bucket.count > 0 ? bucket.total / bucket.count : fallback
    return { key: month.key, label: month.label, value: avg }
  })
}

export function PriceTrendChart({ properties }) {
  if (!properties || properties.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-[11px] text-slate-500 font-medium">
        No data for current filters. Adjust filters to see market movement.
      </div>
    )
  }

  const trend = buildLast12MonthsTrend(properties)
  const values = trend.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)

  const polylinePoints = trend
    .map((point, idx) => {
      const x = (idx / (trend.length - 1)) * 100
      const y = 100 - ((point.value - min) / range) * 82 - 9
      return `${x},${y}`
    })
    .join(' ')

  const areaPoints = `0,100 ${polylinePoints} 100,100`

  return (
    <div className="mt-4 border-t border-slate-200/50 dark:border-slate-800/50 pt-4 flex flex-col">
      <div className="flex justify-between text-[10px] text-slate-500 font-medium px-1 mb-1.5">
        <span>Low: <strong className="text-slate-700 dark:text-slate-300">EUR {Math.round(min).toLocaleString()}</strong></span>
        <span>High: <strong className="text-slate-700 dark:text-slate-300">EUR {Math.round(max).toLocaleString()}</strong></span>
      </div>

      <div className="relative h-20 w-full overflow-hidden rounded-lg bg-slate-800/5 border border-slate-200/20 dark:bg-slate-800/30">
        <svg
          className="h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-label="Price trend for the last 12 months"
        >
          <defs>
            <linearGradient id="trendAreaFill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(59, 130, 246, 0.45)" />
              <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
            </linearGradient>
          </defs>
          <path d={`M ${areaPoints}`} fill="url(#trendAreaFill)" />
          <polyline points={polylinePoints} fill="none" stroke="#3b82f6" strokeWidth="1.6" />
        </svg>
      </div>

      <div className="flex justify-between text-[9px] text-slate-500 mt-2 px-1 font-semibold">
        {trend.map((point) => (
          <span key={point.key}>{point.label}</span>
        ))}
      </div>
    </div>
  )
}
