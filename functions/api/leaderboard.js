import { CITIES, weekNow, json, sb, isInt } from './_lib.js';

// GET /api/leaderboard?week=NN&city=Lagos&limit=50   (public: only display name, city and scores)
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const week = u.searchParams.has('week') ? Number(u.searchParams.get('week')) : weekNow();
  const city = u.searchParams.get('city') || CITIES[week % CITIES.length];
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get('limit')) || 50));
  if (!isInt(week, 0, 1e6) || !CITIES.includes(city)) return json({ error: 'bad_query' }, 400);
  const r = await sb(env, `leaderboard_week?week=eq.${week}&city=eq.${encodeURIComponent(city)}&order=total.desc&limit=${limit}&select=display_name,total,duration_s`, { anon: true });
  if (!r.ok) return json({ error: 'unavailable', detail: r.data }, 502);
  return json({ week, city, rows: r.data || [] }, 200, { 'cache-control': 'public, max-age=30' });
}
