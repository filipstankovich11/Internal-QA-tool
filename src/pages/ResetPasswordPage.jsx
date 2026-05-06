import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

export default function ResetPasswordPage() {
  const { updatePassword, setIsPasswordReset } = useAuth()
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== password2) { setError('Passwords do not match'); return }
    if (password.length < 6)   { setError('Password must be at least 6 characters'); return }
    setLoading(true); setError('')
    const { error: err } = await updatePassword(password)
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => setIsPasswordReset(false), 2000)
    }
  }

  return (
    <div className="login-page">
      <div className="login-container visible">
        <div className="page-logo">
          <div className="page-wordmark">
            <span className="page-wordmark__name">Gorgias</span>
            <span className="page-wordmark__badge">QA</span>
          </div>
        </div>
        <p className="page-tagline">Quality Assurance Platform</p>

        <div className="form-card">
          {done ? (
            <p className="success-msg">Password updated! Signing you in…</p>
          ) : (
            <>
              <p className="reset-note">Choose a new password for your account.</p>
              <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
                <div className="lp-field">
                  <label htmlFor="rp-password">New password</label>
                  <input
                    id="rp-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    required
                    autoFocus
                    autoComplete="new-password"
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                <div className="lp-field">
                  <label htmlFor="rp-password2">Confirm password</label>
                  <input
                    id="rp-password2"
                    type="password"
                    placeholder="••••••••"
                    value={password2}
                    required
                    autoComplete="new-password"
                    onChange={e => setPassword2(e.target.value)}
                  />
                </div>
                <p className="lp-error">{error}</p>
                <button type="submit" className="btn-signin" disabled={loading || !password || !password2}>
                  {loading ? (
                    <><span className="lp-spinner" />Updating…</>
                  ) : 'Set new password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
