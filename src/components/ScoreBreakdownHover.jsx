import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { breakdownSections, scorecardFor, scaleOf } from '../lib/scorecard'

// Colors on a 0–1 fraction of the scale so 1–5 and 0–5 scores read the same
const fracColor = f => f >= 0.8 ? '#2F8F5B' : f >= 0.6 ? '#C8841E' : '#D14B3D'

// align: 'left' anchors popup to right edge of trigger, 'right' to left edge
export default function ScoreBreakdownHover({ children, fullScore, align = 'right' }) {
  const [show, setShow] = useState(false)
  const { rubric } = useApp()
  const card = scorecardFor(fullScore, rubric)
  const { max } = scaleOf(card)
  const sections = breakdownSections(fullScore?.scores, card).filter(d => d.average != null)
  if (!sections.length) return <>{children}</>

  return (
    <div className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div
          className="absolute bottom-full mb-2 z-50 rounded-xl p-3"
          style={{
            [align === 'right' ? 'right' : 'left']: 0,
            width: 248,
            background: '#FFFFFF',
            border: '1px solid #EEEEEE',
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            pointerEvents: 'none',
          }}>
          {/* arrow */}
          <div style={{
            position: 'absolute', bottom: -5,
            [align === 'right' ? 'right' : 'left']: 12,
            width: 10, height: 10,
            background: '#FFFFFF',
            border: '1px solid #EEEEEE',
            borderTop: 'none', borderLeft: 'none',
            transform: 'rotate(45deg)',
          }} />

          {sections.map((dim, di) => {
            const color = fracColor(dim.average / max)
            return (
              <div key={dim.id} style={{ marginBottom: di < sections.length - 1 ? 10 : 0 }}>
                {/* Dimension header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold" style={{ color: '#1A1E23' }}>{dim.name}</span>
                    {dim.weight != null && <span className="text-xs px-1 rounded" style={{ color: 'rgba(26,30,35,.6)', background: '#F0ECE9', fontSize: 10 }}>{dim.weight}%</span>}
                  </div>
                  <span className="text-xs font-bold tabular-nums" style={{ color }}>
                    {dim.average.toFixed(1)}<span style={{ color: 'rgba(26,30,35,.45)' }}>/{max}</span>
                  </span>
                </div>

                {/* Criteria */}
                <div className="flex flex-col gap-1">
                  {dim.rows.map(c => {
                    const cc = c.na ? 'rgba(26,30,35,.45)' : fracColor((c.score ?? 0) / max)
                    return (
                      <div key={c.id} className="flex items-center gap-2">
                        <span className="text-xs flex-1 truncate" style={{ color: 'rgba(26,30,35,.6)' }}>{c.code ? `${c.code} ${c.label}` : c.label}</span>
                        {!c.na && (
                          <div className="flex gap-0.5">
                            {Array.from({ length: max }, (_, i) => i + 1).map(i => (
                              <div key={i} style={{
                                width: 5, height: 5, borderRadius: '50%',
                                background: i <= (c.score ?? 0) ? cc : '#F0ECE9',
                              }} />
                            ))}
                          </div>
                        )}
                        <span className="text-xs tabular-nums" style={{ color: cc, minWidth: 14, textAlign: 'right' }}>{c.na ? 'N/A' : c.score}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
