-- Naija Dash trust v1: server-recorded tournament stages and device checks. Paste into Supabase > SQL Editor > Run. Safe to run twice.
alter table public.runs add column if not exists stage_log jsonb not null default '[]'::jsonb;
alter table public.runs add column if not exists dev_hash text;
create index if not exists runs_dev_week_idx on public.runs (week, dev_hash);

-- Adds ONE stage to a started run, in order, atomically. Returns: ok | duplicate | out_of_order:<expected> | not_found | not_started
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
