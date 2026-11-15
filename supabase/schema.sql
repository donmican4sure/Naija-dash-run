-- Naija Dash database schema. Paste this whole file into Supabase > SQL Editor > Run.
-- Safe rules: the browser can only READ the public leaderboard and live campaigns.
-- Everything that changes data goes through the server functions using the service role key.

create extension if not exists pgcrypto;

-- ============ PLAYERS ============
create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'player',
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ RANKED RUNS (one per account per week) ============
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
  duration_s integer,
  flags text[] not null default '{}',
  reviewed_by text,
  unique (player_id, week)            -- this is what enforces ONE ranked attempt per account per week
);
create index if not exists runs_board_idx on public.runs (week, city, total desc) where status in ('submitted','approved');

-- Public leaderboard: shows only display name, city, week, total and time. Flagged runs stay hidden until approved.
create or replace view public.leaderboard_week with (security_invoker = false) as
  select r.week, r.city, p.display_name, r.total, r.duration_s
  from public.runs r join public.players p on p.id = r.player_id
  where r.status in ('submitted','approved') and p.banned = false;

-- ============ COINS AND ORDERS (used from S4) ============
create table if not exists public.coin_ledger (
  id bigserial primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref text unique,                       -- unique reference: the same payment can never credit twice
  created_at timestamptz not null default now()
);
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

-- ============ ADVERTISING ============
create table if not exists public.campaigns (
  id text primary key,
  type text not null check (type in ('board','takeover','championship','house')),
  status text not null default 'draft' check (status in ('draft','pending','approved','live','paused','ended')),
  advertiser text not null,
  cities text[] not null default '{}',   -- empty = all cities
  lines text[] not null,
  c1 text not null default '#0b3d91',
  c2 text not null default '#f5b800',
  start_date date not null,
  end_date date not null,
  created_by text,
  approved_by text,
  created_at timestamptz not null default now()
);
create table if not exists public.ad_stats (
  day date not null,
  campaign_id text not null,
  placement text not null,
  served bigint not null default 0,
  views bigint not null default 0,
  clicks bigint not null default 0,
  primary key (day, campaign_id, placement)
);
create table if not exists public.ad_batches (   -- stops a retried upload from counting twice
  sid uuid not null, day date not null, campaign_id text not null, placement text not null,
  primary key (sid, day, campaign_id, placement)
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

-- ============ STAFF ROLES AND AUDIT (Ops Console, S2b) ============
create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','sales','moderator','analyst'))
);
create table if not exists public.audit_log (
  id bigserial primary key, at timestamptz not null default now(),
  actor text not null, action text not null, target text, detail jsonb
);

-- ============ ROW LEVEL SECURITY ============
alter table public.players enable row level security;
alter table public.runs enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.orders enable row level security;
alter table public.campaigns enable row level security;
alter table public.ad_stats enable row level security;
alter table public.ad_batches enable row level security;
alter table public.staff_roles enable row level security;
alter table public.audit_log enable row level security;

-- Players can read only their OWN rows. Nobody can write from the browser.
create policy "own player" on public.players for select to authenticated using (id = auth.uid());
create policy "own runs" on public.runs for select to authenticated using (player_id = auth.uid());
create policy "own ledger" on public.coin_ledger for select to authenticated using (player_id = auth.uid());
create policy "own orders" on public.orders for select to authenticated using (player_id = auth.uid());
-- Anyone may read adverts that are live today (the game needs them).
create policy "live adverts" on public.campaigns for select to anon, authenticated
  using (status = 'live' and current_date between start_date and end_date);
-- ad_stats, ad_batches, staff_roles, audit_log: no policies = no browser access at all.

grant select on public.leaderboard_week to anon, authenticated;
