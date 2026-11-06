// Proves the TEST project is invite only: an unknown address cannot create an account,
// however the request is made. Usage: npm run test:auth
// Needs TEST_SUPABASE_SECRET_KEY, which is only ever read here, never by the app.
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { assertTestTarget, loadTestEnv, requireEnv } from './lib/env.mjs'

loadTestEnv()
requireEnv('TEST_PROJECT_REF', 'TEST_SUPABASE_URL', 'TEST_SUPABASE_PUBLISHABLE_KEY', 'TEST_SUPABASE_SECRET_KEY')
assertTestTarget(process.env.TEST_SUPABASE_URL)

const url = process.env.TEST_SUPABASE_URL
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const anon = createClient(url, process.env.TEST_SUPABASE_PUBLISHABLE_KEY, options)
const admin = createClient(url, process.env.TEST_SUPABASE_SECRET_KEY, options)

// If signups were open by mistake, this address would receive mail, so use a throwaway one.
const domain = process.env.TEST_UNKNOWN_EMAIL_DOMAIN ?? 'gmail.com'
const email = `jd-signup-check-${randomBytes(6).toString('hex')}@${domain}`
const closedCodes = ['signup_disabled', 'otp_disabled']

let failed = false
function check(name, ok, detail) {
  console.log(`${ok ? 'ok' : 'not ok'} - ${name}${detail ? ` (${detail})` : ''}`)
  if (!ok) failed = true
}

async function findUser() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return data.users.find((user) => user.email === email)
}

const signUp = await anon.auth.signUp({ email, password: randomBytes(16).toString('hex') })
check('signUp is refused', closedCodes.includes(signUp.error?.code), signUp.error?.code ?? 'no error')

const otpCreate = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
check(
  'signInWithOtp with shouldCreateUser: true is refused',
  closedCodes.includes(otpCreate.error?.code),
  otpCreate.error?.code ?? 'no error',
)

const otpLogin = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
const status = otpLogin.error?.status
check(
  'the login page request fails with a 4xx for an unknown address',
  status !== undefined && status >= 400 && status < 500,
  `${status} ${otpLogin.error?.code ?? ''}`.trim(),
)

const created = await findUser()
check('no account exists for the unknown address', !created)
if (created) await admin.auth.admin.deleteUser(created.id)

process.exit(failed ? 1 : 0)
