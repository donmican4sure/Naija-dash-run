import { json, sb, getUser, readJson, isInt } from './_lib.js';
import { audit } from './admin/_admin.js';

const PRICES = [0, 300, 800, 1500, 0, 500, 1200, 2200, 3500, 5000];   // car prices; coins + the value of owned cars can only grow at a believable speed
const MAX_PER_HOUR = 30000, SLACK = 5000, FIRST_CAP = 300000, MAX_HOURS = 72;
const spent = (d) => d.o.reduce((a, v, i) => a + (v ? (PRICES[i] || 0) : 0), 0);

// Progress only ever goes up (owned cars + best distances), so it is used to stop an old
// or empty device from overwriting a better cloud save.
export function progressOf(d) {
  const owned = d.o.reduce((a, v, i) => a + (v && i !== 0 && i !== 4 ? 1 : 0), 0);
  return owned * 1000000 + d.b[0] + d.b[1];
}

export function clean(x) {
  if (!x || typeof x !== 'object') return null;
  if (!isInt(x.c, 0, 1e9) || !Array.isArray(x.o) || x.o.length > 10 || !Array.isArray(x.b) || x.b.length !== 2) return null;
  if (!x.o.every((v) => v === 0 || v === 1)) return null;
  if (!x.b.every((v) => isInt(v, 0, 1e6))) return null;
  if (!isInt(x.car, 0, 9)) return null;
  const d = { c: x.c, o: x.o.concat([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).slice(0, 10), car: x.car, b: x.b };
  if (x.sel !== undefined && x.sel !== null) { if (!isInt(x.sel, 0, 9)) return null; d.sel = x.sel; }
  return d;
}

async function current(env, id) {
  const r = await sb(env, `player_saves?player_id=eq.${id}&select=data,progress,updated_at`);
  if (!r.ok) return { err: true };
  return { row: (r.data && r.data[0]) || null };
}

// GET /api/save  -> { save: {data, progress, updated_at} | null }
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const c = await current(env, user.id);
  if (c.err) return json({ error: 'unavailable' }, 502);
  return json({ save: c.row });
}

// PUT /api/save  body { data: {c,o,car,sel,b} }
export async function onRequestPut({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await readJson(request, 4000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  const d = clean(body && body.data);
  if (!d) return json({ error: 'bad_data' }, 400);
  const progress = progressOf(d);
  const c = await current(env, user.id);
  if (c.err) return json({ error: 'unavailable' }, 502);
  if (c.row && Number(c.row.progress) > progress) return json({ error: 'stale', save: c.row }, 409);
  // Wallet plausibility: stop absurd edits (for example 1,000,000,000 coins) without hurting honest players.
  let allowed = FIRST_CAP;
  if (c.row && c.row.data && Array.isArray(c.row.data.o)) {
    const hrs = Math.min(MAX_HOURS, Math.max(0, (Date.now() - new Date(c.row.updated_at).getTime()) / 3.6e6));
    allowed = c.row.data.c + spent(c.row.data) + SLACK + MAX_PER_HOUR * hrs;
  }
  let clamped = false;
  if (d.c + spent(d) > allowed) {
    const asked = d.c;
    d.c = Math.max(0, Math.floor(allowed - spent(d)));
    clamped = true;
    await audit(env, user, 'wallet.clamped', user.id, { asked, kept: d.c });
  }
  const r = await sb(env, 'player_saves?on_conflict=player_id', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { player_id: user.id, data: d, progress, updated_at: new Date().toISOString() },
  });
  if (!r.ok) return json({ error: 'unavailable', detail: r.data }, 502);
  return json({ ok: true, progress: progressOf(d), ...(clamped ? { clamped: true, data: d } : {}) });
}
