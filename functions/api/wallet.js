import { json, sb, getUser } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'login_required' }, 401);

  const made = await sb(env, 'players?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates',
    body: {
      id: user.id,
      display_name: (user.email || 'player').split('@')[0].slice(0, 20)
    }
  });
  if (!made.ok) return json({ error: 'player_unavailable' }, 503);

  const player = await sb(env, `players?id=eq.${user.id}&select=banned`);
  if (!player.ok || !player.data?.[0]) return json({ error: 'player_unavailable' }, 503);
  if (player.data[0].banned) return json({ error: 'blocked' }, 403);

  const result = await sb(env, 'rpc/wallet_balance', {
    method: 'POST',
    body: { p_player_id: user.id }
  });

  if (!result.ok || !Number.isSafeInteger(result.data)) {
    return json({ error: 'wallet_unavailable' }, 503);
  }

  return json({ balance: Math.max(0, result.data) });
}
