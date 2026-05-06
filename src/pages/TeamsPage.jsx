import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'

function TeamCard({ team, agents, scores, onEdit, onDelete, canEdit }) {
  const [editing,        setEditing]        = useState(false)
  const [name,           setName]           = useState(team.name)
  const [confirmDelete,  setConfirmDelete]  = useState(false)

  const pass   = scores.filter(s => s.effectiveVerdict === 'PASS').length
  const review = scores.filter(s => s.effectiveVerdict === 'NEEDS_REVIEW').length
  const fail   = scores.filter(s => s.effectiveVerdict === 'FAIL').length
  const avg    = scores.length ? (scores.reduce((s, x) => s + x.effectiveScore, 0) / scores.length).toFixed(1) : null
  const avgColor = avg ? (avg >= 80 ? '#10b981' : avg >= 60 ? '#f59e0b' : '#ef4444') : '#555'

  const save = () => { if (name.trim()) onEdit(team.id, name.trim()); setEditing(false) }

  return (
    <div className="rounded-2xl p-5" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start justify-between mb-4">
        {editing ? (
          <input autoFocus value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') save(); if (e.key==='Escape') setEditing(false) }}
            onBlur={save}
            className="rounded-lg px-3 py-1 text-sm text-white outline-none flex-1 mr-3"
            style={{ background: '#1e1e1e', border: '1px solid #FF9780' }}
          />
        ) : (
          <h3 className="text-white font-semibold">{team.name}</h3>
        )}
        <div className="flex items-center gap-3 shrink-0">
          {canEdit && !confirmDelete && <button onClick={() => setEditing(true)} className="text-xs transition-colors g-btn-ghost">Edit</button>}
          {canEdit && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} className="text-xs" style={{ color: '#777' }}
              onMouseEnter={e=>e.target.style.color='#ef4444'} onMouseLeave={e=>e.target.style.color='#555'}>Delete</button>
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

      <div className="flex items-center gap-4 flex-wrap text-sm">
        <span style={{ color: '#888' }}>{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
        {scores.length > 0 ? (
          <>
            <span style={{ color: '#666' }}>{scores.length} tickets</span>
            <span className="font-bold" style={{ color: avgColor }}>avg {avg}/100</span>
            <div className="flex items-center gap-3 text-xs">
              <span style={{ color: '#10b981' }}>{pass} pass</span>
              <span style={{ color: '#f59e0b' }}>{review} review</span>
              <span style={{ color: '#ef4444' }}>{fail} fail</span>
            </div>
          </>
        ) : <span style={{ color: '#666' }} className="text-xs">No tickets scored yet</span>}
      </div>

      {agents.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agents.map(a => (
            <span key={a.id} className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#888', background: '#1a1a1a' }}>{a.name}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TeamsPage() {
  const { teams, agents, addTeam, updateTeam, deleteTeam, getTeamScores } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)

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

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Teams</h1>
          <p className="text-sm mt-0.5" style={{ color: '#888' }}>Group agents and track collective performance</p>
        </div>
        {isAdmin && <button onClick={() => setAdding(true)} className="g-btn-primary text-sm px-4 py-2 rounded-xl">+ Add Team</button>}
      </div>

      {adding && (
        <div className="rounded-2xl p-5 mb-4 flex items-center gap-3" style={{ background: '#0f0f0f', border: '1px solid rgba(255,147,128,0.3)' }}>
          <input autoFocus placeholder="Team name..."
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') handleAdd(); if (e.key==='Escape') setAdding(false) }}
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
          {teams.map(team => (
            <TeamCard key={team.id} team={team}
              agents={agents.filter(a => a.team_id === team.id)}
              scores={getTeamScores(team.id)}
              onEdit={updateTeam} onDelete={handleDelete} canEdit={isAdmin} />
          ))}
        </div>
      )}
    </div>
  )
}
