import { json, sb } from './_lib.js';

// GET /api/winners -> public list of verified & paid weekly tournament winners
export async function onRequestGet({ env }) {
  const r = await sb(env, 'tournament_winners?select=week,city,rank,display_name,total,prize,status,paid_at&order=week.desc,rank.asc&limit=60');
  if (!r.ok) return json({ error: 'unavailable' }, 502);
  return json({ winners: r.data || [] }, 200, { 'cache-control': 'public, max-age=60' });
}
