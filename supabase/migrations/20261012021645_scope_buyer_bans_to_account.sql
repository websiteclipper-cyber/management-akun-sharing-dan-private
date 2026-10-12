-- Buyer bans are account-scoped. A public IP can be shared by many legitimate
-- buyers, so network and contact identifiers must not affect another buyer's
-- access. Keep the old table/function signature for compatibility with already
-- deployed clients, but stop creating identifier bans. Retain existing rows
-- for diagnosis; the application no longer consults this table for access.

create or replace function public.set_buyer_ban(
  p_buyer_id bigint,
  p_banned boolean,
  p_identifiers jsonb default '[]'::jsonb
)
returns table(status text, identifiers_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.buyers
  set status = case when p_banned then 'blocked' else 'active' end,
      updated_at = now()
  where id = p_buyer_id;

  if not found then
    raise exception 'Buyer not found';
  end if;

  -- Preserve the previous unban cleanup, but never create identifier bans.
  -- Deliberately ignore p_identifiers even when an older client sends them.
  if not p_banned then
    delete from public.buyer_ban_identifiers
    where buyer_id = p_buyer_id;
  end if;

  return query
  select
    case when p_banned then 'blocked' else 'active' end::text,
    0::bigint;
end;
$$;

revoke all on function public.set_buyer_ban(bigint, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_buyer_ban(bigint, boolean, jsonb)
  to service_role;
