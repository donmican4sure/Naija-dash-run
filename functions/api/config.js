import { json, sb } from './_lib.js';

// GET /api/config -> the few settings the game needs (public, cached for 30 seconds)
export async function onRequestGet({ env }) {
  const r = await sb(env, 'app_settings?key=eq.config&select=value');
  if (!r.ok) return json({ error: 'unavailable' }, 502);
  const v = (r.data && r.data[0] && r.data[0].value) || {};
  const m = v.maintenance || {}, a = v.announcement || {}, t = v.tournament || {};
  return json({ config: { maintenance: { on: m.on === true, msg: m.msg || '' }, announcement: { on: a.on === true, msg: a.msg || '', id: a.id || '' }, flags: v.flags || {}, tournament: { prize: t.prize || '' }, version: v.version || '' } }, 200, { 'cache-control': 'public, max-age=30' });
}
