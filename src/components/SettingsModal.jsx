import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  CheckCircle2, LoaderCircle, LockKeyhole, Mail, SlidersHorizontal,
  Target, UserRound, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useToast } from './Toast'
import './SettingsModal.css'

const TABS = [
  { id: 'profile', label: 'Profile', Icon: UserRound },
  { id: 'security', label: 'Security', Icon: LockKeyhole },
  { id: 'preferences', label: 'Preferences', Icon: SlidersHorizontal },
]

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Toggle({ checked, onChange, labelId }) {
  return (
    <button
      type="button"
      className="settings-toggle"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-track" aria-hidden="true">
        <span className="settings-toggle-knob" />
      </span>
    </button>
  )
}

function ProfileTab() {
  const { profile, updateProfile, user } = useAuth()
  const toast = useToast()
  const nameId = useId()
  const nameHintId = useId()
  const nameErrorId = useId()
  const emailLabelId = useId()
  const [name, setName] = useState(profile?.name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const trimmedName = name.trim()
  const changed = trimmedName !== (profile?.name || '')

  const save = async event => {
    event.preventDefault()
    if (!trimmedName) {
      setError('Enter a display name before saving.')
      return
    }
    if (!changed || saving) return

    setSaving(true)
    setError('')
    try {
      const result = await updateProfile({ name: trimmedName })
      if (result?.error) {
        setError('Your display name could not be saved. Try again.')
        toast.error('Could not update your display name.')
      } else {
        setName(trimmedName)
        toast.success('Display name updated.')
      }
    } catch {
      setError('Your display name could not be saved. Check your connection and try again.')
      toast.error('Could not update your display name.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="settings-form" onSubmit={save} noValidate>
      <div className="settings-field">
        <label htmlFor={nameId}>Display name</label>
        <p id={nameHintId} className="settings-field-hint">Used across reviews, reports, and coaching.</p>
        <input
          id={nameId}
          value={name}
          onChange={event => { setName(event.target.value); setError('') }}
          className="settings-input"
          autoComplete="name"
          maxLength={80}
          aria-invalid={!!error}
          aria-describedby={error ? nameErrorId : nameHintId}
        />
        {error && <p id={nameErrorId} className="settings-field-error" role="alert">{error}</p>}
      </div>

      <div className="settings-field">
        <span id={emailLabelId} className="settings-label">Email</span>
        <div className="settings-readonly" role="textbox" aria-readonly="true" aria-labelledby={emailLabelId}>
          <Mail size={15} aria-hidden="true" />
          <span>{user?.email || 'No email available'}</span>
        </div>
        <p className="settings-field-hint">Managed through your sign-in account.</p>
      </div>

      <button type="submit" disabled={!changed || saving} className="settings-primary-action">
        {saving && <LoaderCircle className="settings-spinner" size={16} aria-hidden="true" />}
        {saving ? 'Saving changes…' : 'Save changes'}
      </button>
    </form>
  )
}

function SecurityTab() {
  const { sendPasswordReset, user } = useAuth()
  const toast = useToast()
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    if (sending) return
    setSending(true)
    setError('')
    try {
      const { error: resetError } = await sendPasswordReset()
      if (resetError) {
        setError('The reset email could not be sent. Check your connection and try again.')
        toast.error('Could not send the reset email.')
      } else {
        setSent(true)
        toast.success('Password reset email sent.')
      }
    } catch {
      setError('The reset email could not be sent. Check your connection and try again.')
      toast.error('Could not send the reset email.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="settings-form">
      <div className="settings-security-block">
        <span className="settings-section-icon" aria-hidden="true"><LockKeyhole size={18} /></span>
        <div className="settings-security-copy">
          <h3>Change password</h3>
          <p>We’ll send a secure password-reset link to:</p>
          <strong>{user?.email || 'your account email'}</strong>
        </div>
      </div>

      {sent ? (
        <div className="settings-success" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <div>
            <strong>Reset email sent</strong>
            <p>Check your inbox and follow the link to choose a new password.</p>
          </div>
        </div>
      ) : (
        <button type="button" onClick={send} disabled={sending} className="settings-secondary-action">
          {sending && <LoaderCircle className="settings-spinner" size={16} aria-hidden="true" />}
          {sending ? 'Sending reset email…' : 'Send reset email'}
        </button>
      )}
      {error && <p className="settings-field-error" role="alert">{error}</p>}
    </div>
  )
}

function PreferencesTab({ agentRecord }) {
  const { updateAgent } = useApp()
  const toast = useToast()
  const goalId = useId()
  const goalHintId = useId()
  const goalErrorId = useId()
  const slackLabelId = useId()
  const [goalScore, setGoalScore] = useState(agentRecord?.goal_score ?? '')
  const [notifySlack, setNotifySlack] = useState(agentRecord?.notify_slack ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!agentRecord) {
    return (
      <div className="settings-unavailable" role="status">
        <SlidersHorizontal size={22} aria-hidden="true" />
        <div>
          <strong>Agent preferences unavailable</strong>
          <p>These preferences appear after your sign-in account is linked to an agent profile.</p>
        </div>
      </div>
    )
  }

  const parsedGoal = goalScore === '' ? null : Number(goalScore)
  const goalInvalid = parsedGoal !== null && (!Number.isInteger(parsedGoal) || parsedGoal < 0 || parsedGoal > 100)
  const changed = !goalInvalid && (
    parsedGoal !== (agentRecord.goal_score ?? null) ||
    notifySlack !== (agentRecord.notify_slack ?? true)
  )

  const save = async event => {
    event.preventDefault()
    if (goalInvalid) {
      setError('Enter a whole-number goal from 0 to 100, or leave it blank.')
      return
    }
    if (!changed || saving) return

    setSaving(true)
    setError('')
    try {
      const result = await updateAgent(agentRecord.id, {
        goal_score: parsedGoal,
        notify_slack: notifySlack,
      })
      if (result?.error) {
        setError('Your preferences could not be saved. Try again.')
        toast.error('Could not save preferences.')
      } else {
        toast.success('Preferences saved.')
      }
    } catch {
      setError('Your preferences could not be saved. Check your connection and try again.')
      toast.error('Could not save preferences.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="settings-form" onSubmit={save} noValidate>
      <div className="settings-field">
        <label htmlFor={goalId}>Goal score</label>
        <p id={goalHintId} className="settings-field-hint">Your personal target, shown on your profile.</p>
        <div className="settings-score-control">
          <span className="settings-score-icon" aria-hidden="true"><Target size={16} /></span>
          <input
            id={goalId}
            type="number"
            min="0"
            max="100"
            step="1"
            inputMode="numeric"
            value={goalScore}
            onChange={event => { setGoalScore(event.target.value); setError('') }}
            placeholder="85"
            className="settings-input"
            aria-invalid={goalInvalid || !!error}
            aria-describedby={goalInvalid || error ? goalErrorId : goalHintId}
          />
          <span>out of 100</span>
        </div>
        {(goalInvalid || error) && (
          <p id={goalErrorId} className="settings-field-error" role="alert">
            {error || 'Enter a whole number from 0 to 100.'}
          </p>
        )}
      </div>

      <div className="settings-preference-row">
        <div>
          <p id={slackLabelId} className="settings-preference-label">Slack notifications</p>
          <p className="settings-field-hint">Receive a DM when a reviewer scores your ticket.</p>
        </div>
        <Toggle checked={notifySlack} onChange={setNotifySlack} labelId={slackLabelId} />
      </div>

      <button type="submit" disabled={!changed || saving} className="settings-primary-action">
        {saving && <LoaderCircle className="settings-spinner" size={16} aria-hidden="true" />}
        {saving ? 'Saving preferences…' : 'Save preferences'}
      </button>
    </form>
  )
}

export default function SettingsModal({ onClose }) {
  const { user, profile, role } = useAuth()
  const { agents } = useApp()
  const modalRef = useRef(null)
  const closeButtonRef = useRef(null)
  const tabRefs = useRef([])
  const closeTimerRef = useRef(null)
  const closingRef = useRef(false)
  const [tab, setTab] = useState('profile')
  const [closing, setClosing] = useState(false)

  const agentRecord = role === 'agent'
    ? agents.find(agent => agent.email?.toLowerCase() === user?.email?.toLowerCase())
    : null
  const visibleTabs = role === 'agent' ? TABS : TABS.filter(item => item.id !== 'preferences')

  const requestClose = useCallback((restoreFocus = true) => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(
      () => onClose({ restoreFocus }),
      prefersReducedMotion() ? 100 : 150,
    )
  }, [onClose])

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
      const focusable = [...modalRef.current.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      )].filter(element => !element.closest('[hidden]') && element.getClientRects().length > 0)
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
      window.clearTimeout(closeTimerRef.current)
      hiddenSurfaces.forEach(({ element, inert }) => { element.inert = inert })
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [requestClose])

  const selectTab = nextTab => {
    setTab(nextTab)
  }

  const handleTabKeyDown = (event, index) => {
    let nextIndex = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % visibleTabs.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + visibleTabs.length) % visibleTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = visibleTabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    selectTab(visibleTabs[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className={`settings-overlay${closing ? ' is-closing' : ''}`} onClick={() => requestClose(true)}>
      <section
        ref={modalRef}
        id="settings-dialog"
        className={`settings-modal${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        aria-describedby="settings-subtitle"
        onClick={event => event.stopPropagation()}
      >
        <header className="settings-header">
          <div className="settings-heading-wrap">
            <h2 id="settings-title">Settings</h2>
            <p id="settings-subtitle">Manage your account and personal preferences.</p>
            <div className="settings-account-line">
              <span>{profile?.name || user?.email || 'Account'}</span>
              <span className="settings-role">{role} account</span>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" className="settings-close" onClick={() => requestClose(true)} aria-label="Close settings">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-tabs" role="tablist" aria-label="Settings sections">
            {visibleTabs.map((item, index) => {
              const Icon = item.Icon
              const selected = tab === item.id
              return (
                <button
                  key={item.id}
                  ref={element => { tabRefs.current[index] = element }}
                  id={`settings-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`settings-panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={selected ? 'is-selected' : ''}
                  onClick={() => selectTab(item.id)}
                  onKeyDown={event => handleTabKeyDown(event, index)}
                >
                  <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="settings-content">
            <section id="settings-panel-profile" role="tabpanel" aria-labelledby="settings-tab-profile" hidden={tab !== 'profile'} className="settings-panel">
              <div className="settings-panel-heading">
                <h3>Profile</h3>
                <p>Keep your identity clear wherever your work appears.</p>
              </div>
              <ProfileTab />
            </section>
            <section id="settings-panel-security" role="tabpanel" aria-labelledby="settings-tab-security" hidden={tab !== 'security'} className="settings-panel">
              <div className="settings-panel-heading">
                <h3>Security</h3>
                <p>Manage access to your QA account.</p>
              </div>
              <SecurityTab />
            </section>
            {role === 'agent' && (
              <section id="settings-panel-preferences" role="tabpanel" aria-labelledby="settings-tab-preferences" hidden={tab !== 'preferences'} className="settings-panel">
                <div className="settings-panel-heading">
                  <h3>Preferences</h3>
                  <p>Choose your quality target and feedback notifications.</p>
                </div>
                <PreferencesTab agentRecord={agentRecord} />
              </section>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
