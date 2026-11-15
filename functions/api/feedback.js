import { json, sb, readJson, getUser, uuidRe } from './_lib.js';

async function sha256hex(t) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

// POST /api/feedback { kind:'bug'|'idea'|'other', message, build?, ctx?, did? }   (signed-in or guest; max 5 per hour per person)
export async function onRequestPost({ request, env }) {
  let b; try { b = await readJson(request, 4000); } catch (e) { return json({ error: 'bad_request' }, 400); }
  const kind = ['bug', 'idea', 'other'].includes(b.kind) ? b.kind : null;
  const message = String(b.message || '').trim();
  if (!kind || message.length < 3 || message.length > 1000) return json({ error: 'bad_message' }, 400);
  const user = request.headers.get('authorization') ? await getUser(env, request) : null;
  const dev = uuidRe.test(b.did || '') ? await sha256hex(b.did + '|' + (env.AD_SALT || 'naija-dash')) : null;
  if (!user && !dev) return json({ error: 'bad_request' }, 400);
  const since = new Date(Date.now() - 3600e3).toISOString();
  const who = user ? `player_id=eq.${user.id}` : `dev_hash=eq.${dev}`;
  const c = await sb(env, `feedback?${who}&created_at=gte.${since}&select=id&limit=1`, { prefer: 'count=exact' });
  const n = /\/(\d+)$/.exec((c && c.range) || '');
  if (n && Number(n[1]) >= 5) return json({ error: 'too_many' }, 429);
  const r = await sb(env, 'feedback', { method: 'POST', prefer: 'return=minimal', body: { kind, message, build: String(b.build || '').slice(0, 30), ctx: String(b.ctx || '').slice(0, 200), player_id: user ? user.id : null, email: user ? user.email : null, dev_hash: dev } });
  if (!r.ok) return json({ error: 'unavailable' }, 502);
  return json({ ok: true });
}
