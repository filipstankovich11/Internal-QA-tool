import { useState, useEffect, useRef } from 'react'
import { authFetchJson } from '../lib/api'
import { gorgiasTicketUrl } from '../lib/gorgias'
import Linkify from './Linkify'

// Session cache so reopening a ticket is instant and doesn't re-spend the
// Gorgias rate budget. Keyed by ticket id; also dedupes concurrent fetches.
const cache = new Map()      // ticketId -> messages[]
const inflight = new Map()   // ticketId -> Promise<messages[]>

function loadMessages(ticketId) {
  const key = String(ticketId)
  if (cache.has(key)) return Promise.resolve(cache.get(key))
  if (inflight.has(key)) return inflight.get(key)
  const p = authFetchJson(`/api/ticket-messages?ticket_id=${ticketId}`)
    .then(({ data }) => {
      const msgs = data?.messages || []
      cache.set(key, msgs)
      inflight.delete(key)
      return msgs
    })
    .catch(err => { inflight.delete(key); throw err })
  inflight.set(key, p)
  return p
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const LockIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)

function Avatar({ letter, bg, color }) {
  return (
    <div className="shrink-0 rounded-full flex items-center justify-center font-bold" style={{ width: 20, height: 20, fontSize: 10, background: bg, color }}>
      {letter}
    </div>
  )
}

/**
 * Renders a ticket's conversation as agent/customer bubbles.
 *  - ticketId:    Gorgias ticket id to fetch
 *  - evidenceIds: optional string[] of message ids to ring (evidence highlight)
 *  - maxHeight:   optional px to make the list internally scrollable (else the
 *                 parent scrolls)
 */
