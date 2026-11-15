// Run with:  node tests/run-tests.mjs   (Node 18+). Uses a fake Supabase, no internet needed.
import { onRequestPost as start } from '../functions/api/runs/start.js';
import { onRequestPost as submit } from '../functions/api/runs/submit.js';
import { onRequestGet as board } from '../functions/api/leaderboard.js';
import { onRequestPost as adev } from '../functions/api/ad-events.js';
import { CITIES, weekNow } from '../functions/api/_lib.js';
import { onRequestGet as wallet } from '../functions/api/wallet.js';
import { onRequestGet as getSave, onRequestPut as putSave } from '../functions/api/save.js';

const env = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
const db = { players: [], runs: [], ad: [], ledger: [], saves: [] }; let clock = Date.now();
const users = { tokA: { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', email: 'a@x.com' }, tokB: { id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', email: 'b@x.com' } };
const eq = (rows, q) => { for (const [k, v] of new URLSearchParams(q)) { if (!v.startsWith('eq.')) continue; rows = rows.filter(r => String(r[k]) === v.slice(3)); } return rows; };
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url), m = o.method || 'GET', body = o.body ? JSON.parse(o.body) : null, path = u.pathname;
  const R = (d, s = 200) => new Response(s === 204 ? null : JSON.stringify(d), { status: s });
  if (path === '/auth/v1/user') { const t = (o.headers.authorization || '').slice(7); return users[t] ? R(users[t]) : R({}, 401); }
  if (path === '/rest/v1/players') { if (m === 'POST') { if (!db.players.find(p => p.id === body.id)) db.players.push({ ...body, banned: false }); return R(null, 201); } return R(eq(db.players, u.search)); }
  if (path === '/rest/v1/runs') {
    if (m === 'POST') { if (db.runs.find(r => r.player_id === body.player_id && r.week === body.week)) return R({ code: '23505' }, 409); const r = { id: crypto.randomUUID(), started_at: new Date(clock).toISOString(), flags: [], ...body }; db.runs.push(r); return R([r], 201); }
    let rows = eq(db.runs, u.search); const tg = u.searchParams.get('total'); if (tg && tg.startsWith('gt.')) rows = rows.filter(r => r.total > +tg.slice(3) && ['submitted', 'approved'].includes(r.status));
    if (m === 'PATCH') { rows = rows.filter(r => r.status === 'started'); rows.forEach(r => Object.assign(r, body)); return R(rows); }
    return R(rows);
  }
  if (path === '/rest/v1/leaderboard_week') return R(eq(db.runs.filter(r => ['submitted', 'approved'].includes(r.status)).map(r => ({ ...r, display_name: 'x' })), u.search));
  if (path === '/rest/v1/player_saves') {
    if (m === 'POST') {
      const old = db.saves.find(x => x.player_id === body.player_id);
      if (old) Object.assign(old, body);
      else db.saves.push(body);
      return R(null, 201);
    }
    return R(eq(db.saves, u.search));
  }
  if (path === '/rest/v1/rpc/wallet_balance') return R(db.ledger.filter(x => x.player_id === body.p_player_id).reduce((n,x) => n + x.delta, 0));
  if (path === '/rest/v1/rpc/ad_add') { const k = [body.p_sid, body.p_day, body.p_cid, body.p_pl].join('|'); if (!db.ad.includes(k)) db.ad.push(k); return R(null, 204); }
  return R({}, 404);
};
const req = (tok, body) => new Request('https://x/api', { method: 'POST', headers: tok ? { authorization: 'Bearer ' + tok } : {}, body: JSON.stringify(body) });
let pass = 0, fail = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion'); };
const week = weekNow(), city = CITIES[week % 5], scores = Array.from({ length: 25 }, (_, i) => 400 + (i * 17) % 300);

