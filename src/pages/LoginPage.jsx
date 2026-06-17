import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import './LoginPage.css'

const TESTIMONIALS = [
  {
    quote: "Just got 100% on my latest ticket! The rubric finally made it click — I knew exactly what a perfect response looked like.",
    name: "Filip",
    role: "Support Agent · 100% score",
    rating: 5,
  },
  {
    quote: "100% on a billing dispute ticket I thought was impossible to nail. The coaching notes made all the difference.",
    name: "Katarina",
    role: "Support Agent · 100% score",
    rating: 5,
  },
  {
    quote: "First perfect score! Seeing the breakdown after every ticket helps me know exactly where to improve next time.",
    name: "Ognjen",
    role: "Support Agent · 100% score",
    rating: 5,
  },
]

function Stars({ count }) {
  return (
    <div className="tc-stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i < count ? '#FF9780' : 'none'} stroke="#FF9780" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  )
}

function TestimonialCarousel() {
  const [index, setIndex] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const [direction, setDirection] = useState('up')
  const timerRef = useRef(null)

  const goTo = (next, dir = 'up') => {
    setDirection(dir)
    setIndex(next)
    setAnimKey(k => k + 1)
  }

  const advance = useRef(() => {})
  advance.current = () => {
    goTo((index + 1) % TESTIMONIALS.length, 'up')
  }

  useEffect(() => {
    timerRef.current = setInterval(() => advance.current(), 3000)
    return () => clearInterval(timerRef.current)
  }, [])

  const handleDot = (i) => {
    if (i === index) return
    clearInterval(timerRef.current)
    goTo(i, i > index ? 'up' : 'down')
    timerRef.current = setInterval(() => advance.current(), 3000)
  }

  const t = TESTIMONIALS[index]
  const initials = t.name.split(' ').map(w => w[0]).join('')

  return (
    <div className="tc-wrap">
      <div className="tc-card">
        <div
          key={animKey}
          className={`tc-content tc-slide-${direction}`}
        >
          <Stars count={t.rating} />
          <p className="tc-quote">"{t.quote}"</p>
          <div className="tc-author">
            <div className="tc-avatar">{initials}</div>
            <div>
              <div className="tc-name">{t.name}</div>
              <div className="tc-role">{t.role}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="tc-dots">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            className={`tc-dot${i === index ? ' active' : ''}`}
            onClick={() => handleDot(i)}
            aria-label={`Go to testimonial ${i + 1}`}
          />
        ))}
      </div>
    </div>
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

const INTRO_KEY = 'gorgias_qa_intro_seen'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  )
}

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth()

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
        {/* Left panel — testimonials (hidden on small screens) */}
        <div className={`login-left${introState !== 'showing' ? ' visible' : ''}`}>
          <div className="login-left-inner">
            <div className="login-left-header">
              <div className="page-wordmark" style={{ marginBottom: 8 }}>
                <span className="page-wordmark__name">Gorgias</span>
                <span className="page-wordmark__badge">QA</span>
              </div>
              <p className="login-left-tagline">Internal quality control application</p>
            </div>
            <TestimonialCarousel />
          </div>
        </div>

        {/* Right panel — login form */}
        <div className={`login-container${introState !== 'showing' ? ' visible' : ''}`}>

          {/* Logo */}
          <div className="page-logo">
            <div className="page-wordmark">
              <span className="page-wordmark__name">Gorgias</span>
              <span className="page-wordmark__badge">QA</span>
            </div>
          </div>
          <p className="page-tagline">Quality Assurance Platform</p>

          {/* Card */}
          <div className="form-card">
            {view === 'login' ? (
              <>
                {/* Google SSO */}
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="btn-google"
                >
                  <GoogleIcon />
                  Sign in with Google
                </button>

                <div className="divider-row">
                  <span className="divider-line" />
                  <span className="divider-text">or</span>
                  <span className="divider-line" />
                </div>

                <form onSubmit={handleSignIn} style={{ display: 'contents' }}>
                  <div className="lp-field">
                    <label htmlFor="lp-email">Email</label>
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

                  <div className="lp-field">
                    <label htmlFor="lp-password">Password</label>
                    <div className="input-wrap">
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
    </>
  )
}
