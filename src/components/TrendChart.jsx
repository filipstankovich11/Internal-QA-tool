import { useMemo, useId } from 'react'

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

// Flowing cubic-bezier path through the points (Catmull-Rom style) — gives the
// smooth, glossy curve of a polished area chart rather than hard polyline kinks.
function smoothPath(c) {
  if (c.length < 2) return ''
  const t = 0.18
  let d = `M${c[0].x.toFixed(1)},${c[0].y.toFixed(1)}`
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[i - 1] || c[i], p1 = c[i], p2 = c[i + 1], p3 = c[i + 2] || c[i + 1]
    const c1x = p1.x + (p2.x - p0.x) * t, c1y = p1.y + (p2.y - p0.y) * t
    const c2x = p2.x - (p3.x - p1.x) * t, c2y = p2.y - (p3.y - p1.y) * t
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

export function TrendChart({ scores }) {
  const uid = useId().replace(/:/g, '') // unique SVG ids so multiple charts don't collide
  const pts = useMemo(() => buildTrendData(scores, 30), [scores])
  if (pts.length < 2) return (
    <p className="text-xs text-center py-6" style={{ color: '#888' }}>Not enough data for a trend (need scores across 2+ days)</p>
  )

  const W = 400, H = 80, padX = 8, padY = 10
  const avgValues = pts.map(p => p.avg)
  const minV = Math.max(0,  Math.min(...avgValues) - 5)
  const maxV = Math.min(100, Math.max(...avgValues) + 5)
  const range = maxV - minV || 10

  const x = (day) => padX + (day / 29) * (W - padX * 2)
  const y = (v)   => H - padY - ((v - minV) / range) * (H - padY * 2)

  const coords   = pts.map(({ day, avg }) => ({ x: x(day), y: y(avg) }))
  const linePath = smoothPath(coords)
  const first = coords[0], last = coords[coords.length - 1]
  const areaPath = `${linePath} L${last.x.toFixed(1)},${H} L${first.x.toFixed(1)},${H} Z`
  // Trend direction carries the meaning: improving → green, declining → red, flat → brand peach
  const color = pts[pts.length - 1].avg > pts[0].avg + 3 ? '#10b981'
              : pts[pts.length - 1].avg < pts[0].avg - 3 ? '#ef4444'
              : '#FF9780'

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 200 }}>
        <defs>
          <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={areaPath} fill={`url(#grad-${uid})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" filter={`url(#glow-${uid})`} />
        {/* Glowing end-point marker */}
        <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r="5"   fill={color} opacity="0.2" />
        <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r="2.5" fill={color} />
      </svg>
      <div className="flex justify-between mt-1 px-2">
        <span className="text-xs" style={{ color: '#888' }}>30 days ago</span>
        <span className="text-xs" style={{ color: '#888' }}>Today</span>
      </div>
    </div>
  )
}
