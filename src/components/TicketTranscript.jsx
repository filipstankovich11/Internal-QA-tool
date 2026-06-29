import { useState, useEffect, useRef } from 'react'
import { authFetchJson } from '../lib/api'
import { gorgiasTicketUrl } from '../lib/gorgias'

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

/**
 * Renders a ticket's conversation as agent/customer bubbles.
 *  - ticketId:    Gorgias ticket id to fetch
 *  - evidenceIds: optional string[] of message ids to ring (evidence highlight)
 *  - maxHeight:   optional px to make the list internally scrollable (else the
 *                 parent scrolls)
 */
export default function TicketTranscript({ ticketId, evidenceIds = [], maxHeight, className = '' }) {
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
            {ev.length} cited
          </span>
        )}
      </div>
      {loading ? (
        <p className="text-xs py-6 text-center" style={{ color: 'rgba(26,30,35,.45)' }}>Loading conversation…</p>
      ) : (messages && messages.length) ? (
        <div className="flex flex-col gap-2.5 pr-1" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
          {messages.map(m => {
            const lit = ev.includes(String(m.id))
            const agent = m.from_agent
            return (
              <div key={m.id} ref={el => { rowRefs.current[String(m.id)] = el }} style={{ alignSelf: agent ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
                <div className="flex items-center gap-1.5 mb-0.5 text-xs" style={{ color: 'rgba(26,30,35,.45)', justifyContent: agent ? 'flex-end' : 'flex-start' }}>
                  <span className="font-medium" style={{ color: 'rgba(26,30,35,.6)' }}>{m.author || (agent ? 'Agent' : 'Customer')}</span>
                  {!m.public && <span className="px-1 rounded" style={{ background: '#F1ECE8' }}>internal</span>}
                </div>
                <div className="text-sm leading-relaxed px-3.5 py-2.5 whitespace-pre-wrap" style={{
                  background: agent ? '#FFF4F1' : '#F6F4F2', color: '#1A1E23',
                  border: `1px solid ${lit ? '#FF9780' : (agent ? '#FBD9CE' : '#E5DFD9')}`,
                  borderRadius: 16, borderTopRightRadius: agent ? 4 : 16, borderTopLeftRadius: agent ? 16 : 4,
                  boxShadow: lit ? '0 0 0 2px rgba(255,151,128,.35), 0 1px 6px rgba(255,151,128,.25)' : 'none',
                  transition: 'box-shadow .2s ease, border-color .2s ease',
                }}>{(m.body || '').trim() || '(no text)'}</div>
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
