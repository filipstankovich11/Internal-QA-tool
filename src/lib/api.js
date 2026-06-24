import { supabase } from './supabase'

/**
 * fetch() wrapper that automatically attaches the current Supabase session
 * token as an Authorization header so the Python API can verify the caller
 * is a valid authenticated user.
 */
export async function authFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

/**
 * authFetch + safe JSON parse. Returns { ok, status, data }. Throws an Error with
 * a clear, human-readable message instead of the cryptic "Unexpected end of JSON
 * input" when the API returns an empty/non-JSON body — almost always because the
 * Python API server (:5001) isn't running.
 */
export async function authFetchJson(url, options = {}) {
  let res
  try {
    res = await authFetch(url, options)
  } catch {
    throw new Error('Could not reach the API server — is it running on :5001? (run `npm run dev`)')
  }
  const text = await res.text()
  if (!text) {
    throw new Error(`API server returned an empty response (HTTP ${res.status}) — is it running on :5001?`)
  }
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) }
  } catch {
    throw new Error(`API server returned an unexpected response (HTTP ${res.status}).`)
  }
}

/**
 * Build few-shot calibration examples from human-overridden scores.
 * Takes the most recent 8 overridden scores and extracts the fields the
 * Python scorer needs to inject as calibration context into the prompt.
 */
export function buildFewShotExamples(scoreHistory) {
  return (scoreHistory || [])
    .filter(s => s.overrideVerdict)
    .slice(0, 8)
    .map(s => {
      const full = s.fullScore || {}
      const scores = full.scores || {}
      const dimAverages = {}
      for (const [key, dim] of Object.entries(scores)) {
        if (dim?.dimension_average != null) {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          dimAverages[label] = Number(dim.dimension_average).toFixed(1)
        }
      }
      return {
        summary:          full.summary || '',
        ai_verdict:       s.verdict || '',
        ai_score:         s.weightedScore ?? full.weighted_score ?? '',
        human_verdict:    s.overrideVerdict,
        human_score:      s.overrideScore ?? '',
        reviewer_note:    s.overrideNote || '',
        dimension_averages: dimAverages,
      }
    })
}
