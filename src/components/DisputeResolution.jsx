import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { gradeColor, VERDICT_COLOR, VERDICT_BG, VERDICT_LABEL, VERDICTS } from '../lib/verdict'

function relTime(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// Resolve a disputed score: review the thread, reply, then uphold or revise.
export default function DisputeResolution({ score, onClose, onResolved }) {
  const { clearDispute, overrideScore } = useApp()
  const { user, profile, role } = useAuth()
  const toast = useToast()
  const sid = score.scoreId || score.id

  const [thread, setThread]   = useState([])
  const [reply, setReply]     = useState('')
  const [posting, setPosting] = useState(false)
  const [mode, setMode]       = useState(null)     // null | 'revise'
  const [revScore, setRevScore]     = useState(Math.round(score.effectiveScore ?? 0))
  const [revVerdict, setRevVerdict] = useState(score.effectiveVerdict || 'NEEDS_REVIEW')
  const [working, setWorking] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('dispute_messages').select('*').eq('score_id', sid).order('created_at')
    setThread(data || [])
  }, [sid])
  useEffect(() => { load() }, [load])

  const author = () => ({ author_id: user?.id, author_name: profile?.name || user?.email || 'Reviewer', author_role: role })
  const postMessage = async (body) => supabase.from('dispute_messages').insert({ score_id: sid, body, ...author() })

  const post = async () => {
    if (!reply.trim()) return
    setPosting(true)
    const { error } = await postMessage(reply.trim())
    setPosting(false)
    if (error) { toast.error('Failed to post reply'); return }
    setReply(''); load()
  }

  const uphold = async () => {
    setWorking(true)
    await postMessage('✓ Dispute reviewed — the original score stands.')
    const ok = await clearDispute(sid)
    setWorking(false)
    if (ok) { toast.success('Dispute upheld'); onResolved?.(); onClose() }
    else toast.error('Failed to resolve')
  }

  const revise = async () => {
    setWorking(true)
    await overrideScore(sid, { verdict: revVerdict, score: revScore, note: reply.trim() || 'Revised after dispute review' })
    await postMessage(`Score revised to ${revScore}/100 · ${VERDICT_LABEL[revVerdict]}.${reply.trim() ? ` ${reply.trim()}` : ''}`)
    const ok = await clearDispute(sid)
    setWorking(false)
    if (ok) { toast.success('Score revised'); onResolved?.(); onClose() }
    else toast.error('Failed to revise')
  }

  const vc = VERDICT_COLOR[score.effectiveVerdict]
  const vb = VERDICT_BG[score.effectiveVerdict]

  // The agent's original dispute note is message #1
  const opening = score.disputeNote ? [{ id: 'opening', author_name: 'Agent', author_role: 'agent', body: score.disputeNote, created_at: score.disputeAt }] : []
  const messages = [...opening, ...thread]

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(26,30,35,.35)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden modal-enter" style={{ background: '#fff', border: '1px solid #EEEEEE', boxShadow: '0 24px 64px rgba(0,0,0,.22)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F0ECE9' }}>
          <h2 className="font-semibold" style={{ color: '#1A1E23', fontFamily: "'Inter Tight'" }}>Resolve dispute</h2>
          <button onClick={onClose} className="text-lg leading-none" style={{ color: 'rgba(26,30,35,.45)' }}
            onMouseEnter={e => e.target.style.color = '#1A1E23'} onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.45)'}>✕</button>
        </div>

        <div className="grid md:grid-cols-2" style={{ maxHeight: '78vh' }}>
          {/* Left — disputed score */}
          <div className="p-6 flex flex-col gap-4" style={{ borderRight: '1px solid #F0ECE9' }}>
            <div className="flex items-center gap-3">
              <a href={gorgiasTicketUrl(score.ticketId)} target="_blank" rel="noreferrer" className="font-mono text-sm font-medium" style={{ color: '#B84A2E' }}>#{score.ticketId}</a>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ color: vc, background: vb }}>{VERDICT_LABEL[score.effectiveVerdict] || score.effectiveVerdict}</span>
            </div>
            <p className="text-sm" style={{ color: 'rgba(26,30,35,.72)' }}>{score.fullScore?.ticket_subject || '—'}</p>
            <div className="rounded-xl p-4 text-center" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
              <p className="tabular-nums" style={{ fontSize: 32, fontFamily: "'Inter Tight'", fontWeight: 600, color: gradeColor(score.effectiveScore) }}>{score.effectiveScore?.toFixed(0)}<span className="text-sm" style={{ color: 'rgba(26,30,35,.45)' }}>/100</span></p>
              <p className="text-xs mt-1" style={{ color: 'rgba(26,30,35,.5)' }}>Disputed score</p>
            </div>
            {score.fullScore?.summary && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(26,30,35,.45)' }}>Summary</p>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(26,30,35,.6)' }}>{score.fullScore.summary}</p>
              </div>
            )}
          </div>

          {/* Right — thread + decision */}
          <div className="flex flex-col" style={{ maxHeight: '78vh' }}>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(26,30,35,.45)' }}>Discussion</p>
              {messages.map((m, i) => {
                const isAgent = m.author_role === 'agent'
                return (
                  <div key={m.id || i} className="rounded-xl px-3.5 py-2.5" style={{ background: isAgent ? '#FBF7F3' : '#FFF4F1', border: `1px solid ${isAgent ? '#F0ECE9' : '#FFE0D6'}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold" style={{ color: '#1A1E23' }}>{m.author_name}{!isAgent && <span className="ml-1.5 font-normal" style={{ color: 'rgba(26,30,35,.45)' }}>· reviewer</span>}</span>
                      {m.created_at && <span className="text-xs" style={{ color: 'rgba(26,30,35,.45)' }}>{relTime(m.created_at)}</span>}
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{m.body}</p>
                  </div>
                )
              })}
            </div>

            {/* Reply + decision */}
            <div className="p-5" style={{ borderTop: '1px solid #F0ECE9' }}>
              <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2}
                placeholder="Reply to the agent…"
                className="g-input w-full rounded-xl px-3 py-2.5 text-sm resize-none mb-2" style={{ color: '#1A1E23' }} />
              <div className="flex items-center gap-2">
                <button onClick={post} disabled={!reply.trim() || posting}
                  className="text-xs px-3 py-2 rounded-lg" style={{ color: 'rgba(26,30,35,.72)', border: '1px solid #E7E3DF', background: '#fff', opacity: !reply.trim() || posting ? 0.5 : 1 }}>
                  {posting ? 'Posting…' : 'Reply'}
                </button>
                <div className="flex-1" />
                {mode !== 'revise' ? (
                  <>
                    <button onClick={() => setMode('revise')} disabled={working}
                      className="text-xs px-3 py-2 rounded-lg font-medium" style={{ color: '#B84A2E', background: '#FFF4F1', border: '1px solid #FFE0D6' }}>Revise…</button>
                    <button onClick={uphold} disabled={working}
                      className="g-btn-primary text-xs px-4 py-2 rounded-lg font-medium" style={{ opacity: working ? 0.6 : 1 }}>
                      {working ? 'Working…' : 'Uphold score'}
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" max="100" value={revScore}
                      onChange={e => setRevScore(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                      className="no-spinner w-14 text-center text-sm rounded-lg px-2 py-2 g-input" style={{ color: '#1A1E23' }} />
                    <select value={revVerdict} onChange={e => setRevVerdict(e.target.value)}
                      className="text-xs rounded-lg px-2 py-2 g-input" style={{ color: '#1A1E23' }}>
                      {VERDICTS.map(v => <option key={v} value={v}>{VERDICT_LABEL[v]}</option>)}
                    </select>
                    <button onClick={revise} disabled={working}
                      className="g-btn-primary text-xs px-4 py-2 rounded-lg font-medium" style={{ opacity: working ? 0.6 : 1 }}>
                      {working ? 'Saving…' : 'Save revision'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
