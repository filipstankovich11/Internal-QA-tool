import { supabase } from './supabase'

// Kick the heavy app-data queries off the moment a session is known, in parallel
// with the auth profile fetch — instead of waiting for AppProvider to mount.
// AppContext consumes these in-flight promises so the data is already loading
// (often already done) by the time the dashboard renders.

let cache = null

// Idempotent: first call fires the queries, later calls return the same promises.
// The trailing .then(r => r) matters — a supabase query builder is lazy and only
// hits the network when awaited/.then'd, so without it the requests wouldn't
// actually start here. Chaining .then turns each into an in-flight Promise.
export function startPrefetch() {
  if (cache) return cache
  cache = {
    teams:  supabase.from('teams').select('*').order('created_at').then(r => r),
    agents: supabase.from('agents').select('*').order('created_at').then(r => r),
    scores: supabase.from('scores').select('*').order('scored_at', { ascending: false }).limit(500).then(r => r),
    rubric: supabase.from('rubric').select('config').eq('id', 1).single().then(r => r),
  }
  return cache
}

// Clear on sign-out so the next user fetches their own (RLS-scoped) data.
export function resetPrefetch() {
  cache = null
}
