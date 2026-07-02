import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import './LoginPage.css'

const TESTIMONIALS = [
  {
    quote: "Just got 100% on my latest ticket! The rubric finally made it click — I knew exactly what a perfect response looked like.",
    initial: "F",
    name: "Filip",
    role: "Support Agent · 100% score",
  },
  {
    quote: "Calibration sessions ended the 'why did I get this score' debates. We're finally grading the same way.",
    initial: "K",
    name: "Katarina",
    role: "Team Lead · L2 Support",
  },
  {
    quote: "I can see exactly where my team needs coaching in seconds. Reviews that took an afternoon now take minutes.",
    initial: "O",
    name: "Ognjen",
    role: "QA Manager",
  },
]

const ROTATE_MS = 4500

function TestimonialCarousel() {
  const [index, setIndex] = useState(0)
  const timerRef = useRef(null)

  const resetTimer = () => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setIndex(i => (i + 1) % TESTIMONIALS.length), ROTATE_MS)
  }

  useEffect(() => {
    resetTimer()
    return () => clearInterval(timerRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDot = (i) => { setIndex(i); resetTimer() }

  return (
    <>
      <div className="carousel">
        {TESTIMONIALS.map((t, i) => (
          <div key={t.name} className={`review${i === index ? ' is-active' : ''}`}>
            <div className="stars">★★★★★</div>
            <p className="quote">"{t.quote}"</p>
            <div className="review-footer">
              <div className="avatar">{t.initial}</div>
              <div>
                <div className="review-name">{t.name}</div>
                <div className="review-role">{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="dots">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            className={`dot${i === index ? ' is-active' : ''}`}
            onClick={() => handleDot(i)}
            aria-label={`Show review ${i + 1}`}
          />
        ))}
      </div>
    </>
  )
}

/* ── Animated Gorgias icon ── two overlapping rounded rects */
function GorgiasIcon() {
  return (
    <svg className="icon-svg" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Back chat bubble — lower-left biased, with tail at bottom */}
      <path
        className="s-back"
        pathLength="1"
        strokeLinejoin="round"
        d="M15 8
           H54 Q66 8 66 20
           V60 Q66 72 54 72
           H34 L20 86 V72
           H15 Q3 72 3 60
           V20 Q3 8 15 8 Z"
      />
      {/* Front rounded rect — upper-right biased */}
      <rect
        className="s-front"
        x="30" y="24" width="63" height="63" rx="12"
        pathLength="1"
      />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

const INTRO_KEY = 'gorgias_qa_intro_seen'

export default function LoginPage() {
  const { signIn } = useAuth()

  /* ── intro animation ── */
  const [introState, setIntroState] = useState(() =>
    sessionStorage.getItem(INTRO_KEY) ? 'done' : 'showing'
  )
  const [introPulse, setIntroPulse] = useState(false)

  useEffect(() => {
    if (introState !== 'showing') return
    // pulse starts just after everything animates in (~1.6s)
    const t1 = setTimeout(() => setIntroPulse(true), 1600)
    // dismiss shortly after all animations finish (~2.1s)
    const t2 = setTimeout(() => {
      sessionStorage.setItem(INTRO_KEY, '1')
      setIntroState('hiding')
    }, 2200)
    const t3 = setTimeout(() => setIntroState('done'), 2700)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [introState])

  /* ── form state ── */
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [view,       setView]       = useState('login')   // 'login' | 'forgot'
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent,  setResetSent]  = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  const handleSignIn = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true); setError('')
    const { error: err } = await signIn(email.trim(), password)
    if (err) { setError(err.message); setLoading(false) }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (resetLoading) return
    setResetLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: window.location.origin,
    })
    if (err) {
      setError(err.message)
    } else {
      setResetSent(true)
    }
    setResetLoading(false)
  }

  return (
    <>
      {/* ── Intro overlay ── */}
      {introState !== 'done' && (
        <div className={`intro-overlay${introState === 'hiding' ? ' hidden' : ''}`}>
          <div className="intro-glow" />
          <div className="intro-logo-wrap">
            <GorgiasIcon />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="intro-letters">
                  {'Gorgias'.split('').map((ch, i) => <span key={i}>{ch}</span>)}
                </div>
                <span className="qa-badge">QA</span>
              </div>
            </div>
          </div>
          <p className="intro-subtitle">Quality Assurance Platform</p>
        </div>
      )}

      {/* ── Main login page ── */}
      <div className="login-page">
        <div className="login-card">
          {/* Left panel — testimonials (hidden on small screens) */}
          <div className={`login-left${introState !== 'showing' ? ' visible' : ''}`}>
            <div className="login-left-glow" />
            <div className="login-left-inner">
              <div className="login-left-header">
                <div className="page-wordmark">
                  <span className="page-wordmark__name">Gorgias</span>
                  <span className="page-wordmark__badge">QA</span>
                </div>
                <p className="login-left-tagline">Internal Quality<br />Control Application</p>
              </div>
              <TestimonialCarousel />
            </div>
          </div>

          {/* Right panel — login form */}
          <div className={`login-container${introState !== 'showing' ? ' visible' : ''}`}>

            {/* Logo — shown only on small screens, where the left panel is hidden */}
            <div className="page-logo">
              <div className="page-wordmark">
                <span className="page-wordmark__name">Gorgias</span>
                <span className="page-wordmark__badge">QA</span>
              </div>
            </div>
            <p className="page-tagline">Quality Assurance Platform</p>

            <div className="form-header">
              <h1 className="form-h1">{view === 'login' ? 'Welcome back' : 'Reset password'}</h1>
              <p className="form-sub">
                {view === 'login' ? 'Sign in to your reviewer workspace.' : "We'll email you a secure link."}
              </p>
            </div>

            <div className="form-card">
              {view === 'login' ? (
                <>
                  <form onSubmit={handleSignIn} style={{ display: 'contents' }}>
                    <div className="lp-field">
                      <label htmlFor="lp-email">Email</label>
                      <div className="lp-field-box">
                        <MailIcon />
                        <input
                          id="lp-email"
                          type="email"
                          placeholder="you@company.com"
                          value={email}
                          required
                          autoFocus
                          autoComplete="email"
                          onChange={e => setEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="lp-field">
                      <label htmlFor="lp-password">Password</label>
                      <div className="lp-field-box">
                        <LockIcon />
                        <input
                          id="lp-password"
                          type={showPass ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={password}
                          required
                          autoComplete="current-password"
                          onChange={e => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          className="eye-btn"
                          aria-label={showPass ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPass(v => !v)}
                        >
                          {showPass ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="forgot-row">
                      <a href="#" onClick={e => { e.preventDefault(); setView('forgot'); setError('') }}>
                        Forgot password?
                      </a>
                    </div>

                    <p className="lp-error">{error}</p>

                    <button type="submit" className="btn-signin" disabled={loading || !email || !password}>
                      {loading ? (
                        <>
                          <span className="lp-spinner" />
                          Signing in…
                        </>
                      ) : 'Sign in'}
                    </button>
                  </form>

                  <div className="secure-row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Secured by Supabase Auth</span>
                  </div>
                </>
              ) : (
                /* ── Forgot password view ── */
                <>
                  <button className="back-link" onClick={() => { setView('login'); setResetSent(false); setResetEmail('') }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Back to sign in
                  </button>

                  <p className="reset-note">
                    Enter your email address and we'll send you a link to reset your password.
                  </p>

                  {resetSent ? (
                    <p className="success-msg">
                      ✓ Check your inbox — a reset link is on its way.
                    </p>
                  ) : (
                    <form onSubmit={handleReset} style={{ display: 'contents' }}>
                      <div className="lp-field">
                        <label htmlFor="lp-reset-email">Email</label>
                        <div className="lp-field-box">
                          <MailIcon />
                          <input
                            id="lp-reset-email"
                            type="email"
                            placeholder="you@company.com"
                            value={resetEmail}
                            required
                            autoFocus
                            onChange={e => setResetEmail(e.target.value)}
                          />
                        </div>
                      </div>
                      <button type="submit" className="btn-signin" disabled={resetLoading || !resetEmail}>
                        {resetLoading ? (
                          <>
                            <span className="lp-spinner" />
                            Sending…
                          </>
                        ) : 'Send reset link'}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="page-footer">
              <span className="env-label">Production Environment</span>
              <div className="env-dot-row">
                <span className="env-dot" />
                <span className="env-sub">v1.0 · Gorgias QA</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
