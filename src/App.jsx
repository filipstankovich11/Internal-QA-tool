import { useState, lazy, Suspense, Component } from 'react'
import { AppProvider }    from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import NavBar            from './components/NavBar'
import LoginPage         from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#070707' }}>
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
const BatchPage        = lazy(() => import('./pages/BatchPage'))
const AgentsPage       = lazy(() => import('./pages/AgentsPage'))
const AgentProfilePage = lazy(() => import('./pages/AgentProfilePage'))
const InboxPage        = lazy(() => import('./pages/InboxPage'))
const CoachingPage     = lazy(() => import('./pages/CoachingPage'))
const TeamsPage        = lazy(() => import('./pages/TeamsPage'))
const RubricPage       = lazy(() => import('./pages/RubricPage'))
const ReviewQueuePage  = lazy(() => import('./pages/ReviewQueuePage'))

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center" style={{ background: '#070707' }}>
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
    case 'batch':     return <BatchPage />
    case 'agents':    return role === 'agent' ? <AgentProfilePage /> : <AgentsPage />
    case 'inbox':     return <InboxPage />
    case 'coaching':  return <CoachingPage />
    case 'teams':     return <TeamsPage />
    case 'rubric':    return <RubricPage />
    default:          return <ScorePage />
  }
}

function AppShell() {
  const { user, loading, isPasswordReset, role } = useAuth()
  const [page, setPage] = useState('dashboard')

  if (loading) return <Spinner />
  if (isPasswordReset) return <ResetPasswordPage />
  if (!user) return <LoginPage />

  return (
    <AppProvider>
      <ToastProvider>
        <div className="min-h-screen" style={{ background: '#070707' }}>
          <NavBar page={page} setPage={setPage} />
          <ErrorBoundary>
            <Suspense fallback={<Spinner />}>
              <div key={page} className="page-enter">
                <Router page={page} role={role} />
              </div>
            </Suspense>
          </ErrorBoundary>
        </div>
      </ToastProvider>
    </AppProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
