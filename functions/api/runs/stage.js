import { STAGES, MAX_STAGE, json, sb, getUser, readJson, isInt, uuidRe } from '../_lib.js';

const bdOk = (x) => x === undefined || (Number.isFinite(x) && Math.abs(x) <= 1e6);

// POST /api/runs/stage { run_id, i, score, bd:{t,d,r,s} }
// The game reports each tournament stage the moment it ends. The server stamps the time, so scores cannot all be sent at once at the end.
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'login_required' }, 401);
  let b; try { b = await readJson(request, 2000); } catch (e) { return json({ error: 'bad_request' }, 400); }
  if (!uuidRe.test(b.run_id || '') || !isInt(b.i, 0, STAGES - 1)) return json({ error: 'bad_payload' }, 400);
  if (!isInt(b.score, 0, MAX_STAGE(b.i))) return json({ error: 'score_out_of_range', stage: b.i + 1 }, 400);
  const bd = b.bd && typeof b.bd === 'object' ? b.bd : {};
  if (!['t', 'd', 'r', 's'].every((k) => bdOk(bd[k]))) return json({ error: 'bad_breakdown' }, 400);
  const clean = { t: bd.t | 0, d: bd.d | 0, r: bd.r | 0, s: bd.s | 0 };
  const r = await sb(env, 'rpc/run_stage_add', { method: 'POST', body: { p_run: b.run_id, p_player: user.id, p_idx: b.i, p_score: b.score, p_bd: clean } });
  if (!r.ok) return json({ error: 'unavailable', detail: r.data }, 502);
  const res = String(r.data);
  if (res === 'ok') return json({ ok: true, next: b.i + 1 });
  if (res === 'duplicate') return json({ ok: true, duplicate: true, next: b.i + 1 });
  if (res.startsWith('out_of_order:')) return json({ error: 'out_of_order', expected: Number(res.split(':')[1]) }, 409);
  if (res === 'not_found') return json({ error: 'run_not_found' }, 404);
  return json({ error: 'run_not_open' }, 409);
}
