import { json, sb, readJson, CITIES, uuidRe } from '../_lib.js';
import { staff, audit } from './_admin.js';

const TYPES = ['board', 'takeover', 'championship', 'house'];
const STATUSES = ['draft', 'pending', 'approved', 'live', 'paused', 'ended'];
const hex = /^#[0-9a-fA-F]{6}$/;
const day = /^\d{4}-\d{2}-\d{2}$/;
const lineOk = (s) => typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 22;

// Returns a clean campaign object or { err }.  partial = true allows missing fields (for updates).
export function clean(b, partial) {
  const o = {};
  const need = (k) => !partial || b[k] !== undefined;
  if (need('type')) { if (!TYPES.includes(b.type)) return { err: 'bad_type' }; o.type = b.type; }
  if (need('advertiser')) { const a = String(b.advertiser || '').trim(); if (a.length < 1 || a.length > 60) return { err: 'bad_advertiser' }; o.advertiser = a; }
  if (need('cities')) { if (!Array.isArray(b.cities) || !b.cities.every((c) => CITIES.includes(c))) return { err: 'bad_cities' }; o.cities = b.cities; }
  if (need('lines')) { if (!Array.isArray(b.lines) || b.lines.length !== 2 || !b.lines.every(lineOk)) return { err: 'bad_lines' }; o.lines = b.lines.map((s) => s.trim().toUpperCase()); }
  if (need('c1')) { if (!hex.test(b.c1 || '')) return { err: 'bad_color' }; o.c1 = b.c1; }
  if (need('c2')) { if (!hex.test(b.c2 || '')) return { err: 'bad_color' }; o.c2 = b.c2; }
  if (need('start_date')) { if (!day.test(b.start_date || '')) return { err: 'bad_date' }; o.start_date = b.start_date; }
  if (need('end_date')) { if (!day.test(b.end_date || '')) return { err: 'bad_date' }; o.end_date = b.end_date; }
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return { err: 'bad_status' }; o.status = b.status; }
  if (b.advertiser_id !== undefined) { if (b.advertiser_id === null || b.advertiser_id === '') o.advertiser_id = null; else if (uuidRe.test(b.advertiser_id)) o.advertiser_id = b.advertiser_id; else return { err: 'bad_advertiser_id' }; }
  if (b.link !== undefined) { const l = String(b.link || '').trim(); if (l.length > 200) return { err: 'bad_link' }; o.link = l; }
  if (b.notes !== undefined) { const n = String(b.notes || '').trim(); if (n.length > 500) return { err: 'bad_notes' }; o.notes = n; }
  if (o.start_date && o.end_date && o.end_date < o.start_date) return { err: 'end_before_start' };
  return { o };
}

// GET /api/admin/campaigns -> every campaign with total served/views
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, ['owner', 'sales', 'analyst']);
  if (s.res) return s.res;
  const [c, t] = await Promise.all([
    sb(env, 'campaigns?select=*&order=created_at.desc&limit=300'),
    sb(env, 'ad_totals?select=campaign_id,served,views&limit=1000'),
  ]);
  if (!c.ok) return json({ error: 'unavailable', detail: c.data }, 502);
  const tot = {}; ((t.ok && t.data) || []).forEach((r) => { tot[r.campaign_id] = r; });
  return json({ role: s.role, campaigns: (c.data || []).map((r) => ({ ...r, served: Number((tot[r.id] || {}).served || 0), views: Number((tot[r.id] || {}).views || 0) })) });
}

// POST /api/admin/campaigns  (create)
export async function onRequestPost({ request, env }) {
  const s = await staff(env, request, ['owner', 'sales']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 4000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  const c = clean(b, false);
  if (c.err) return json({ error: c.err }, 400);
  const row = { id: 'c-' + crypto.randomUUID().slice(0, 8), status: 'draft', created_by: s.user.email || s.user.id, ...c.o };
  if (row.status === 'live' && s.role !== 'owner') row.status = 'pending';
  const r = await sb(env, 'campaigns', { method: 'POST', prefer: 'return=minimal', body: row });
  if (!r.ok) return json({ error: 'unavailable', detail: r.data }, 502);
  await audit(env, s.user, 'campaign.create', row.id, { advertiser: row.advertiser, type: row.type });
  return json({ ok: true, id: row.id });
}

// PUT /api/admin/campaigns  { id, ...fields }
export async function onRequestPut({ request, env }) {
  const s = await staff(env, request, ['owner', 'sales']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 4000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  if (typeof b.id !== 'string' || !/^[\w-]{1,40}$/.test(b.id)) return json({ error: 'bad_id' }, 400);
  const c = clean(b, true);
  if (c.err) return json({ error: c.err }, 400);
  const o = c.o;
  if (o.status === 'live' || o.status === 'approved') {
    if (s.role !== 'owner') return json({ error: 'only_owner_can_approve' }, 403);
    o.approved_by = s.user.email || s.user.id;
  }
  if (!Object.keys(o).length) return json({ error: 'nothing_to_change' }, 400);
  const cur = await sb(env, `campaigns?id=eq.${encodeURIComponent(b.id)}&select=start_date,end_date`);
  if (!cur.ok) return json({ error: 'unavailable' }, 502);
  if (!cur.data || !cur.data[0]) return json({ error: 'not_found' }, 404);
  const sd = o.start_date || cur.data[0].start_date, ed = o.end_date || cur.data[0].end_date;
  if (ed < sd) return json({ error: 'end_before_start' }, 400);
  o.updated_at = new Date().toISOString();
  const r = await sb(env, `campaigns?id=eq.${encodeURIComponent(b.id)}`, { method: 'PATCH', prefer: 'return=minimal', body: o });
  if (!r.ok) return json({ error: 'unavailable', detail: r.data }, 502);
  await audit(env, s.user, 'campaign.update', b.id, o);
  return json({ ok: true });
}
