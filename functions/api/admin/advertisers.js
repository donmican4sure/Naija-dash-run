import { json, sb, readJson, uuidRe } from '../_lib.js';
import { staff, audit, authUsers } from './_admin.js';

// GET    /api/admin/advertisers                      -> advertisers and their portal logins
// POST   /api/admin/advertisers { action:'create', name, contact_email? }
// POST   /api/admin/advertisers { action:'add_user', advertiser_id, email }   (they must have signed in to the game once)
// DELETE /api/admin/advertisers { user_id }          -> removes a portal login
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, ['owner', 'sales']);
  if (s.res) return s.res;
  const [a, u] = await Promise.all([sb(env, 'advertisers?select=id,name,contact_email,created_at&order=name.asc&limit=300'), sb(env, 'advertiser_users?select=user_id,advertiser_id&limit=1000')]);
  if (!a.ok || !u.ok) return json({ error: 'unavailable', detail: (a.ok ? u : a).data }, 502);
  const users = (await authUsers(env)) || [], email = {}; users.forEach((x) => { email[x.id] = x.email; });
  return json({ advertisers: (a.data || []).map((x) => ({ ...x, logins: (u.data || []).filter((y) => y.advertiser_id === x.id).map((y) => ({ user_id: y.user_id, email: email[y.user_id] || null })) })) });
}

export async function onRequestPost({ request, env }) {
  const s = await staff(env, request, ['owner', 'sales']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 1000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  if (b.action === 'create') {
    const name = String(b.name || '').trim();
    if (name.length < 1 || name.length > 60) return json({ error: 'bad_name' }, 400);
    const ce = String(b.contact_email || '').trim().slice(0, 120);
    const r = await sb(env, 'advertisers', { method: 'POST', prefer: 'return=representation', body: { name, contact_email: ce || null } });
    if (!r.ok) return json({ error: r.status === 409 ? 'name_taken' : 'unavailable', detail: r.data }, r.status === 409 ? 409 : 502);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    await audit(env, s.user, 'advertiser.create', name, null);
    return json({ ok: true, id: row && row.id });
  }
  if (b.action === 'add_user') {
    const em = String(b.email || '').trim().toLowerCase();
    if (!uuidRe.test(b.advertiser_id || '') || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return json({ error: 'bad_request' }, 400);
    const users = await authUsers(env);
    if (!users) return json({ error: 'lookup_failed' }, 502);
    const u = users.find((x) => String(x.email || '').toLowerCase() === em);
    if (!u) return json({ error: 'user_not_found' }, 404);
    const w = await sb(env, 'advertiser_users?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { user_id: u.id, advertiser_id: b.advertiser_id } });
    if (!w.ok) return json({ error: 'unavailable', detail: w.data }, 502);
    await audit(env, s.user, 'advertiser.add_login', em, { advertiser_id: b.advertiser_id });
    return json({ ok: true });
  }
  return json({ error: 'bad_request' }, 400);
}

export async function onRequestDelete({ request, env }) {
  const s = await staff(env, request, ['owner', 'sales']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 1000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  if (!uuidRe.test(b.user_id || '')) return json({ error: 'bad_request' }, 400);
  const w = await sb(env, `advertiser_users?user_id=eq.${b.user_id}`, { method: 'DELETE', prefer: 'return=minimal' });
  if (!w.ok) return json({ error: 'unavailable', detail: w.data }, 502);
  await audit(env, s.user, 'advertiser.remove_login', b.user_id, null);
  return json({ ok: true });
}
