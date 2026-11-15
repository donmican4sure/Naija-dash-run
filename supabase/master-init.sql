-- ============================================================================
-- NAIJA DASH MASTER SUPABASE SCHEMA (BATCHES 1 TO 6 COMPLETE)
-- Paste this entire file into your fresh Supabase -> SQL Editor -> Run.
-- Safe to run multiple times (idempotent).
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. PLAYERS & CLOUD SAVES
create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'player',
  banned boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists players_display_name_lower_idx
  on public.players (lower(display_name))
  where display_name <> 'player';

create table if not exists public.player_saves (
  player_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  progress bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- 2. RANKED RUNS & STAGE TRUST LOG
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  week integer not null,
  city text not null check (city in ('Lagos','Abuja','Port Harcourt','Kano','Enugu')),
  status text not null default 'started' check (status in ('started','submitted','review','approved','rejected')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  total integer check (total between 0 and 60000),
  stage_scores jsonb,
  stage_log jsonb not null default '[]'::jsonb,
  dev_hash text,
  duration_s integer,
  flags text[] not null default '{}',
  reviewed_by text,
  unique (player_id, week)
);
alter table public.runs add column if not exists stage_log jsonb not null default '[]'::jsonb;
alter table public.runs add column if not exists dev_hash text;
create index if not exists runs_board_idx on public.runs (week, city, total desc) where status in ('submitted','approved');
create index if not exists runs_dev_week_idx on public.runs (week, dev_hash);

create or replace view public.leaderboard_week with (security_invoker = false) as
  select r.week, r.city, p.display_name, r.total, r.duration_s
  from public.runs r join public.players p on p.id = r.player_id
  where r.status in ('submitted','approved') and p.banned = false;

create or replace function public.run_stage_add(p_run uuid, p_player uuid, p_idx int, p_score int, p_bd jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare r public.runs; n int;
begin
  select * into r from public.runs where id = p_run and player_id = p_player for update;
  if not found then return 'not_found'; end if;
  if r.status <> 'started' then return 'not_started'; end if;
  n := jsonb_array_length(r.stage_log);
  if p_idx < n then return 'duplicate'; end if;
  if p_idx > n then return 'out_of_order:' || n; end if;
  update public.runs
     set stage_log = stage_log || jsonb_build_array(jsonb_build_object('i', p_idx, 's', p_score, 'bd', p_bd, 'at', now()))
   where id = p_run;
  return 'ok';
end $$;
revoke all on function public.run_stage_add(uuid, uuid, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.run_stage_add(uuid, uuid, int, int, jsonb) to service_role;

-- 3. WALLET & ORDERS LEDGER
create table if not exists public.coin_ledger (
  id bigserial primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref text unique,
  created_at timestamptz not null default now()
);
create index if not exists coin_ledger_player_created_idx on public.coin_ledger (player_id, created_at desc);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  pack text not null,
  amount_ngn integer not null check (amount_ngn > 0),
  coins integer not null check (coins > 0),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  tx_ref text unique not null,
  flw_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create or replace function public.wallet_apply(p_player_id uuid, p_delta integer, p_reason text, p_ref text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_balance bigint;
  v_existing public.coin_ledger%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if p_player_id is null or p_reason is null or p_delta is null or p_delta = 0
     or p_delta < -1000000 or p_delta > 1000000
     or p_reason not in ('reward','purchase','revive','adjustment')
     or p_ref is null or length(p_ref) < 8 or length(p_ref) > 120 then
    raise exception 'invalid transaction';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text, 0));
  select * into v_existing from public.coin_ledger where ref = p_ref;
  if found then
    if v_existing.player_id <> p_player_id or v_existing.delta <> p_delta or v_existing.reason <> p_reason then
      raise exception 'reference conflict';
    end if;
    select coalesce(sum(delta), 0) into v_balance from public.coin_ledger where player_id = p_player_id;
    return jsonb_build_object('applied', false, 'balance', v_balance);
  end if;
  select coalesce(sum(delta), 0) into v_balance from public.coin_ledger where player_id = p_player_id;
  if v_balance + p_delta < 0 then raise exception 'insufficient balance'; end if;
  insert into public.coin_ledger (player_id, delta, reason, ref) values (p_player_id, p_delta, p_reason, p_ref);
  return jsonb_build_object('applied', true, 'balance', v_balance + p_delta);
end;
$$;
revoke all on function public.wallet_apply(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.wallet_apply(uuid, integer, text, text) to service_role;

create or replace function public.wallet_balance(p_player_id uuid)
returns bigint language sql security definer set search_path = public, pg_temp as $$
  select coalesce(sum(delta), 0) from public.coin_ledger where player_id = p_player_id and auth.role() = 'service_role';
$$;
revoke all on function public.wallet_balance(uuid) from public, anon, authenticated;
grant execute on function public.wallet_balance(uuid) to service_role;

-- 4. ADVERTISING, CAMPAIGNS & ADVERTISER PORTAL
create table if not exists public.advertisers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_email text,
  created_at timestamptz not null default now()
);
create table if not exists public.advertiser_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade
);
create table if not exists public.campaigns (
  id text primary key,
  type text not null check (type in ('board','takeover','championship','house')),
  status text not null default 'draft' check (status in ('draft','pending','approved','live','paused','ended')),
  advertiser text not null,
  advertiser_id uuid references public.advertisers(id) on delete set null,
  cities text[] not null default '{}',
  lines text[] not null,
  c1 text not null default '#0b3d91',
  c2 text not null default '#f5b800',
  start_date date not null,
  end_date date not null,
  link text,
  notes text,
  created_by text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.campaigns add column if not exists link text;
alter table public.campaigns add column if not exists notes text;
alter table public.campaigns add column if not exists updated_at timestamptz not null default now();
alter table public.campaigns add column if not exists advertiser_id uuid references public.advertisers(id) on delete set null;

create table if not exists public.ad_stats (
  day date not null,
  campaign_id text not null,
  placement text not null,
  served bigint not null default 0,
  views bigint not null default 0,
  clicks bigint not null default 0,
  primary key (day, campaign_id, placement)
);
create table if not exists public.ad_batches (
  sid uuid not null, day date not null, campaign_id text not null, placement text not null,
  primary key (sid, day, campaign_id, placement)
);
create table if not exists public.ad_unique (
  day date not null, campaign_id text not null, pid_hash text not null,
  primary key (day, campaign_id, pid_hash)
);

create or replace function public.ad_add(p_sid uuid, p_day date, p_cid text, p_pl text, p_s int, p_v int, p_c int)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.ad_batches(sid, day, campaign_id, placement) values (p_sid, p_day, p_cid, p_pl) on conflict do nothing;
  if found then
    insert into public.ad_stats(day, campaign_id, placement, served, views, clicks) values (p_day, p_cid, p_pl, p_s, p_v, p_c)
    on conflict (day, campaign_id, placement) do update
      set served = ad_stats.served + excluded.served, views = ad_stats.views + excluded.views, clicks = ad_stats.clicks + excluded.clicks;
  end if;
end $$;
revoke all on function public.ad_add(uuid,date,text,text,int,int,int) from public, anon, authenticated;
grant execute on function public.ad_add(uuid,date,text,text,int,int,int) to service_role;

create or replace view public.ad_totals as
  select campaign_id, sum(served)::bigint as served, sum(views)::bigint as views, max(day) as last_day
  from public.ad_stats group by campaign_id;
revoke all on public.ad_totals from anon, authenticated;

-- 5. ADMIN, SETTINGS, BETA & ERROR TELEMETRY
create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','sales','moderator','analyst'))
);
create table if not exists public.audit_log (
  id bigserial primary key, at timestamptz not null default now(),
  actor text not null, action text not null, target text, detail jsonb
);
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('bug','idea','other')),
  message text not null,
  build text, ctx text,
  player_id uuid references auth.users(id) on delete set null,
  email text, dev_hash text,
  status text not null default 'new' check (status in ('new','done'))
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  msg text not null, src text, line int, build text, ua text, dev_hash text
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

