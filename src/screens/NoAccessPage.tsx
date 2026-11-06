import { useAuth } from '../auth/AuthProvider'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { Notice } from '../components/Notice'

/** Signed in, but there is no active employee row for this account. */
export function NoAccessPage() {
  const { signOut } = useAuth()
  return (
    <AppShell
      footer={
        <Button variant="secondary" onClick={() => void signOut()}>
          Uitloggen
        </Button>
      }
    >
      <h1 className="text-2xl">Geen toegang</h1>
      <Notice tone="fault">Je account heeft geen toegang tot de app. Neem contact op met de eigenaar.</Notice>
    </AppShell>
  )
}
