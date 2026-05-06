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
