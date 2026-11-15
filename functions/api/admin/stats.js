import { json } from '../_lib.js';
import { staff } from './_admin.js';
import { campaignStats } from '../_stats.js';

// GET /api/admin/stats?campaign=ID&days=30 -> totals, unique viewers, per day, per city
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, ['owner', 'sales', 'analyst']);
  if (s.res) return s.res;
  const u = new URL(request.url);
  const id = u.searchParams.get('campaign') || '';
  const days = Math.min(90, Math.max(1, Number(u.searchParams.get('days')) || 30));
  if (!/^[\w-]{1,40}$/.test(id)) return json({ error: 'bad_campaign' }, 400);
  const st = await campaignStats(env, id, days);
  if (!st) return json({ error: 'unavailable' }, 502);
  return json(st);
}
