begin;

alter table public.admins
  add column if not exists token_version integer;

update public.admins
set token_version = 0
where token_version is null;

alter table public.admins
  alter column token_version set default 0,
  alter column token_version set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admins_token_version_check'
      and conrelid = 'public.admins'::regclass
  ) then
    alter table public.admins
      add constraint admins_token_version_check
      check (token_version >= 0);
  end if;
end
$$;

create table if not exists public.admin_auth_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  email_hash text not null,
  ip_hash text not null,
  attempted_at timestamptz not null default now(),
  constraint admin_auth_events_type_check
    check (event_type in ('login_failure', 'password_reset_request')),
  constraint admin_auth_events_email_hash_check
    check (length(email_hash) = 64),
  constraint admin_auth_events_ip_hash_check
    check (length(ip_hash) = 64)
);

create index if not exists admin_auth_events_email_time_idx
  on public.admin_auth_events (event_type, email_hash, attempted_at desc);

create index if not exists admin_auth_events_ip_time_idx
  on public.admin_auth_events (event_type, ip_hash, attempted_at desc);

create index if not exists admin_auth_events_cleanup_idx
  on public.admin_auth_events (attempted_at);

-- Admin credentials and authentication telemetry are server-only data.
alter table public.admins enable row level security;
revoke all privileges on table public.admins from anon, authenticated;

alter table public.audit_logs enable row level security;
revoke all privileges on table public.audit_logs from anon, authenticated;

alter table public.admin_auth_events enable row level security;
revoke all privileges on table public.admin_auth_events from anon, authenticated;

notify pgrst, 'reload schema';

commit;
