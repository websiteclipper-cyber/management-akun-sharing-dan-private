begin;

set local lock_timeout = '5s';

alter table public.stock_accounts
  alter column account_identifier type text
  using account_identifier::text;

comment on column public.stock_accounts.account_identifier is
  'Email, username, invite URL, or activation URL used to identify a stock account.';

notify pgrst, 'reload schema';

commit;
