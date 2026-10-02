import test from 'node:test'
import assert from 'node:assert/strict'
import { parseScoreCSV } from './scoreCsv.js'

test('reads ticket IDs from a simple CSV', () => {
  assert.deepEqual(parseScoreCSV('ticket_id,subject\n123,First\n456,Second'), ['123', '456'])
})

test('keeps columns aligned when quoted values contain commas and newlines', () => {
  const csv = 'subject,ticket_url,notes\n"Hello, world",https://example.gorgias.com/app/ticket/123,"Line one\nLine two"'
  assert.deepEqual(parseScoreCSV(csv), ['https://example.gorgias.com/app/ticket/123'])
})

test('handles escaped quotes and a UTF-8 byte order mark', () => {
  const csv = '\uFEFFticket,subject\n987,"Customer said ""hello"""'
  assert.deepEqual(parseScoreCSV(csv), ['987'])
})

test('explains missing and empty ticket columns', () => {
  assert.throws(() => parseScoreCSV('subject\nHello'), /ticket_id or ticket_url/)
  assert.throws(() => parseScoreCSV('ticket_id,subject\n,Hello'), /No ticket IDs or URLs/)
})

test('rejects unclosed quoted values', () => {
  assert.throws(() => parseScoreCSV('ticket_id,subject\n123,"Broken'), /unclosed quoted value/)
})
