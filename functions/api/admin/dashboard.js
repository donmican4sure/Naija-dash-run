import { json, sb, weekNow } from '../_lib.js';
import { staff } from './_admin.js';

const count = (r) => { const m = /\/(\d+)$/.exec(r.range || ''); return m ? Number(m[1]) : 0; };

// GET /api/admin/dashboard -> headline numbers
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, null);
  if (s.res) return s.res;
  const today = new Date().toISOString().slice(0, 10), week = weekNow();
  const [pa, pt, rn, ad, lc, fb, er] = await Promise.all([
    sb(env, 'players?select=id&limit=1', { prefer: 'count=exact' }),
    sb(env, `players?select=id&created_at=gte.${today}T00:00:00Z&limit=1`, { prefer: 'count=exact' }),
    sb(env, `runs?week=eq.${week}&select=status&limit=2000`),
    sb(env, `ad_stats?day=eq.${today}&select=served,views&limit=2000`),
    sb(env, 'campaigns?status=eq.live&select=id&limit=200'),
    sb(env, 'feedback?status=eq.new&select=id&limit=1', { prefer: 'count=exact' }),
    sb(env, `client_errors?created_at=gte.${new Date(Date.now() - 864e5).toISOString()}&select=id&limit=1`, { prefer: 'count=exact' }),
  ]);
  const runs = { started: 0, submitted: 0, review: 0, approved: 0, rejected: 0 };
  ((rn.ok && rn.data) || []).forEach((r) => { if (r.status in runs) runs[r.status]++; });
  let views = 0, served = 0; ((ad.ok && ad.data) || []).forEach((r) => { views += Number(r.views); served += Number(r.served); });
  return json({ role: s.role, players_total: count(pa), players_today: count(pt), week, runs, ad_views_today: views, ad_served_today: served, live_campaigns: ((lc.ok && lc.data) || []).length, feedback_new: count(fb), errors_24h: count(er) });
}
