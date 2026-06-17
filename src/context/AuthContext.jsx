import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,            setUser]            = useState(null)
  const [profile,         setProfile]         = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [isPasswordReset, setIsPasswordReset] = useState(false)

  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null

      // Enforce @gorgias.com domain for OAuth logins
      if (u && event === 'SIGNED_IN' && !u.email?.endsWith('@gorgias.com')) {
        supabase.auth.signOut()
        setUser(null); setProfile(null); setLoading(false)
        return
      }

      setUser(u)
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordReset(true)
        setLoading(false)
      } else if (u) {
        setIsPasswordReset(false)
        fetchProfile(u.id)
      } else {
        setIsPasswordReset(false)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { hd: 'gorgias.com' }, // hint: show only gorgias.com accounts
      },
    })

  const signOut = () => supabase.auth.signOut()

  const updatePassword = (newPassword) =>
    supabase.auth.updateUser({ password: newPassword })

  const updateProfile = async (patch) => {
    if (!user) return
    const { data, error } = await supabase
      .from('profiles').update(patch).eq('id', user.id).select().single()
    if (!error && data) setProfile(data)
    return { error }
  }

  const sendPasswordReset = () =>
    supabase.auth.resetPasswordForEmail(user?.email, { redirectTo: window.location.origin })

  const role     = profile?.role ?? 'agent'
  const isAdmin  = role === 'admin'
  const isLead   = role === 'lead'
  const canEdit  = isAdmin || isLead
  const canScore = isAdmin || isLead

  return (
    <AuthContext.Provider value={{ user, profile, loading, role, isAdmin, isLead, canEdit, canScore, signIn, signInWithGoogle, signOut, updatePassword, updateProfile, sendPasswordReset, isPasswordReset, setIsPasswordReset }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
