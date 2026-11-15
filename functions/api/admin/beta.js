import { json, sb, readJson } from '../_lib.js';
import { staff, audit } from './_admin.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// GET /api/admin/beta?part=invites|feedback|errors   POST { emails:"a@x.com, b@x.com", note? }   DELETE { email }   PUT { id, status }
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, ['owner', 'moderator']);
  if (s.res) return s.res;
  const part = new URL(request.url).searchParams.get('part');
  if (part === 'invites') {
    const r = await sb(env, 'beta_invites?select=email,note,created_at&order=created_at.desc&limit=500');
    return r.ok ? json({ invites: r.data || [] }) : json({ error: 'unavailable' }, 502);
  }
  if (part === 'feedback') {
    const r = await sb(env, 'feedback?select=id,created_at,kind,message,build,ctx,email,status&order=created_at.desc&limit=100');
    return r.ok ? json({ feedback: r.data || [] }) : json({ error: 'unavailable' }, 502);
  }
  if (part === 'errors') {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const r = await sb(env, `client_errors?created_at=gte.${since}&select=msg,src,line,build,created_at,dev_hash&order=created_at.desc&limit=1000`);
    if (!r.ok) return json({ error: 'unavailable' }, 502);
    const g = {};
    (r.data || []).forEach((e) => { const k = e.msg; const x = g[k] || (g[k] = { msg: k, src: e.src, line: e.line, build: e.build, count: 0, phones: new Set(), last: e.created_at }); x.count++; x.phones.add(e.dev_hash); });
    return json({ errors: Object.values(g).map((x) => ({ ...x, phones: x.phones.size })).sort((a, b) => b.count - a.count).slice(0, 50) });
  }
  return json({ error: 'bad_request' }, 400);
}

export async function onRequestPost({ request, env }) {
  const s = await staff(env, request, ['owner']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 6000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  const list = String(b.emails || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const good = [...new Set(list.filter((x) => EMAIL.test(x)))].slice(0, 60);
  if (!good.length) return json({ error: 'no_valid_emails' }, 400);
  const note = String(b.note || '').slice(0, 80) || null;
  const w = await sb(env, 'beta_invites?on_conflict=email', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: good.map((email) => ({ email, note })) });
  if (!w.ok) return json({ error: 'unavailable', detail: w.data }, 502);
  await audit(env, s.user, 'beta.invite', String(good.length), { note });
  return json({ ok: true, added: good.length, skipped: list.length - good.length });
}

export async function onRequestDelete({ request, env }) {
  const s = await staff(env, request, ['owner']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 1000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  const email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return json({ error: 'bad_request' }, 400);
  const w = await sb(env, `beta_invites?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE', prefer: 'return=minimal' });
  if (!w.ok) return json({ error: 'unavailable' }, 502);
  await audit(env, s.user, 'beta.uninvite', email, null);
  return json({ ok: true });
}

export async function onRequestPut({ request, env }) {
  const s = await staff(env, request, ['owner', 'moderator']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 1000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  if (!/^[0-9a-f-]{36}$/.test(b.id || '') || !['new', 'done'].includes(b.status)) return json({ error: 'bad_request' }, 400);
  const w = await sb(env, `feedback?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: b.status } });
  if (!w.ok) return json({ error: 'unavailable' }, 502);
  return json({ ok: true });
}
