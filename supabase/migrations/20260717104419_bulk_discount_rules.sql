begin;

alter table public.discount_campaigns
  add column if not exists min_quantity integer;

alter table public.discount_campaigns
  add column if not exists fixed_discount_mode text;

update public.discount_campaigns
set min_quantity = 1
where min_quantity is null;

update public.discount_campaigns
set fixed_discount_mode = 'per_item'
where fixed_discount_mode is null;

alter table public.discount_campaigns
  alter column min_quantity set default 1,
  alter column min_quantity set not null,
  alter column fixed_discount_mode set default 'per_item',
  alter column fixed_discount_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_campaigns_min_quantity_check'
      and conrelid = 'public.discount_campaigns'::regclass
  ) then
    alter table public.discount_campaigns
      add constraint discount_campaigns_min_quantity_check
      check (min_quantity between 1 and 10);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_campaigns_fixed_mode_check'
      and conrelid = 'public.discount_campaigns'::regclass
  ) then
    alter table public.discount_campaigns
      add constraint discount_campaigns_fixed_mode_check
      check (fixed_discount_mode in ('per_item', 'per_order'));
  end if;
end
$$;

-- Promo codes must not be enumerable from a browser. Validation and admin
-- management are performed by authenticated Next.js API routes.
alter table public.discount_campaigns enable row level security;
revoke all privileges on table public.discount_campaigns from anon, authenticated;

notify pgrst, 'reload schema';

commit;
