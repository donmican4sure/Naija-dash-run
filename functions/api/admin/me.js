import { json } from '../_lib.js';
import { staff } from './_admin.js';

// GET /api/admin/me -> { email, role }
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, null);
  if (s.res) return s.res;
  return json({ email: s.user.email, role: s.role });
}
