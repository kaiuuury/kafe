// Connection metadata survives hibernation only while its WebSocket is alive.
// SDP and ICE candidates are relayed, never attached or written to storage.
export const ROOM_PATTERN = /^kafe-[a-f0-9]{32}$/;
export const LIMITS = Object.freeze({payload: 65536, signal: 60000, messages: 200, windowMs: 10000, joinMs: 15000, idleMs: 90000});
const bounds = Object.freeze({ritual: 6, question: 11, scene: 2});
const encoder = new TextEncoder();
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validRoom(room) { return typeof room === 'string' && ROOM_PATTERN.test(room); }

export function sharedValues(message, initial = {ritual: 1, question: 0, scene: 0}, creating = false) {
  const shared = {...initial};
  for (const [key, max] of Object.entries(bounds)) {
    if (creating && key === 'question') continue;
    if (Number.isInteger(message?.[key]) && message[key] >= 0 && message[key] <= max) shared[key] = message[key];
  }
  return shared;
}

export function validateUpgrade(request, publicOrigin) {
  const url = new URL(request.url);
  if (url.pathname !== '/signal') return {status: 404};
  if (request.method !== 'GET') return {status: 405};
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return {status: 426};
  const room = url.searchParams.get('room');
  if (!validRoom(room) || url.searchParams.getAll('room').length !== 1) return {status: 400};
  let origin;
  try { origin = new URL(request.headers.get('Origin')).origin; } catch { return {status: 403}; }
  const expected = publicOrigin ? new URL(publicOrigin).origin : url.origin;
  if (origin !== expected || !/^https?:/.test(origin)) return {status: 403};
  return {room};
}

export class RoomProtocol {
  constructor(context, now = Date.now) { this.context = context; this.now = now; }

  state(ws) {
    try { const value = ws.deserializeAttachment(); return value?.version === 1 && !value.closed ? value : null; }
    catch { return null; }
  }

  connections() { return this.context.getWebSockets().filter(ws => this.state(ws)); }
  members() { return this.connections().filter(ws => this.state(ws).joined); }

  send(ws, message) {
    try { ws.send(JSON.stringify(message)); return true; }
    catch { this.leave(ws, 1011, 'Conexão encerrada'); return false; }
  }

  relay(ws, message) { for (const peer of this.members()) if (peer !== ws) this.send(peer, message); }

  leave(ws, code = 1000, reason = 'Encontro encerrado') {
    const state = this.state(ws);
    // Erase names and all other connection metadata before sending notifications.
    try { ws.serializeAttachment({version: 1, closed: true}); } catch {}
    try { ws.close(code, reason); } catch {}
    if (state?.joined) this.relay(ws, {type: 'left'});
  }

  reject(ws, message, code = 1008) {
    this.send(ws, {type: 'error', message});
    this.leave(ws, code, message);
    return false;
  }

  attach(ws, room) {
    this.sweep();
    if (!validRoom(room)) return this.reject(ws, 'Convite inválido.');
    const sockets = this.connections();
    if (sockets.some(peer => this.state(peer).room !== room)) return this.reject(ws, 'Convite inválido.');
    // Pending connections reserve a chair for at most 15 seconds.
    if (sockets.length >= 2) return this.reject(ws, 'Esta mesa já tem duas pessoas.');
    const now = this.now();
    ws.serializeAttachment({version: 1, room, joined: false, joinedAt: now, lastSeen: now, windowStart: now, count: 0});
    return true;
  }

  message(ws, raw) {
    this.sweep();
    const state = this.state(ws);
    if (!state) return;
    const now = this.now();
    if (typeof raw !== 'string') { this.leave(ws, 1003, 'Envie mensagens de texto'); return; }
    if (encoder.encode(raw).byteLength > LIMITS.payload) { this.leave(ws, 1009, 'Mensagem muito grande'); return; }
    if (now - state.windowStart >= LIMITS.windowMs) { state.windowStart = now; state.count = 0; }
    state.count += 1;
    state.lastSeen = now;
    ws.serializeAttachment(state);
    if (state.count > LIMITS.messages) { this.leave(ws, 1008, 'Muitas mensagens'); return; }
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!isObject(message)) return;

    if (message.type === 'join' && !state.joined) {
      if (message.room !== state.room || typeof message.name !== 'string' || !message.name.trim() || message.name.length > 40) {
        this.reject(ws, 'Convite inválido ou nome ausente.'); return;
      }
      const peers = this.members();
      if (peers.length >= 2) { this.reject(ws, 'Esta mesa já tem duas pessoas.'); return; }
      state.joined = true;
      state.profile = {name: message.name.trim(), drink: 'Café', mic: false, cam: false};
      state.shared = peers.length ? this.state(peers[0]).shared : sharedValues(message.initial, undefined, true);
      ws.serializeAttachment(state);
      this.send(ws, {type: 'welcome', peers: peers.map(peer => this.state(peer).profile), shared: state.shared});
      this.relay(ws, {type: 'peer', profile: state.profile});
      return;
    }
    if (!state.joined) return;
    if (message.type === 'ping') { this.send(ws, {type: 'pong'}); return; }
    if (message.type === 'signal' && isObject(message.data) && encoder.encode(JSON.stringify(message.data)).byteLength < LIMITS.signal) {
      this.relay(ws, {type: 'signal', data: message.data});
      return;
    }
    if (message.type === 'profile') {
      for (const key of ['mic', 'cam']) if (typeof message[key] === 'boolean') state.profile[key] = message[key];
      if (['Café', 'Chá', 'Chocolate'].includes(message.drink)) state.profile.drink = message.drink;
      ws.serializeAttachment(state);
      this.relay(ws, {type: 'profile', profile: state.profile});
      return;
    }
    if (message.type === 'shared') {
      const shared = sharedValues(message, state.shared);
      for (const member of this.members()) {
        const data = this.state(member);
        data.shared = shared;
        member.serializeAttachment(data);
        this.send(member, {type: 'shared', shared});
      }
    }
  }

  sweep() {
    const now = this.now();
    for (const ws of this.connections()) {
      const state = this.state(ws);
      const deadline = state.joined ? state.lastSeen + LIMITS.idleMs : state.joinedAt + LIMITS.joinMs;
      if (now >= deadline) this.leave(ws, 1008, state.joined ? 'A conexão ficou inativa' : 'Entre em uma mesa');
    }
  }

  nextDeadline() {
    const deadlines = this.connections().map(ws => {
      const state = this.state(ws);
      return state.joined ? state.lastSeen + LIMITS.idleMs : state.joinedAt + LIMITS.joinMs;
    });
    return deadlines.length ? Math.min(...deadlines) : null;
  }
}
