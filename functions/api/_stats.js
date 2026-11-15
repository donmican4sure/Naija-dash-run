import { sb } from './_lib.js';

// Shared by the admin and advertiser reports. Returns null if the database is unavailable.
export async function campaignStats(env, id, days) {
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const q = encodeURIComponent(id);
  const [r, u] = await Promise.all([
    sb(env, `ad_stats?campaign_id=eq.${q}&day=gte.${from}&select=day,placement,served,views&order=day.asc&limit=5000`),
    sb(env, `ad_unique?campaign_id=eq.${q}&day=gte.${from}&select=day,pid_hash&limit=20000`),
  ]);
  if (!r.ok) return null;
  const byDay = {}, byCity = {}; let served = 0, views = 0;
  (r.data || []).forEach((x) => {
    const sv = Number(x.served), vw = Number(x.views), city = String(x.placement).split(':')[0];
    served += sv; views += vw;
    (byDay[x.day] = byDay[x.day] || { day: x.day, served: 0, views: 0, unique: 0 }); byDay[x.day].served += sv; byDay[x.day].views += vw;
    (byCity[city] = byCity[city] || { city, served: 0, views: 0 }); byCity[city].served += sv; byCity[city].views += vw;
  });
  const all = new Set();
  ((u.ok && u.data) || []).forEach((x) => {
    all.add(x.pid_hash);
    (byDay[x.day] = byDay[x.day] || { day: x.day, served: 0, views: 0, unique: 0 }); byDay[x.day].unique++;
  });
  return { campaign: id, days, served, views, unique: all.size, by_day: Object.values(byDay).sort((a, b) => (a.day < b.day ? -1 : 1)), by_city: Object.values(byCity) };
}
