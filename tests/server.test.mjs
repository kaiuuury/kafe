import test from 'node:test';import assert from 'node:assert/strict';import {WebSocket} from 'ws';import {createKafeServer} from '../server.mjs';
test('mesa isolada, limite de duas pessoas, sincronização e limpeza',async()=>{
 const app=await createKafeServer({production:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port,clients=[];
 async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${port}/signal`,{origin:`http://127.0.0.1:${port}`});clients.push(ws);const messages=[];ws.on('message',v=>messages.push(JSON.parse(v)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});return {ws,messages,send:v=>ws.send(JSON.stringify(v)),next:async type=>{for(let i=0;i<100;i++){const index=messages.findIndex(m=>m.type===type);if(index>=0)return messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,10))}throw Error('Mensagem ausente: '+type)}}}
 try{
 const a=await connect(),b=await connect(),c=await connect(),d=await connect();const room='kafe-'+'a'.repeat(32);
 a.ws.send('null');a.ws.send('[]');a.ws.send('42');a.ws.send('not json');a.send({type:'join',room,name:'A',initial:{scene:2,ritual:6}});const initialWelcome=await a.next('welcome');assert.equal(initialWelcome.peers.length,0);assert.equal(initialWelcome.shared.ritual,6);
 assert.equal(app.rooms.get(room).shared.scene,2);b.send({type:'join',room,name:'B',initial:{scene:0,ritual:0}});assert.equal((await b.next('welcome')).peers[0].name,'A');assert.equal((await a.next('peer')).profile.name,'B');
 assert.equal(app.rooms.get(room).shared.ritual,6);c.send({type:'join',room,name:'C'});assert.match((await c.next('error')).message,/duas/);
 d.send({type:'join',room:'kafe-'+'b'.repeat(32),name:'D'});await d.next('welcome');
 a.send({type:'shared',ritual:4,question:7,scene:2});assert.equal((await b.next('shared')).shared.question,7);await a.next('shared');
 a.send({type:'shared',ritual:200,question:-1});assert.equal((await b.next('shared')).shared.ritual,4);await a.next('shared');
 b.send({type:'shared',ritual:6});assert.equal((await a.next('shared')).shared.ritual,6);assert.equal((await b.next('shared')).shared.ritual,6);
 a.send({type:'shared',ritual:7});assert.equal((await b.next('shared')).shared.ritual,6);await a.next('shared');
 a.send({type:'ping'});assert.equal((await a.next('pong')).type,'pong');
 a.send({type:'signal',data:{description:{type:'offer',sdp:'test'}}});assert.equal((await b.next('signal')).data.description.sdp,'test');assert.equal(d.messages.length,0);
 a.send({type:'profile',cam:true,drink:'Chá'});assert.equal((await b.next('profile')).profile.drink,'Chá');
 b.ws.close();await a.next('left');a.ws.close();d.ws.close();await new Promise(r=>setTimeout(r,50));assert.equal(app.rooms.size,0);
 }finally{clients.forEach(c=>c.terminate());await app.close()}
});
test('origem externa não pode abrir sinalização',async()=>{const app=await createKafeServer({production:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{const ws=new WebSocket(`ws://127.0.0.1:${app.server.address().port}/signal`,{origin:'https://example.com'});const message=await new Promise(r=>ws.once('error',e=>r(e.message)));assert.match(message,/403/)}finally{await app.close()}});

test('health check, configuração sem cache e arquivo ausente',async()=>{
 const app=await createKafeServer({production:true,env:{}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{
  const base=`http://127.0.0.1:${app.server.address().port}`;
  assert.deepEqual(await fetch(base+'/healthz').then(r=>r.json()),{ok:true});
  const config=await fetch(base+'/api/config');assert.equal(config.headers.get('cache-control'),'no-store');assert.equal((await config.json()).relayAvailable,false);
  assert.equal((await fetch(base+'/absent.js')).status,404);
 }finally{await app.close()}
});
test('proxy aceita somente a origem pública configurada e rejeita upgrade desconhecido',async()=>{
 const app=await createKafeServer({production:true,env:{KAFE_PUBLIC_ORIGIN:'https://kafe.example.test'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{
  const base=`ws://127.0.0.1:${app.server.address().port}`;
  const accepted=new WebSocket(base+'/signal',{origin:'https://kafe.example.test'});
  await new Promise((resolve,reject)=>{accepted.once('open',resolve);accepted.once('error',reject)});accepted.close();
  for(const [url,origin,code] of [[base+'/signal','http://kafe.example.test',403],[base+'/unknown','https://kafe.example.test',404]]){
   const rejected=new WebSocket(url,{origin});const message=await new Promise(r=>rejected.once('error',e=>r(e.message)));assert.match(message,new RegExp(String(code)));
  }
 }finally{await app.close()}
});
