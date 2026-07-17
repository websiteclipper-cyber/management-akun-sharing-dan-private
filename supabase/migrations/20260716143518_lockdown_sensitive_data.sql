-- Browser clients must never query these tables directly. All access is now
-- handled by authenticated Next.js API routes using the service-role client.
begin;

alter table public.buyers enable row level security;
alter table public.orders enable row level security;
alter table public.account_assignments enable row level security;
alter table public.stock_accounts enable row level security;
alter table public.backup_accounts enable row level security;
alter table public.payments enable row level security;

-- Defense in depth: remove table grants in addition to enabling RLS. No anon
-- or authenticated browser role needs direct access to customer, payment, or
-- credential inventory data.
revoke all privileges on table public.buyers from anon, authenticated;
revoke all privileges on table public.orders from anon, authenticated;
revoke all privileges on table public.account_assignments from anon, authenticated;
revoke all privileges on table public.stock_accounts from anon, authenticated;
revoke all privileges on table public.backup_accounts from anon, authenticated;
revoke all privileges on table public.payments from anon, authenticated;

commit;
