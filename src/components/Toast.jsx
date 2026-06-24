import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)

const STYLES = {
  success: { color: '#2F8F5B', border: '#EEEEEE', bg: '#FFFFFF', icon: '✓' },
  error:   { color: '#D14B3D', border: '#EEEEEE', bg: '#FFFFFF', icon: '✗' },
  info:    { color: '#B84A2E', border: '#EEEEEE', bg: '#FFFFFF', icon: 'i' },
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
              style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 220, maxWidth: 340, boxShadow: '0 20px 48px rgba(0,0,0,.12)' }}>
              <span style={{ color: s.color, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{s.icon}</span>
              <span style={{ color: '#1A1E23', fontSize: 13, lineHeight: 1.4 }}>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
