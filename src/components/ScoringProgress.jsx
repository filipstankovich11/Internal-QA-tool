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

      {/* Flying-files loader (see .loader-con / .pfile in index.css) */}
      <div className="loader-con">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="pfile" style={{ '--i': i }} />
        ))}
      </div>

      {!finishing && (
        <p style={{ fontSize: 11, color: 'rgba(26,30,35,.45)', textAlign: 'center', marginTop: 7 }}>
          Usually 15–30 seconds
        </p>
      )}
    </div>
  )
}
