-- Secure wallet foundation. Additive migration only.

create index if not exists coin_ledger_player_created_idx
on public.coin_ledger (player_id, created_at desc);

create or replace function public.wallet_apply(
  p_player_id uuid,
  p_delta integer,
  p_reason text,
  p_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance bigint;
  v_existing public.coin_ledger%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;

  if p_player_id is null
     or p_reason is null
     or p_delta is null
     or p_delta = 0
     or p_delta < -1000000
     or p_delta > 1000000
     or p_reason not in ('reward','purchase','revive','adjustment')
     or p_ref is null
     or length(p_ref) < 8
     or length(p_ref) > 120 then
    raise exception 'invalid transaction';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_player_id::text, 0)
  );

  select * into v_existing
  from public.coin_ledger
  where ref = p_ref;

  if found then
    if v_existing.player_id <> p_player_id
       or v_existing.delta <> p_delta
       or v_existing.reason <> p_reason then
      raise exception 'reference conflict';
    end if;

    select coalesce(sum(delta), 0)
    into v_balance
    from public.coin_ledger
    where player_id = p_player_id;

    return jsonb_build_object(
      'applied', false,
      'balance', v_balance
    );
  end if;

  select coalesce(sum(delta), 0)
  into v_balance
  from public.coin_ledger
  where player_id = p_player_id;

  if v_balance + p_delta < 0 then
    raise exception 'insufficient balance';
  end if;

  insert into public.coin_ledger
    (player_id, delta, reason, ref)
  values
    (p_player_id, p_delta, p_reason, p_ref);

  return jsonb_build_object(
    'applied', true,
    'balance', v_balance + p_delta
  );
end;
$$;

revoke all on function public.wallet_apply(uuid, integer, text, text)
from public, anon, authenticated;

grant execute on function public.wallet_apply(uuid, integer, text, text)
to service_role;

create or replace function public.wallet_balance(p_player_id uuid)
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(delta), 0)
  from public.coin_ledger
  where player_id = p_player_id
  and auth.role() = 'service_role';
$$;

revoke all on function public.wallet_balance(uuid)
from public, anon, authenticated;

grant execute on function public.wallet_balance(uuid)
to service_role;
