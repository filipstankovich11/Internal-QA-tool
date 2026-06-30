import { useState, useEffect, lazy, Suspense, Component } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import NavigationContext from './context/NavigationContext'
import Sidebar           from './components/Sidebar'
import CommandPalette    from './components/CommandPalette'
import LoginPage         from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#161616' }}>
        <div className="text-center px-6 max-w-md">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-white font-semibold mb-2">Something went wrong</p>
          <p className="text-sm mb-6" style={{ color: '#777' }}>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}
            className="g-btn-primary text-sm px-5 py-2 rounded-xl">
            Try again
          </button>
        </div>
      </div>
    )
  }
}

const DashboardPage    = lazy(() => import('./pages/DashboardPage'))
const ScorePage        = lazy(() => import('./pages/ScorePage'))
const AgentsPage       = lazy(() => import('./pages/AgentsPage'))
const AgentProfilePage = lazy(() => import('./pages/AgentProfilePage'))
const InboxPage        = lazy(() => import('./pages/InboxPage'))
const CoachingPage     = lazy(() => import('./pages/CoachingPage'))
const TeamsPage        = lazy(() => import('./pages/TeamsPage'))
const RubricPage       = lazy(() => import('./pages/RubricPage'))
const ReviewQueuePage  = lazy(() => import('./pages/ReviewQueuePage'))
const MyQueuePage      = lazy(() => import('./pages/MyQueuePage'))
const ScoreFormPage    = lazy(() => import('./pages/ScoreFormPage'))
const ScoreModal       = lazy(() => import('./components/ScoreModal'))

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center" style={{ background: '#161616' }}>
    <svg className="animate-spin h-6 w-6" style={{ color: '#FF9780' }} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  </div>
)

function Router({ page, role }) {
  switch (page) {
    case 'dashboard': return <DashboardPage />
    case 'review':    return <ReviewQueuePage />
    case 'myqueue':   return <MyQueuePage />
    case 'agents':    return role === 'agent' ? <AgentProfilePage /> : <AgentsPage />
    case 'inbox':     return <InboxPage />
    case 'coaching':  return <CoachingPage />
    case 'teams':     return <TeamsPage />
    case 'rubric':       return <RubricPage />
    default:             return <ScorePage />
  }
}

// Main content area — swaps the routed page for the full-page score detail when
// a score is open (the review queue opens its own modal instead). Navigating
// to another page closes the detail.
function MainContent({ page, role }) {
  const { viewingScore, closeScore, scoreToEdit, closeScoreEditor } = useApp()
  useEffect(() => { closeScore(); closeScoreEditor() }, [page]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner />}>
        {scoreToEdit ? (
          <ScoreFormPage initialScore={scoreToEdit}
            onClose={closeScoreEditor}
            onSaved={() => { closeScoreEditor(); closeScore() }} />
        ) : viewingScore ? (
          <ScoreModal score={viewingScore.score} actions={viewingScore.actions} variant="page" onClose={closeScore} />
        ) : (
          <div key={page} className="page-enter">
            <Router page={page} role={role} />
          </div>
        )}
      </Suspense>
    </ErrorBoundary>
  )
}

function AppShell() {
  const { user, loading, isPasswordReset, role, canScore, isAdmin } = useAuth()
  const [page, setPage] = useState('dashboard')

  // Role guard: the Router renders whatever `page` holds, and `page` survives a
  // role/account switch. If the current page isn't permitted for this role
  // (e.g. an agent landing on a scorer-only page like Calibration), fall back
  // to the dashboard. Mirrors the access rules in the Sidebar's MENU_TABS.
  const isAgent = role === 'agent'
  useEffect(() => {
    // Wait until auth has settled and the role is known — otherwise the transient
    // pre-profile state (or a token refresh) would bounce a permitted user off their page.
    if (loading || !role) return
    const blocked =
      (['score', 'review', 'teams'].includes(page) && !canScore) ||
      (['myqueue', 'rubric'].includes(page) && !isAdmin) ||
      (['inbox', 'coaching'].includes(page) && !isAgent)
    if (blocked) setPage('dashboard')
  }, [page, canScore, isAdmin, isAgent, loading, role])

  if (loading) return <Spinner />
  if (isPasswordReset) return <ResetPasswordPage />
  if (!user) return <LoginPage />

  return (
    <NavigationContext.Provider value={setPage}>
    <AppProvider>
      <ToastProvider>
        <div className="flex min-h-screen">
          <CommandPalette />
          <Sidebar page={page} setPage={setPage} />
          <div className="flex-1 min-w-0">
            <MainContent page={page} role={role} />
          </div>
        </div>
      </ToastProvider>
    </AppProvider>
    </NavigationContext.Provider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
