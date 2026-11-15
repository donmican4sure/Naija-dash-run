import { json, sb, getUser } from '../_lib.js';

// Finds which advertiser this login belongs to. Returns { user, adv: {id,name} } or { res } (error response).
export async function advertiser(env, request) {
  const user = await getUser(env, request);
  if (!user) return { res: json({ error: 'unauthorized' }, 401) };
  const r = await sb(env, `advertiser_users?user_id=eq.${user.id}&select=advertiser_id,advertisers(id,name)`);
  if (!r.ok) return { res: json({ error: 'unavailable' }, 502) };
  const row = r.data && r.data[0];
  if (!row || !row.advertisers) return { res: json({ error: 'not_advertiser' }, 403) };
  return { user, adv: { id: row.advertisers.id, name: row.advertisers.name } };
}
