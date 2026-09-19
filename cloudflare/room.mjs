import {DurableObject} from 'cloudflare:workers';
import {RoomProtocol, validateUpgrade} from './room-protocol.mjs';

// The outer Worker MUST route /signal?room=<id> with namespace.getByName(room).
// No application data is stored in ctx.storage; only expiry alarms use storage.
export class KafeRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.protocol = new RoomProtocol(ctx);
  }

  async fetch(request) {
    const result = validateUpgrade(request, this.env.KAFE_PUBLIC_ORIGIN);
    if (result.status) return new Response('Convite ou conexão inválida.', {status: result.status});
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    this.protocol.attach(server, result.room);
    await this.scheduleAlarm();
    return new Response(null, {status: 101, webSocket: client});
  }

  async webSocketMessage(ws, message) {
    this.protocol.message(ws, message);
    await this.scheduleAlarm();
  }

  async webSocketClose(ws) {
    this.protocol.leave(ws);
    await this.scheduleAlarm();
  }

  async webSocketError(ws) {
    this.protocol.leave(ws, 1011, 'Conexão interrompida');
    await this.scheduleAlarm();
  }

  async alarm() {
    this.protocol.sweep();
    await this.scheduleAlarm();
  }

  async scheduleAlarm() {
    const next = this.protocol.nextDeadline();
    const current = await this.ctx.storage.getAlarm();
    if (next === null) {
      if (current !== null) await this.ctx.storage.deleteAlarm();
    } else if (current === null || current > next) {
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next));
    }
  }
}
