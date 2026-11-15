import { json, sb, getUser, readJson } from './_lib.js';

const BAD = ['admin', 'moderator', 'naijadash', 'support', 'official', 'staff', 'owner', 'system', 'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'scam'];

function defName(email) {
  return String(email || 'player').split('@')[0].replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 20) || 'player';
}

// GET /api/profile -> { display_name, is_default }
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const def = defName(user.email);
  await sb(env, 'players?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: { id: user.id, display_name: def },
  });
  const r = await sb(env, `players?id=eq.${user.id}&select=display_name,banned`);
  if (!r.ok) return json({ error: 'unavailable' }, 502);
  const row = r.data && r.data[0];
  const dn = (row && row.display_name) || def;
  return json({ display_name: dn, is_default: dn === 'player' || dn.toLowerCase() === def.toLowerCase(), banned: !!(row && row.banned) });
}

// PUT /api/profile { display_name }
export async function onRequestPut({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  let b;
  try { b = await readJson(request, 1000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  const name = String(b.display_name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 20) return json({ error: 'bad_length' }, 400);
  if (!/^[A-Za-z0-9 _.-]+$/.test(name)) return json({ error: 'bad_chars' }, 400);
  const low = name.toLowerCase();
  if (BAD.some((w) => low.includes(w))) return json({ error: 'not_allowed' }, 400);

  const p = await sb(env, `players?id=eq.${user.id}&select=banned`);
  if (p.ok && p.data && p.data[0] && p.data[0].banned) return json({ error: 'banned' }, 403);

  const tk = await sb(env, `players?display_name=ilike.${encodeURIComponent(name)}&id=neq.${user.id}&select=id&limit=1`);
  if (tk.ok && tk.data && tk.data.length) return json({ error: 'name_taken' }, 409);

  const w = await sb(env, 'players?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: { id: user.id, display_name: name },
  });
  if (!w.ok) return json({ error: w.status === 409 ? 'name_taken' : 'unavailable' }, w.status === 409 ? 409 : 502);
  return json({ ok: true, display_name: name, is_default: false });
}
