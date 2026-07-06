import { useState } from 'react'

/**
 * Coaching modals (concepts 3a / 3b / 3c, adapted) — overlays launched from the
 * Coaching hub. Presentation + local editing; persistence lives in the parent.
 *
 * Adapted from the design handoff: hand-rolled lucide-style icons (no
 * lucide-react dependency), the app's coral palette instead of the purple AI
 * signature, and neutral pronouns throughout.
 */

const ink = '#1A1E23'
const aiGradient = 'linear-gradient(135deg,#FF6B4A,#FF9780)'

const icon = (children, size = 14) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const AiIcon = ({ size = 14 }) => icon(<>
  <path d="M12 2l9 3.5-9 3.5-9-3.5z" />
  <path d="M21 5.5v5" />
  <circle cx="12" cy="15" r="6.5" />
  <path d="M12 8.5a9.4 9.4 0 0 0 0 13 9.4 9.4 0 0 0 0-13" />
  <path d="M5.5 15h13" />
</>, size)
const MegaphoneIcon = ({ size = 14 }) => icon(<>
  <path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
</>, size)
const UsersIcon = ({ size = 13 }) => icon(<>
  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
  <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
</>, size)
const EyeIcon = ({ size = 13 }) => icon(<>
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
</>, size)
const PlusIcon = ({ size = 15 }) => icon(<><path d="M5 12h14" /><path d="M12 5v14" /></>, size)

const S = {
  title: { flex: 1, font: "600 17px/1.2 'Inter Tight', sans-serif", letterSpacing: '-0.01em', color: ink },
  sub: { font: "400 12.5px/1.5 'Roboto'", color: 'rgba(26,30,35,.55)', marginTop: 6 },
  label: { font: "600 11px/1 'Roboto'", letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(26,30,35,.5)' },
  input: { border: '1px solid #E1DCD7', borderRadius: 10, padding: '12px 14px', outline: 'none', background: '#fff' },
  footer: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, paddingTop: 16, borderTop: '1px solid #F4F0ED' },
  footNote: { display: 'inline-flex', alignItems: 'center', gap: 6, font: "400 11px/1 'Roboto'", color: 'rgba(26,30,35,.5)' },
  btnGhost: { marginLeft: 'auto', height: 38, padding: '0 15px', background: 'transparent', border: '1px solid #E7DED6', borderRadius: 8, font: "500 13px/1 'Roboto'", color: 'rgba(26,30,35,.7)', cursor: 'pointer' },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 17px', background: '#FF9780', border: 'none', borderRadius: 8, font: "500 13px/1 'Roboto'", color: ink, cursor: 'pointer' },
  ticketPill: { font: "500 11px/1 'Roboto'", color: '#B84A2E', background: '#fff', border: '1px solid #F4DDD7', padding: '6px 10px', borderRadius: 9999 },
  radioOn: { width: 17, height: 17, borderRadius: 9999, border: '5px solid #FF9780', background: '#fff', flex: 'none', boxSizing: 'border-box' },
  radioOff: { width: 17, height: 17, borderRadius: 9999, border: '1.5px solid #C8B8AD', flex: 'none', boxSizing: 'border-box' },
  optionOn: { border: '1px solid #FF9780', background: '#FFF9F4', borderRadius: 10, padding: '12px 14px', boxShadow: '0 0 0 3px #FFEAE6', cursor: 'pointer' },
  optionOff: { border: '1px solid #E7DED6', borderRadius: 10, padding: '12px 14px', cursor: 'pointer' },
}

function ModalShell({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overlay-enter"
      style={{ background: 'rgba(26,30,35,0.45)', backdropFilter: 'blur(8px)', padding: '64px 32px', overflowY: 'auto' }}
      onClick={onClose}>
      <div className="modal-enter" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.28)', padding: '24px 26px' }}>
        {children}
      </div>
    </div>
  )
}

function Header({ avatar, title, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {avatar}
      <span style={S.title}>{title}</span>
      <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 18, color: 'rgba(26,30,35,.4)', cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
    </div>
  )
}

