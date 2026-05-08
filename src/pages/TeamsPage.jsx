import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'

const SORT_OPTIONS = [
  { id: 'avg',    label: 'Avg score' },
  { id: 'agents', label: 'Agents'    },
  { id: 'name',   label: 'Name'      },
]

function scoreColor(avg) {
  if (avg === null) return '#555'
  return avg >= 80 ? '#10b981' : avg >= 60 ? '#f59e0b' : '#ef4444'
}

function TeamCard({ team, agents, scores, onEdit, onDelete, canEdit, getAgentScores, avgScore }) {
  const [editing,       setEditing]       = useState(false)
  const [name,          setName]          = useState(team.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded,      setExpanded]      = useState(false)

  const pass   = scores.filter(s => s.effectiveVerdict === 'PASS').length
  const review = scores.filter(s => s.effectiveVerdict === 'NEEDS_REVIEW').length
  const fail   = scores.filter(s => s.effectiveVerdict === 'FAIL').length
  const avg    = scores.length ? +(scores.reduce((s, x) => s + x.effectiveScore, 0) / scores.length).toFixed(1) : null
  const passRate = scores.length ? Math.round((pass / scores.length) * 100) : null

  const save = () => { if (name.trim()) onEdit(team.id, name.trim()); setEditing(false) }

  return (
    <div className="rounded-2xl" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          {editing ? (
            <input autoFocus value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              onBlur={save}
              className="rounded-lg px-3 py-1 text-sm text-white outline-none flex-1 mr-3"
              style={{ background: '#1e1e1e', border: '1px solid #FF9780' }}
            />
          ) : (
            <h3 className="text-white font-semibold">{team.name}</h3>
          )}
          <div className="flex items-center gap-3 shrink-0">
            {canEdit && !confirmDelete && <button onClick={() => setEditing(true)} className="text-xs transition-colors" style={{ color: '#aaa' }} onMouseEnter={e => e.target.style.color='#fff'} onMouseLeave={e => e.target.style.color='#aaa'}>Edit</button>}
            {canEdit && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)} className="text-xs" style={{ color: '#aaa' }}
                onMouseEnter={e => e.target.style.color = '#ef4444'}
                onMouseLeave={e => e.target.style.color = '#aaa'}>Delete</button>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#ef4444' }}>Delete team?</span>
                <button onClick={() => onDelete(team.id)} className="text-xs font-medium px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs g-btn-ghost">Cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <span style={{ color: '#aaa' }}>{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
          {scores.length > 0 ? (
            <>
              <span style={{ color: '#aaa' }}>{scores.length} tickets</span>
              <span className="font-bold" style={{ color: scoreColor(avg) }}>avg {avg}/100</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                {passRate}% pass
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span style={{ color: '#10b981' }}>{pass} pass</span>
                <span style={{ color: '#f59e0b' }}>{review} review</span>
                <span style={{ color: '#ef4444' }}>{fail} fail</span>
              </div>
            </>
          ) : <span style={{ color: '#aaa' }} className="text-xs">No tickets scored yet</span>}
        </div>

        {/* Expand toggle */}
        {agents.length > 0 && (
          <button onClick={() => setExpanded(v => !v)}
            className="mt-3 flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: '#aaa' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#aaa'}>
            <span style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
            {expanded ? 'Hide agents' : 'Show agents'}
          </button>
        )}
      </div>

      {/* Expanded agent list */}
      {expanded && agents.length > 0 && (
        <div className="border-t px-5 pb-4" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <div className="flex flex-col divide-y" style={{ '--tw-divide-opacity': 1 }}>
            {agents.map(agent => {
              const aScores  = getAgentScores(agent.id)
              const aAvg     = avgScore(aScores)
              const aPass    = aScores.filter(s => s.effectiveVerdict === 'PASS').length
              const aPassPct = aScores.length ? Math.round((aPass / aScores.length) * 100) : null
              return (
                <div key={agent.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: '#1e1e1e', color: '#FF9780' }}>
                      {agent.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-sm" style={{ color: '#ccc' }}>{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {aScores.length > 0 ? (
                      <>
                        <span style={{ color: '#666' }}>{aScores.length} tickets</span>
                        <span className="font-medium" style={{ color: scoreColor(aAvg) }}>{aAvg}/100</span>
                        {aPassPct !== null && (
                          <span style={{ color: '#10b981' }}>{aPassPct}% pass</span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: '#aaa' }}>No scores yet</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TeamsPage() {
  const { teams, agents, addTeam, updateTeam, deleteTeam, getTeamScores, getAgentScores, avgScore } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)
  const [sort,    setSort]    = useState('avg')

  const handleAdd = async () => {
    if (!newName.trim()) return
    await addTeam(newName.trim())
    setNewName(''); setAdding(false)
    toast.success('Team created')
  }

  const handleDelete = async (id) => {
    await deleteTeam(id)
    toast.success('Team deleted')
  }

  const sortedTeams = [...teams].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'agents') {
      return agents.filter(x => x.team_id === b.id).length - agents.filter(x => x.team_id === a.id).length
    }
    // avg — teams with no scores go to bottom
    const aAvg = avgScore(getTeamScores(a.id)) ?? -1
    const bAvg = avgScore(getTeamScores(b.id)) ?? -1
    return bAvg - aAvg
  })

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Teams</h1>
          <p className="text-sm mt-0.5" style={{ color: '#888' }}>Group agents and track collective performance</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort toggle */}
          {teams.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#aaa' }}>Sort by</span>
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)' }}>
                {SORT_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => setSort(o.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={sort === o.id ? { background: '#1e1e1e', color: '#fff' } : { color: '#aaa' }}
                    onMouseEnter={e => { if (sort !== o.id) e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { if (sort !== o.id) e.currentTarget.style.color = '#aaa' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {isAdmin && <button onClick={() => setAdding(true)} className="g-btn-primary text-sm px-4 py-2 rounded-xl">+ Add Team</button>}
        </div>
      </div>

      {adding && (
        <div className="rounded-2xl p-5 mb-4 flex items-center gap-3" style={{ background: '#0f0f0f', border: '1px solid rgba(255,147,128,0.3)' }}>
          <input autoFocus placeholder="Team name..."
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#444] g-input"
          />
          <button onClick={handleAdd} className="g-btn-primary text-sm px-4 py-2.5 rounded-xl">Save</button>
          <button onClick={() => setAdding(false)} className="text-sm px-3 py-2.5 g-btn-ghost">Cancel</button>
        </div>
      )}

      {teams.length === 0 && !adding ? (
        <div className="text-center py-20" style={{ color: '#555' }}>
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm">No teams yet. Add one to start grouping agents.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedTeams.map(team => (
            <TeamCard key={team.id} team={team}
              agents={agents.filter(a => a.team_id === team.id)}
              scores={getTeamScores(team.id)}
              onEdit={updateTeam}
              onDelete={handleDelete}
              canEdit={isAdmin}
              getAgentScores={getAgentScores}
              avgScore={avgScore}
            />
          ))}
        </div>
      )}
    </div>
  )
}
