// Shared helpers for the Naija Dash API (Cloudflare Pages Functions).
export const CITIES = ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Enugu']; // same order as the game
export const STAGES = 25;
export const MAX_STAGE = i => (i === STAGES - 1 ? 1500 : 1000);
export const weekNow = () => Math.floor(Date.now() / 604800000);

export const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

// Supabase REST with the SERVICE ROLE key (server only) or the public anon key.
export async function sb(env, path, { method = 'GET', body, prefer, anon = false } = {}) {
  const key = anon ? env.SUPABASE_ANON_KEY : env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) return { ok: false, status: 500, data: { error: 'missing_env', missing: [!env.SUPABASE_URL && 'SUPABASE_URL', !key && (anon ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY')].filter(Boolean) } };
  let res;
  try { res = await fetch(String(env.SUPABASE_URL).trim().replace(/\/+$/, '') + '/rest/v1/' + path, {
    method,
    headers: { apikey: key, ...(String(key).startsWith('sb_') ? {} : { authorization: 'Bearer ' + key }), 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }); } catch (e) { return { ok: false, status: 502, data: { error: 'fetch_failed', message: String(e && e.message || e) } }; }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { ok: res.ok, status: res.status, data, range: res.headers && res.headers.get ? res.headers.get('content-range') : null };
}

// Verify the player's login token with Supabase. Never trust a user id sent by the browser.
export async function getUser(env, request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: auth } });
  if (!res.ok) return null;
  const u = await res.json();
  return u && u.id ? u : null;
}

export async function readJson(request, maxBytes = 20000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('too_large');
  return JSON.parse(text || '{}');
}

export const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
