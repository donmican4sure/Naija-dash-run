import { json, sb, getUser } from '../_lib.js';

export const ROLES = ['owner', 'sales', 'moderator', 'analyst'];

// Checks the login token, then finds the person's staff role. ADMIN_EMAILS (a Cloudflare setting) are always owners.
// allowed = list of roles that may use the endpoint. Returns { user, role } or { res } (an error response).
export async function staff(env, request, allowed) {
  const user = await getUser(env, request);
  if (!user) return { res: json({ error: 'unauthorized' }, 401) };
  const emails = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  let role = emails.includes(String(user.email || '').toLowerCase())  ? 'owner' : null;
  if (!role) {
    const r = await sb(env, `staff_roles?user_id=eq.${user.id}&select=role`);
    if (r.ok && r.data && r.data[0]) role = r.data[0].role;
  }
  if (!role) return { res: json({ error: 'not_staff' }, 403) };
  if (allowed && !allowed.includes(role)) return { res: json({ error: 'forbidden' }, 403) };
  return { user, role };
}

export async function audit(env, user, action, target, detail) {
  await sb(env, 'audit_log', { method: 'POST', prefer: 'return=minimal', body: { actor: user.email || user.id, action, target: String(target || ''), detail: detail || null } });
}

// Looks users up through Supabase's admin API (server only). Returns an array of { id, email }.
export async function authUsers(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, ...(String(key).startsWith('sb_') ? {} : { authorization: 'Bearer ' + key }) };
  const out = [];
  for (let page = 1; page <= 5; page++) {
    let res;
    try { res = await fetch(`${String(env.SUPABASE_URL).replace(/\/+$/, '')}/auth/v1/admin/users?page=${page}&per_page=200`, { headers }); } catch (e) { return null; }
    if (!res.ok) return null;
    const j = await res.json();
    const list = (j && j.users) || [];
    list.forEach((u) => out.push({ id: u.id, email: u.email }));
    if (list.length < 200) break;
  }
  return out;
}
