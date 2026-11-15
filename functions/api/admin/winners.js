import { json, sb, readJson, weekNow, CITIES, uuidRe } from '../_lib.js';
import { staff, audit, authUsers } from './_admin.js';

const DEF_PRIZES = ['₦10,000', '₦5,000', '₦2,500'];

// GET /api/admin/winners?week=NN -> winners for the week + email lookup for manual payout
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, ['owner', 'moderator']);
  if (s.res) return s.res;
  const u = new URL(request.url);
  const week = Number(u.searchParams.get('week')) || weekNow();
  const r = await sb(env, `tournament_winners?week=eq.${week}&select=*&order=rank.asc`);
  if (!r.ok) return json({ error: 'unavailable', detail: r.data }, 502);
  const users = s.role === 'owner' ? ((await authUsers(env)) || []) : [];
  const email = {}; users.forEach((x) => { email[x.id] = x.email; });
  return json({
    week,
    city: CITIES[week % CITIES.length],
    winners: (r.data || []).map((w) => ({ ...w, email: email[w.player_id] || null })),
  });
}

// POST /api/admin/winners { week?, prizes?:['₦10,000','₦5,000','₦2,500'] } -> locks Top 3 from leaderboard into tournament_winners
export async function onRequestPost({ request, env }) {
  const s = await staff(env, request, ['owner']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 2000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  const week = Number(b.week) || weekNow();
  const city = CITIES[week % CITIES.length];
  const prizes = Array.isArray(b.prizes) && b.prizes.length === 3 ? b.prizes.map((p) => String(p || '').trim().slice(0, 40)) : DEF_PRIZES;

  const runs = await sb(env, `runs?week=eq.${week}&status=in.(submitted,approved)&select=id,week,city,total,player_id,players(display_name,banned)&order=total.desc,duration_s.asc&limit=10`);
  if (!runs.ok) return json({ error: 'unavailable' }, 502);
  const eligible = (runs.data || []).filter((x) => x.players && !x.players.banned).slice(0, 3);
  if (!eligible.length) return json({ error: 'no_eligible_runs' }, 404);

  const rows = eligible.map((x, idx) => ({
    week,
    city: x.city || city,
    rank: idx + 1,
    run_id: x.id,
    player_id: x.player_id,
    display_name: (x.players && x.players.display_name) || 'player',
    total: x.total,
    prize: prizes[idx] || DEF_PRIZES[idx] || '',
    status: 'verified',
    updated_by: s.user.email || s.user.id,
    updated_at: new Date().toISOString(),
  }));

  const w = await sb(env, 'tournament_winners?on_conflict=week,rank', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: rows,
  });
  if (!w.ok) return json({ error: 'unavailable', detail: w.data }, 502);
  await audit(env, s.user, 'winners.lock', String(week), { count: rows.length });
  return json({ ok: true, count: rows.length });
}

// PUT /api/admin/winners { id, status:'verified'|'contacted'|'paid', prize?, notes? }
export async function onRequestPut({ request, env }) {
  const s = await staff(env, request, ['owner']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 2000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  if (!uuidRe.test(b.id || '') || !['verified', 'contacted', 'paid'].includes(b.status)) return json({ error: 'bad_request' }, 400);
  const patch = {
    status: b.status,
    updated_by: s.user.email || s.user.id,
    updated_at: new Date().toISOString(),
  };
  if (b.status === 'paid') patch.paid_at = new Date().toISOString();
  if (b.prize !== undefined) patch.prize = String(b.prize || '').trim().slice(0, 40);
  if (b.notes !== undefined) patch.notes = String(b.notes || '').trim().slice(0, 300);

  const w = await sb(env, `tournament_winners?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=minimal', body: patch });
  if (!w.ok) return json({ error: 'unavailable', detail: w.data }, 502);
  await audit(env, s.user, 'winners.' + b.status, b.id, patch);
  return json({ ok: true });
}
