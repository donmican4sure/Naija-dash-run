import { json, sb, readJson, isInt, uuidRe } from './_lib.js';

async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// POST /api/ad-events { sid:uuid, pid?:uuid, days:{ "YYYY-MM-DD": { "campaignId|placement": [served, views] } } }
// Aggregated counts only. pid is a random device id; it is hashed here and only the hash is kept (used to count unique viewers).
// Each (sid, day, key) is counted once, so retries cannot inflate the totals.
export async function onRequestPost({ request, env }) {
  let b; try { b = await readJson(request, 60000); } catch (e) { return json({ error: 'bad_request' }, 400); }
  if (!uuidRe.test(b.sid || '') || !b.days || typeof b.days !== 'object') return json({ error: 'bad_payload' }, 400);
  const today = Date.now(); let n = 0; const seen = new Set(), rows = [];
  const h = uuidRe.test(b.pid || '') ? await sha256hex(b.pid + '|' + (env.AD_SALT || 'naija-dash')) : null;
  for (const [day, keys] of Object.entries(b.days)) {
    const t = Date.parse(day + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(today - t < 14 * 864e5 && t < today + 864e5)) continue;
    for (const [key, v] of Object.entries(keys || {})) {
      if (n >= 200) break;
      const [cid, pl] = key.split('|');
      if (!cid || !pl || key.length > 80 || !Array.isArray(v) || !isInt(v[0], 0, 5000) || !isInt(v[1], 0, 5000)) continue;
      n++;
      await sb(env, 'rpc/ad_add', { method: 'POST', body: { p_sid: b.sid, p_day: day, p_cid: cid, p_pl: pl, p_s: v[0], p_v: v[1], p_c: 0 } });
      if (h && v[1] > 0 && cid !== 'slang' && !seen.has(day + cid)) { seen.add(day + cid); rows.push({ day, campaign_id: cid, pid_hash: h }); }
    }
  }
  if (rows.length) await sb(env, 'ad_unique?on_conflict=day,campaign_id,pid_hash', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: rows });
  return json({ ok: true, accepted: n });
}