export default function TicketTranscript({ ticketId, evidenceIds = [], taggedIds = [], annotations = {}, maxHeight, className = '', onToggleMessage, taggingLabel }) {
  const [messages, setMessages] = useState(() => cache.get(String(ticketId)) || null)
  const [loading, setLoading]   = useState(!cache.has(String(ticketId)))
  const [failed, setFailed]     = useState(false)

  useEffect(() => {
    if (!ticketId) return
    const cached = cache.get(String(ticketId))
    if (cached) { setMessages(cached); setLoading(false); setFailed(false); return }
    let cancelled = false
    setLoading(true); setFailed(false)
    loadMessages(ticketId)
      .then(msgs => { if (!cancelled) setMessages(msgs) })
      .catch(() => { if (!cancelled) { setMessages([]); setFailed(true) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticketId])

  const ev = evidenceIds.map(String)
  const taggedSet = new Set(taggedIds.map(String))   // tagged for ANY criterion (coverage)

  // Scroll the first cited message into view when the highlight changes
  const rowRefs = useRef({})
  const evKey = ev.join(',')
  useEffect(() => {
    if (!ev.length) return
    const first = (messages || []).find(m => ev.includes(String(m.id)))
    const el = first && rowRefs.current[String(first.id)]
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [evKey, messages]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(26,30,35,.45)' }}>Conversation</p>
        {ev.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: '#FFF4F1', border: '1px solid #FFE0D6', color: '#B84A2E' }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: '#FF9780' }} />
            {ev.length} {onToggleMessage ? 'tagged' : 'cited'}
          </span>
        )}
      </div>
      {onToggleMessage && taggingLabel && (
        <p className="text-xs mb-2 leading-relaxed" style={{ color: '#B84A2E' }}>
          Tagging evidence for <b style={{ fontWeight: 600 }}>{taggingLabel}</b> — click a message to tag it.
        </p>
      )}
      {loading ? (
        <p className="text-xs py-6 text-center" style={{ color: 'rgba(26,30,35,.45)' }}>Loading conversation…</p>
      ) : (messages && messages.length) ? (
        <div className="flex flex-col gap-4 pr-1" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
          {messages.map(m => {
            const lit = ev.includes(String(m.id))            // evidence for the focused criterion
            const tagged = !lit && taggedSet.has(String(m.id)) // evidence for another criterion
            const agent = m.from_agent
            const internal = !m.public
            const clickable = !!onToggleMessage
            const initials = (m.author || (agent ? 'A' : 'C'))[0]?.toUpperCase() || '?'
            const time = fmtTime(m.created_at)

            // Distinct treatment per message type — internal notes read as notes
            // (amber accent), not just another coral-outlined chat bubble.
            const palette = internal
              ? { bg: '#FFF8E8', avatarBg: '#F3D48A', avatarColor: '#8A6116', accent: '#E8B84B', ring: 'rgba(232,184,75,.55)' }
              : agent
              ? { bg: '#FFF1EC', avatarBg: '#FFD2C9', avatarColor: '#B84A2E', accent: null, ring: 'rgba(255,151,128,.55)' }
              : { bg: '#F5F3F1', avatarBg: '#E5DFD9', avatarColor: '#5B534C', accent: null, ring: 'rgba(93,82,71,.3)' }

            return (
              <div key={m.id} ref={el => { rowRefs.current[String(m.id)] = el }}
                className="flex flex-col"
                style={{ alignSelf: agent ? 'flex-end' : 'flex-start', alignItems: agent ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                <div className="flex items-center gap-1.5 mb-1 text-xs" style={{ color: 'rgba(26,30,35,.45)', justifyContent: agent ? 'flex-end' : 'flex-start' }}>
                  {!agent && <Avatar letter={initials} bg={palette.avatarBg} color={palette.avatarColor} />}
                  <span className="font-medium" style={{ color: 'rgba(26,30,35,.65)' }}>{m.author || (agent ? 'Agent' : 'Customer')}</span>
                  {time && <span style={{ color: 'rgba(26,30,35,.35)' }}>· {time}</span>}
                  {internal && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide" style={{ fontSize: 10, background: '#FBE8B9', color: '#8A6116' }}>
                      <LockIcon /> internal
                    </span>
                  )}
                  {lit && clickable && <span style={{ color: '#B84A2E', fontWeight: 600 }}>✓ evidence</span>}
                  {tagged && clickable && <span style={{ color: 'rgba(184,74,46,.6)' }}>• tagged elsewhere</span>}
                  {agent && <Avatar letter={initials} bg={palette.avatarBg} color={palette.avatarColor} />}
                </div>
                <div onClick={clickable ? () => onToggleMessage(m.id) : undefined}
                  className="text-sm leading-relaxed px-4 py-3 whitespace-pre-wrap" style={{
                  background: palette.bg, color: '#1A1E23',
                  borderRadius: 18, borderTopRightRadius: agent ? 6 : 18, borderTopLeftRadius: agent ? 18 : 6,
                  borderLeft: palette.accent ? `3px solid ${palette.accent}` : 'none',
                  boxShadow: lit ? `0 0 0 2px ${palette.ring}, 0 2px 10px rgba(0,0,0,.08)`
                    : tagged ? `0 0 0 1.5px ${palette.ring}`
                    : '0 1px 2px rgba(0,0,0,.05)',
                  transition: 'box-shadow .2s ease',
                  cursor: clickable ? 'pointer' : 'default',
                }}
                  onMouseEnter={clickable && !lit ? (e => { e.currentTarget.style.boxShadow = `0 0 0 2px ${palette.ring}` }) : undefined}
                  onMouseLeave={clickable && !lit ? (e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.05)' }) : undefined}>
                  <Linkify text={(m.body || '').trim() || '(no text)'} /></div>
                {(annotations[String(m.id)] || []).map((a, i) => {
                  const good = a.type === 'good'
                  return (
                    <div key={i} className="inline-flex items-start gap-1.5 mt-1.5 px-2.5 py-1 rounded-full text-xs leading-snug"
                      style={{ background: good ? '#E6F4EC' : '#FCE9E6', color: good ? '#2F8F5B' : '#D14B3D' }}>
                      <span className="font-semibold shrink-0">{good ? '✓' : '✗'}</span>
                      <span>{a.note}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs py-3 leading-relaxed" style={{ color: 'rgba(26,30,35,.45)' }}>
          {failed ? 'Couldn’t load the conversation here. ' : 'No messages on this ticket. '}
          <a href={gorgiasTicketUrl(ticketId)} target="_blank" rel="noreferrer" style={{ color: '#B84A2E' }}>Open #{ticketId} in Gorgias →</a>
        </p>
      )}
    </div>
  )
}
