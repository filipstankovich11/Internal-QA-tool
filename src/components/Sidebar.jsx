import { useState, useEffect, useCallback, useRef } from 'react'
import GorgiasLogo from './GorgiasLogo'
import SettingsModal from './SettingsModal'
import NotificationPanel from './NotificationPanel'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { isInReviewQueue } from '../lib/queue'
import { isClaimActive } from '../lib/claims'
import { QA_GUIDANCE_ENABLED } from '../config/features'

// Lucide-style icons, 18px / 2px stroke (per the Gorgias handoff)
const ic = (children) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>

const MENU_TABS = [
  { id: 'dashboard',   label: 'Dashboard',    icon: ic(<><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>) },
  { id: 'score',       label: 'Score',        scorerOnly: true, icon: ic(<><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></>) },
  { id: 'review',      label: 'Review Queue', scorerOnly: true, badge: true, icon: ic(<><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/></>) },
  { id: 'myqueue',     label: 'My Queue',     adminOnly: true, myQueueBadge: true, icon: ic(<><path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><rect x="3" y="4" width="6" height="6" rx="1"/></>) },
  { id: 'agents',      label: 'Agents',       icon: ic(<><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></>) },
  { id: 'inbox',       label: 'Inbox',        agentOnly: true, inboxBadge: true, icon: ic(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>) },
  { id: 'coaching',    label: 'Coaching',     agentOnly: true, icon: ic(<><path d="M9 3h12v13H11"/><path d="M13 7h5"/><path d="M14 10h4"/><circle cx="4.5" cy="5.5" r="2.5"/><path d="M2.5 21l.6-6.5A4 4 0 0 1 7 10.9l3.4 2.9 3.8-1"/></>) },
  { id: 'teams',       label: 'Teams',        scorerOnly: true, icon: ic(<><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></>) },
  { id: 'coachinghub', label: 'Coaching',     scorerOnly: true, icon: ic(<><path d="M9 3h12v13H11"/><path d="M13 7h5"/><path d="M14 10h4"/><circle cx="4.5" cy="5.5" r="2.5"/><path d="M2.5 21l.6-6.5A4 4 0 0 1 7 10.9l3.4 2.9 3.8-1"/></>) },
  { id: 'reports',     label: 'Reports',      scorerOnly: true, icon: ic(<><path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M2 19h20M8 15v-3M12 15V8M16 15v-5"/></>) },
  { id: 'rubric',      label: 'QA Guidance',  adminOnly: true, icon: ic(<><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></>) },
]


const BellIcon    = () => ic(<><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></>)
const GearIcon    = () => ic(<><path d="M11 10.27 7 3.34"/><path d="m11 13.73-4 6.93"/><path d="M12 22v-2"/><path d="M12 2v2"/><path d="M14 12h8"/><path d="m17 20.66-1-1.73"/><path d="m17 3.34-1 1.73"/><path d="M2 12h2"/><path d="m20.66 17-1.73-1"/><path d="m20.66 7-1.73 1"/><path d="m3.34 17 1.73-1"/><path d="m3.34 7 1.73 1"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="8"/></>)
const SignOutIcon = () => ic(<><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></>)
const ChevronLeft  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
const ChevronRight = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>

function NavItem({ icon, label, isActive, onClick, badge, collapsed, danger, buttonRef, ariaControls, ariaHaspopup, ariaExpanded }) {
  const [hovered, setHovered] = useState(false)
  const iconColor  = isActive ? '#FF9780' : (danger && hovered) ? '#D14B3D' : 'rgba(26,30,35,.72)'
  const labelColor = isActive ? '#1A1E23' : (danger && hovered) ? '#D14B3D' : 'rgba(26,30,35,.72)'
  const bg = isActive ? '#FFEAE6' : hovered ? '#F6F2EF' : 'transparent'

  return (
    <button
      ref={buttonRef}
      className="nav-item-motion"
      onClick={(e) => { onClick(); if (e.detail) e.currentTarget.blur() }}
      title={collapsed ? label : undefined}
      aria-controls={ariaControls}
      aria-haspopup={ariaHaspopup}
      aria-expanded={ariaExpanded}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        height: 38, padding: collapsed ? 0 : '0 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 8, color: labelColor, background: bg, border: 'none',
        transition: 'color 140ms, background 140ms, transform 120ms',
        fontSize: 14, fontWeight: isActive ? 600 : 500,
        whiteSpace: 'nowrap', cursor: 'pointer', width: '100%', textAlign: 'left', position: 'relative',
      }}
    >
      {isActive && <span className="nav-active-rail" aria-hidden="true" />}
      <span style={{ flexShrink: 0, display: 'flex', color: iconColor, transition: 'color 140ms' }}>{icon}</span>

      {!collapsed && (
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
          {label}
          {badge != null && badge > 0 && (
            <span style={{
              background: 'var(--coral-tint)', color: 'var(--coral-text)',
              fontSize: 11, fontWeight: 600,
              padding: '3px 7px', borderRadius: 9999, lineHeight: 1,
            }}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
      )}

      {collapsed && badge != null && badge > 0 && (
        <span style={{ position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: '50%', background: 'var(--coral)' }} />
      )}
    </button>
  )
}

function SectionLabel({ label, collapsed }) {
  if (collapsed) return <div style={{ height: 1, background: 'var(--hairline)', margin: '10px 8px' }} />
  return (
    <p style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'rgba(26,30,35,.4)',
      padding: '4px 10px 6px', margin: 0,
    }}>
      {label}
    </p>
  )
}