create table if not exists public.beta_invites (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

-- 6. BATCH 6 (OPTION 2): WEEKLY TOURNAMENT WINNERS & MANUAL PAYOUT RECORD
create table if not exists public.tournament_winners (
  id uuid primary key default gen_random_uuid(),
  week integer not null,
  city text not null check (city in ('Lagos','Abuja','Port Harcourt','Kano','Enugu')),
  rank integer not null check (rank between 1 and 10),
  run_id uuid references public.runs(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  display_name text not null,
  total integer not null,
  prize text not null default '',
  status text not null default 'verified' check (status in ('verified','contacted','paid')),
  notes text,
  paid_at timestamptz,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week, rank)
);
create index if not exists tournament_winners_week_idx on public.tournament_winners (week desc, rank asc);

-- 7. ROW LEVEL SECURITY & PERMISSIONS
alter table public.players enable row level security;
alter table public.player_saves enable row level security;
alter table public.runs enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.orders enable row level security;
alter table public.campaigns enable row level security;
alter table public.ad_stats enable row level security;
alter table public.ad_batches enable row level security;
alter table public.ad_unique enable row level security;
alter table public.advertisers enable row level security;
alter table public.advertiser_users enable row level security;
alter table public.staff_roles enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_settings enable row level security;
alter table public.feedback enable row level security;
alter table public.client_errors enable row level security;
alter table public.beta_invites enable row level security;
alter table public.tournament_winners enable row level security;

drop policy if exists "own player" on public.players;
create policy "own player" on public.players for select to authenticated using (id = auth.uid());

drop policy if exists "own save" on public.player_saves;
create policy "own save" on public.player_saves for select to authenticated using (player_id = auth.uid());

drop policy if exists "own runs" on public.runs;
create policy "own runs" on public.runs for select to authenticated using (player_id = auth.uid());

drop policy if exists "own ledger" on public.coin_ledger;
create policy "own ledger" on public.coin_ledger for select to authenticated using (player_id = auth.uid());

drop policy if exists "own orders" on public.orders;
create policy "own orders" on public.orders for select to authenticated using (player_id = auth.uid());

drop policy if exists "live adverts" on public.campaigns;
create policy "live adverts" on public.campaigns for select to anon, authenticated
  using (status = 'live' and current_date between start_date and end_date);

revoke select on public.campaigns from anon, authenticated;
grant select (id, type, status, advertiser, cities, lines, c1, c2, start_date, end_date) on public.campaigns to anon, authenticated;
grant select on public.leaderboard_week to anon, authenticated;