function TicketPills({ tickets, moreTickets, note }) {
  if (!tickets?.length) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
      {tickets.map(t => <span key={t.scoreId || t.ticketId} style={S.ticketPill}>#{t.ticketId}</span>)}
      <span style={{ font: "400 11px/1 'Roboto'", color: 'rgba(26,30,35,.45)' }}>
        {moreTickets > 0 ? `+${moreTickets} more · ` : ''}{note}
      </span>
    </div>
  )
}

// ================================================== 3a — Turn into team topic

/**
 * draft: { title, body, tickets:[{scoreId, ticketId}], moreTickets }
 * onCreate({title, body, destination: 'huddle'|'feed'}) · onRedraft() → fresh draft
 */
export function TeamTopicModal({ draft, onCreate, onRedraft, onClose, saving }) {
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const [destination, setDestination] = useState('huddle')

  return (
    <ModalShell onClose={onClose}>
      <Header
        onClose={onClose}
        title="Turn into team topic"
        avatar={
          <span style={{ width: 28, height: 28, borderRadius: 9999, background: aiGradient, color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <AiIcon />
          </span>
        }
      />
      <div style={S.sub}>Drafted from this week's insight. Agents aren't named — it's about the pattern, not people.</div>

      <div style={{ ...S.label, margin: '18px 0 7px' }}>Topic</div>
      <input value={title} onChange={e => setTitle(e.target.value)}
        style={{ ...S.input, width: '100%', boxSizing: 'border-box', font: "500 14px/1.35 'Roboto'", color: ink }} />

      <div style={{ ...S.label, margin: '14px 0 7px' }}>What the team should know</div>
      <div style={{ position: 'relative' }}>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
          style={{ ...S.input, width: '100%', boxSizing: 'border-box', font: "400 13px/1.6 'Roboto'", color: 'rgba(26,30,35,.8)', resize: 'vertical' }} />
        <span onClick={() => { const d = onRedraft(); setTitle(d.title); setBody(d.body) }}
          style={{ position: 'absolute', right: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 5, font: "500 11px/1 'Roboto'", color: '#FF9780', cursor: 'pointer' }}>
          <AiIcon size={13} /> Redraft
        </span>
      </div>

      <TicketPills tickets={draft.tickets} moreTickets={draft.moreTickets} note="visible to leads only" />

      <div style={{ ...S.label, margin: '16px 0 8px' }}>Where it goes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ ...(destination === 'huddle' ? S.optionOn : S.optionOff), display: 'flex', alignItems: 'center', gap: 11 }} onClick={() => setDestination('huddle')}>
          <span style={destination === 'huddle' ? S.radioOn : S.radioOff} />
          <div style={{ flex: 1 }}>
            <div style={{ font: "500 13px/1.3 'Roboto'", color: ink }}>Next team huddle</div>
            <div style={{ font: "400 11.5px/1.4 'Roboto'", color: 'rgba(26,30,35,.55)', marginTop: 2 }}>
              Saved to the huddle agenda, with the evidence attached
            </div>
          </div>
        </div>
        <div style={{ ...(destination === 'feed' ? S.optionOn : S.optionOff), display: 'flex', alignItems: 'center', gap: 11 }} onClick={() => setDestination('feed')}>
          <span style={destination === 'feed' ? S.radioOn : S.radioOff} />
          <div style={{ flex: 1 }}>
            <div style={{ font: "500 13px/1.3 'Roboto'", color: ink }}>Post to team feed now</div>
            <div style={{ font: "400 11.5px/1.4 'Roboto'", color: 'rgba(26,30,35,.55)', marginTop: 2 }}>
              Every agent is notified today
            </div>
          </div>
        </div>
      </div>

      <div style={S.footer}>
        <span style={S.footNote}><UsersIcon /> Visible to the whole team</span>
        <button style={S.btnGhost} onClick={onClose}>Cancel</button>
        <button style={{ ...S.btnPrimary, opacity: title.trim() && body.trim() ? 1 : 0.5 }} disabled={saving || !title.trim() || !body.trim()}
          onClick={() => onCreate({ title: title.trim(), body: body.trim(), destination })}>
          {saving ? 'Creating…' : 'Create team topic'}
        </button>
      </div>
    </ModalShell>
  )
}

// ================================================== 3b — Share with the team

/**
 * strength: { title, sub, summary, agent:{firstName, initial, avatarBg},
 *             excerpts:[{quote, ticketId, scoreId}] }
 * onShare({creditAgent}) · onOpenTicket({scoreId, ticketId})
 */
export function ShareStrengthModal({ strength, onShare, onOpenTicket, onClose, saving }) {
  const [creditAgent, setCreditAgent] = useState(true)

  return (
    <ModalShell onClose={onClose}>
      <Header
        onClose={onClose}
        title="Share with the team"
        avatar={
          <span style={{ width: 28, height: 28, borderRadius: 8, background: '#fff', border: '1px solid #E7DED6', color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <MegaphoneIcon />
          </span>
        }
      />
      <div style={S.sub}>This is what the team will see — the reviewer's notes on what worked, never customer details.</div>

      <div style={{ ...S.label, margin: '18px 0 8px' }}>Preview</div>
      <div style={{ border: '1px solid #EEEEEE', background: '#FBF7F3', borderRadius: 12, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9999, background: strength.agent.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', font: "600 12px/1 'Inter Tight'", color: ink, flex: 'none' }}>
            {strength.agent.initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ font: "600 13.5px/1.2 'Inter Tight'", color: ink }}>{strength.title}</span>
            <div style={{ font: "400 11px/1 'Roboto'", color: 'rgba(26,30,35,.5)', marginTop: 4 }}>{strength.sub}</div>
          </div>
          <span style={{ font: "500 10px/1 'Roboto'", color: '#2F8F5B', background: '#E6F4EC', padding: '4px 8px', borderRadius: 9999, flex: 'none' }}>Strength</span>
        </div>
        <div style={{ font: "400 12.5px/1.6 'Roboto'", color: 'rgba(26,30,35,.7)', marginTop: 10 }}>{strength.summary}</div>
        {strength.excerpts.map(ex => (
          <div key={ex.scoreId || ex.ticketId} style={{ background: '#E8E3E1', borderRadius: 12, borderTopLeftRadius: 4, padding: '11px 14px', marginTop: 9, font: "400 12px/1.55 'Roboto'", color: 'rgba(26,30,35,.75)' }}>
            “{ex.quote}”
            <div style={{ font: "500 10.5px/1 'Roboto'", color: '#B84A2E', marginTop: 7, cursor: 'pointer' }} onClick={() => onOpenTicket(ex)}>
              From #{ex.ticketId} · open the scored ticket →
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 14 }} onClick={() => setCreditAgent(v => !v)}>
        {creditAgent ? (
          <span style={{ width: 18, height: 18, borderRadius: 5, background: '#FF9780', color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', font: "600 12px/1 'Roboto'" }}>✓</span>
        ) : (
          <span style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid #C8B8AD', flex: 'none', boxSizing: 'border-box' }} />
        )}
        <span style={{ font: "400 13px/1.3 'Roboto'", color: ink }}>Credit {strength.agent.firstName} by name</span>
        <span style={{ font: "400 11px/1 'Roboto'", color: 'rgba(26,30,35,.45)' }}>they'll be notified first</span>
      </div>

      <div style={S.footer}>
        <span style={S.footNote}><UsersIcon /> Posts to the team feed</span>
        <button style={S.btnGhost} onClick={onClose}>Cancel</button>
        <button style={S.btnPrimary} disabled={saving} onClick={() => onShare({ creditAgent })}>
          <MegaphoneIcon /> {saving ? 'Sharing…' : 'Share with team'}
        </button>
      </div>
    </ModalShell>
  )
}

// ========================================================= 3c — Add to plan

/**
 * opportunity: { title, tickets:[{scoreId, ticketId}], moreTickets }
 * agent: { firstName, initial, avatarBg }
 * goals: [{ id, title, status, recommended }] — recommended = same rubric criterion
 * onAdd({goalId | 'new'})
 */
export function AddToPlanModal({ opportunity, agent, goals, onAdd, onClose, saving }) {
  const recommended = goals.find(g => g.recommended) || goals[0]
  const [selected, setSelected] = useState(recommended ? recommended.id : 'new')
  const totalEvidence = opportunity.tickets.length + opportunity.moreTickets

  return (
    <ModalShell onClose={onClose}>
      <Header
        onClose={onClose}
        title={`Add to ${agent.firstName}'s plan`}
        avatar={
          <div style={{ width: 28, height: 28, borderRadius: 9999, background: agent.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', font: "600 11px/1 'Inter Tight'", color: ink, flex: 'none' }}>
            {agent.initial}
          </div>
        }
      />
      <div style={S.sub}>
        “{opportunity.title}” becomes something {agent.firstName} can see and track — no session needed yet.
      </div>

      <div style={{ ...S.label, margin: '18px 0 8px' }}>Attach to</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {goals.map(g => {
          const on = selected === g.id
          return (
            <div key={g.id} style={on ? S.optionOn : S.optionOff} onClick={() => setSelected(g.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={on ? S.radioOn : S.radioOff} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ font: "500 13px/1.3 'Roboto'", color: ink }}>{g.title}</span>
                  <div style={{ font: "400 11.5px/1.4 'Roboto'", color: 'rgba(26,30,35,.55)', marginTop: 2 }}>{g.status}</div>
                </div>
                {g.recommended && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: "500 10px/1 'Roboto'", color: '#B84A2E', background: '#FFEAE6', padding: '4px 8px', borderRadius: 9999, flex: 'none' }}>
                    <AiIcon size={11} /> Same root cause
                  </span>
                )}
              </div>
              {g.recommended && on && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, marginLeft: 28, flexWrap: 'wrap' }}>
                  <span style={{ font: "400 11px/1 'Roboto'", color: 'rgba(26,30,35,.5)' }}>Adds as evidence:</span>
                  {opportunity.tickets.slice(0, 2).map(t => (
                    <span key={t.scoreId || t.ticketId} style={{ ...S.ticketPill, padding: '5px 9px' }}>#{t.ticketId}</span>
                  ))}
                  {totalEvidence > 2 && (
                    <span style={{ font: "400 11px/1 'Roboto'", color: 'rgba(26,30,35,.45)' }}>+{totalEvidence - 2} more</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 11, border: '1.5px dashed #D8CFC7', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', ...(selected === 'new' ? { borderColor: '#FF9780', background: '#FFF9F4' } : {}) }}
          onClick={() => setSelected('new')}>
          <span style={selected === 'new' ? S.radioOn : S.radioOff} />
          <div style={{ flex: 1 }}>
            <span style={{ font: "500 13px/1.3 'Roboto'", color: ink }}>Create a new goal</span>
            <div style={{ font: "400 11.5px/1.4 'Roboto'", color: 'rgba(26,30,35,.55)', marginTop: 2 }}>
              Drafted from this opportunity — {agent.firstName} sees it once you add it
            </div>
          </div>
          <span style={{ color: 'rgba(26,30,35,.4)', display: 'inline-flex' }}><PlusIcon /></span>
        </div>
      </div>

      <div style={S.footer}>
        <span style={S.footNote}><EyeIcon /> {agent.firstName} sees the goal, not this card</span>
        <button style={S.btnGhost} onClick={onClose}>Cancel</button>
        <button style={S.btnPrimary} disabled={saving} onClick={() => onAdd({ goalId: selected })}>
          {saving ? 'Adding…' : 'Add to plan'}
        </button>
      </div>
    </ModalShell>
  )
}
