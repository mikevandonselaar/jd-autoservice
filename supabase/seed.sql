-- Development data for the TEST project and a local stack. Never run this on production.
--
-- The addresses are placeholders. Replace them with mailboxes you control before you try
-- a real login. Users are normally invited from the dashboard (see README), not seeded.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'eigenaar@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'sem@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'rik@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'werkplaats@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.id in (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000004'
)
on conflict (provider_id, provider) do nothing;

insert into public.employees (user_id, name, role, contract_hours_per_week, end_date)
values
  ('a0000000-0000-4000-8000-000000000001', 'Eigenaar', 'admin', null, null),
  ('a0000000-0000-4000-8000-000000000002', 'Sem', 'employee', 40, null),
  ('a0000000-0000-4000-8000-000000000003', 'Rik', 'employee', 32, null),
  ('a0000000-0000-4000-8000-000000000004', 'Werkplaats', 'workshop', null, null)
on conflict (user_id) do nothing;
