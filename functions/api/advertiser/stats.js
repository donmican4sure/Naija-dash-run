import { json, sb } from '../_lib.js';
import { advertiser } from './_adv.js';
import { campaignStats } from '../_stats.js';

// GET /api/advertiser/stats?campaign=ID&days=30 -> only for campaigns that belong to this advertiser
export async function onRequestGet({ request, env }) {
  const a = await advertiser(env, request);
  if (a.res) return a.res;
  const u = new URL(request.url);
  const id = u.searchParams.get('campaign') || '';
  const days = Math.min(90, Math.max(1, Number(u.searchParams.get('days')) || 30));
  if (!/^[\w-]{1,40}$/.test(id)) return json({ error: 'bad_campaign' }, 400);
  const own = await sb(env, `campaigns?id=eq.${encodeURIComponent(id)}&advertiser_id=eq.${a.adv.id}&select=id`);
  if (!own.ok) return json({ error: 'unavailable' }, 502);
  if (!own.data || !own.data[0]) return json({ error: 'not_found' }, 404);
  const st = await campaignStats(env, id, days);
  if (!st) return json({ error: 'unavailable' }, 502);
  return json(st);
}
