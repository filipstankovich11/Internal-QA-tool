import { useState, useEffect, useRef } from 'react'

// Indeterminate "Claude is scoring…" progress bar: fast start, eases toward a
// 91% ceiling while the request is in flight, then snaps to 100% on completion.
// Shared by the Score page and the Calibration new-session modal.
export default function ScoringProgress({ loading }) {
  const [progress, setProgress] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (loading) {
      setProgress(0)
      setFinishing(false)
      intervalRef.current = setInterval(() => {
        setProgress(p => {
          if (p >= 91) return p
          // Fast start, exponential slow-down near the ceiling
          return p + Math.max(0.2, (91 - p) * 0.028)
        })
      }, 100)
      return () => clearInterval(intervalRef.current)
    } else if (!loading) {
      clearInterval(intervalRef.current)
      if (progress > 0) {
        setProgress(100)
        setFinishing(true)
        const t = setTimeout(() => { setProgress(0); setFinishing(false) }, 700)
        return () => clearTimeout(t)
      }
    }
  }, [loading])

  if (progress === 0 && !finishing) return null

  const pct = Math.min(100, Math.round(progress))
  const label = finishing ? 'Complete!' : 'Claude is scoring this ticket…'

  return (
    <div style={{ marginTop: 14, marginBottom: 4 }}>
      {/* Label + percentage */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'rgba(26,30,35,.6)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#B84A2E', fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </span>
      </div>

      {/* Track */}
      <div style={{
        width: '100%', height: 7, borderRadius: 999,
        background: '#F0ECE9',
        overflow: 'hidden', position: 'relative',
      }}>
        {/* Fill */}
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 999,
          background: 'linear-gradient(90deg, #FF9780 0%, #ff6b4a 60%, #f59e0b 100%)',
          transition: 'width 100ms linear',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Shimmer */}
          <div className="progress-shimmer" />
        </div>
      </div>

      {!finishing && (
        <p style={{ fontSize: 11, color: 'rgba(26,30,35,.45)', textAlign: 'center', marginTop: 7 }}>
          Usually 15–30 seconds
        </p>
      )}
    </div>
  )
}
