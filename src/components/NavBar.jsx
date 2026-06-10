import { useMemo } from 'react'
import GorgiasLogo from './GorgiasLogo'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
  { id: 'score',     label: 'Score',     scorerOnly: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
  { id: 'review',    label: 'Review Queue', scorerOnly: true, badge: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> },
  { id: 'agents',    label: 'Agents',    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  { id: 'inbox',     label: 'Inbox',     agentOnly: true, inboxBadge: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg> },
  { id: 'coaching',  label: 'Coaching',  agentOnly: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
  { id: 'teams',     label: 'Teams',     scorerOnly: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
  { id: 'rubric',       label: 'QA Guidance',  adminOnly: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
  { id: 'calibration', label: 'Calibration',  scorerOnly: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> },
]

const ROLE_COLOR = { admin: '#FF9780', lead: '#f59e0b', agent: '#888' }

const SignOutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

export default function NavBar({ page, setPage }) {
  const { profile, role, canScore, isAdmin, signOut, user } = useAuth()
  const { scoreHistory, agents } = useApp()

  const myAgentId = useMemo(
    () => role === 'agent' ? agents.find(a => a.user_id === user?.id)?.id ?? null : null,
    [role, agents, user]
  )

  const reviewCount = scoreHistory.filter(s =>
    (s.effectiveVerdict === 'NEEDS_REVIEW' && !s.overrideVerdict) || s.disputed
  ).length

  const inboxUnread = useMemo(() => {
    const visible = myAgentId
      ? scoreHistory.filter(s => s.agentIds?.includes(myAgentId))
      : scoreHistory
    return visible.filter(s => !s.acknowledged).length
  }, [scoreHistory, myAgentId])

  const isAgent = role === 'agent'

  const visibleTabs = TABS
    .filter(t => {
      if (t.scorerOnly && !canScore) return false
      if (t.adminOnly && !isAdmin) return false
      if (t.agentOnly && !isAgent) return false
      return true
    })
    .map(t => t.id === 'agents' && isAgent ? { ...t, label: 'My Profile' } : t)

  return (
    <nav className="sticky top-0 z-40 border-b" style={{ background: 'rgba(7,7,7,0.92)', borderColor: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}>
      <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-3">
        {/* Logo — click to go home */}
        <button
          onClick={() => setPage('dashboard')}
          className="shrink-0 transition-opacity"
          style={{ opacity: 1 }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          title="Dashboard"
        >
          <GorgiasLogo />
        </button>

        <div className="h-5 w-px shrink-0" style={{ background: 'rgba(255,255,255,0.10)' }} />

        {/* Tabs — scrollable so they never clip */}
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {visibleTabs.map(tab => {
            const isActive = page === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setPage(tab.id)}
                className="flex items-center gap-1.5 px-2.5 whitespace-nowrap shrink-0 text-xs font-medium relative"
                style={{
                  height: '36px',
                  color: isActive ? '#FF9780' : '#555',
                  transition: 'color 150ms',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #FF9780' : '2px solid transparent',
                  borderRadius: 0,
                  marginBottom: '-1px',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#ccc' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#555' }}
              >
                {tab.icon}
                {tab.label}
                {tab.badge && reviewCount > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full leading-none"
                    style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontSize: '10px' }}>
                    {reviewCount}
                  </span>
                )}
                {tab.inboxBadge && inboxUnread > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full leading-none"
                    style={{ background: 'rgba(255,151,128,0.2)', color: '#FF9780', fontSize: '10px' }}>
                    {inboxUnread}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* User info + sign out */}
        <div className="flex items-center gap-2 shrink-0">
          {profile && (
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'rgba(255,151,128,0.15)', color: '#FF9780' }}
                title={`${profile.name} · ${role}`}>
                {(profile.name || '?')[0].toUpperCase()}
              </div>
              <span className="text-xs capitalize hidden lg:block" style={{ color: ROLE_COLOR[role] || '#888' }}>{role}</span>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: '#777', border: '1px solid rgba(255,255,255,0.07)' }}
            title="Sign out"
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
          >
            <SignOutIcon />
          </button>
        </div>
      </div>
    </nav>
  )
}
