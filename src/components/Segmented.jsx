// Animated segmented toggle (Gorgias). A white thumb slides to the active segment.
// options: array of { id, label } (or plain strings). Controlled via `value` + `onChange`.
export default function Segmented({ options, value, onChange, segWidth = 96, fontPx = 13, padY = 7, fluid = false, ariaLabel = 'Choose an option' }) {
  const opts = options.map(o => (typeof o === 'string' ? { id: o, label: o } : o))
  const idx = Math.max(0, opts.findIndex(o => o.id === value))

  return (
    <div className="relative inline-flex" role="group" aria-label={ariaLabel}
      style={{ width: fluid ? '100%' : undefined, background: '#F1ECE8', borderRadius: 9999, padding: 3 }}>
      {/* Sliding thumb */}
      <div style={{
        position: 'absolute', top: 3, left: 3, width: fluid ? `calc((100% - 6px) / ${opts.length})` : segWidth, height: 'calc(100% - 6px)',
        background: '#fff', borderRadius: 9999, boxShadow: '0 1px 3px rgba(0,0,0,.12)',
        transform: fluid ? `translateX(${idx * 100}%)` : `translateX(${idx * segWidth}px)`,
        transition: 'transform .28s cubic-bezier(.16,1,.3,1)',
      }} />
      {opts.map((o, i) => (
        <button key={o.id} type="button" onClick={() => onChange?.(o.id)} aria-pressed={i === idx}
          className="relative font-medium text-center"
          style={{
            zIndex: 1, width: fluid ? 'auto' : segWidth, flex: fluid ? '1 1 0' : undefined, minWidth: 0,
            padding: `${padY}px 4px`, fontSize: fontPx,
            color: i === idx ? '#1A1E23' : 'rgba(26,30,35,.72)',
            background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color .25s',
          }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
