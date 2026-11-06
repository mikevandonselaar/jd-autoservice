// Prints a login code and link for an existing user on the TEST project, without sending mail.
// Handy in development, where the built-in mailer allows only a few emails per hour.
// Usage: npm run login-link -- <email> [app url, default http://localhost:5173]
// Needs TEST_SUPABASE_SECRET_KEY, which is only ever read here, never by the app.
import { createClient } from '@supabase/supabase-js'
import { assertTestTarget, loadTestEnv, requireEnv } from './lib/env.mjs'

loadTestEnv()
requireEnv('TEST_PROJECT_REF', 'TEST_SUPABASE_URL', 'TEST_SUPABASE_SECRET_KEY')
assertTestTarget(process.env.TEST_SUPABASE_URL)

const [email, appUrl = 'http://localhost:5173'] = process.argv.slice(2)
if (!email) {
  console.error('Usage: npm run login-link -- <email> [app url]')
  process.exit(2)
}

const admin = createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// The admin API bypasses the closed sign-up and would create an unknown address, so refuse it.
const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listError) throw listError
if (!list.users.some((user) => user.email?.toLowerCase() === email.toLowerCase())) {
  console.error(`No user with address ${email}. Invite them first.`)
  process.exit(1)
}

const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
if (error) throw error

// A new code replaces the previous one. Both work once, for the OTP expiry (one hour).
console.log(`code: ${data.properties.email_otp}`)
console.log(
  `link: ${new URL('/auth/callback', appUrl)}?token_hash=${data.properties.hashed_token}&type=email`,
)
