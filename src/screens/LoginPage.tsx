import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Notice } from '../components/Notice'
import { SectionLabel } from '../components/SectionLabel'
import { TextField } from '../components/TextField'
import { supabase } from '../lib/supabase'

type Step = 'email' | 'code'

// Shown for every address, known or not, so the page never reveals who has an account.
const neutralMessage = 'Staat dit adres in het systeem? Dan krijg je een mail met een link en een code.'

export function LoginPage() {
  const { state } = useAuth()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 'error' only happens with a session, when the employee row could not be loaded.
  // The protected route explains that and offers a retry.
  if (state.status === 'signedIn' || state.status === 'error') return <Navigate to="/" replace />

  async function requestLogin(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    // shouldCreateUser is false: the login page never creates an account.
    const { error: failure } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setBusy(false)

    // A 4xx answer (unknown address, rate limit) gets the same neutral message as a known address.
    // Only a failure on our side or on the network is shown.
    const status = (failure as { status?: number } | null)?.status
    const clientError = status !== undefined && status >= 400 && status < 500
    if (failure && !clientError) {
      setError('Er ging iets mis. Probeer het zo nog eens.')
      return
    }
    setStep('code')
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: failure } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    // On success the session is set and the signedIn check above redirects to the home screen.
    if (failure) setError('Deze code klopt niet of is verlopen.')
  }

  function startOver() {
    setStep('email')
    setCode('')
    setError(null)
  }

  if (step === 'email') {
    return (
      <AppShell
        panel="Inloggen"
        footer={
          <Button type="submit" form="login-form" disabled={busy || email.trim() === ''}>
            Stuur inloglink
          </Button>
        }
      >
        <h1 className="text-2xl">Inloggen</h1>
        <form id="login-form" onSubmit={requestLogin} className="flex flex-col gap-4">
          <TextField
            id="email"
            label="E-mailadres"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            hint="Je krijgt een link om in te loggen."
          />
        </form>
        {error && <Notice tone="fault">{error}</Notice>}
      </AppShell>
    )
  }

  return (
    <AppShell
      panel="Inloggen"
      footer={
        <>
          <Button type="submit" form="code-form" disabled={busy || code.trim().length < 6}>
            Inloggen met code
          </Button>
          <Button variant="secondary" onClick={startOver}>
            Ander e-mailadres
          </Button>
        </>
      }
    >
      <h1 className="text-2xl">Check je mail</h1>
      <Card className="flex flex-col gap-2.5 p-3.5">
        <SectionLabel>Mail onderweg</SectionLabel>
        <p role="status">{neutralMessage}</p>
        <p className="text-muted">Tik op de link in de mail. Staat de app op je beginscherm? Vul dan de code in.</p>
      </Card>
      <form id="code-form" onSubmit={verifyCode} className="flex flex-col gap-4">
        <TextField
          id="code"
          label="Code uit de mail"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          className="text-center text-[26px] font-bold tracking-[0.3em]"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        />
      </form>
      {error && <Notice tone="fault">{error}</Notice>}
    </AppShell>
  )
}
