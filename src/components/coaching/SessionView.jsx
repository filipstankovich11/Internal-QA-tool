import { useState } from 'react'

/**
 * Coaching session detail (concept 2a, adapted) — destination of "Start
 * session" on the Coaching hub. Presentation + local editing; persistence
 * lives in the parent (save draft / mark complete callbacks).
 *
 * `session` shape mirrors the coaching_sessions row (agenda/action_items/
 * evidence as plain arrays). All edits are collected locally and handed back
 * via onSaveDraft(patch) / onComplete(patch). Navigation callbacks
 * (onOpenTicket/onOpenScorecard) also receive the current patch — opening a
 * score unmounts this view, so the parent needs it to save edits first.
 */

const ink = '#1A1E23'
const aiGradient = 'linear-gradient(135deg,#FF6B4A,#FF9780)'

const icon = (children, size = 15) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const AiIcon = ({ size = 12 }) => icon(<>
  <path d="M12 2l9 3.5-9 3.5-9-3.5z" />
  <path d="M21 5.5v5" />
  <circle cx="12" cy="15" r="6.5" />
  <path d="M12 8.5a9.4 9.4 0 0 0 0 13 9.4 9.4 0 0 0 0-13" />
  <path d="M5.5 15h13" />
</>, size)
const PlusIcon = () => icon(<><path d="M5 12h14" /><path d="M12 5v14" /></>)
const ArrowLeftIcon = () => icon(<><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>)
const EyeIcon = ({ off }) => icon(off
  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>, 13)
const ChevronRightIcon = () => icon(<polyline points="9 18 15 12 9 6" />, 14)

const STATUS_PILL = {
  fail:   { glyph: '✕', color: '#D14B3D', bg: '#FCE9E6' },
  review: { glyph: '~', color: '#C8841E', bg: '#FBEBD3' },
  pass:   { glyph: '✓', color: '#3B7DD8', bg: '#E4EEFA' },
}

