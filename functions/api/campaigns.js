import { json, sb } from './_lib.js';

// GET /api/campaigns -> live adverts for the game (public). The database itself only shows live, in-date campaigns.
export async function onRequestGet({ env }) {
  const r = await sb(env, 'campaigns?select=id,type,advertiser,cities,lines,c1,c2,start_date,end_date&status=eq.live&limit=100', { anon: true });
  if (!r.ok) return json({ error: 'unavailable' }, 502);
  const list = (r.data || []).map((c) => ({ id: c.id, type: c.type, status: 'live', advertiser: c.advertiser, cities: (c.cities && c.cities.length) ? c.cities : 'all', lines: c.lines, c1: c.c1, c2: c.c2, start: c.start_date, end: c.end_date }));
  return json({ campaigns: list }, 200, { 'cache-control': 'public, max-age=60' });
}
