import { STAGES, MAX_STAGE, json, sb, getUser, readJson, uuidRe, isInt } from '../_lib.js';

const MIN_SECONDS = 900, MAX_SECONDS = 24 * 3600, FAST_FLAG = 1500, TIME_UP_SECONDS = 2520, BURST_GAP = 6;

export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'login_required' }, 401);
  let b; try { b = await readJson(request); } catch (e) { return json({ error: 'bad_request' }, 400); }
  if (!uuidRe.test(b.run_id || '')) return json({ error: 'bad_payload' }, 400);

  if (b.stage_scores !== undefined) {
    if (!Array.isArray(b.stage_scores) || b.stage_scores.length !== STAGES) return json({ error: 'bad_stages' }, 400);
    for (let i = 0; i < STAGES; i++) {
      if (!isInt(b.stage_scores[i], 0, MAX_STAGE(i))) return json({ error: 'score_out_of_range', stage: i }, 400);
    }
  }

  const r = await sb(env, `runs?id=eq.${b.run_id}&player_id=eq.${user.id}&select=id,week,city,status,started_at,stage_log,dev_hash`);
  const run = r.ok && r.data && r.data[0];
  if (!run) return json({ error: 'run_not_found' }, 404);
  if (run.status !== 'started') return json({ error: 'already_submitted' }, 409);

  const serverElapsed = (Date.now() - new Date(run.started_at).getTime()) / 1000;
  if (serverElapsed < MIN_SECONDS) return json({ error: 'too_fast' }, 422);
  if (serverElapsed > MAX_SECONDS) return json({ error: 'expired' }, 422);

  const log = Array.isArray(run.stage_log) ? run.stage_log : [];
  const timeUp = serverElapsed >= TIME_UP_SECONDS;
  const hasClient = Array.isArray(b.stage_scores) && b.stage_scores.length === STAGES;
  if (log.length < STAGES && !timeUp && !hasClient) return json({ error: 'incomplete', logged: log.length }, 409);

  const scores = [];
  for (let i = 0; i < STAGES; i++) {
    const raw = log[i] ? (log[i].s | 0) : (hasClient ? (b.stage_scores[i] | 0) : 0);
    scores.push(Math.min(MAX_STAGE(i), Math.max(0, raw)));
  }

  const total = scores.reduce((a, c) => a + c, 0);
  const flags = [];
  if (serverElapsed < FAST_FLAG) flags.push('fast');
  if (total / STAGES > 900) flags.push('very_high_average');
  if (new Set(scores).size < 5 && (log.length >= STAGES || hasClient)) flags.push('repetitive_scores');

  let burst = 0, prev = new Date(run.started_at).getTime();
  log.forEach((s) => { const t = new Date(s.at).getTime(); if ((t - prev) / 1000 < BURST_GAP) burst++; prev = t; });
  if (burst >= 3) flags.push('burst_stages');
  if (hasClient && log.length === STAGES && log.some((s, i) => b.stage_scores[i] !== s.s)) flags.push('client_mismatch');
  if (run.dev_hash) {
    const d = await sb(env, `runs?week=eq.${run.week}&dev_hash=eq.${run.dev_hash}&player_id=neq.${user.id}&select=id&limit=1`);
    if (d.ok && d.data && d.data.length) flags.push('shared_device');
  }
  const status = flags.length ? 'review' : 'submitted';
  const up = await sb(env, `runs?id=eq.${run.id}&status=eq.started`, {
    method: 'PATCH', prefer: 'return=representation',
    body: { status, total, stage_scores: scores, duration_s: Math.round(serverElapsed), flags, submitted_at: new Date().toISOString() }
  });
  if (!up.ok || !up.data || !up.data[0]) return json({ error: 'could_not_save' }, 409);

  const better = await sb(env, `runs?week=eq.${run.week}&city=eq.${encodeURIComponent(run.city)}&status=in.(submitted,approved)&total=gt.${total}&select=id&limit=1000`);
  return json({ ok: true, total, status, rank: status === 'submitted' && better.ok && Array.isArray(better.data) ? better.data.length + 1 : null, flagged: flags.length > 0 });
}
