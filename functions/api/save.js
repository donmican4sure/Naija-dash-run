import { json, sb, getUser, readJson, isInt } from './_lib.js';
import { audit } from './admin/_admin.js';

const PRICES = [0, 2500, 8000, 22000, 0, 4500, 14000, 35000, 65000, 120000];
const MAX_PER_HOUR = 45000, SLACK = 25000, FIRST_CAP = 250000, MAX_HOURS = 168;
const spent = (d) => (d.o || []).reduce((a, v, i) => a + (v ? (PRICES[i] || 0) : 0), 0);

export function progressOf(d) {
  const owned = (d.o || []).reduce((a, v, i) => a + (v && i !== 0 && i !== 4 ? 1 : 0), 0);
  const cities = Array.isArray(d.cu) ? d.cu.reduce((a, v, i) => a + (v && i > 0 ? 1 : 0), 0) : 0;
  return owned * 1000000 + cities * 250000 + (d.b ? d.b[0] + d.b[1] : 0);
}

export function clean(x) {
  if (!x || typeof x !== 'object') return null;
  if (!Array.isArray(x.b) || x.b.length !== 2 || !x.b.every((v) => isInt(v, 0, 1e6))) return null;
  const hasFull = isInt(x.c, 0, 1e9) && Array.isArray(x.o) && x.o.length === 10 && x.o.every((v) => v === 0 || v === 1) && isInt(x.car, 0, 9);
  if (!hasFull) return { b: [x.b[0], x.b[1]] };
  const d = { c: x.c, o: x.o.slice(0, 10), car: x.car, b: [x.b[0], x.b[1]] };
  if (x.sel !== undefined && x.sel !== null) { if (!isInt(x.sel, 0, 9)) return null; d.sel = x.sel; }
  if (Array.isArray(x.cu) && x.cu.length === 5 && x.cu.every((v) => v === 0 || v === 1)) d.cu = x.cu.slice(0, 5);
  if (isInt(x.cy, 0, 4)) d.cy = x.cy;
  if (x.own && typeof x.own === 'object') d.own = x.own;
  if (x.pt && typeof x.pt === 'object') d.pt = x.pt;
  if (typeof x.plate === 'string') d.plate = x.plate.slice(0, 8);
  if (isInt(x.sk, 0, 10)) d.sk = x.sk;
  if (isInt(x.hn, 0, 10)) d.hn = x.hn;
  if (x.dr && typeof x.dr === 'object' && typeof x.dr.d === 'string' && isInt(x.dr.s, 0, 365)) d.dr = { d: x.dr.d.slice(0, 10), s: x.dr.s };
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
  try { body = await readJson(request, 8000); } catch (e) { return json({ error: 'bad_body' }, 400); }
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
      allowed = Math.max(FIRST_CAP, (c.row.data.c || 0) + spent(c.row.data) + SLACK + MAX_PER_HOUR * hrs);
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
