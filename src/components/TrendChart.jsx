import { useMemo } from 'react'

// Build daily-averaged data points from scores over the last N days
export function buildTrendData(scores, days = 30) {
  const now = Date.now()
  const cutoff = now - days * 86400000
  const recent = scores.filter(s => s.scoredAt >= cutoff)
  if (!recent.length) return []

  const buckets = {}
  recent.forEach(s => {
    const dayIdx = Math.floor((s.scoredAt - cutoff) / 86400000)
    if (!buckets[dayIdx]) buckets[dayIdx] = []
    buckets[dayIdx].push(s.effectiveScore ?? s.weightedScore)
  })

  return Object.entries(buckets)
    .map(([day, vals]) => ({ day: parseInt(day), avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .sort((a, b) => a.day - b.day)
}

export function TrendChart({ scores }) {
  const pts = useMemo(() => buildTrendData(scores, 30), [scores])
  if (pts.length < 2) return (
    <p className="text-xs text-center py-6" style={{ color: '#888' }}>Not enough data for a trend (need scores across 2+ days)</p>
  )

  const W = 400, H = 80, padX = 8, padY = 6
  const avgValues = pts.map(p => p.avg)
  const minV = Math.max(0,  Math.min(...avgValues) - 5)
  const maxV = Math.min(100, Math.max(...avgValues) + 5)
  const range = maxV - minV || 10

  const x = (day) => padX + (day / 29) * (W - padX * 2)
  const y = (v)   => H - padY - ((v - minV) / range) * (H - padY * 2)

  const linePath = pts.map(({ day, avg }, i) => `${i === 0 ? 'M' : 'L'}${x(day).toFixed(1)},${y(avg).toFixed(1)}`).join(' ')

  // Area fill
  const first = pts[0], last = pts[pts.length - 1]
  const areaPath = `${linePath} L${x(last.day).toFixed(1)},${H} L${x(first.day).toFixed(1)},${H} Z`
  const color = last.avg > first.avg + 3 ? '#10b981' : last.avg < first.avg - 3 ? '#ef4444' : '#888'

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 200 }}>
        <path d={areaPath} fill={color} opacity="0.04" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        {pts.map(({ day, avg }) => (
          <circle key={day} cx={x(day).toFixed(1)} cy={y(avg).toFixed(1)} r="2.5" fill={color} opacity="0.9" />
        ))}
      </svg>
      <div className="flex justify-between mt-1 px-2">
        <span className="text-xs" style={{ color: '#888' }}>30 days ago</span>
        <span className="text-xs" style={{ color: '#888' }}>Today</span>
      </div>
    </div>
  )
}
