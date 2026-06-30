const domain = import.meta.env.VITE_GORGIAS_DOMAIN || 'gorgias.gorgias.com'
export const gorgiasTicketUrl = (ticketId) => `https://${domain}/app/ticket/${ticketId}`

// Extract a ticket id from a pasted Gorgias URL (or a bare id). Mirrors the
// backend's extract_ticket_id — note /views/{viewId}/{ticketId} puts the view
// id first, so a naive "first number" match grabs the wrong value.
export function parseTicketId(value) {
  const v = (value || '').trim()
  if (!v) return ''
  let m = v.match(/\/tickets?\/(\d+)/)            // /ticket/123 or /tickets/123
  if (m) return m[1]
  m = v.match(/\/views\/\d+\/(\d+)/)              // /views/{view}/{ticket}
  if (m) return m[1]
  if (/^\d+$/.test(v)) return v                   // bare id
  const all = v.match(/\d{4,}/g)                  // fallback: last long number
  return all ? all[all.length - 1] : ''
}
