import { useEffect, useState } from 'react'

const COLORS = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }

export default function ScoreRing({ score, verdict }) {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 80)
    return () => clearTimeout(t)
  }, [score])

  const size = 148
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animated / 100) * circumference
  const color  = COLORS[verdict] || '#555'

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'absolute', top: 0, left: 0 }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#1a1a1a" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)', filter: `drop-shadow(0 0 8px ${color}66)` }} />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="text-white text-4xl font-bold leading-none tabular-nums">{Math.round(score)}</span>
        <span className="text-xs mt-1" style={{ color: '#555' }}>/ 100</span>
      </div>
    </div>
  )
}
