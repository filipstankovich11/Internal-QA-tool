import { useState, useEffect, useCallback } from 'react'
import GorgiasLogo from './GorgiasLogo'
import SettingsModal from './SettingsModal'
import NotificationPanel from './NotificationPanel'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

const MENU_TABS = [
  { id: 'dashboard',   label: 'Dashboard',    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
  { id: 'score',       label: 'Score',        scorerOnly: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
  { id: 'review',      label: 'Review Queue', scorerOnly: true, badge: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> },
  { id: 'agents',      label: 'Agents',       icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  { id: 'inbox',       label: 'Inbox',        agentOnly: true, inboxBadge: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg> },
  { id: 'coaching',    label: 'Coaching',     agentOnly: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
  { id: 'teams',       label: 'Teams',        scorerOnly: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
  { id: 'rubric',      label: 'QA Guidance',  adminOnly: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
  { id: 'calibration', label: 'Calibration',  scorerOnly: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> },
]

const ROLE_COLOR = { admin: '#FF9780', lead: '#f59e0b', agent: '#888' }

const BellIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
const GearIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
const SignOutIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
const ChevronLeft  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
const ChevronRight = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>

function NavItem({ icon, label, isActive, onClick, badge, collapsed, danger, bright }) {
  const [hovered, setHovered] = useState(false)
  const active = isActive
  const color  = danger ? (hovered ? '#ef4444' : bright ? '#ffffff' : '#888')
               : active  ? '#FF9780'
               : bright  ? '#ffffff'
               : hovered ? '#f0f0f0'
               : '#b0b0b0'
  const bg     = active  ? 'rgba(255,151,128,0.10)'
               : hovered ? 'rgba(255,255,255,0.08)'
               : 'transparent'

  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '9px 0' : '8px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 9,
        color,
        background: bg,
        border: 'none',
        transition: 'color 140ms, background 140ms',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        position: 'relative',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', opacity: active ? 1 : 0.9 }}>{icon}</span>

      {!collapsed && (
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
          {label}
          {badge != null && badge > 0 && (
            <span style={{
              background: danger ? 'rgba(239,68,68,0.15)' : 'rgba(255,151,128,0.15)',
              color: danger ? '#ef4444' : '#FF9780',
              fontSize: 10, fontWeight: 700,
              padding: '2px 6px', borderRadius: 999, lineHeight: 1.4,
            }}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
      )}

      {/* Collapsed dot indicator */}
      {collapsed && badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: 7, right: 7,
          width: 6, height: 6, borderRadius: '50%',
          background: danger ? '#ef4444' : '#FF9780',
        }} />
      )}
    </button>
  )
}

function SectionLabel({ label, collapsed }) {
  if (collapsed) return <div style={{ height: 1, background: 'rgba(255,255,255,0.10)', margin: '8px 10px' }} />
  return (
    <p style={{
      fontSize: 12, fontWeight: 600, letterSpacing: '0.10em',
      textTransform: 'uppercase', color: '#c8c8c8',
      padding: '4px 12px 6px', margin: 0,
    }}>
      {label}
    </p>
  )
}

export default function Sidebar({ page, setPage }) {
  const [collapsed,         setCollapsed]         = useState(false)
  const [showSettings,      setShowSettings]      = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount,       setUnreadCount]       = useState(0)
  const { user, profile, role, canScore, isAdmin, signOut } = useAuth()
  const { agents, scoreHistory, activeOverlay, setActiveOverlay } = useApp()

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

  const reviewCount  = scoreHistory.filter(s => (s.effectiveVerdict === 'NEEDS_REVIEW' && !s.overrideVerdict) || s.disputed).length
  const inboxUnread  = scoreHistory.filter(s => !s.acknowledged).length
  const isAgent      = role === 'agent'

  const visibleTabs = MENU_TABS
    .filter(t => {
      if (t.scorerOnly && !canScore) return false
      if (t.adminOnly  && !isAdmin)  return false
      if (t.agentOnly  && !isAgent)  return false
      return true
    })
    .map(t => t.id === 'agents' && isAgent ? { ...t, label: 'My Profile' } : t)

  return (
    <aside style={{
      width: collapsed ? 56 : 232,
      flexShrink: 0,
      background: '#141416',
      borderRight: '1px solid rgba(255,255,255,0.07)',
      transition: 'width 220ms cubic-bezier(0.16, 1, 0.3, 1)',
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
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '0 12px' : '0 16px 0 14px',
        height: 58,
        flexShrink: 0,
        gap: 8,
      }}>
        {!collapsed && (
          <button
            onClick={() => setPage('dashboard')}
            style={{ opacity: 1, transition: 'opacity 150ms', lineHeight: 0 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            <GorgiasLogo />
          </button>
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{
            color: '#444', padding: '5px', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color 140ms, background 140ms', flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#444'; e.currentTarget.style.background = 'transparent' }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </button>
      </div>

      {/* ── Nav ── */}
      <nav style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '8px 8px 8px', overflowY: 'auto', overflowX: 'hidden', gap: 1,
      }}>

        {/* MENU section */}
        <SectionLabel label="Menu" collapsed={collapsed} />
        {visibleTabs.map(tab => (
          <NavItem
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            isActive={page === tab.id}
            onClick={() => setPage(tab.id)}
            badge={
              tab.badge      ? reviewCount  :
              tab.inboxBadge ? inboxUnread  :
              null
            }
            collapsed={collapsed}
            bright
          />
        ))}

        {/* GENERAL section — pinned to bottom of nav */}
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <SectionLabel label="General" collapsed={collapsed} />
          <NavItem
            icon={<BellIcon />}
            label="Notifications"
            isActive={showNotifications}
            onClick={() => { setShowNotifications(true); setShowSettings(false); setActiveOverlay('notifications') }}
            badge={unreadCount}
            collapsed={collapsed}
            bright
          />
          <NavItem
            icon={<GearIcon />}
            label="Settings"
            isActive={showSettings}
            onClick={() => { setShowSettings(true); setShowNotifications(false); setActiveOverlay('settings') }}
            badge={null}
            collapsed={collapsed}
            bright
          />
          <NavItem
            icon={<SignOutIcon />}
            label="Sign out"
            isActive={false}
            onClick={signOut}
            badge={null}
            collapsed={collapsed}
            danger
            bright
          />
        </div>
      </nav>

      {/* ── User profile ── */}
      {profile && (
        <div style={{
          padding: '10px 8px 12px',
          borderTop: '1px solid rgba(255,255,255,0.10)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: 10, padding: '6px 10px', borderRadius: 9,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(255,151,128,0.12)', color: '#FF9780',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, flexShrink: 0,
              border: '1px solid rgba(255,151,128,0.2)',
            }}
              title={collapsed ? `${profile.name} · ${role}` : undefined}
            >
              {(profile.name || '?')[0].toUpperCase()}
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#e0e0e0', fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.name}
                </div>
                <div style={{ color: ROLE_COLOR[role] || '#888', fontSize: 13, textTransform: 'capitalize', marginTop: 1 }}>
                  {role}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => { setShowSettings(false); setActiveOverlay(o => o === 'settings' ? null : o) }} />}
      {showNotifications && (
        <NotificationPanel
          onClose={() => { setShowNotifications(false); setActiveOverlay(o => o === 'notifications' ? null : o); fetchUnread() }}
          offsetLeft={collapsed ? 56 : 232}
        />
      )}
    </aside>
  )
}
