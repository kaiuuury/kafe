import {createIceConfig} from '../ice-config.mjs';
export {KafeRoom} from './room.mjs';

export async function kafeApi(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/healthz')return Response.json({ok:true});
 if(url.pathname==='/api/config'){
   try{return Response.json(createIceConfig(env)(),{headers:{'Cache-Control':'no-store'}})}
   catch{return Response.json({error:'Configuração da chamada indisponível.'},{status:503})}
 }
 if(url.pathname==='/signal'){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket necessário.',{status:426});
   if(request.headers.get('Origin')!==url.origin)return new Response('Origem não autorizada.',{status:403});
   const room=url.searchParams.get('room');
   if(!room||!/^kafe-[a-f0-9]{32}$/.test(room))return new Response('Convite inválido.',{status:400});
   if(!env.ROOMS)return new Response('Mesa indisponível.',{status:503});
   return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
 }
 return null;
}

export default {async fetch(request,env){
 return await kafeApi(request,env) || env.ASSETS.fetch(request);
}};
