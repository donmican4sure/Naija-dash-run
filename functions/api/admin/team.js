import { json, sb, readJson, uuidRe } from '../_lib.js';
import { staff, audit, authUsers } from './_admin.js';

const GRANT = ['sales', 'moderator', 'analyst'];

// GET /api/admin/team -> staff list. POST { email, role } adds. DELETE { user_id } removes. Owner only.
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, ['owner']);
  if (s.res) return s.res;
  const r = await sb(env, 'staff_roles?select=user_id,role');
  if (!r.ok) return json({ error: 'unavailable' }, 502);
  const users = (await authUsers(env)) || [];
  const email = {}; users.forEach((u) => { email[u.id] = u.email; });
  return json({ team: (r.data || []).map((x) => ({ user_id: x.user_id, role: x.role, email: email[x.user_id] || null })), owners_from_settings: String(env.ADMIN_EMAILS || '').split(',').map((x) => x.trim()).filter(Boolean) });
}

export async function onRequestPost({ request, env }) {
  const s = await staff(env, request, ['owner']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 1000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  const em = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || !GRANT.includes(b.role)) return json({ error: 'bad_request' }, 400);
  const users = await authUsers(env);
  if (!users) return json({ error: 'lookup_failed' }, 502);
  const u = users.find((x) => String(x.email || '').toLowerCase() === em);
  if (!u) return json({ error: 'user_not_found' }, 404);
  const w = await sb(env, 'staff_roles?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { user_id: u.id, role: b.role } });
  if (!w.ok) return json({ error: 'unavailable', detail: w.data }, 502);
  await audit(env, s.user, 'team.add', em, { role: b.role });
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const s = await staff(env, request, ['owner']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 1000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  if (!uuidRe.test(b.user_id || '')) return json({ error: 'bad_request' }, 400);
  const w = await sb(env, `staff_roles?user_id=eq.${b.user_id}`, { method: 'DELETE', prefer: 'return=minimal' });
  if (!w.ok) return json({ error: 'unavailable', detail: w.data }, 502);
  await audit(env, s.user, 'team.remove', b.user_id, null);
  return json({ ok: true });
}
