import { Navigate, Outlet } from 'react-router'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { Notice } from '../components/Notice'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { state, reload } = useAuth()

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p role="status" className="py-8 text-center text-muted">
          Laden…
        </p>
      </AppShell>
    )
  }

  if (state.status === 'signedOut') return <Navigate to="/login" replace />

  if (state.status === 'error') {
    return (
      <AppShell footer={<Button onClick={reload}>Opnieuw proberen</Button>}>
        <h1 className="text-2xl">Geen verbinding</h1>
        <Notice tone="fault">We kunnen je gegevens nu niet laden. Controleer je verbinding en probeer het opnieuw.</Notice>
      </AppShell>
    )
  }

  return <Outlet />
}
