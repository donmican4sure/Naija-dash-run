import { CITIES, weekNow, json, sb, getUser, readJson, isInt, uuidRe } from '../_lib.js';

async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// POST /api/runs/start  { week, city, did? }  -> starts (or resumes) the ONE ranked run for this account this week.
// did is a random device id; only its hash is kept, so we can spot many accounts on one phone.
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'login_required' }, 401);
  let b; try { b = await readJson(request); } catch (e) { return json({ error: 'bad_request' }, 400); }
  const week = weekNow();
  if (!isInt(b.week, 0, 1e6) || b.week !== week || b.city !== CITIES[week % CITIES.length]) return json({ error: 'wrong_week_or_city', week, city: CITIES[week % CITIES.length] }, 400);
  const dev = uuidRe.test(b.did || '') ? await sha256hex(b.did + '|' + (env.AD_SALT || 'naija-dash')) : null;

  // make sure the player row exists and is not blocked
  await sb(env, 'players?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { id: user.id, display_name: (user.email || 'player').split('@')[0].slice(0, 20) } });
  const p = await sb(env, `players?id=eq.${user.id}&select=banned`);
  if (p.ok && p.data && p.data[0] && p.data[0].banned) return json({ error: 'blocked' }, 403);

  // closed beta: only invited emails may enter the ranked circuit
  const cfg = await sb(env, 'app_settings?key=eq.config&select=value');
  const beta = cfg.ok && cfg.data && cfg.data[0] && cfg.data[0].value && cfg.data[0].value.beta;
  if (beta && beta.on === true) {
    const inv = await sb(env, `beta_invites?email=eq.${encodeURIComponent(String(user.email || '').toLowerCase())}&select=email`);
    if (!inv.ok || !inv.data || !inv.data.length) return json({ error: 'beta_only' }, 403);
  }

  // the database has UNIQUE(player_id, week): a second ranked attempt is impossible, even if the browser is cleared.
  const ins = await sb(env, 'runs', { method: 'POST', prefer: 'return=representation', body: { player_id: user.id, week, city: b.city, status: 'started', dev_hash: dev } });
  if (ins.ok && ins.data && ins.data[0]) return json({ run_id: ins.data[0].id, resumed: false });
  const ex = await sb(env, `runs?player_id=eq.${user.id}&week=eq.${week}&select=id,status,dev_hash,stage_log`);
  const run = ex.ok && ex.data && ex.data[0];
  if (!run) return json({ error: 'could_not_start' }, 500);
  if (run.status !== 'started') return json({ error: 'already_ranked_this_week' }, 409);
  if (dev && !run.dev_hash) await sb(env, `runs?id=eq.${run.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { dev_hash: dev } });
  return json({ run_id: run.id, resumed: true, stages_logged: Array.isArray(run.stage_log) ? run.stage_log.length : 0 });
}
