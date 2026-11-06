import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { AppRole } from '../lib/roles'

export type Employee = {
  user_id: string
  name: string
  role: AppRole
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  /** Signed in, but the employees table says otherwise: no row, or the end date has passed. */
  | { status: 'signedIn'; employee: Employee | null }
  | { status: 'error' }

type AuthContextValue = {
  state: AuthState
  signOut: () => Promise<void>
  /** Reload the employee row, for the retry button after a network error. */
  reload: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function loadEmployee(session: Session): Promise<AuthState> {
  const { data, error } = await supabase
    .from('employees')
    .select('user_id, name, role')
    .eq('user_id', session.user.id)
    .maybeSingle<Employee>()
  if (error) return { status: 'error' }
  return { status: 'signedIn', employee: data }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let active = true

    async function apply(session: Session | null) {
      const next: AuthState = session ? await loadEmployee(session) : { status: 'signedOut' }
      if (active) setState(next)
    }

    // INITIAL_SESSION fires on subscribe, so there is no separate getSession call.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refreshes do not change who the user is.
      if (event === 'TOKEN_REFRESHED') return
      // Never await Supabase calls inside this callback, that can deadlock the client.
      setTimeout(() => void apply(session), 0)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [reloadCount])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setReloadCount((n) => n + 1)
  }, [])

  const value = useMemo(() => ({ state, signOut, reload }), [state, signOut, reload])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
