import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

const TYPE_META = {
  dispute_submitted: { icon: '⚑', color: '#f59e0b', label: 'Dispute' },
  score_overridden:  { icon: '✎', color: '#818cf8', label: 'Override' },
  reviewer_note:     { icon: '💬', color: '#38bdf8', label: 'Note' },
  dispute_cleared:   { icon: '✓', color: '#10b981', label: 'Cleared' },
  calibration_open:  { icon: '🎯', color: '#FF9780', label: 'Calibration' },
}

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60)  return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function NotificationPanel({ onClose, offsetLeft }) {
  const { user } = useAuth()
  const { agents } = useApp()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const myAgent = agents.find(a => a.email?.toLowerCase() === user?.email?.toLowerCase())

  const fetchNotifications = useCallback(async () => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchNotifications()

    const channel = supabase.channel('notifications-panel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      }, () => fetchNotifications())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
      }, payload => {
        setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchNotifications])

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (!unreadIds.length) return
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <>
      {/* Backdrop — closes panel when clicking content area */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(26,30,35,.35)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: offsetLeft,
          width: 320,
          height: '100vh',
          zIndex: 46,
          background: '#FFFFFF',
          borderRight: '1px solid #EEEEEE',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 48px rgba(0,0,0,.12)',
          animation: 'slideInLeft 180ms cubic-bezier(0.16,1,0.3,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: 56, flexShrink: 0,
          borderBottom: '1px solid #F0ECE9',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="font-semibold text-sm" style={{ color: '#1A1E23', fontFamily: "'Inter Tight'" }}>Notifications</span>
            {unreadCount > 0 && (
              <span style={{ background: '#FF9780', color: '#FFFFFF', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9999 }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs transition-colors"
                style={{ color: 'rgba(26,30,35,.6)' }}
                onMouseEnter={e => e.target.style.color = '#B84A2E'}
                onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.6)'}
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="text-xl leading-none transition-colors"
              style={{ color: 'rgba(26,30,35,.45)' }}
              onMouseEnter={e => e.target.style.color = '#1A1E23'}
              onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.45)'}
            >×</button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(26,30,35,.5)', fontSize: 13 }}>Loading…</div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: '#FBEBD3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C8841E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 01-3.46 0"/>
                </svg>
              </div>
              <p style={{ color: '#1A1E23', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>No notifications yet</p>
              <p style={{ color: 'rgba(26,30,35,.5)', fontSize: 12 }}>You'll see disputes, overrides, and notes here</p>
            </div>
          ) : (
            notifications.map(n => {
              const meta = TYPE_META[n.type] || { icon: '•', color: 'rgba(26,30,35,.5)', label: '' }
              return (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '14px 16px',
                    borderBottom: '1px solid #F0ECE9',
                    background: n.read ? 'transparent' : '#FFEAE6',
                    textAlign: 'left',
                    transition: 'background 150ms',
                    cursor: 'default',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FBF7F3'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : '#FFEAE6'}
                >
                  {/* Type icon */}
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: `${meta.color}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, marginTop: 1,
                  }}>
                    {meta.icon}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: n.read ? 'rgba(26,30,35,.6)' : '#1A1E23', fontSize: 13, lineHeight: 1.45, marginBottom: 3 }}>
                      {n.message}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: meta.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 10, color: 'rgba(26,30,35,.45)' }}>·</span>
                      <span style={{ fontSize: 10, color: 'rgba(26,30,35,.45)' }}>{timeAgo(n.created_at)}</span>
                    </div>
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF9780', flexShrink: 0, marginTop: 5 }} />
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
