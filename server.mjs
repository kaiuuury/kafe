import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer, WebSocket} from 'ws';
import {createIceConfig} from './ice-config.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
export async function createKafeServer({production=false,env=process.env}={}) {
  const getIceConfig=createIceConfig(env);
  const publicOrigin=env.KAFE_PUBLIC_ORIGIN ? new URL(env.KAFE_PUBLIC_ORIGIN).origin : null;
  const rooms=new Map();
  const vite=production ? null : await (await import('vite')).createServer({root,server:{middlewareMode:true},appType:'spa'});
  const server=http.createServer(async (req,res)=>{
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/healthz') {res.setHeader('Content-Type','application/json');res.end('{"ok":true}');return;}
    if(pathname==='/api/config') {res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(getIceConfig()));return;}
    if(vite){vite.middlewares(req,res);return;}
    try {
      const relative=decodeURIComponent(pathname).replace(/^\/+/, '');
      let file=path.resolve(root,'dist',relative || 'index.html');
      if(!file.startsWith(path.resolve(root,'dist')+path.sep)){res.writeHead(403);res.end();return;}
      let bytes;try{bytes=await fs.readFile(file)}catch{res.writeHead(404);res.end('Não encontrado.');return;}
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'};
      res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(bytes);
    }catch{res.writeHead(500);res.end('Não foi possível abrir o Kafé.');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:65536});
  server.on('upgrade',(req,socket,head)=>{
    if(new URL(req.url,'http://localhost').pathname!=='/signal'){socket.write('HTTP/1.1 404 Not Found\r\n\r\n');socket.destroy();return;}
    if(wss.clients.size>=1200){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}
    let valid=false;try{const origin=new URL(req.headers.origin);valid=['http:','https:'].includes(origin.protocol)&&(publicOrigin ? origin.origin===publicOrigin : origin.host===req.headers.host)}catch{}
    if(!valid){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data))};
  const relay=(ws,data)=>{for(const peer of rooms.get(ws.room)?.members||[])if(peer!==ws)send(peer,data)};
  wss.on('connection',ws=>{
    ws.alive=true;ws.on('pong',()=>ws.alive=true);
    let windowStart=Date.now(),count=0;
    const joinDeadline=setTimeout(()=>{if(!ws.room)ws.close(1008,'Entre em uma mesa')},15000);
    ws.on('message',raw=>{
      if(Date.now()-windowStart>10000){windowStart=Date.now();count=0}if(++count>200){ws.close(1008,'Muitas mensagens');return;}
      let msg;try{msg=JSON.parse(raw)}catch{return;}
      if(!msg || typeof msg!=='object' || Array.isArray(msg))return;
      if(msg.type==='join'&&!ws.room){
        if(typeof msg.room!=='string'||!/^kafe-[a-f0-9]{32}$/.test(msg.room)||typeof msg.name!=='string'||!msg.name.trim()||msg.name.length>40){send(ws,{type:'error',message:'Convite inválido ou nome ausente.'});return;}
        if(!rooms.has(msg.room)){if(rooms.size>=500){send(ws,{type:'error',message:'Todas as mesas estão ocupadas.'});return;}const shared={ritual:1,question:0,scene:0};for(const [key,max] of Object.entries({ritual:6,scene:2}))if(Number.isInteger(msg.initial?.[key])&&msg.initial[key]>=0&&msg.initial[key]<=max)shared[key]=msg.initial[key];rooms.set(msg.room,{members:new Set(),shared});}
        const room=rooms.get(msg.room);if(room.members.size>=2){send(ws,{type:'error',message:'Esta mesa já tem duas pessoas.'});ws.close(1008,'Mesa cheia');return;}
        ws.room=msg.room;ws.profile={name:msg.name.trim(),drink:'Café',mic:false,cam:false};clearTimeout(joinDeadline);
        const peers=[...room.members].map(p=>p.profile);room.members.add(ws);
        send(ws,{type:'welcome',peers,shared:room.shared});relay(ws,{type:'peer',profile:ws.profile});return;
      }
      if(!ws.room)return;
      if(msg.type==='ping'){send(ws,{type:'pong'});return;}
      if(msg.type==='signal'&&msg.data&&typeof msg.data==='object'&&!Array.isArray(msg.data)&&JSON.stringify(msg.data).length<60000)relay(ws,{type:'signal',data:msg.data});
      if(msg.type==='profile'){
        if(typeof msg.mic==='boolean')ws.profile.mic=msg.mic;if(typeof msg.cam==='boolean')ws.profile.cam=msg.cam;
        if(['Café','Chá','Chocolate'].includes(msg.drink))ws.profile.drink=msg.drink;
        relay(ws,{type:'profile',profile:ws.profile});
      }
      if(msg.type==='shared'){
        const room=rooms.get(ws.room);const bounds={ritual:6,question:11,scene:2};
        for(const key of Object.keys(bounds))if(Number.isInteger(msg[key])&&msg[key]>=0&&msg[key]<=bounds[key])room.shared[key]=msg[key];
        for(const member of room.members)send(member,{type:'shared',shared:room.shared});
      }
    });
    ws.on('close',()=>{clearTimeout(joinDeadline);const room=rooms.get(ws.room);if(room){room.members.delete(ws);relay(ws,{type:'left'});if(!room.members.size)rooms.delete(ws.room)}});
    ws.on('error',()=>{});
  });
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},30000);
  return {server,rooms,close:async()=>{clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));if(vite)await vite.close();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {server}=await createKafeServer({production:process.argv.includes('--production')});
  server.listen(Number(process.env.PORT)||4177,process.env.HOST||'127.0.0.1',()=>console.log('Kafé disponível em http://localhost:'+(process.env.PORT||4177)));
}
