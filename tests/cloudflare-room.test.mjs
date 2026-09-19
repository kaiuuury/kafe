import test from 'node:test';
import assert from 'node:assert/strict';
import {LIMITS, RoomProtocol, validateUpgrade} from '../cloudflare/room-protocol.mjs';

const room = 'kafe-' + 'a'.repeat(32);
const otherRoom = 'kafe-' + 'b'.repeat(32);
class Socket {
  messages = [];
  attachment = null;
  closed = null;
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(value) { if (this.closed) throw Error('closed'); this.messages.push(JSON.parse(value)); }
  close(code, reason) { this.closed = {code, reason}; }
  take(type) { const at = this.messages.findIndex(message => message.type === type); return at >= 0 ? this.messages.splice(at, 1)[0] : undefined; }
}
function harness() {
  const sockets = [];
  let now = 100000;
  const context = {getWebSockets: () => sockets};
  let protocol = new RoomProtocol(context, () => now);
  return {
    get protocol() { return protocol; },
    connect(expected = room) { const ws = new Socket(); sockets.push(ws); protocol.attach(ws, expected); return ws; },
    send(ws, message) { protocol.message(ws, JSON.stringify(message)); },
    join(ws, name = 'Pessoa', initial) { this.send(ws, {type: 'join', room, name, initial}); },
    tick(ms) { now += ms; },
    hibernate() { protocol = new RoomProtocol(context, () => now); },
  };
}

test('Cloudflare: valida upgrade, origem e convite antes de aceitar a conexão', () => {
  const request = (url = `https://kafe.example/signal?room=${room}`, headers = {}, method = 'GET') => new Request(url, {method, headers: {Upgrade: 'websocket', Origin: 'https://kafe.example', ...headers}});
  assert.deepEqual(validateUpgrade(request()), {room});
  assert.equal(validateUpgrade(request(`https://kafe.example/signal?room=${room}&room=${otherRoom}`)).status, 400);
  assert.equal(validateUpgrade(request('https://kafe.example/signal?room=short')).status, 400);
  assert.equal(validateUpgrade(request('https://kafe.example/absent')).status, 404);
  assert.equal(validateUpgrade(request(undefined, {Upgrade: 'none'})).status, 426);
  assert.equal(validateUpgrade(request(undefined, {Origin: 'https://other.example'})).status, 403);
  assert.equal(validateUpgrade(request(undefined, {}, 'POST')).status, 405);
  assert.deepEqual(validateUpgrade(request(undefined, {Origin: 'https://custom.example'}), 'https://custom.example'), {room});
});

test('Cloudflare: duas cadeiras, ritual novo e estado sobrevivem à hibernação', () => {
  const app = harness();
  const a = app.connect(); app.join(a, '  Ana  ', {scene: 2, ritual: 6, question: 9});
  assert.deepEqual(a.take('welcome'), {type: 'welcome', peers: [], shared: {scene: 2, ritual: 6, question: 0}});
  app.hibernate();
  const b = app.connect(); app.join(b, 'Bia', {scene: 0, ritual: 0});
  const welcome = b.take('welcome');
  assert.equal(welcome.peers[0].name, 'Ana'); assert.equal(welcome.shared.ritual, 6);
  assert.equal(a.take('peer').profile.name, 'Bia');
  const c = app.connect();
  assert.match(c.take('error').message, /duas pessoas/); assert.equal(c.closed.code, 1008);
  assert.equal(app.protocol.members().length, 2);
  app.send(a, {type: 'shared', ritual: 6, question: 11, scene: 1});
  assert.deepEqual(b.take('shared').shared, {ritual: 6, question: 11, scene: 1}); a.take('shared');
  app.hibernate();
  app.send(b, {type: 'shared', ritual: 7, question: -1, scene: 3, private: 'ignored'});
  assert.deepEqual(a.take('shared').shared, {ritual: 6, question: 11, scene: 1});
  app.protocol.leave(b); assert.equal(a.take('left').type, 'left');
  app.protocol.leave(b); assert.equal(a.take('left'), undefined);
  const replacement = app.connect(); app.join(replacement, 'Caio');
  assert.equal(replacement.take('welcome').shared.ritual, 6);
});