await t('start needs login', async () => ok((await start({ request: req(null, {}), env })).status === 401));
await t('start rejects the wrong city', async () => ok((await start({ request: req('tokA', { week, city: 'Nowhere' }), env })).status === 400));
let runA;
await t('start creates a ranked run', async () => { const r = await start({ request: req('tokA', { week, city }), env }); ok(r.status === 200); runA = (await r.json()).run_id; ok(runA); });
await t('starting again resumes the SAME run (no extra attempt)', async () => { const j = await (await start({ request: req('tokA', { week, city }), env })).json(); ok(j.run_id === runA && j.resumed); });
await t('submit too fast is rejected', async () => ok((await submit({ request: req('tokA', { run_id: runA, stage_scores: scores, elapsed_s: 1000 }), env })).status === 422));
clock -= 40 * 60 * 1000; db.runs[0].started_at = new Date(clock).toISOString();
await t('another player cannot submit my run', async () => ok((await submit({ request: req('tokB', { run_id: runA, stage_scores: scores, elapsed_s: 2400 }), env })).status === 404));
await t('score above the stage cap is rejected', async () => { const bad = scores.slice(); bad[3] = 5000; ok((await submit({ request: req('tokA', { run_id: runA, stage_scores: bad, elapsed_s: 2400 }), env })).status === 400); });
await t('wrong number of stages is rejected', async () => ok((await submit({ request: req('tokA', { run_id: runA, stage_scores: [1, 2, 3], elapsed_s: 2400 }), env })).status === 400));
await t('a valid run is accepted and ranked', async () => { const r = await submit({ request: req('tokA', { run_id: runA, stage_scores: scores, elapsed_s: 2400 }), env }); const j = await r.json(); ok(r.status === 200 && j.total === scores.reduce((a, c) => a + c, 0) && j.rank === 1 && !j.flagged, JSON.stringify(j)); });
await t('submitting twice is rejected', async () => ok((await submit({ request: req('tokA', { run_id: runA, stage_scores: scores, elapsed_s: 2400 }), env })).status === 409));
await t('after submitting, a new start is refused', async () => ok((await start({ request: req('tokA', { week, city }), env })).status === 409));
await t('leaderboard lists the run', async () => { const j = await (await board({ request: new Request(`https://x/api/leaderboard?week=${week}&city=${encodeURIComponent(city)}`), env })).json(); ok(j.rows.length === 1); });
let runB; await start({ request: req('tokB', { week, city }), env }); runB = db.runs[1].id; db.runs[1].started_at = new Date(clock).toISOString();
await t('a suspicious run is flagged for review and hidden', async () => { const j = await (await submit({ request: req('tokB', { run_id: runB, stage_scores: Array(25).fill(990), elapsed_s: 2400 }), env })).json(); ok(j.flagged && j.status === 'review' && j.rank === null, JSON.stringify(j)); });
await t('ad events are counted once even if sent twice', async () => { const body = { sid: crypto.randomUUID(), days: { [new Date().toISOString().slice(0, 10)]: { 'slang|Lagos:drive:1': [3, 1] } } }; await adev({ request: req(null, body), env }); await adev({ request: req(null, body), env }); ok(db.ad.length === 1); });
await t('ad events reject junk', async () => ok((await adev({ request: req(null, { sid: 'nope', days: {} }), env })).status === 400));
await t('wallet requires login', async () => {
  const r = await wallet({ request: new Request('https://x/api/wallet'), env });
  ok(r.status === 401);
});
await t('wallet returns server ledger balance', async () => {
  db.ledger.push({ player_id: users.tokA.id, delta: 250, reason: 'reward' });
  db.ledger.push({ player_id: users.tokA.id, delta: -50, reason: 'purchase' });
  const r = await wallet({ request: new Request('https://x/api/wallet', { headers: { authorization: 'Bearer tokA' } }), env });
  const j = await r.json();
  ok(r.status === 200 && j.balance === 200, JSON.stringify(j));
});
await t('wallet rejects banned accounts', async () => {
  db.players.find(p => p.id === users.tokA.id).banned = true;
  const r = await wallet({ request: new Request('https://x/api/wallet', { headers: { authorization: 'Bearer tokA' } }), env });
  ok(r.status === 403);
  db.players.find(p => p.id === users.tokA.id).banned = false;
});

const saveReq = (tok, method, body) => new Request('https://x/api/save', {
  method,
  headers: tok ? { authorization: 'Bearer ' + tok, 'content-type': 'application/json' } : {},
  body: body === undefined ? undefined : JSON.stringify(body)
});
await t('cloud save requires login', async () => {
  ok((await putSave({ request: saveReq(null, 'PUT', { data: { b: [10, 20] } }), env })).status === 401);
});
await t('cloud save rejects invalid distance data', async () => {
  ok((await putSave({ request: saveReq('tokA', 'PUT', { data: { b: [10, -1] } }), env })).status === 400);
});
await t('cloud save ignores forged wallet and ownership fields', async () => {
  const r = await putSave({ request: saveReq('tokA', 'PUT', {
    data: { b: [100, 200], c: 999999, o: [1,1,1,1,1], car: 9, sel: 9 }
  }), env });
  const row = db.saves.find(x => x.player_id === users.tokA.id);
  ok(r.status === 200 && row && JSON.stringify(row.data) === JSON.stringify({ b: [100, 200] }), JSON.stringify(row));
});
await t('older cloud progress cannot overwrite newer progress', async () => {
  const r = await putSave({ request: saveReq('tokA', 'PUT', { data: { b: [1, 1] } }), env });
  ok(r.status === 409, 'expected stale-save conflict, got ' + r.status);
});
await t('cloud save GET requires login', async () => {
  ok((await getSave({ request: saveReq(null, 'GET'), env })).status === 401);
});

console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