export default function Sidebar({ page, setPage }) {
  const [collapsed,         setCollapsed]         = useState(false)
  const [mobileOpen,        setMobileOpen]        = useState(false)
  const [showSettings,      setShowSettings]      = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount,       setUnreadCount]       = useState(0)
  const { user, profile, role, canScore, isAdmin, signOut } = useAuth()
  const { agents, scoreHistory, activeOverlay, setActiveOverlay } = useApp()
  const menuButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const sidebarRef = useRef(null)
  const notificationButtonRef = useRef(null)
  const settingsButtonRef = useRef(null)
  const compact = collapsed && !mobileOpen
  const closeMobile = () => {
    setMobileOpen(false)
    requestAnimationFrame(() => menuButtonRef.current?.focus())
  }

  useEffect(() => {
    if (!mobileOpen) return
    closeButtonRef.current?.focus()
    const onKeyDown = e => {
      if (e.key === 'Escape') {
        closeMobile()
      } else if (e.key === 'Tab') {
        const focusable = [...sidebarRef.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled)')]
          .filter(el => el.getClientRects().length > 0)
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable.at(-1)
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  const navigate = nextPage => {
    setPage(nextPage)
    setMobileOpen(false)
    if (window.matchMedia('(max-width: 767px)').matches) {
      requestAnimationFrame(() => menuButtonRef.current?.focus())
    }
  }

  // Close our panels when a different overlay surface (e.g. the score panel) opens
  useEffect(() => {
    if (activeOverlay !== 'notifications') setShowNotifications(false)
    if (activeOverlay !== 'settings')      setShowSettings(false)
  }, [activeOverlay])

  const fetchUnread = useCallback(async () => {
    if (!user) return
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('read', false)
      .gte('created_at', cutoff)
    setUnreadCount(count || 0)
  }, [user])

  useEffect(() => {
    fetchUnread()
    const channel = supabase.channel('sidebar-notif-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => fetchUnread())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchUnread])

  const closeNotifications = useCallback(({ restoreFocus = true } = {}) => {
    setShowNotifications(false)
    setActiveOverlay(current => current === 'notifications' ? null : current)
    fetchUnread()
    if (restoreFocus) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = window.matchMedia('(max-width: 767px)').matches
            ? menuButtonRef.current
            : notificationButtonRef.current
          target?.focus()
        })
      })
    }
  }, [fetchUnread, setActiveOverlay])

  const closeSettings = useCallback(({ restoreFocus = true } = {}) => {
    setShowSettings(false)
    setActiveOverlay(current => current === 'settings' ? null : current)
    if (restoreFocus) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = window.matchMedia('(max-width: 767px)').matches
            ? menuButtonRef.current
            : settingsButtonRef.current
          target?.focus()
        })
      })
    }
  }, [setActiveOverlay])
  const reviewCount  = scoreHistory.filter(isInReviewQueue).length
  const myQueueCount = scoreHistory.filter(s => s.claimedBy === user?.id && isClaimActive(s) && isInReviewQueue(s)).length
  const inboxUnread  = scoreHistory.filter(s => !s.acknowledged).length
  const isAgent      = role === 'agent'

  const visibleTabs = MENU_TABS
    .filter(t => {
      if (t.id === 'rubric' && !QA_GUIDANCE_ENABLED) return false
      if (t.scorerOnly && !canScore) return false
      if (t.adminOnly  && !isAdmin)  return false
      if (t.agentOnly  && !isAgent)  return false
      return true
    })
    .map(t => t.id === 'agents' && isAgent ? { ...t, label: 'My Profile' } : t)

  return (
    <>
    <header className="mobile-app-header">
      <button ref={menuButtonRef} type="button" onClick={() => setMobileOpen(true)}
        aria-label="Open navigation" aria-controls="app-sidebar-nav" aria-expanded={mobileOpen}>
        {ic(<><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></>)}
      </button>
      <GorgiasLogo color="#1A1E23" />
    </header>
    {mobileOpen && <div className="mobile-nav-backdrop" onClick={closeMobile} aria-hidden="true" />}
    <aside ref={sidebarRef} id="app-sidebar-nav" className={`app-sidebar${mobileOpen ? ' mobile-open' : ''}`}
      role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen ? 'true' : undefined}
      aria-label={mobileOpen ? 'Navigation' : undefined} style={{
      width: compact ? 56 : 240,
      flexShrink: 0,
      background: 'var(--white)',
      borderRight: '1px solid var(--hairline)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      height: '100vh',
      zIndex: 40,
    }}>

      {/* ── Header: logo + collapse ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: compact ? 'center' : 'space-between',
        padding: compact ? '0 12px' : '0 16px 0 14px',
        height: 60,
        flexShrink: 0,
        gap: 8,
      }}>
        {!compact && (
          <button
            onClick={() => navigate('dashboard')}
            aria-label="Go to dashboard"
            style={{ transition: 'opacity 150ms', lineHeight: 0 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            <GorgiasLogo color="#1A1E23" />
          </button>
        )}
        <button
          className="desktop-sidebar-collapse"
          onClick={() => setCollapsed(v => !v)}
          style={{
            color: 'var(--ink-45)', padding: '5px', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color 140ms, background 140ms', flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(26,30,35,.72)'; e.currentTarget.style.background = '#F6F2EF' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.45)'; e.currentTarget.style.background = 'transparent' }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </button>
        <button ref={closeButtonRef} type="button" className="mobile-nav-close"
          onClick={closeMobile}
          aria-label="Close navigation">
          {ic(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>)}
        </button>
      </div>

      {/* ── Nav ── */}
      <nav style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '6px 8px 8px', overflowY: 'auto', overflowX: 'hidden', gap: 2,
      }}>

        {/* MENU section */}
        <SectionLabel label="Menu" collapsed={compact} />
        {visibleTabs.map(tab => (
          <NavItem
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            isActive={page === tab.id}
            onClick={() => navigate(tab.id)}
            badge={
              tab.badge        ? reviewCount  :
              tab.myQueueBadge ? myQueueCount :
              tab.inboxBadge   ? inboxUnread  :
              null
            }
            collapsed={compact}
          />
        ))}

        {/* GENERAL section — pinned to bottom of nav */}
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <SectionLabel label="General" collapsed={compact} />
          <NavItem
            buttonRef={notificationButtonRef}
            icon={<BellIcon />}
            label="Notifications"
            isActive={showNotifications}
            onClick={() => { setShowNotifications(true); setShowSettings(false); setActiveOverlay('notifications'); setMobileOpen(false) }}
            badge={unreadCount}
            collapsed={compact}
            ariaControls="notification-panel"
            ariaHaspopup="dialog"
            ariaExpanded={showNotifications}
          />
          <NavItem
            buttonRef={settingsButtonRef}
            icon={<GearIcon />}
            label="Settings"
            isActive={showSettings}
            onClick={() => { setShowSettings(true); setShowNotifications(false); setActiveOverlay('settings'); setMobileOpen(false) }}
            badge={null}
            collapsed={compact}
            ariaControls="settings-dialog"
            ariaHaspopup="dialog"
            ariaExpanded={showSettings}
          />
          <NavItem
            icon={<SignOutIcon />}
            label="Sign out"
            isActive={false}
            onClick={signOut}
            badge={null}
            collapsed={compact}
            danger
          />
        </div>
      </nav>

      {/* ── User profile ── */}
      {profile && (
        <div style={{
          padding: '10px 8px 14px',
          borderTop: '1px solid var(--hairline)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: 10, padding: '6px 8px', borderRadius: 8,
            justifyContent: compact ? 'center' : 'flex-start',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'var(--coral)', color: 'var(--ink)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}
              title={compact ? profile.name : undefined}
            >
              {(profile.name || '?')[0].toUpperCase()}
            </div>
            {!compact && (
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.name}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </aside>
    {showSettings && <SettingsModal onClose={closeSettings} />}
    {showNotifications && (
        <NotificationPanel
          onClose={closeNotifications}
          offsetLeft={compact ? 56 : 240}
          onNavigate={navigate}
        />
    )}
    </>
  )
}
