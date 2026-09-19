import {createHmac, randomUUID} from 'node:crypto';

// Validate at startup: a typo must not crash the first visitor's request.
export function createIceConfig(env = process.env) {
  let servers;
  try { servers = JSON.parse(env.KAFE_ICE_SERVERS || '[{"urls":"stun:stun.l.google.com:19302"}]'); }
  catch { throw new Error('KAFE_ICE_SERVERS precisa ser um JSON válido.'); }
  if (!Array.isArray(servers) || !servers.every(s => s &&
    (typeof s.urls === 'string' || Array.isArray(s.urls)) &&
    [s.urls].flat().length && [s.urls].flat().every(url => typeof url === 'string' && /^(stun|stuns|turn|turns):\S+$/.test(url)))) {
    throw new Error('KAFE_ICE_SERVERS precisa conter servidores ICE válidos.');
  }
  const urls = (env.KAFE_TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  const secret = env.KAFE_TURN_SECRET;
  if (!!urls.length !== !!secret || urls.some(url => !/^turns?:\S+$/.test(url))) {
    throw new Error('Configure KAFE_TURN_URLS e KAFE_TURN_SECRET juntos, com URLs turn: ou turns:.');
  }
  if (secret && secret.length < 32) throw new Error('KAFE_TURN_SECRET precisa ter pelo menos 32 caracteres.');
  const ttl = Number(env.KAFE_TURN_TTL || 3600);
  if (!Number.isInteger(ttl) || ttl < 600 || ttl > 86400) throw new Error('KAFE_TURN_TTL deve estar entre 600 e 86400 segundos.');
  const relayAvailable = !!urls.length || servers.some(s => [s.urls].flat().some(u => /^turns?:/.test(u)));
  if (env.KAFE_REQUIRE_TURN === 'true' && !relayAvailable) throw new Error('Configure TURN antes de iniciar a publicação.');
  return () => {
    const iceServers = structuredClone(servers);
    if (secret) {
      const username = `${Math.floor(Date.now() / 1000) + ttl}:${randomUUID()}`;
      iceServers.push({urls, username, credential: createHmac('sha1', secret).update(username).digest('base64')});
    }
    return {iceServers, relayAvailable};
  };
}
