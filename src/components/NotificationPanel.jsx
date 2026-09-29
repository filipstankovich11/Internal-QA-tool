import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3, Bell, Check, CheckCheck, ClipboardList, Compass, Eye, Flag,
  GraduationCap, Megaphone, MessageCircle, Package, Pencil, Ruler, Target,
  Trash2, TriangleAlert, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { QA_GUIDANCE_ENABLED } from '../config/features'
import { useToast } from './Toast'
import './NotificationPanel.css'

const TYPE_META = {
  dispute_submitted:  { Icon: Flag,          tone: 'warning', label: 'Dispute' },
  score_overridden:   { Icon: Pencil,        tone: 'violet',  label: 'Override' },
  reviewer_note:      { Icon: MessageCircle, tone: 'info',    label: 'Note' },
  dispute_cleared:    { Icon: Check,         tone: 'success', label: 'Cleared' },
  calibration_open:   { Icon: Target,        tone: 'coral',   label: 'Calibration' },
  score_acknowledged: { Icon: Eye,           tone: 'success', label: 'Seen' },
  score_published:    { Icon: BarChart3,     tone: 'coral',   label: 'Graded' },
  dispute_reply:      { Icon: MessageCircle, tone: 'warning', label: 'Reply' },
  score_assigned:     { Icon: ClipboardList, tone: 'info',    label: 'Assigned' },
  auto_fail_triggered:{ Icon: TriangleAlert, tone: 'danger',  label: 'Auto-fail' },
  batch_complete:     { Icon: Package,       tone: 'violet',  label: 'Batch' },
  rubric_updated:     { Icon: Ruler,         tone: 'success', label: 'Guidance' },
  coaching_session:   { Icon: GraduationCap, tone: 'coral',   label: 'Coaching' },
  coaching_goal:      { Icon: Compass,       tone: 'warning', label: 'Plan' },
  team_post:          { Icon: Megaphone,     tone: 'info',    label: 'Team' },
}

