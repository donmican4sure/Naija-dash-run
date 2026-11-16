import { json, sb, getUser, readJson, isInt } from './_lib.js';
import { audit } from './admin/_admin.js';

const PRICES = [0, 2500, 8000, 22000, 0, 4500, 14000, 35000, 65000, 120000];
const MAX_PER_HOUR = 8000, SLACK = 2500, FIRST_CAP = 150000, MAX_HOURS = 72;
const spent = (d) => (d.o || []).reduce((a, v, i) => a + (v ? (PRICES[i] || 0) : 0), 0);

export function progressOf(d) {
  const owned = (d.o || []).reduce((a, v, i) => a + (v && i !== 0 && i !== 4 ? 1 : 0), 0);
  return owned * 1000000 + d.b[0] + d.b[1];
}

export function clean(x) {
  if (!x || typeof x !== 'object') return null;
  if (!Array.isArray(x.b) || x.b.length !== 2 || !x.b.every((v) => isInt(v, 0, 1e6))) return null;
  const hasFull = isInt(x.c, 0, 1e9) && Array.isArray(x.o) && x.o.length === 10 && x.o.every((v) => v === 0 || v === 1) && isInt(x.car, 0, 9);
  if (!hasFull) return { b: [x.b[0], x.b[1]] };
  const d = { c: x.c, o: x.o.slice(0, 10), car: x.car, b: [x.b[0], x.b[1]] };
  if (x.sel !== undefined && x.sel !== null) { if (!isInt(x.sel, 0, 9)) return null; d.sel = x.sel; }
  return d;
}

async function current(env, id) {
  const r = await sb(env, `player_saves?player_id=eq.${id}&select=data,progress,updated_at`);
  if (!r.ok) return { err: true };
  return { row: (r.data && r.data[0]) || null };
}

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const c = await current(env, user.id);
  if (c.err) return json({ error: 'unavailable' }, 502);
  return json({ save: c.row });
}

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

  let clamped = false;
  if (typeof d.c === 'number' && Array.isArray(d.o)) {
    let allowed = FIRST_CAP;
    if (c.row && c.row.data && Array.isArray(c.row.data.o)) {
      const hrs = Math.min(MAX_HOURS, Math.max(0, (Date.now() - new Date(c.row.updated_at).getTime()) / 3.6e6));
      allowed = (c.row.data.c || 0) + spent(c.row.data) + SLACK + MAX_PER_HOUR * hrs;
    }
    if (d.c + spent(d) > allowed) {
      const asked = d.c;
      d.c = Math.max(0, Math.floor(allowed - spent(d)));
      clamped = true;
      await audit(env, user, 'wallet.clamped', user.id, { asked, kept: d.c });
    }
  }

  const r = await sb(env, 'player_saves?on_conflict=player_id', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { player_id: user.id, data: d, progress, updated_at: new Date().toISOString() },
  });
  if (!r.ok) return json({ error: 'unavailable', detail: r.data }, 502);
  return json({ ok: true, progress: progressOf(d), ...(clamped ? { clamped: true, data: d } : {}) });
}
