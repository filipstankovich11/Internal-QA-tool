import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useToast } from './Toast'

const TABS = [
  { id: 'profile',      label: 'Profile',       icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  { id: 'security',     label: 'Security',       icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> },
  { id: 'preferences',  label: 'Preferences',    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M2 12h2M20 12h2M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41"/></svg> },
]

function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 9999,
        background: checked ? '#FF9780' : '#E1DCD7',
        position: 'relative',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 200ms',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3, left: checked ? 21 : 3,
        width: 16, height: 16,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 200ms cubic-bezier(0.16,1,0.3,1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      }} />
    </button>
  )
}

function ProfileTab() {
  const { profile, updateProfile, user } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.name || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    const { error } = await updateProfile({ name: name.trim() })
    setSaving(false)
    if (error) toast.error('Failed to update name')
    else toast.success('Name updated')
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgba(26,30,35,.5)' }}>Display name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          className="w-full g-input rounded-xl px-4 py-2.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgba(26,30,35,.5)' }}>Email</label>
        <p className="text-sm px-4 py-2.5 rounded-xl" style={{ color: 'rgba(26,30,35,.6)', background: '#FBF7F3', border: '1px solid #EEEEEE' }}>
          {user?.email}
        </p>
      </div>
      <button
        onClick={save}
        disabled={!name.trim() || name === profile?.name || saving}
        className="g-btn-primary text-sm px-5 py-2.5 rounded-xl self-start"
        style={{ opacity: (!name.trim() || name === profile?.name || saving) ? 0.4 : 1 }}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

function SecurityTab() {
  const { sendPasswordReset, user } = useAuth()
  const toast = useToast()
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  const send = async () => {
    setSending(true)
    const { error } = await sendPasswordReset()
    setSending(false)
    if (error) toast.error('Failed to send reset email')
    else { setSent(true); toast.success('Password reset email sent') }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl p-4" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
        <p className="text-sm font-medium mb-1" style={{ color: '#1A1E23' }}>Change password</p>
        <p className="text-xs mb-4" style={{ color: 'rgba(26,30,35,.6)' }}>
          We'll send a password reset link to <span style={{ color: '#1A1E23' }}>{user?.email}</span>
        </p>
        {sent ? (
          <p className="text-sm" style={{ color: '#2F8F5B' }}>✓ Reset email sent — check your inbox</p>
        ) : (
          <button
            onClick={send}
            disabled={sending}
            className="text-sm px-4 py-2 rounded-xl font-medium transition-all"
            style={{ background: '#FFEAE6', color: '#B84A2E', border: '1px solid #FFD9D1', opacity: sending ? 0.5 : 1 }}
            onMouseEnter={e => { if (!sending) e.currentTarget.style.background = '#FFD9D1' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#FFEAE6' }}>
            {sending ? 'Sending…' : 'Send reset email'}
          </button>
        )}
      </div>
    </div>
  )
}

function PreferencesTab({ agentRecord }) {
  const { updateAgent } = useApp()
  const toast = useToast()
  const [goalScore,   setGoalScore]   = useState(agentRecord?.goal_score ?? '')
  const [notifySlack, setNotifySlack] = useState(agentRecord?.notify_slack ?? true)
  const [saving,      setSaving]      = useState(false)

  if (!agentRecord) {
    return (
      <p className="text-sm" style={{ color: 'rgba(26,30,35,.6)' }}>
        Preferences are available for agent accounts only.
      </p>
    )
  }

  const save = async () => {
    setSaving(true)
    await updateAgent(agentRecord.id, {
      goal_score:   goalScore !== '' ? parseInt(goalScore, 10) : null,
      notify_slack: notifySlack,
    })
    setSaving(false)
    toast.success('Preferences saved')
  }

  const changed = (
    (goalScore !== '' ? parseInt(goalScore, 10) : null) !== (agentRecord.goal_score ?? null) ||
    notifySlack !== (agentRecord.notify_slack ?? true)
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgba(26,30,35,.5)' }}>Goal score</label>
        <p className="text-xs mb-2" style={{ color: 'rgba(26,30,35,.5)' }}>
          Your personal target — shown as a progress bar on your profile
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0"
            max="100"
            value={goalScore}
            onChange={e => setGoalScore(e.target.value)}
            placeholder="e.g. 85"
            className="g-input rounded-xl px-4 py-2.5 text-sm w-28"
          />
          <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>out of 100</span>
        </div>
      </div>

      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-sm font-medium" style={{ color: '#1A1E23' }}>Slack notifications</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(26,30,35,.6)' }}>Receive a DM when a reviewer scores your ticket</p>
        </div>
        <Toggle checked={notifySlack} onChange={setNotifySlack} />
      </div>

      <button
        onClick={save}
        disabled={!changed || saving}
        className="g-btn-primary text-sm px-5 py-2.5 rounded-xl self-start"
        style={{ opacity: (!changed || saving) ? 0.4 : 1 }}>
        {saving ? 'Saving…' : 'Save preferences'}
      </button>
    </div>
  )
}

export default function SettingsModal({ onClose }) {
  const { user, profile, role } = useAuth()
  const { agents } = useApp()
  const [tab, setTab] = useState('profile')

  const agentRecord = role === 'agent'
    ? agents.find(a => a.email?.toLowerCase() === user?.email?.toLowerCase())
    : null

  const visibleTabs = role === 'agent'
    ? TABS
    : TABS.filter(t => t.id !== 'preferences')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: 'rgba(26,30,35,.35)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden modal-enter"
        style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 20px 48px rgba(0,0,0,.12)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F0ECE9' }}>
          <div>
            <h2 className="font-semibold" style={{ color: '#1A1E23', fontFamily: "'Inter Tight'" }}>Settings</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(26,30,35,.6)' }}>
              {profile?.name || user?.email}
              <span className="ml-2 capitalize" style={{ color: '#B84A2E' }}>{role}</span>
            </p>
          </div>
          <button onClick={onClose}
            className="text-2xl leading-none transition-colors" style={{ color: 'rgba(26,30,35,.45)' }}
            onMouseEnter={e => e.target.style.color = '#1A1E23'}
            onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.45)'}>×</button>
        </div>

        <div className="flex" style={{ minHeight: 300 }}>
          {/* Side tabs */}
          <div className="flex flex-col gap-0.5 p-3 shrink-0" style={{ width: 156, borderRight: '1px solid #F0ECE9', background: '#FBF7F3' }}>
            {visibleTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm font-medium transition-all"
                style={{
                  color: tab === t.id ? '#B84A2E' : 'rgba(26,30,35,.6)',
                  background: tab === t.id ? '#FFEAE6' : 'transparent',
                  borderLeft: tab === t.id ? '2px solid #FF9780' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = '#1A1E23' }}
                onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = 'rgba(26,30,35,.6)' }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 p-6 min-w-0">
            {tab === 'profile'     && <ProfileTab />}
            {tab === 'security'    && <SecurityTab />}
            {tab === 'preferences' && <PreferencesTab agentRecord={agentRecord} />}
          </div>
        </div>
      </div>
    </div>
  )
}