const pendingNotificationDeletes = new Map()
const sortNotifications = rows => [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function timeAgo(timestamp) {
  const time = new Date(timestamp).getTime()
  if (!Number.isFinite(time)) return 'recently'
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function NotificationPanel({ onClose, offsetLeft, onNavigate }) {
  const { isAdmin, role } = useAuth()
  const { scoreHistory, openScore } = useApp()
  const toast = useToast()
  const panelRef = useRef(null)
  const closeButtonRef = useRef(null)
  const closeTimerRef = useRef(null)
  const confirmTimerRef = useRef(null)
  const freshTimersRef = useRef(new Map())
  const mountedRef = useRef(false)
  const closingRef = useRef(false)

  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [pendingIds, setPendingIds] = useState(new Set())
  const [freshIds, setFreshIds] = useState(new Set())
  const [removingIds, setRemovingIds] = useState(new Set())

  const scoresById = useMemo(
    () => new Map(scoreHistory.map(score => [score.id, score])),
    [scoreHistory],
  )

  const setIdState = (setter, id, active) => {
    setter(previous => {
      const next = new Set(previous)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const requestClose = useCallback((restoreFocus = true) => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(
      () => onClose({ restoreFocus }),
      prefersReducedMotion() ? 100 : 150,
    )
  }, [onClose])

  const fetchNotifications = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true)
    setError('')
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!mountedRef.current) return
    if (fetchError) {
      setError('Notifications could not be loaded. Check your connection and try again.')
      setLoading(false)
      return
    }
    setNotifications((data || []).filter(item => !pendingNotificationDeletes.has(item.id)))
    setLoading(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchNotifications({ showLoading: true })

    const restoreDismissed = event => {
      const notification = event.detail
      if (!notification) return
      setNotifications(previous => sortNotifications([
        notification,
        ...previous.filter(item => item.id !== notification.id),
      ]))
    }
    window.addEventListener('notification-undo', restoreDismissed)

    const channel = supabase.channel('notifications-panel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
        if (pendingNotificationDeletes.has(payload.new.id)) return
        setNotifications(previous => sortNotifications([
          payload.new,
          ...previous.filter(item => item.id !== payload.new.id),
        ]))
        setIdState(setFreshIds, payload.new.id, true)
        const timer = window.setTimeout(() => {
          if (mountedRef.current) setIdState(setFreshIds, payload.new.id, false)
          freshTimersRef.current.delete(payload.new.id)
        }, prefersReducedMotion() ? 100 : 260)
        freshTimersRef.current.set(payload.new.id, timer)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, payload => {
        setNotifications(previous => previous.map(item => item.id === payload.new.id ? payload.new : item))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' }, payload => {
        setNotifications(previous => previous.filter(item => item.id !== payload.old.id))
      })
      .subscribe()

    return () => {
      mountedRef.current = false
      window.clearTimeout(closeTimerRef.current)
      window.clearTimeout(confirmTimerRef.current)
      freshTimersRef.current.forEach(window.clearTimeout)
      window.removeEventListener('notification-undo', restoreDismissed)
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications])

  useEffect(() => {
    const hiddenSurfaces = ['.app-main', '.app-sidebar', '.mobile-app-header']
      .map(selector => document.querySelector(selector))
      .filter(Boolean)
      .map(element => ({ element, inert: element.inert }))
    hiddenSurfaces.forEach(({ element }) => { element.inert = true })

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => closeButtonRef.current?.focus())

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose(true)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...panelRef.current.querySelectorAll(
        'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter(element => element.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      hiddenSurfaces.forEach(({ element, inert }) => { element.inert = inert })
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [requestClose])

  const markRead = async id => {
    const current = notifications.find(item => item.id === id)
    if (!current || current.read || pendingIds.has(id)) return
    setIdState(setPendingIds, id, true)
    setNotifications(previous => previous.map(item => item.id === id ? { ...item, read: true } : item))
    const { error: updateError } = await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (mountedRef.current) {
      setIdState(setPendingIds, id, false)
      if (updateError) {
        setNotifications(previous => previous.map(item => item.id === id ? { ...item, read: false } : item))
        toast.error('Could not mark that notification as read.')
      }
    }
  }

  const markAllRead = async () => {
    const unreadIds = notifications.filter(item => !item.read).map(item => item.id)
    if (!unreadIds.length || markingAll) return
    const snapshot = notifications
    setMarkingAll(true)
    setNotifications(previous => previous.map(item => ({ ...item, read: true })))
    const { error: updateError } = await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    if (!mountedRef.current) return
    setMarkingAll(false)
    if (updateError) {
      setNotifications(snapshot)
      toast.error('Could not mark all notifications as read.')
    }
  }

  const dismiss = notification => {
    if (pendingNotificationDeletes.has(notification.id)) return
    setIdState(setRemovingIds, notification.id, true)
    const removeDelay = prefersReducedMotion() ? 0 : 140
    window.setTimeout(() => {
      if (!mountedRef.current) return
      setNotifications(previous => previous.filter(item => item.id !== notification.id))
      setIdState(setRemovingIds, notification.id, false)
    }, removeDelay)

    const deleteTimer = window.setTimeout(async () => {
      pendingNotificationDeletes.delete(notification.id)
      const { error: deleteError } = await supabase.from('notifications').delete().eq('id', notification.id)
      if (deleteError && mountedRef.current) {
        setNotifications(previous => sortNotifications([notification, ...previous.filter(item => item.id !== notification.id)]))
        toast.error('Could not dismiss that notification.')
      }
    }, 7000)
    pendingNotificationDeletes.set(notification.id, { timer: deleteTimer, notification })

    toast.action('Notification dismissed.', {
      label: 'Undo',
      duration: 6500,
      onClick: () => {
        const pending = pendingNotificationDeletes.get(notification.id)
        if (!pending) return
        window.clearTimeout(pending.timer)
        pendingNotificationDeletes.delete(notification.id)
        window.dispatchEvent(new CustomEvent('notification-undo', { detail: notification }))
        toast.info('Notification restored.')
      },
    })
  }

  const clearAll = async () => {
    if (!notifications.length || clearing) return
    if (!clearConfirm) {
      setClearConfirm(true)
      window.clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) setClearConfirm(false)
      }, 4000)
      return
    }

    const ids = notifications.map(item => item.id)
    setClearing(true)
    const { error: deleteError } = await supabase.from('notifications').delete().in('id', ids)
    if (!mountedRef.current) return
    setClearing(false)
    setClearConfirm(false)
    if (deleteError) {
      toast.error('Could not clear notifications. Nothing was removed.')
      return
    }
    setNotifications([])
    toast.success('Notifications cleared.')
  }

  const openLinkedScore = score => {
    openScore({
      ...score.fullScore,
      scoreId: score.id,
      reviewerNote: score.notes,
      overrideVerdict: score.overrideVerdict,
      overrideScore: score.overrideScore,
      overrideNote: score.overrideNote,
      overrideAt: score.overrideAt,
      disputed: score.disputed,
      disputeNote: score.disputeNote,
      disputeAt: score.disputeAt,
      acknowledged: score.acknowledged,
      acknowledgedAt: score.acknowledgedAt,
    })
    requestClose(false)
  }

  const unread = notifications.filter(item => !item.read)
  const earlier = notifications.filter(item => item.read)

  const renderRow = notification => {
    const meta = TYPE_META[notification.type] || { Icon: Bell, tone: 'neutral', label: 'Update' }
    const Icon = meta.Icon
    const score = notification.score_id ? scoresById.get(notification.score_id) : null
    const guidanceLink = QA_GUIDANCE_ENABLED && notification.type === 'rubric_updated' && isAdmin && !!onNavigate
    const coachingLink = ['coaching_session', 'coaching_goal'].includes(notification.type) && role === 'agent' && !!onNavigate
    const actionLabel = score ? `Open ticket #${score.ticketId}` : guidanceLink ? 'Open QA Guidance changes' : coachingLink ? 'Open coaching' : ''
    const canOpen = !!actionLabel

    const openDestination = () => {
      markRead(notification.id)
      if (score) openLinkedScore(score)
      else if (guidanceLink) { onNavigate('rubric'); requestClose(false) }
      else if (coachingLink) { onNavigate('coaching'); requestClose(false) }
    }

    const copy = (
      <>
        <span className={`notification-type-icon tone-${meta.tone}`} aria-hidden="true"><Icon size={15} strokeWidth={2} /></span>
        <span className="notification-copy">
          <span className="notification-message">{notification.message}</span>
          <span className="notification-meta">
            <span className={`notification-type-label tone-${meta.tone}`}>{meta.label}</span>
            <span aria-hidden="true">·</span>
            <span>{timeAgo(notification.created_at)}</span>
            {canOpen && <><span aria-hidden="true">·</span><span className="notification-action-hint">{actionLabel} →</span></>}
          </span>
        </span>
      </>
    )

    return (
      <li key={notification.id} className={`notification-item${notification.read ? '' : ' is-unread'}${freshIds.has(notification.id) ? ' is-fresh' : ''}${removingIds.has(notification.id) ? ' is-removing' : ''}`}>
        {canOpen ? (
          <button type="button" className="notification-primary" onClick={openDestination} aria-label={`${notification.message}. ${actionLabel}`}>
            {copy}
          </button>
        ) : (
          <div className="notification-primary">{copy}</div>
        )}
        <div className="notification-row-actions" role="group" aria-label="Notification actions">
          {!notification.read && (
            <button type="button" onClick={() => markRead(notification.id)} disabled={pendingIds.has(notification.id)} aria-label="Mark notification as read" title="Mark as read">
              <Check size={15} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={() => dismiss(notification)} aria-label="Dismiss notification" title="Dismiss notification">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        {!notification.read && <span className="notification-unread-dot" aria-hidden="true" />}
      </li>
    )
  }

  const renderGroup = (label, rows) => rows.length > 0 && (
    <section className="notification-group" aria-labelledby={`notification-group-${label.toLowerCase()}`}>
      <h3 id={`notification-group-${label.toLowerCase()}`}>{label}{label === 'New' ? ` — ${rows.length}` : ''}</h3>
      <ul>{rows.map(renderRow)}</ul>
    </section>
  )

  return (
    <>
      <div className={`notification-backdrop${closing ? ' is-closing' : ''}`} onClick={() => requestClose(true)} aria-hidden="true" />
      <section
        ref={panelRef}
        id="notification-panel"
        className={`notification-panel${closing ? ' is-closing' : ''}`}
        style={{ left: offsetLeft }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-panel-title"
        aria-describedby="notification-panel-scope"
        aria-busy={loading || clearing}
      >
        <header className="notification-header">
          <div className="notification-title-row">
            <div className="notification-title-wrap">
              <h2 id="notification-panel-title">Notifications</h2>
              {unread.length > 0 && <span className="notification-count" aria-label={`${unread.length} unread`}>{unread.length}</span>}
            </div>
            <button ref={closeButtonRef} type="button" className="notification-close" onClick={() => requestClose(true)} aria-label="Close notifications">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {notifications.length > 0 && (
            <div className="notification-header-actions">
              {unread.length > 0 && (
                <button type="button" onClick={markAllRead} disabled={markingAll}>
                  <CheckCheck size={15} aria-hidden="true" />
                  {markingAll ? 'Marking…' : 'Mark all read'}
                </button>
              )}
              <button type="button" className={clearConfirm ? 'is-confirming' : ''} onClick={clearAll} disabled={clearing}>
                <Trash2 size={15} aria-hidden="true" />
                {clearing ? 'Clearing…' : clearConfirm ? 'Confirm clear all' : 'Clear all'}
              </button>
            </div>
          )}
        </header>

        <div className="notification-list-scroll">
          {loading ? (
            <div className="notification-state notification-loading" role="status">
              <span className="notification-skeleton" />
              <span>Loading notifications…</span>
            </div>
          ) : error ? (
            <div className="notification-state notification-error" role="alert">
              <TriangleAlert size={24} aria-hidden="true" />
              <strong>Something went wrong</strong>
              <p>{error}</p>
              <button type="button" onClick={() => fetchNotifications({ showLoading: true })}>Try again</button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notification-state notification-empty">
              <span className="notification-empty-icon"><Bell size={24} aria-hidden="true" /></span>
              <strong>No notifications yet</strong>
              <p>Ticket reviews, disputes, assignments, and coaching updates will appear here.</p>
            </div>
          ) : (
            <>{renderGroup('New', unread)}{renderGroup('Earlier', earlier)}</>
          )}
        </div>
        <p id="notification-panel-scope" className="notification-scope">Showing up to 50 notifications from the last 30 days.</p>
      </section>
    </>
  )
}
