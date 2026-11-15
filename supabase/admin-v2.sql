-- Naija Dash admin v2: unique viewers and advertiser logins. Paste into Supabase > SQL Editor > Run. Safe to run twice.

-- Unique viewers: one anonymous, hashed row per device per campaign per day. No personal data.
create table if not exists public.ad_unique (
  day date not null, campaign_id text not null, pid_hash text not null,
  primary key (day, campaign_id, pid_hash)
);
alter table public.ad_unique enable row level security;

-- Advertisers and their logins (read-only portal).
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
alter table public.advertisers enable row level security;
alter table public.advertiser_users enable row level security;
alter table public.campaigns add column if not exists advertiser_id uuid references public.advertisers(id) on delete set null;

-- Players' browsers may read ONLY the public billboard columns of live campaigns (not notes, emails or links to advertisers).
revoke select on public.campaigns from anon, authenticated;
grant select (id, type, status, advertiser, cities, lines, c1, c2, start_date, end_date) on public.campaigns to anon, authenticated;
