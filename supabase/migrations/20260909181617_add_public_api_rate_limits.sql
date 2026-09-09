begin;

create table if not exists public.public_api_rate_limits (
  scope text not null,
  key_hash text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 1,
  primary key (scope, key_hash, bucket_start),
  constraint public_api_rate_limits_hash_check check (length(key_hash) = 64),
  constraint public_api_rate_limits_count_check check (request_count > 0)
);

create index if not exists public_api_rate_limits_bucket_idx
  on public.public_api_rate_limits (bucket_start);

alter table public.public_api_rate_limits enable row level security;
revoke all privileges on table public.public_api_rate_limits from public, anon, authenticated;

create or replace function public.consume_public_api_rate_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bucket timestamptz;
  v_count integer;
begin
  if p_scope = '' or length(p_key_hash) <> 64
    or p_window_seconds < 1 or p_max_requests < 1 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  v_bucket := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.public_api_rate_limits (scope, key_hash, bucket_start, request_count)
  values (p_scope, p_key_hash, v_bucket, 1)
  on conflict (scope, key_hash, bucket_start)
  do update set request_count = public.public_api_rate_limits.request_count + 1
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke execute on function public.consume_public_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_api_rate_limit(text, text, integer, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
