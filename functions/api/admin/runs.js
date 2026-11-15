import { json, sb, readJson, weekNow, uuidRe } from '../_lib.js';
import { staff, audit } from './_admin.js';

const SEL = 'id,week,city,status,total,duration_s,flags,submitted_at,started_at,stage_log,player_id,players(display_name,banned)';

// GET /api/admin/runs?view=review            -> runs waiting for a decision
// GET /api/admin/runs?view=board&week=NN     -> ranked runs for a week (best first)
export async function onRequestGet({ request, env }) {
  const s = await staff(env, request, ['owner', 'moderator']);
  if (s.res) return s.res;
  const u = new URL(request.url);
  const view = u.searchParams.get('view') === 'board' ? 'board' : 'review';
  const week = Number(u.searchParams.get('week')) || weekNow();
  const q = view === 'review'
    ? `runs?status=eq.review&select=${SEL}&order=submitted_at.desc&limit=100`
    : `runs?week=eq.${week}&status=in.(submitted,approved)&select=${SEL}&order=total.desc&limit=50`;
  const r = await sb(env, q);
  if (!r.ok) return json({ error: 'unavailable', detail: r.data }, 502);
  return json({ view, week, runs: r.data || [] });
}

// PUT /api/admin/runs { id, decision: 'approve' | 'reject' | 'ban' }
export async function onRequestPut({ request, env }) {
  const s = await staff(env, request, ['owner', 'moderator']);
  if (s.res) return s.res;
  let b; try { b = await readJson(request, 1000); } catch (e) { return json({ error: 'bad_body' }, 400); }
  if (!uuidRe.test(b.id || '') || !['approve', 'reject', 'ban'].includes(b.decision)) return json({ error: 'bad_request' }, 400);
  const cur = await sb(env, `runs?id=eq.${b.id}&select=id,status,player_id`);
  if (!cur.ok) return json({ error: 'unavailable' }, 502);
  const run = cur.data && cur.data[0];
  if (!run) return json({ error: 'not_found' }, 404);
  if (b.decision === 'approve' && run.status !== 'review') return json({ error: 'not_in_review' }, 409);
  if (['started'].includes(run.status)) return json({ error: 'not_submitted' }, 409);
  const status = b.decision === 'approve' ? 'approved' : 'rejected';
  const w = await sb(env, `runs?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status, reviewed_by: s.user.email || s.user.id } });
  if (!w.ok) return json({ error: 'unavailable', detail: w.data }, 502);
  if (b.decision === 'ban') {
    const p = await sb(env, `players?id=eq.${run.player_id}`, { method: 'PATCH', prefer: 'return=minimal', body: { banned: true } });
    if (!p.ok) return json({ error: 'unavailable', detail: p.data }, 502);
  }
  await audit(env, s.user, 'run.' + b.decision, b.id, { player: run.player_id });
  return json({ ok: true, status });
}
