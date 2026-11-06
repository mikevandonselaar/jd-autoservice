import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required. Copy .env.example to .env.',
  )
}

// A privileged key must never ship in the bundle, so refuse to start with one.
function isPrivilegedKey(value: string): boolean {
  if (value.startsWith('sb_secret_')) return true
  try {
    const payload = JSON.parse(atob(value.split('.')[1]))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

if (isPrivilegedKey(key)) {
  throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY holds a secret key. Use the publishable key.')
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The login link is handled by /auth/callback, not by the client.
    detectSessionInUrl: false,
  },
})
