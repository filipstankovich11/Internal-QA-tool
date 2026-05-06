import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)

const STYLES = {
  success: { color: '#10b981', border: 'rgba(16,185,129,0.25)',  bg: 'rgba(16,185,129,0.07)',  icon: '✓' },
  error:   { color: '#ef4444', border: 'rgba(239,68,68,0.25)',   bg: 'rgba(239,68,68,0.07)',   icon: '✗' },
  info:    { color: '#FF9780', border: 'rgba(255,151,128,0.25)', bg: 'rgba(255,151,128,0.07)', icon: 'i' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200)
  }, [])

  const toast = {
    success: msg => push(msg, 'success'),
    error:   msg => push(msg, 'error'),
    info:    msg => push(msg, 'info'),
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => {
          const s = STYLES[t.type] || STYLES.info
          return (
            <div key={t.id} className="toast-enter"
              style={{ background: '#111', border: `1px solid ${s.border}`, borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 220, maxWidth: 340 }}>
              <span style={{ color: s.color, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{s.icon}</span>
              <span style={{ color: '#ccc', fontSize: 13, lineHeight: 1.4 }}>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
