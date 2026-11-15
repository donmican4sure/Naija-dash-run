import { json, sb } from '../_lib.js';
import { advertiser } from './_adv.js';

// GET /api/advertiser/me -> this advertiser's campaigns (read-only) with totals
export async function onRequestGet({ request, env }) {
  const a = await advertiser(env, request);
  if (a.res) return a.res;
  const c = await sb(env, `campaigns?advertiser_id=eq.${a.adv.id}&select=id,type,status,cities,lines,c1,c2,start_date,end_date&order=created_at.desc&limit=200`);
  if (!c.ok) return json({ error: 'unavailable' }, 502);
  const ids = (c.data || []).map((x) => x.id);
  let tot = {};
  if (ids.length) {
    const t = await sb(env, `ad_totals?campaign_id=in.(${ids.map((i) => encodeURIComponent(i)).join(',')})&select=campaign_id,served,views`);
    ((t.ok && t.data) || []).forEach((r) => { tot[r.campaign_id] = r; });
  }
  return json({ advertiser: a.adv.name, email: a.user.email, campaigns: (c.data || []).map((x) => ({ ...x, served: Number((tot[x.id] || {}).served || 0), views: Number((tot[x.id] || {}).views || 0) })) });
}
