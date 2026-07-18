begin;

-- The expiry job is invoked only from our server route with the service-role key.
-- Do not expose this SECURITY DEFINER function through the public Data API.
revoke execute on function public.auto_expire_assignments() from public, anon, authenticated;
grant execute on function public.auto_expire_assignments() to service_role;

-- Payment proofs contain sensitive transaction data. Keep existing uploads intact,
-- but make downloads private and remove anonymous listing access.
update storage.buckets
set public = false
where id = 'payment-proofs'
  and public is distinct from false;

drop policy if exists "Allow public read payment proofs" on storage.objects;

notify pgrst, 'reload schema';

commit;
