function parseRows(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell.trim())
      if (row.some(value => value !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted value')
  row.push(cell.trim())
  if (row.some(value => value !== '')) rows.push(row)
  return rows
}

export function parseScoreCSV(text) {
  const rows = parseRows(String(text || '').replace(/^\uFEFF/, ''))
  if (rows.length < 2) throw new Error('CSV must have a header row and at least one data row')

  const headers = rows[0].map(header => header.trim().toLowerCase())
  const column = headers.findIndex(header => ['ticket_id', 'ticket_url', 'url', 'id', 'ticket'].includes(header))
  if (column === -1) throw new Error('Add a ticket_id or ticket_url column to the CSV')

  const tickets = rows.slice(1).map(row => row[column]?.trim()).filter(Boolean)
  if (tickets.length === 0) throw new Error('No ticket IDs or URLs were found in the CSV')
  return tickets
}

