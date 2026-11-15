-- Naija Dash beta tools: feedback, error reports, invite list. Paste into Supabase > SQL Editor > Run. Safe to run twice.
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

-- Only your server (secret key) can touch these tables.
alter table public.feedback enable row level security;
alter table public.client_errors enable row level security;
alter table public.beta_invites enable row level security;
