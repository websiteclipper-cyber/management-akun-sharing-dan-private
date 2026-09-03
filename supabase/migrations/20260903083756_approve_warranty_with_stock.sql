-- Approving a warranty claim must allocate and deliver a replacement from the
-- normal stock pool in the same database transaction. This prevents an
-- approved claim from being left without credentials and prevents two admins
-- from consuming the same stock slot concurrently.

alter table public.warranty_claims
  add column if not exists replacement_assignment_id bigint
  references public.account_assignments(id) on delete set null;

create index if not exists idx_warranty_claims_replacement_assignment
  on public.warranty_claims(replacement_assignment_id)
  where replacement_assignment_id is not null;

create index if not exists idx_stock_accounts_warranty_available
  on public.stock_accounts(product_id, created_at, id)
  where status = 'active' and current_used_slot < max_slot;

create or replace function public.approve_warranty_with_stock(
  p_claim_id text,
  p_admin_id bigint,
  p_admin_notes text default null,
  p_resolution_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claim public.warranty_claims%rowtype;
  v_old_assignment public.account_assignments%rowtype;
  v_new_assignment public.account_assignments%rowtype;
  v_stock public.stock_accounts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select claim.*
  into v_claim
  from public.warranty_claims as claim
  where claim.id::text = p_claim_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'KLAIM_TIDAK_DITEMUKAN';
  end if;

  -- Repeated requests are safe: once a stock assignment is linked, return it
  -- instead of consuming another slot.
  if v_claim.replacement_assignment_id is not null then
    select assignment.*
    into v_new_assignment
    from public.account_assignments as assignment
    where assignment.id = v_claim.replacement_assignment_id;

    if found then
      select stock.*
      into strict v_stock
      from public.stock_accounts as stock
      where stock.id = v_new_assignment.stock_account_id;

      update public.account_assignments
      set delivered_at = coalesce(delivered_at, v_now),
          updated_at = v_now
      where id = v_new_assignment.id;

      return jsonb_build_object(
        'success', true,
        'already_delivered', true,
        'claim_id', v_claim.id,
        'assignment_id', v_new_assignment.id,
        'stock_account_id', v_stock.id,
        'new_email', v_stock.account_identifier,
        'message', 'Akun pengganti sudah pernah dikirim dari stok.'
      );
    end if;
  end if;

  -- Preserve claims that were completed through the legacy manual field.
  if v_claim.status = 'approved' and nullif(v_claim.new_email, '') is not null then
    return jsonb_build_object(
      'success', true,
      'already_delivered', true,
      'legacy_manual_delivery', true,
      'claim_id', v_claim.id,
      'new_email', v_claim.new_email,
      'message', 'Klaim ini sudah memiliki akun pengganti dari proses lama.'
    );
  end if;

  if v_claim.status not in ('pending', 'approved') then
    raise exception using
      errcode = 'P0001',
      message = 'STATUS_KLAIM_TIDAK_DAPAT_DISETUJUI';
  end if;

  if v_claim.assignment_id is not null then
    select assignment.*
    into v_old_assignment
    from public.account_assignments as assignment
    where assignment.id = v_claim.assignment_id
      and assignment.status = 'active'
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'ASSIGNMENT_AKUN_LAMA_TIDAK_DITEMUKAN';
    end if;
  else
    -- Legacy claims may not have assignment_id. Match the reported account
    -- first, then fall back to the latest active assignment on the same order.
    select assignment.*
    into v_old_assignment
    from public.account_assignments as assignment
    join public.stock_accounts as stock on stock.id = assignment.stock_account_id
    where assignment.order_id = v_claim.order_id
      and assignment.status = 'active'
      and lower(stock.account_identifier) = lower(v_claim.reported_email)
    order by assignment.created_at desc, assignment.id desc
    limit 1
    for update of assignment;

    if not found then
      select assignment.*
      into v_old_assignment
      from public.account_assignments as assignment
      where assignment.order_id = v_claim.order_id
        and assignment.status = 'active'
      order by assignment.created_at desc, assignment.id desc
      limit 1
      for update;
    end if;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'ASSIGNMENT_AKUN_LAMA_TIDAK_DITEMUKAN';
    end if;
  end if;

  -- Skip the reported stock account entirely, even when it still has another
  -- free sharing slot. SKIP LOCKED lets concurrent approvals choose another
  -- candidate instead of double-delivering one slot.
  select stock.*
  into v_stock
  from public.stock_accounts as stock
  where stock.product_id = v_claim.product_id
    and stock.id <> v_old_assignment.stock_account_id
    and stock.status = 'active'
    and coalesce(stock.current_used_slot, 0) < greatest(coalesce(stock.max_slot, 1), 1)
  order by stock.created_at asc, stock.id asc
  limit 1
  for update skip locked;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'STOK_PENGGANTI_TIDAK_TERSEDIA',
      detail = 'Tambahkan stok aktif untuk produk ini sebelum menerima klaim.';
  end if;

  update public.stock_accounts
  set current_used_slot = coalesce(current_used_slot, 0) + 1,
      status = case
        when coalesce(current_used_slot, 0) + 1 >= greatest(coalesce(max_slot, 1), 1)
          then 'full'
        else 'active'
      end,
      updated_at = v_now
  where id = v_stock.id
  returning * into v_stock;

  update public.account_assignments
  set status = 'replaced',
      updated_at = v_now
  where id = v_old_assignment.id;

  insert into public.account_assignments (
    order_id,
    stock_account_id,
    buyer_id,
    assigned_by_admin_id,
    assignment_type,
    start_at,
    expired_at,
    warranty_expired_at,
    status,
    delivery_channel,
    delivered_at,
    created_at,
    updated_at
  ) values (
    v_claim.order_id,
    v_stock.id,
    v_claim.buyer_id,
    p_admin_id,
    'replacement',
    coalesce(v_old_assignment.start_at, v_now),
    v_old_assignment.expired_at,
    v_old_assignment.warranty_expired_at,
    'active',
    'web',
    v_now,
    v_now,
    v_now
  )
  returning * into v_new_assignment;

  update public.orders
  set order_status = case when order_status = 'completed' then order_status else 'delivered' end,
      delivered_at = coalesce(delivered_at, v_now),
      updated_at = v_now
  where id = v_claim.order_id;

  update public.warranty_claims
  set status = 'approved',
      replacement_backup_id = null,
      replacement_assignment_id = v_new_assignment.id,
      new_email = v_stock.account_identifier,
      new_password_encrypted = v_stock.account_secret_encrypted,
      admin_notes = coalesce(nullif(p_admin_notes, ''), admin_notes, 'Disetujui admin; akun otomatis diambil dari stok.'),
      resolution_notes = coalesce(
        nullif(p_resolution_notes, ''),
        'Klaim diterima. Akun pengganti otomatis dikirim dari stok yang tersedia.'
      ),
      resolved_at = v_now,
      updated_at = v_now
  where id = v_claim.id
  returning * into v_claim;

  if to_regclass('public.account_replacements') is not null then
    execute $insert_replacement$
      insert into public.account_replacements (
        old_assignment_id,
        new_assignment_id,
        reason,
        replaced_by_admin_id,
        created_at
      ) values ($1, $2, $3, $4, $5)
    $insert_replacement$
    using
      v_old_assignment.id,
      v_new_assignment.id,
      concat('Klaim garansi ', v_claim.claim_code),
      p_admin_id,
      v_now;
  end if;

  return jsonb_build_object(
    'success', true,
    'already_delivered', false,
    'claim_id', v_claim.id,
    'claim_code', v_claim.claim_code,
    'status', v_claim.status,
    'assignment_id', v_new_assignment.id,
    'stock_account_id', v_stock.id,
    'new_email', v_stock.account_identifier,
    'delivered_at', v_now,
    'message', 'Klaim diterima dan akun pengganti otomatis dikirim dari stok.'
  );
end;
$$;

revoke execute on function public.approve_warranty_with_stock(text, bigint, text, text) from public;
revoke execute on function public.approve_warranty_with_stock(text, bigint, text, text) from anon, authenticated;
grant execute on function public.approve_warranty_with_stock(text, bigint, text, text) to service_role;

notify pgrst, 'reload schema';