test('Cloudflare: join não pode trocar o convite e mensagens antes da entrada não são retransmitidas', () => {
  const app = harness(); const a = app.connect(); app.join(a, 'Ana'); a.take('welcome');
  const b = app.connect();
  app.send(b, {type: 'signal', data: {description: {type: 'offer', sdp: 'not admitted'}}});
  assert.equal(a.take('signal'), undefined);
  app.send(b, {type: 'join', room: otherRoom, name: 'Intruso'});
  assert.match(b.take('error').message, /inválido/); assert.equal(b.closed.code, 1008);
  assert.equal(a.take('peer'), undefined); assert.equal(app.protocol.members().length, 1);
});

test('Cloudflare: sinalização isolada, perfil limitado e SDP ausente dos attachments', () => {
  const app = harness(), isolated = harness();
  const a = app.connect(), b = app.connect(), stranger = isolated.connect();
  app.join(a, 'Ana'); app.join(b, 'Bia'); isolated.join(stranger, 'Outro');
  const data = {description: {type: 'offer', sdp: 'private-sdp-marker'}};
  app.send(a, {type: 'signal', data});
  assert.deepEqual(b.take('signal').data, data); assert.equal(stranger.take('signal'), undefined);
  assert.equal(JSON.stringify([a.attachment, b.attachment]).includes('private-sdp-marker'), false);
  app.send(a, {type: 'profile', name: 'Renomeada', mic: true, cam: 'true', drink: 'Chá'});
  assert.deepEqual(b.take('profile').profile, {name: 'Ana', mic: true, cam: false, drink: 'Chá'});
  app.protocol.leave(a);
  assert.equal(JSON.stringify(a.attachment).includes('Ana'), false);
});

test('Cloudflare: heartbeat mantém cadeira e alarm libera conexão sem atividade', () => {
  const app = harness(); const a = app.connect(); app.join(a, 'Ana');
  const pending = app.connect();
  app.tick(LIMITS.joinMs); app.protocol.sweep(); assert.equal(pending.closed.code, 1008);
  const b = app.connect(); app.join(b, 'Bia');
  app.tick(60000); app.send(a, {type: 'ping'}); assert.equal(a.take('pong').type, 'pong');
  app.hibernate(); app.tick(30000); app.protocol.sweep();
  assert.equal(a.closed, null); assert.equal(b.closed.code, 1008); assert.equal(a.take('left').type, 'left');
  app.tick(60000); app.protocol.sweep(); assert.equal(a.closed.code, 1008); assert.equal(app.protocol.nextDeadline(), null);
  const fresh = app.connect(); app.join(fresh, 'Nova'); assert.deepEqual(fresh.take('welcome').shared, {ritual: 1, question: 0, scene: 0});
});

test('Cloudflare: limites de mensagens, bytes UTF-8 e quadros binários sobrevivem à hibernação', () => {
  const app = harness(); const a = app.connect(); app.join(a, 'Ana');
  for (const malformed of ['null', '[]', '42', '{']) app.protocol.message(a, malformed);
  assert.equal(a.closed, null);
  app.hibernate();
  for (let i = 0; i < LIMITS.messages; i++) app.send(a, {type: 'ping'});
  assert.equal(a.closed.code, 1008);
  const b = app.connect(); app.join(b, 'Bia');
  app.protocol.message(b, 'á'.repeat(LIMITS.payload / 2 + 1)); assert.equal(b.closed.code, 1009);
  const c = app.connect(); app.protocol.message(c, new ArrayBuffer(1)); assert.equal(c.closed.code, 1003);
});
