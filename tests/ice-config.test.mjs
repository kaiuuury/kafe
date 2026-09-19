import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createIceConfig} from '../ice-config.mjs';

test('TURN gera credenciais temporárias sem divulgar o segredo',()=>{
 const secret='test-secret-'.repeat(4);
 const config=createIceConfig({KAFE_TURN_URLS:'turn:relay.example.test:3478,turns:relay.example.test:443',KAFE_TURN_SECRET:secret,KAFE_REQUIRE_TURN:'true'});
 const first=config(),second=config();const turn=first.iceServers.at(-1);
 const expiry=Number(turn.username.split(':')[0]);
 assert.ok(expiry>Date.now()/1000+3590&&expiry<=Date.now()/1000+3601);
 assert.equal(turn.credential,createHmac('sha1',secret).update(turn.username).digest('base64'));
 assert.notEqual(turn.username,second.iceServers.at(-1).username);
 assert.equal(JSON.stringify(first).includes(secret),false);
 assert.equal(first.relayAvailable,true);
});
test('configuração inválida falha antes de iniciar o servidor',()=>{
 for(const env of [{KAFE_ICE_SERVERS:'bad'},{KAFE_ICE_SERVERS:'null'},{KAFE_ICE_SERVERS:'[{}]'},{KAFE_TURN_URLS:'https://example.test'},{KAFE_REQUIRE_TURN:'true'},{KAFE_TURN_TTL:'NaN'}])assert.throws(()=>createIceConfig(env));
 assert.equal(createIceConfig({})().relayAvailable,false);
});