const S = {
  card: { background: '#fff', border: '1px solid #EEEEEE', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' },
  sectionLabel: { font: "600 12px/1 'DM Sans'", letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(26,30,35,.5)' },
  btnPrimary: { height: 40, padding: '0 18px', background: '#FF9780', border: 'none', borderRadius: 8, font: "500 14px/1 'DM Sans'", color: ink, cursor: 'pointer' },
  btnGhost: { height: 40, padding: '0 16px', background: 'transparent', border: '1px solid #E7DED6', borderRadius: 8, font: "500 14px/1 'DM Sans'", color: 'rgba(26,30,35,.7)', cursor: 'pointer' },
  ticketPill: { font: "500 11px/1 'DM Sans'", color: '#B84A2E', background: '#fff', border: '1px solid #F4DDD7', padding: '6px 10px', borderRadius: 9999, cursor: 'pointer' },
  aiAvatar: (size) => ({ width: size, height: size, flex: 'none', borderRadius: 9999, background: aiGradient, color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }),
  inlineInput: { flex: 1, border: '1px solid #E1DCD7', borderRadius: 8, padding: '8px 11px', font: "400 13px/1.4 'DM Sans'", color: ink, outline: 'none', background: '#fff' },
}

function RichText({ text }) {
  const parts = (text || '').split('**')
  return <>{parts.map((p, i) => i % 2 === 1
    ? <b key={i} style={{ fontWeight: 600, color: ink }}>{p}</b>
    : <span key={i}>{p}</span>)}</>
}

export default function SessionView({
  session, agentName, agentInitial, agentBg, agentStats,
  readOnly = false,
  onBack, onSaveDraft, onComplete, onRedraft, onOpenTicket, onOpenScorecard, saving,
}) {
  const [notes, setNotes]           = useState(session.notes || '')
  const [agenda, setAgenda]         = useState(session.agenda || [])
  const [actionItems, setActionItems] = useState(session.action_items || [])
  const [visible, setVisible]       = useState(session.visible_to_agent ?? true)
  const [addingPoint, setAddingPoint]   = useState(false)
  const [addingAction, setAddingAction] = useState(false)
  const [pointText, setPointText]   = useState('')
  const [actionText, setActionText] = useState('')
  const [actionOwner, setActionOwner] = useState('agent')

  const firstName = (agentName || 'Agent').split(' ')[0]
  const patch = () => ({ notes, agenda, action_items: actionItems, visible_to_agent: visible })

  const toggleAction = (id) => {
    if (readOnly) return
    setActionItems(items => items.map(a => a.id === id ? { ...a, done: !a.done } : a))
  }
  const addPoint = () => {
    const t = pointText.trim()
    if (!t) { setAddingPoint(false); return }
    setAgenda(a => [...a, { id: crypto.randomUUID(), kind: 'issue', title: t, detail: '', tickets: [] }])
    setPointText(''); setAddingPoint(false)
  }
  const addAction = () => {
    const t = actionText.trim()
    if (!t) { setAddingAction(false); return }
    setActionItems(items => [...items, {
      id: crypto.randomUUID(), done: false, text: t,
      owner: actionOwner === 'agent' ? `${firstName} · open` : 'Lead · open',
    }])
    setActionText(''); setAddingAction(false)
  }

  return (
    <div>
      {/* Back */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, font: "500 13px/1 'DM Sans'", color: 'rgba(26,30,35,.55)', cursor: 'pointer', marginBottom: 16 }}
        onClick={onBack}>
        <ArrowLeftIcon />
        Coaching
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 9999, background: agentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', font: "600 18px/1 'Inter Tight'", color: ink, flex: 'none' }}>
            {agentInitial}
          </div>
          <div>
            <h1 style={{ font: "600 26px/1.1 'Inter Tight'", letterSpacing: '-0.02em', color: ink, margin: 0 }}>
              Session with {agentName}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
              <span style={{ font: "500 11px/1 'DM Sans'", color: session.status === 'completed' ? '#2F8F5B' : '#B84A2E', background: session.status === 'completed' ? '#E6F4EC' : '#FFEAE6', padding: '5px 9px', borderRadius: 9999, textTransform: 'capitalize' }}>
                {session.status}
              </span>
              <span style={{ font: "400 13px/1 'DM Sans'", color: 'rgba(26,30,35,.55)' }}>{session.origin}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            title={visible ? `${firstName} will see this session once completed — click to hide` : `Hidden from ${firstName} — click to make visible`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: "500 11px/1 'DM Sans'", color: visible ? 'rgba(26,30,35,.65)' : 'rgba(26,30,35,.45)', background: '#FBF7F3', border: '1px solid #F0ECE9', padding: '7px 11px', borderRadius: 9999, cursor: readOnly ? 'default' : 'pointer' }}
            onClick={() => !readOnly && setVisible(v => !v)}>
            <EyeIcon off={!visible} />
            {visible ? `Visible to ${firstName}` : `Hidden from ${firstName}`}
          </button>
          {!readOnly && (
            <>
              <button style={S.btnGhost} disabled={saving} onClick={() => onSaveDraft(patch())}>
                {saving ? 'Saving…' : 'Save draft'}
              </button>
              <button style={S.btnPrimary} disabled={saving} onClick={() => onComplete(patch())}>
                Mark complete
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* AI trend summary */}
          {session.ai_summary && (
            <div style={{ border: '1px solid #F4DDD7', background: 'linear-gradient(135deg,#FFF3EE,#FFF9F4)', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span style={S.aiAvatar(24)}><AiIcon /></span>
                <span style={{ font: "600 12px/1 'Inter Tight'", color: ink }}>Since last coaching</span>
              </div>
              <div style={{ font: "400 13px/1.6 'DM Sans'", color: 'rgba(26,30,35,.75)' }}>
                <RichText text={session.ai_summary} />
              </div>
            </div>
          )}

          {/* Agenda */}
          <div style={{ ...S.card, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={S.sectionLabel}>Agenda{session.agenda_source ? ` · ${session.agenda_source}` : ''}</span>
              {!readOnly && onRedraft && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: "500 12px/1 'DM Sans'", color: '#FF9780', cursor: 'pointer' }}
                  onClick={() => setAgenda(onRedraft())}>
                  <AiIcon size={14} />
                  Redraft
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {agenda.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', gap: 13, border: '1px solid #F0ECE9', borderRadius: 12, padding: '14px 16px' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 9999, background: item.kind === 'strength' ? '#E6F4EC' : '#FFEAE6', color: item.kind === 'strength' ? '#2F8F5B' : '#B84A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', font: "600 12px/1 'Inter Tight'", flex: 'none' }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "500 13.5px/1.35 'DM Sans'", color: ink }}>{item.title}</div>
                    {item.detail && (
                      <div style={{ font: "400 12px/1.5 'DM Sans'", color: 'rgba(26,30,35,.6)', marginTop: 4 }}>{item.detail}</div>
                    )}
                    {/* Ticket pills below the text — real ticket ids are long, and
                        beside the text they crush it into a one-word column */}
                    {(item.tickets || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {item.tickets.map((t) => (
                          <span key={t.scoreId || t.ticketId} style={S.ticketPill} onClick={() => onOpenTicket(t, patch())}>
                            #{t.ticketId}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {!readOnly && (
                    <button title="Remove talking point" onClick={() => setAgenda(a => a.filter(x => x.id !== item.id))}
                      style={{ border: 'none', background: 'transparent', color: 'rgba(26,30,35,.35)', cursor: 'pointer', alignSelf: 'flex-start', padding: 0, font: '400 13px/1 sans-serif' }}>✕</button>
                  )}
                </div>
              ))}
              {!readOnly && (addingPoint ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input autoFocus value={pointText} onChange={e => setPointText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addPoint(); if (e.key === 'Escape') setAddingPoint(false) }}
                    placeholder="Talking point…" style={S.inlineInput} />
                  <button style={{ ...S.btnPrimary, height: 36, padding: '0 14px', font: "500 13px/1 'DM Sans'" }} onClick={addPoint}>Add</button>
                </div>
              ) : (
                <button
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 38, background: 'transparent', border: '1.5px dashed #D8CFC7', borderRadius: 12, font: "500 13px/1 'DM Sans'", color: 'rgba(26,30,35,.55)', cursor: 'pointer' }}
                  onClick={() => setAddingPoint(true)}>
                  <PlusIcon />
                  Add talking point
                </button>
              ))}
            </div>
          </div>

          {/* Session notes */}
          <div style={{ ...S.card, padding: '20px 22px' }}>
            <div style={{ ...S.sectionLabel, marginBottom: 12 }}>Session notes</div>
            {readOnly ? (
              <p style={{ font: "400 13px/1.55 'DM Sans'", color: notes ? 'rgba(26,30,35,.75)' : 'rgba(26,30,35,.4)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {notes || 'No notes recorded.'}
              </p>
            ) : (
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="How did the conversation go? What did you agree on?"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E1DCD7', borderRadius: 10, padding: '13px 15px', minHeight: 76, font: "400 13px/1.55 'DM Sans'", color: ink, resize: 'vertical', outline: 'none', background: '#fff' }} />
            )}
          </div>

          {/* Action items */}
          <div style={{ ...S.card, padding: '20px 22px' }}>
            <div style={{ ...S.sectionLabel, marginBottom: 12 }}>
              Action items{visible ? ` · shared with ${firstName}` : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actionItems.map((a) => (
                <div key={a.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#FBF7F3', border: '1px solid #F0ECE9', borderRadius: 10, padding: '11px 14px', cursor: readOnly ? 'default' : 'pointer' }}
                  onClick={() => toggleAction(a.id)}>
                  <span style={{ width: 18, height: 18, border: a.done ? 'none' : '1.5px solid #C8B8AD', background: a.done ? '#FF9780' : 'transparent', borderRadius: 5, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: ink, font: "600 12px/1 'DM Sans'" }}>
                    {a.done ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, font: "400 13px/1.4 'DM Sans'", color: ink, textDecoration: a.done ? 'line-through' : 'none', opacity: a.done ? 0.55 : 1 }}>
                    {a.text}
                  </span>
                  <span style={{ font: "400 11px/1 'DM Sans'", color: 'rgba(26,30,35,.45)' }}>{a.owner}</span>
                </div>
              ))}
              {!readOnly && (addingAction ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input autoFocus value={actionText} onChange={e => setActionText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addAction(); if (e.key === 'Escape') setAddingAction(false) }}
                    placeholder="Action item…" style={S.inlineInput} />
                  <select value={actionOwner} onChange={e => setActionOwner(e.target.value)}
                    style={{ border: '1px solid #E1DCD7', borderRadius: 8, padding: '8px 8px', font: "400 12px/1 'DM Sans'", color: ink, background: '#fff', outline: 'none' }}>
                    <option value="agent">{firstName}</option>
                    <option value="lead">Lead</option>
                  </select>
                  <button style={{ ...S.btnPrimary, height: 36, padding: '0 14px', font: "500 13px/1 'DM Sans'" }} onClick={addAction}>Add</button>
                </div>
              ) : (
                <button
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 4px', background: 'transparent', border: 'none', font: "500 13px/1 'DM Sans'", color: '#FF9780', cursor: 'pointer', alignSelf: 'flex-start' }}
                  onClick={() => setAddingAction(true)}>
                  <PlusIcon />
                  Add action item
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Evidence tickets */}
          {(session.evidence || []).length > 0 && (
            <div style={{ ...S.card, padding: 20 }}>
              <div style={{ ...S.sectionLabel, marginBottom: 14 }}>Evidence tickets</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {session.evidence.map((t) => {
                  const pill = STATUS_PILL[t.status] || STATUS_PILL.review
                  return (
                    <div key={t.scoreId || t.ticketId}
                      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 10px', border: '1px solid #F0ECE9', borderRadius: 10, cursor: 'pointer' }}
                      onClick={() => onOpenTicket(t, patch())}>
                      <span style={{ font: "500 11px/1 'DM Sans'", color: pill.color, background: pill.bg, padding: '5px 8px', borderRadius: 9999, flex: 'none' }}>
                        {pill.glyph} {t.score}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "500 12.5px/1.3 'DM Sans'", color: '#B84A2E' }}>#{t.ticketId}</div>
                        <div style={{ font: "400 11px/1.3 'DM Sans'", color: 'rgba(26,30,35,.55)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.subject || '—'}
                        </div>
                      </div>
                      <span style={{ color: '#C8B8AD', flex: 'none', display: 'inline-flex' }}><ChevronRightIcon /></span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Agent stats */}
          {agentStats && (
            <div style={{ ...S.card, padding: 20 }}>
              <div style={{ ...S.sectionLabel, marginBottom: 14 }}>{agentStats.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ font: "600 30px/1 'Inter Tight'", color: agentStats.avgScoreColor }}>{agentStats.avgScore}</span>
                <span style={{ font: "400 12px/1 'DM Sans'", color: 'rgba(26,30,35,.5)' }}>{agentStats.sub}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
                {agentStats.dimensions.map((d) => (
                  <div key={d.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', font: "400 11px/1 'DM Sans'", color: 'rgba(26,30,35,.6)', marginBottom: 5 }}>
                      <span>{d.name}</span>
                      <span style={{ color: d.color, fontWeight: 600 }}>{d.score.toFixed(1)}</span>
                    </div>
                    <div style={{ height: 5, background: '#F0ECE9', borderRadius: 9999 }}>
                      <div style={{ height: '100%', width: `${d.pct}%`, background: d.color, borderRadius: 9999 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ font: "400 11px/1.4 'DM Sans'", marginTop: 16, paddingTop: 13, borderTop: '1px solid #F4F0ED', color: 'rgba(26,30,35,.5)' }}>
                Full scorecard on the{' '}
                <span style={{ color: '#FF9780', fontWeight: 500, cursor: 'pointer' }} onClick={() => onOpenScorecard(patch())}>
                  Agents page →
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
