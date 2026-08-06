-- Store the 2FA.live shared secret separately from passwords and encrypt it
-- in the application layer before insertion.
begin;

alter table public.stock_accounts
  add column if not exists two_factor_secret_encrypted text;

comment on column public.stock_accounts.two_factor_secret_encrypted is
  'Encrypted 2FA.live/TOTP shared secret for the account; decrypted only for an assigned buyer.';

notify pgrst, 'reload schema';

commit;
