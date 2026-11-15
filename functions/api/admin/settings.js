import { json, sb, readJson } from '../_lib.js';
import { staff, audit } from './_admin.js';

const FLAGS = ['revive', 'daily', 'challenges', 'share'];
const str = (v, n) => (typeof v === 'string' && v.length <= n ? v : null);

// Returns a clean config or { err }
export function cleanConfig(b, prev) {
  if (!b || typeof b !== 'object') return { err: 'bad_config' };
  const m = b.maintenance || {}, a = b.announcement || {}, t = b.tournament || {}, f = b.flags || {}, bt = b.beta || {};
  const mmsg = str(m.msg || '', 200), amsg = str(a.msg || '', 240), prize = str(t.prize || '', 80), ver = str(b.version || '', 30);
  if (mmsg === null || amsg === null || prize === null || ver === null || !/^[\w.-]*$/.test(ver)) return { err: 'bad_config' };
  const flags = {}; FLAGS.forEach((k) => { flags[k] = f[k] !== false; });
  const old = (prev && prev.announcement) || {};
  const id = a.on && amsg && (a.resend || amsg !== old.msg || !old.id) ? String(Date.now()) : (old.id || '');
  return { c: { maintenance: { on: m.on === true, msg: mmsg }, announcement: { on: a.on === true, msg: amsg, id }, flags, tournament: { prize }, beta: { on: bt.on === true }, version: ver } };
}

// GET /api/admin/settings   PUT /api/admin/settings (owner only)
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, null);
  if (s.res) return s.res;
  const r = await sb(env, 'app_settings?key=eq.config&select=value,updated_at,updated_by');
  if (!r.ok) return json({ error: 'unavailable', detail: r.data }, 502);
  const row = r.data && r.data[0];
  return json({ config: row ? row.value : null, updated_at: row ? row.updated_at : null, updated_by: row ? row.updated_by : null, role: s.role });
}

export async function onRequestPut({ request, env }) {
  const s = await staff(env, request, ['owner']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 4000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  const cur = await sb(env, 'app_settings?key=eq.config&select=value');
  if (!cur.ok) return json({ error: 'unavailable' }, 502);
  const c = cleanConfig(b, cur.data && cur.data[0] && cur.data[0].value);
  if (c.err) return json({ error: c.err }, 400);
  const w = await sb(env, 'app_settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { key: 'config', value: c.c, updated_at: new Date().toISOString(), updated_by: s.user.email || s.user.id } });
  if (!w.ok) return json({ error: 'unavailable', detail: w.data }, 502);
  await audit(env, s.user, 'settings.update', 'config', c.c);
  return json({ ok: true, config: c.c });
}
