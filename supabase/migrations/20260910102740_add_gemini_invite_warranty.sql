-- Gemini Pro warranty is fulfilled by inviting the buyer's Google account,
-- not by allocating another credential from the normal stock pool.
alter table public.products
  add column if not exists warranty_fulfillment_type text not null default 'standard_replacement';

alter table public.products
  drop constraint if exists products_warranty_fulfillment_type_check;

alter table public.products
  add constraint products_warranty_fulfillment_type_check
  check (warranty_fulfillment_type in ('standard_replacement', 'gemini_pro_invite'));

-- Intentionally enable the special flow for this exact product only.
update public.products
set warranty_fulfillment_type = 'gemini_pro_invite',
    updated_at = now()
where lower(trim(name)) = lower('CHATGPT PLUS PRIVATE 30 HARI Garansi Gemini Pro');

alter table public.warranty_claims
  add column if not exists terms_snapshot text,
  add column if not exists terms_hash text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists gemini_invite_email text,
  add column if not exists gemini_invite_status text,
  add column if not exists invite_sent_at timestamptz,
  add column if not exists activation_confirmed_at timestamptz,
  add column if not exists invite_processed_by_admin_id bigint
    references public.admins(id) on delete set null;

alter table public.warranty_claims
  drop constraint if exists warranty_claims_gemini_invite_status_check;

alter table public.warranty_claims
  add constraint warranty_claims_gemini_invite_status_check
  check (
    gemini_invite_status is null
    or gemini_invite_status in ('ready_to_invite', 'invite_sent', 'activated', 'failed')
  );

create index if not exists idx_warranty_claims_gemini_invite_status
  on public.warranty_claims(gemini_invite_status)
  where gemini_invite_status is not null;

comment on column public.products.warranty_fulfillment_type is
  'How an approved warranty is fulfilled: stock replacement or Gemini Pro invitation.';
comment on column public.warranty_claims.gemini_invite_email is
  'Buyer-owned Google email that will receive the Gemini Pro invitation. Never store its password or OTP.';

notify pgrst, 'reload schema';
