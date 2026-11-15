-- Naija Dash admin v1. Paste into Supabase > SQL Editor > Run. Safe to run twice.
alter table public.campaigns add column if not exists link text;
alter table public.campaigns add column if not exists notes text;
alter table public.campaigns add column if not exists updated_at timestamptz not null default now();

-- Totals per campaign for the admin screens (server only).
create or replace view public.ad_totals as
  select campaign_id, sum(served)::bigint as served, sum(views)::bigint as views, max(day) as last_day
  from public.ad_stats group by campaign_id;
revoke all on public.ad_totals from anon, authenticated;

-- Game settings (announcements, switches, tournament text). Browser can never read or write it directly.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.app_settings enable row level security;
