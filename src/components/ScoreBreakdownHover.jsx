import { useState } from 'react'

const dimColor  = v => v >= 4 ? '#2F8F5B' : v >= 3 ? '#C8841E' : '#D14B3D'
const critColor = v => v >= 4 ? '#2F8F5B' : v >= 3 ? '#C8841E' : '#D14B3D'

const DIMS = [
  {
    key: 'inquiry_resolution', label: 'Inquiry Resolution', weight: '50%',
    crits: [
      { key: 'core_inquiry_resolved',     label: 'Core Resolution' },
      { key: 'troubleshooting_procedure', label: 'Troubleshooting' },
      { key: 'forward_resolution',        label: 'Forward Resolution' },
    ],
  },
  {
    key: 'internal_processes', label: 'Internal Processes', weight: '25%',
    crits: [
      { key: 'ticket_handling_procedure', label: 'Ticket Handling' },
    ],
  },
  {
    key: 'customer_perception', label: 'Customer Perception', weight: '25%',
    crits: [
      { key: 'tone_professionalism',  label: 'Tone & Prof.' },
      { key: 'communication_clarity', label: 'Clarity' },
    ],
  },
]

// align: 'left' anchors popup to right edge of trigger, 'right' to left edge
export default function ScoreBreakdownHover({ children, scores, align = 'right' }) {
  const [show, setShow] = useState(false)
  if (!scores) return <>{children}</>

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

          {DIMS.map((dim, di) => {
            const dimData = scores[dim.key]
            if (!dimData) return null
            const avg   = Number(dimData.dimension_average)
            if (!isFinite(avg)) return null
            const color = dimColor(avg)
            return (
              <div key={dim.key} style={{ marginBottom: di < DIMS.length - 1 ? 10 : 0 }}>
                {/* Dimension header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold" style={{ color: '#1A1E23' }}>{dim.label}</span>
                    <span className="text-xs px-1 rounded" style={{ color: 'rgba(26,30,35,.6)', background: '#F0ECE9', fontSize: 10 }}>{dim.weight}</span>
                  </div>
                  <span className="text-xs font-bold tabular-nums" style={{ color }}>
                    {avg.toFixed(1)}<span style={{ color: 'rgba(26,30,35,.45)' }}>/5</span>
                  </span>
                </div>

                {/* Criteria */}
                <div className="flex flex-col gap-1">
                  {dim.crits.map(c => {
                    const cd = dimData[c.key]
                    if (!cd) return null
                    const cc = critColor(cd.score)
                    return (
                      <div key={c.key} className="flex items-center gap-2">
                        <span className="text-xs flex-1" style={{ color: 'rgba(26,30,35,.6)' }}>{c.label}</span>
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} style={{
                              width: 5, height: 5, borderRadius: '50%',
                              background: i <= cd.score ? cc : '#F0ECE9',
                            }} />
                          ))}
                        </div>
                        <span className="text-xs tabular-nums" style={{ color: cc, width: 14, textAlign: 'right' }}>{cd.score}</span>
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
