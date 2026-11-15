import { json, sb, readJson, uuidRe } from './_lib.js';

async function sha256hex(t) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

// POST /api/errors { msg, src?, line?, build?, ua?, did }  (browser errors from players' phones; max 20 per 10 minutes per phone)
export async function onRequestPost({ request, env }) {
  let b; try { b = await readJson(request, 2000); } catch (e) { return json({ error: 'bad_request' }, 400); }
  const msg = String(b.msg || '').trim().slice(0, 200);
  if (!msg || !uuidRe.test(b.did || '')) return json({ error: 'bad_request' }, 400);
  const dev = await sha256hex(b.did + '|' + (env.AD_SALT || 'naija-dash'));
  const since = new Date(Date.now() - 600e3).toISOString();
  const c = await sb(env, `client_errors?dev_hash=eq.${dev}&created_at=gte.${since}&select=id&limit=1`, { prefer: 'count=exact' });
  const n = /\/(\d+)$/.exec((c && c.range) || '');
  if (n && Number(n[1]) >= 20) return json({ ok: true, dropped: true });
  await sb(env, 'client_errors', { method: 'POST', prefer: 'return=minimal', body: { msg, src: String(b.src || '').slice(0, 100), line: Number.isFinite(b.line) ? b.line | 0 : null, build: String(b.build || '').slice(0, 30), ua: String(b.ua || '').slice(0, 160), dev_hash: dev } });
  return json({ ok: true });
}
