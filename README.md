# JD Autoservice

In-house PWA for JD Autoservice. This is the foundation: login by magic link, roles, and one empty home screen per role. Modules (inspection checklist, hours, leave, planning) come later. See [CLAUDE.md](CLAUDE.md) for conventions.

## Local setup

Requires Node 22 or newer.

```sh
npm install
cp .env.example .env     # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev              # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and build to `dist/` (also generates the service worker and manifest) |
| `npm run lint` | ESLint |
| `npm run test:db` | pgTAP tests in `supabase/tests` against the test project |
| `npm run test:auth` | Checks that sign-up is closed on the test project |

## Manual steps in Supabase

You need two projects: **production** and a separate **test** project. The tests create and delete data, so they never run against production. Both are free-tier projects in the Frankfurt region (`eu-central-1`).

### 1. Create the project (do this twice)

1. In the dashboard choose **New project**, region **Central EU (Frankfurt)**, free plan. Save the database password.
2. **Authentication → Sign In / Providers → Email**: keep Email enabled. **Turn off** "Allow new users to sign up". Keep "Confirm email" on. Keep anonymous sign-ins off. Email OTP length 6, expiry 3600.
3. **Authentication → URL Configuration**:
   - Site URL, production project: `https://<your production domain>`
   - Site URL, test project: `http://localhost:5173`
   - Redirect URLs, both projects: `http://localhost:5173/auth/callback`, and on production also `https://<your production domain>/auth/callback`

   The email templates link to `{{ .SiteURL }}/auth/callback`, so the Site URL must be right.
4. **Authentication → Emails → Templates**: for **Magic Link** and **Invite user**, paste the body from `supabase/templates/magic_link.html` and `invite.html`, and set the subjects from `supabase/config.toml`. The magic link email carries a link and a 6-digit code. The code is what lets someone log in on an iPhone or iPad when the app is installed on the home screen: that app does not share storage with Safari, so the link alone cannot sign it in.
5. **Authentication → Emails → SMTP Settings**: set up custom SMTP (see below).
6. **Project Settings → Data API**: check that `public` is exposed and `private` is not.

### 2. Apply the migrations

```sh
npx supabase login
npx supabase link --project-ref <project ref>
npx supabase db push
```

Do not add `--include-seed` on production. The seed only exists for the test project.

### 3. Get the keys

**Project Settings → API Keys**. For the app (`.env`) copy only the **Project URL** and the **publishable key** (`sb_publishable_…`). The **secret key** never goes in `.env`, in code or in the repo.

### 4. Invite users and give them a role

Nobody can sign up. For each person (the first one is the owner):

1. **Authentication → Users → Invite user** and enter their address.
2. In the **SQL editor** add their role row. Hours are `null` for the owner and the workshop account.

```sql
insert into public.employees (user_id, name, role, contract_hours_per_week)
select id, 'Name', 'admin', null            -- or 'employee' with hours, or 'workshop' with null
from auth.users
where email = 'person@example.com';
```

A person without a row in `employees`, or past `end_date`, can log in but only sees "Geen toegang". The tablet account is a normal user with role `workshop` and a mailbox someone can reach. Getting back in after a logout needs that mailbox.

### 5. Test project and tests

Repeat step 1 for the test project and apply the migrations with its connection string. Then fill in `.env.test` (copy the names from `.env.example`):

- `TEST_PROJECT_REF`, `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY`, `TEST_SUPABASE_SECRET_KEY` from **Project Settings → API Keys**
- `TEST_DATABASE_URL`: **Connect → Session pooler** connection string. The direct connection is IPv6 only on the free tier.
- `PRODUCTION_PROJECT_REF`: the production ref, so the scripts can refuse to touch it

```sh
npx supabase db push --db-url "<TEST_DATABASE_URL, percent-encoded>"
npm run test:db
npm run test:auth
```

Optionally load the dev users: run `supabase/seed.sql` in the SQL editor of the **test** project only, after replacing the example addresses by mailboxes you control.

## Custom SMTP

Supabase's built-in email sender is for trying things out, not for real users:

- It only delivers to members of your Supabase organization. Everyone else fails with "Email address not authorized".
- It is limited to **2 emails per hour** for the whole project, and the limit can change without notice.

So a mechanic who asks for a link at the start of the shift can already be blocked. Set up your own SMTP server under **Authentication → Emails → SMTP Settings**: sender address, sender name, host, port, username and password.

- **Mailbox on your Plesk server** (no extra service): create a mailbox such as `no-reply@<your domain>` in Plesk, use that server's SMTP host with port 587 (STARTTLS) or 465 (TLS), and set SPF and DKIM for the domain in Plesk so the mail does not end up in spam.
- A transactional email service works the same way, and is the fallback if mail from the Plesk server keeps landing in spam.

After saving, Supabase sets a starting limit of 30 emails per hour. Adjust it under **Authentication → Rate Limits**. The same address can only request a new link once every 60 seconds. Test with a real address and check the spam folder.

## Build and deploy to Plesk

The Supabase URL and publishable key are compiled into the build, so build with the production values in `.env`.

```sh
npm run build
```

1. Upload the **contents** of `dist/` to the document root of the domain in Plesk (usually `httpdocs`), including the hidden `.htaccess`. Replace the previous files.
2. Linux hosting uses `.htaccess`, Windows hosting uses `web.config` (needs the URL Rewrite module). Both are in `dist/`; the server ignores the other one.
3. Enable HTTPS (Let's Encrypt) and redirect HTTP to HTTPS. A PWA only installs over HTTPS.
4. Check that `https://<domain>/login` opens directly (the fallback works) and that `https://<domain>/manifest.webmanifest` loads.
5. On the tablet or phone: open the site and choose **Add to Home Screen** (iOS/iPadOS) or **Install app** (Android/Chrome).

After a deploy, installed apps pick up the new version the next time they are opened. `index.html`, `sw.js` and the manifest are never cached for long; files in `assets/` are cached for a year because their names contain a hash.

## Good to know

- **Free tier:** projects with little activity are paused after about 7 days (for example over a holiday closure) and must be restored in the dashboard. There are no automatic backups: export regularly with `npx supabase db dump` (on Windows this needs Docker) before real hours and leave data go in.
- **Unknown addresses:** the login page shows the same message for every address. Someone calling Supabase's API directly can still tell from the response that an address has no account, and no setting closes this.
- **Security model:** see [CLAUDE.md](CLAUDE.md). A new table or function that skips RLS or leaves a SECURITY DEFINER function without a fixed `search_path` fails `npm run test:db`.
