begin;

-- Snapshots deliberately have no FK: deleting/renaming an admin must not erase
-- the account identity recorded at the time of the attempt.
create table public.admin_login_history (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  admin_id bigint,
  admin_name text check (length(admin_name) <= 200),
  email text not null check (length(email) between 1 and 254),
  outcome text not null check (outcome in ('success', 'failed', 'blocked')),
  ip_address inet,
  user_agent text check (length(user_agent) <= 512),
  device_type text not null check (device_type in ('desktop', 'mobile', 'tablet', 'unknown')),
  browser text not null check (length(browser) <= 80),
  os text not null check (length(os) <= 80),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  region text check (length(region) <= 128),
  city text check (length(city) <= 128),
  location_source text not null check (location_source in ('vercel', 'unavailable'))
);

create index admin_login_history_time_idx on public.admin_login_history (occurred_at desc, id desc);
create index admin_login_history_outcome_time_idx on public.admin_login_history (outcome, occurred_at desc, id desc);

-- Server-only, append-only. The generic admin CRUD endpoint does not allow this
-- table. Deliberately no client RLS policies and no application deletion grant.
alter table public.admin_login_history enable row level security;
revoke all on table public.admin_login_history from public, anon, authenticated, service_role;
grant select, insert on table public.admin_login_history to service_role;

comment on table public.admin_login_history is 'Append-only admin login attempts. Device metadata is browser-reported; network location is approximate. Server-only access.';

notify pgrst, 'reload schema';
commit;
