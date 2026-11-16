import { json, readJson, sb } from '../_lib.js';

// POST /api/webhook/flutterwave
export async function onRequestPost({ request, env }) {
  const signature = request.headers.get('verif-hash');
  if (!signature || signature !== env.FLW_SECRET_HASH) {
    return json({ error: 'unauthorized_signature' }, 401);
  }

  let body;
  try {
    body = await readJson(request, 10000);
  } catch (e) {
    return json({ error: 'bad_body' }, 400);
  }

  const event = body && body.event;
  const data = body && body.data;

  if (event === 'charge.completed' && data && data.status === 'successful') {
    const txRef = data.tx_ref;
    const meta = data.meta || {};
    const playerId = meta.player_id;
    const coinsToAdd = parseInt(meta.coins, 10) || 0;

    if (!playerId || coinsToAdd <= 0) {
      return json({ error: 'invalid_metadata' }, 400);
    }

    const ledgerEntry = {
      player_id: playerId,
      delta: coinsToAdd,
      reason: `flutterwave_purchase_${txRef}`
    };

    const r = await sb(env, 'coin_ledger', {
      method: 'POST',
      body: ledgerEntry
    });

    if (!r.ok) {
      return json({ error: 'database_error', detail: r.data }, 502);
    }

    return json({ status: 'success', credited: coinsToAdd });
  }

  return json({ status: 'ignored_event' });
}
