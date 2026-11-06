import { Navigate, Outlet } from 'react-router'
import type { AppRole } from '../lib/roles'
import { useAuth } from './AuthProvider'

/**
 * Sends everyone else back to the home screen. This only hides screens; what a role may
 * read or change is decided by RLS and the RPC functions.
 */
export function RequireRole({ roles }: { roles: AppRole[] }) {
  const { state } = useAuth()
  const role = state.status === 'signedIn' ? state.employee?.role : undefined
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />
  return <Outlet />
}
