# JD Autoservice

Small in-house PWA for an independent car garage in the Netherlands: vehicle inspection checklist, working hours, leave and day planning. Users are a few mechanics and one owner. The app is temporary, so keep dependencies few and avoid extra hosted services.

## Stack

Vite, React 19, TypeScript 6 (pinned: typescript-eslint does not support 6.1+ yet), Tailwind CSS 4, react-router (declarative mode), vite-plugin-pwa, Supabase (Frankfurt, free tier).

- No API server. Reads use supabase-js under RLS. Writes go through Postgres RPC functions.
- Static hosting on Plesk: the build output is uploaded and every route falls back to `index.html` (`public/.htaccess`, `public/web.config`).

## Commands

- `npm run dev` / `npm run build` / `npm run lint`
- `npm run test:db`: pgTAP tests in `supabase/tests` against the TEST project (needs `.env.test`)
- `npm run test:auth`: proves sign-up is closed on the TEST project

## Conventions

- Code, comments, identifiers and logs are English. Interface copy is Dutch, plain and short, addressing the user as "je".
- Tokens (colours, fonts, radius) are defined once, in the `@theme` block of `src/index.css`. Use the token classes, never raw hex values in components.
- Primary buttons are charcoal with white text. Red is a small brand accent and otherwise means fault.
- Raleway 700 uppercase for headings, Open Sans for body text and all numbers. Corners 4px. Touch targets at least 56px high. Text at least 16px.
- Fonts are self-hosted through `@fontsource` (latin subset), not loaded from Google.
- Match the surrounding code: comment density, naming and idiom.

## Design source

Only the phone row "Telefoon · inspectie (mobiele variant)", artboards M1 to M6, of the design artifact `2144c951-f169-4cbb-b609-6d1f3421045f` (claude.ai/code/artifact/2144c951-f169-4cbb-b609-6d1f3421045f). One single-column layout for every role and device: white 60px header with the compact logo and a diagonal red and charcoal panel, `#F4F4F4` main, white footer with the main action. Content is a centred column of at most 480px on larger screens. The other artboards are not used. Where the design uses 14px or 15px text, use 16px.

## Data and roles

- `public.employees (user_id, name, role, contract_hours_per_week, end_date)`. Roles: `employee` sees only their own row, `admin` (the owner) sees and corrects everything, `workshop` (the shared tablet) must never see hours, leave or balances of any employee.
- Inspections are done by `employee` and `admin` on their own account; the mechanic is the logged-in user. `workshop` has no access to checklists or inspections.
- The owner manages several checklists (`checklists`, `checklist_blocks`, `checklist_points`, `checklist_measurements`). Starting an inspection copies the chosen checklist into `inspection_items` and `inspection_readings`, so later edits never change past inspections.
- The role comes from the employees table only, never from the JWT or user metadata. `private.current_app_role()` reads it, and returns null after `end_date`.
- RLS only filters rows, not columns. Anything the workshop account needs about other employees (for example a name picker) must come from an RPC that returns only those fields, never from a select on `employees`.

## Security rules

- RLS is on for every table, with explicit policies and a test per role. `supabase/tests/employees_rls.test.sql` also checks that every public table has RLS and a policy, and that every SECURITY DEFINER function has a fixed `search_path` and no `anon` execute right. A new table or function must pass these.
- `SECURITY DEFINER` functions set `search_path = ''`, qualify every name, and revoke execute from `public` and `anon`. Every RPC checks the caller's role and validates its input.
- Only the Supabase URL and the publishable key may reach the client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). The secret / service role key never goes in client code, `.env` or the repo. It exists only in `.env.test`, for the test scripts.
- `.env*` is gitignored; `.env.example` lists names without values.
- Login is invite only. Sign-up is off in Supabase and the login page never creates a user (`shouldCreateUser: false`). An unknown address gets the same neutral message as a known one.
- Migrations live in `supabase/migrations`, applied with the Supabase CLI. `supabase/seed.sql` is for the test project only, never production.
