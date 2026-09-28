import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)

const STYLES = {
  success: { color: '#2F8F5B', border: '#EEEEEE', bg: '#FFFFFF', icon: '✓' },
  error:   { color: '#D14B3D', border: '#EEEEEE', bg: '#FFFFFF', icon: '✗' },
  info:    { color: '#B84A2E', border: '#EEEEEE', bg: '#FFFFFF', icon: 'i' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  const push = useCallback((message, type = 'success', opts = {}) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, action: opts.action || null }])
    // Action toasts linger so there's time to click their CTA; plain ones auto-clear.
    const duration = opts.duration ?? (opts.action ? 9000 : 3200)
    if (duration) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const toast = {
    success: msg => push(msg, 'success'),
    error:   msg => push(msg, 'error'),
    info:    msg => push(msg, 'info'),
    // Clickable "call to action" toast — e.g. "AI review complete → View scorecard".
    // Pressing the CTA (or the toast body) runs `onClick` and clears the toast.
    action: (msg, { label, onClick, type = 'success', duration } = {}) =>
      push(msg, type, { action: { label, onClick }, duration }),
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => {
          const s = STYLES[t.type] || STYLES.info
          const act = t.action
          const run = () => { act?.onClick?.(); dismiss(t.id) }
          return (
            <div key={t.id} className="toast-enter"
              onClick={act ? run : undefined}
              style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: act ? '11px 14px 11px 16px' : '10px 16px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 240, maxWidth: 360, boxShadow: '0 20px 48px rgba(0,0,0,.12)', pointerEvents: act ? 'auto' : 'none', cursor: act ? 'pointer' : 'default' }}>
              <span style={{ color: s.color, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{s.icon}</span>
              <span style={{ color: '#1A1E23', fontSize: 13, lineHeight: 1.4, flex: 1 }}>{t.message}</span>
              {act && (
                <>
                  <span style={{ color: '#B84A2E', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {act.label || 'View'} →
                  </span>
                  <button type="button" aria-label="Dismiss"
                    onClick={e => { e.stopPropagation(); dismiss(t.id) }}
                    style={{ color: 'rgba(26,30,35,.4)', fontSize: 16, lineHeight: 1, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'rgba(26,30,35,.7)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(26,30,35,.4)'}>×</button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
