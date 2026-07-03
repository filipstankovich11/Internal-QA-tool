import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

const TYPE_META = {
  dispute_submitted:  { icon: '⚑', color: '#f59e0b', label: 'Dispute' },
  score_overridden:   { icon: '✎', color: '#818cf8', label: 'Override' },
  reviewer_note:      { icon: '💬', color: '#38bdf8', label: 'Note' },
  dispute_cleared:    { icon: '✓', color: '#10b981', label: 'Cleared' },
  calibration_open:   { icon: '🎯', color: '#FF9780', label: 'Calibration' },
  score_acknowledged: { icon: '👁', color: '#2F8F5B', label: 'Seen' },
  score_published:    { icon: '📊', color: '#FF9780', label: 'Graded' },
  dispute_reply:      { icon: '💬', color: '#f59e0b', label: 'Reply' },
  score_assigned:     { icon: '📋', color: '#3B7DD8', label: 'Assigned' },
  auto_fail_triggered:{ icon: '⚠️', color: '#D14B3D', label: 'Auto-fail' },
  batch_complete:     { icon: '📦', color: '#818cf8', label: 'Batch' },
  rubric_updated:     { icon: '📐', color: '#2F8F5B', label: 'Guidance' },
  coaching_session:   { icon: '🎓', color: '#9747FF', label: 'Coaching' },
}

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60)  return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function NotificationPanel({ onClose, offsetLeft, onNavigate }) {
  // Animated close: slide the panel out (and fade the backdrop) before
  // unmounting. All close paths route through requestClose.
  const [closing, setClosing] = useState(false)
  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 180)
  }
  const { user, isAdmin } = useAuth()
  const { agents, scoreHistory, openScore } = useApp()
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

  const dismiss = async (id) => {
    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) { console.error('notification delete failed:', error); return }
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const [clearConfirm, setClearConfirm] = useState(false)
  const clearAll = async () => {
    if (!clearConfirm) { setClearConfirm(true); setTimeout(() => setClearConfirm(false), 3000); return }
    const ids = notifications.map(n => n.id)
    if (!ids.length) return
    const { error } = await supabase.from('notifications').delete().in('id', ids)
    if (error) { console.error('clear notifications failed:', error); return }
    setNotifications([])
    setClearConfirm(false)
  }

  const unreadCount = notifications.filter(n => !n.read).length
  const newOnes = notifications.filter(n => !n.read)
  const earlier = notifications.filter(n => n.read)

  const GroupLabel = ({ children }) => (
    <p style={{ padding: '12px 16px 4px', fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(26,30,35,.4)' }}>{children}</p>
  )

  // Notifications that reference a score open it full-page on click.
  const linkedScore = (n) => n.score_id ? scoreHistory.find(s => s.id === n.score_id) : null

  const openLinkedScore = (s) => {
    openScore({
      ...s.fullScore,
      scoreId:         s.id,
      reviewerNote:    s.notes,
      overrideVerdict: s.overrideVerdict,
      overrideScore:   s.overrideScore,
      overrideNote:    s.overrideNote,
      overrideAt:      s.overrideAt,
      disputed:        s.disputed,
      disputeNote:     s.disputeNote,
      disputeAt:       s.disputeAt,
      acknowledged:    s.acknowledged,
      acknowledgedAt:  s.acknowledgedAt,
    })
    requestClose()
  }

  const renderRow = (n) => {
    const meta = TYPE_META[n.type] || { icon: '•', color: 'rgba(26,30,35,.5)', label: '' }
    const score = linkedScore(n)
    // Guidance changes link to the QA Guidance page (admin-gated tab)
    const guidanceLink = n.type === 'rubric_updated' && isAdmin && !!onNavigate
    const clickable = !!score || guidanceLink
    return (
      <div key={n.id} role="button" tabIndex={0}
        onClick={() => {
          markRead(n.id)
          if (score) openLinkedScore(score)
          else if (guidanceLink) { onNavigate('rubric'); requestClose() }
        }}
        title={score ? `Open ticket #${score.ticketId}` : guidanceLink ? 'Open QA Guidance change history' : undefined}
        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderBottom: '1px solid #F0ECE9', background: n.read ? 'transparent' : '#FFEAE6', textAlign: 'left', transition: 'background 150ms', cursor: clickable ? 'pointer' : 'default' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#FBF7F3'; e.currentTarget.querySelector('.notif-actions').style.opacity = 1 }}
        onMouseLeave={e => { e.currentTarget.style.background = n.read ? 'transparent' : '#FFEAE6'; e.currentTarget.querySelector('.notif-actions').style.opacity = 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: `${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, marginTop: 1 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: n.read ? 'rgba(26,30,35,.6)' : '#1A1E23', fontSize: 13, lineHeight: 1.45, marginBottom: 3 }}>{n.message}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: meta.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{meta.label}</span>
            <span style={{ fontSize: 10, color: 'rgba(26,30,35,.45)' }}>·</span>
            <span style={{ fontSize: 10, color: 'rgba(26,30,35,.45)' }}>{timeAgo(n.created_at)}</span>
            {score && (
              <>
                <span style={{ fontSize: 10, color: 'rgba(26,30,35,.45)' }}>·</span>
                <span style={{ fontSize: 10, color: '#B84A2E', fontWeight: 600 }}>View ticket →</span>
              </>
            )}
            {guidanceLink && (
              <>
                <span style={{ fontSize: 10, color: 'rgba(26,30,35,.45)' }}>·</span>
                <span style={{ fontSize: 10, color: '#B84A2E', fontWeight: 600 }}>View changes →</span>
              </>
            )}
          </div>
        </div>
        {/* Hover actions: mark one as read without navigating, or dismiss it */}
        <div className="notif-actions" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: 0, transition: 'opacity 120ms' }}>
          {!n.read && (
            <button onClick={e => { e.stopPropagation(); markRead(n.id) }} title="Mark as read"
              style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(26,30,35,.5)', fontSize: 12, lineHeight: 1 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FFEAE6'; e.currentTarget.style.color = '#B84A2E' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(26,30,35,.5)' }}>✓</button>
          )}
          <button onClick={e => { e.stopPropagation(); dismiss(n.id) }} title="Dismiss notification"
            style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(26,30,35,.5)', fontSize: 12, lineHeight: 1 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FEF6F4'; e.currentTarget.style.color = '#D14B3D' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(26,30,35,.5)' }}>✕</button>
        </div>
        {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF9780', flexShrink: 0, marginTop: 5 }} />}
      </div>
    )
  }

  return (
    <>
      {/* Backdrop — closes panel when clicking content area */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(26,30,35,.35)', backdropFilter: 'blur(2px)',
          animation: closing ? 'fadeOut 180ms ease forwards' : undefined,
        }}
        onClick={requestClose}
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
          animation: closing
            ? 'slideOutPanel 180ms cubic-bezier(0.4,0,0.7,0.2) forwards'
            : 'slideInLeft 180ms cubic-bezier(0.16,1,0.3,1)',
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
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs transition-colors"
                title="Delete all notifications"
                style={{ color: clearConfirm ? '#D14B3D' : 'rgba(26,30,35,.6)', fontWeight: clearConfirm ? 600 : 400 }}
                onMouseEnter={e => e.target.style.color = '#D14B3D'}
                onMouseLeave={e => e.target.style.color = clearConfirm ? '#D14B3D' : 'rgba(26,30,35,.6)'}
              >
                {clearConfirm ? 'Sure? Click again' : 'Clear all'}
              </button>
            )}
            <button
              onClick={requestClose}
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
            <>
              {newOnes.length > 0 && <GroupLabel>New — {newOnes.length}</GroupLabel>}
              {newOnes.map(renderRow)}
              {earlier.length > 0 && <GroupLabel>Earlier</GroupLabel>}
              {earlier.map(renderRow)}
            </>
          )}
        </div>
      </div>
    </>
  )
}
