import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { Notice } from '../components/Notice'
import { supabase } from '../lib/supabase'

// The email templates only ever send these two types.
const allowedTypes = ['email', 'invite'] as const
type CallbackType = (typeof allowedTypes)[number]

function isCallbackType(value: string | null): value is CallbackType {
  return allowedTypes.some((type) => type === value)
}

export function CallbackPage() {
  const { state } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const [verified, setVerified] = useState(false)
  // A login token works once. StrictMode runs effects twice in development, so guard against it.
  const started = useRef(false)

  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  const valid = !!tokenHash && tokenHash.length <= 200 && isCallbackType(type)

  useEffect(() => {
    if (!tokenHash || !isCallbackType(type) || tokenHash.length > 200 || started.current) return
    started.current = true
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      if (error) setFailed(true)
      else setVerified(true)
    })
  }, [tokenHash, type])

  // Wait until the link has been used before moving on. Someone who is already signed in
  // (say, on a shared device) must end up in the account the link belongs to. Replacing the
  // URL also removes the token from the address bar and the history.
  const hasSession = state.status === 'signedIn' || state.status === 'error'
  if (hasSession && (verified || !valid)) return <Navigate to="/" replace />

  if (!valid || failed) {
    return (
      <AppShell
        panel="Inloggen"
        footer={<Button onClick={() => navigate('/login', { replace: true })}>Opnieuw inloggen</Button>}
      >
        <h1 className="text-2xl">Inloggen mislukt</h1>
        <Notice tone="fault">Deze link is al gebruikt of verlopen. Vraag een nieuwe link of code aan.</Notice>
      </AppShell>
    )
  }

  return (
    <AppShell panel="Inloggen">
      <p role="status" className="py-8 text-center text-muted">
        Je wordt ingelogd…
      </p>
    </AppShell>
  )
}
