import {useEffect,useRef,useState} from 'react';

export function useTable(room,name,initial){
 const session=useRef(null),initialSettings=useRef(initial),mediaLock=useRef(false);
 const profile=useRef({mic:false,cam:false,drink:'Café'});
 const [attempt,setAttempt]=useState(0),[ready,setReady]=useState(false),[canRetry,setCanRetry]=useState(false);
 const [status,setStatus]=useState('Preparando sua mesa…'),[error,setError]=useState(''),[peer,setPeer]=useState(null);
 const [localStream,setLocalStream]=useState(null),[remoteStream,setRemoteStream]=useState(null);
 const [mic,setMic]=useState(false),[cam,setCam]=useState(false),[busy,setBusy]=useState('');
 const [shared,setShared]=useState({ritual:1,question:0,scene:0});
 const send=data=>{const s=session.current;if(s?.active&&s.ws?.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify(data));};
 const updateMedia=s=>{
   if(session.current!==s||!s.active)return;
   setMic(profile.current.mic);setCam(profile.current.cam);
   setLocalStream(new MediaStream(Object.values(s.streams).flatMap(stream=>stream.getTracks())));
   send({type:'profile',...profile.current});
 };
 useEffect(()=>{
   const s={active:true,accepted:false,ws:null,pc:null,streams:{},queue:Promise.resolve(),timer:null};
   session.current=s;
   setReady(false);setCanRetry(false);setError('');setPeer(null);setRemoteStream(null);
   setStatus('Preparando sua mesa…');
   const stopMedia=()=>{
     Object.values(s.streams).forEach(stream=>stream.getTracks().forEach(track=>track.stop()));s.streams={};
     profile.current.mic=false;profile.current.cam=false;
     setMic(false);setCam(false);setLocalStream(null);
   };
   const closePeer=()=>{clearTimeout(s.timer);s.pc?.close();s.pc=null;setRemoteStream(null)};
   const makePeer=offerer=>{
     if(s.pc)return s.pc;
     const p=new RTCPeerConnection({iceServers:s.iceServers});s.pc=p;
     if(offerer)for(const kind of ['audio','video'])p.addTransceiver(s.streams[kind]?.getTracks()[0]||kind,{direction:'sendrecv'});
     const current=()=>s.active&&s.pc===p;
     p.onicecandidate=e=>{if(current()&&e.candidate)send({type:'signal',data:{candidate:e.candidate.toJSON()}})};
     p.ontrack=e=>{if(current())setRemoteStream(old=>new MediaStream([...(old?.getTracks().filter(t=>t.id!==e.track.id)||[]),e.track]))};
     p.onconnectionstatechange=()=>{
       if(!current())return;
       if(p.connectionState==='connected'){clearTimeout(s.timer);setStatus('Vocês estão à mesa');setCanRetry(false);setError('')}
       if(['failed','disconnected'].includes(p.connectionState)){
         setStatus('A conexão entre vocês foi interrompida');setCanRetry(true);
         setError('Tente reconectar à mesa. Seu convite continua o mesmo.');
       }
     };
     s.timer=setTimeout(()=>{if(current()&&p.connectionState!=='connected'){
       setCanRetry(true);setError('A chamada está demorando. Tente reconectar ou mudar de rede.');
     }},25000);
     return p;
   };
   (async()=>{try{
     const response=await fetch('/api/config',{signal:AbortSignal.timeout(10000)});
     if(!response.ok)throw new Error('config');const config=await response.json();if(!s.active)return;
     s.iceServers=config.iceServers;
     const ws=new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/signal?room='+encodeURIComponent(room));s.ws=ws;
     const connectTimer=setTimeout(()=>{if(s.active&&!s.accepted)ws.close()},12000);s.connectTimer=connectTimer;
     ws.onopen=()=>{s.lastPong=Date.now();send({type:'join',room,name,initial:initialSettings.current});s.heartbeat=setInterval(()=>{if(Date.now()-s.lastPong>60000){ws.close();return}send({type:'ping'})},20000)};
     ws.onmessage=event=>{s.queue=s.queue.then(async()=>{
       if(!s.active)return;const m=JSON.parse(event.data);if(m.type==='pong'){s.lastPong=Date.now();return}
       if(m.type==='error'){s.rejected=true;setError(m.message);setStatus('Não foi possível entrar');setCanRetry(true);ws.close();return;}
       if(m.type==='welcome'){
         clearTimeout(connectTimer);s.accepted=true;setReady(true);setShared(m.shared);setStatus('Uma cadeira à espera');
         send({type:'profile',...profile.current});
         if(m.peers.length){setPeer(m.peers[0]);const p=makePeer(true);await p.setLocalDescription(await p.createOffer());if(!s.active)return;send({type:'signal',data:{description:p.localDescription.toJSON()}});setStatus('Conectando vocês…')}
       }
       if(m.type==='peer'){setPeer(m.profile);makePeer(false);setStatus('Conectando vocês…')}
       if(m.type==='profile')setPeer(m.profile);
       if(m.type==='shared')setShared(m.shared);
       if(m.type==='left'){closePeer();setPeer(null);setCanRetry(false);setError('');setStatus('Sua companhia saiu. A mesa continua aberta.')}
       if(m.type==='signal'&&s.accepted){
         const p=makePeer(false);
         if(m.data.description){
           await p.setRemoteDescription(m.data.description);if(!s.active||s.pc!==p)return;
           if(m.data.description.type==='offer'){
             for(const t of p.getTransceivers()){t.direction='sendrecv';const track=s.streams[t.receiver.track.kind]?.getTracks()[0];if(track)await t.sender.replaceTrack(track)}
             await p.setLocalDescription(await p.createAnswer());if(!s.active||s.pc!==p)return;
             send({type:'signal',data:{description:p.localDescription.toJSON()}});
           }
         }else if(m.data.candidate)await p.addIceCandidate(m.data.candidate);
       }
     }).catch(()=>{if(s.active){setCanRetry(true);setError('Não conseguimos conectar a chamada. Tente reconectar à mesa.')}})};
     ws.onerror=()=>{if(s.active)setError('O Kafé perdeu contato com o servidor. Tente reconectar à mesa.')};
     ws.onclose=()=>{clearInterval(s.heartbeat);clearTimeout(connectTimer);if(s.active){s.accepted=false;setReady(false);setCanRetry(true);closePeer();stopMedia();setPeer(null);if(!s.rejected){setStatus('Conexão com a mesa encerrada');setError('Reconecte para retomar o encontro. Câmera e microfone foram desligados.')}}};
   }catch{if(s.active){setCanRetry(true);setError('Não foi possível preparar a mesa. Verifique sua conexão.')}}})();
   return()=>{s.active=false;clearInterval(s.heartbeat);clearTimeout(s.connectTimer);s.ws?.close();closePeer();stopMedia()};
 },[room,name,attempt]);
 const toggle=async kind=>{
   const s=session.current;if(mediaLock.current||!s?.accepted||!s.active)return;
   mediaLock.current=true;setBusy(kind);setError('');const key=kind==='audio'?'mic':'cam';let acquired;
   try{
     if(profile.current[key]){
       s.streams[kind]?.getTracks().forEach(t=>t.stop());delete s.streams[kind];profile.current[key]=false;
       updateMedia(s);await s.pc?.getTransceivers().find(t=>t.receiver.track.kind===kind)?.sender.replaceTrack(null);
     }else{
       if(!navigator.mediaDevices?.getUserMedia)throw new Error('secure');
       acquired=await navigator.mediaDevices.getUserMedia(kind==='audio'?{audio:{echoCancellation:true,noiseSuppression:true}}:{video:{width:{ideal:1280},height:{ideal:720}}});
       if(!s.active||!s.accepted){acquired.getTracks().forEach(t=>t.stop());return}
       await s.pc?.getTransceivers().find(t=>t.receiver.track.kind===kind)?.sender.replaceTrack(acquired.getTracks()[0]);
       if(!s.active||!s.accepted){acquired.getTracks().forEach(t=>t.stop());return}
       s.streams[kind]=acquired;profile.current[key]=true;
       acquired.getTracks()[0].onended=()=>{if(s.active&&s.streams[kind]===acquired){delete s.streams[kind];profile.current[key]=false;updateMedia(s)}};
       updateMedia(s);
     }
   }catch(e){
     acquired?.getTracks().forEach(t=>t.stop());
     if(s.active)setError(e.message==='secure'?'Câmera e microfone precisam de HTTPS ou localhost.':e.name==='NotAllowedError'?'A permissão foi recusada. Você pode liberá-la no navegador e tentar de novo.':'Não foi possível abrir esse dispositivo. Confira se ele está disponível.');
   }finally{mediaLock.current=false;setBusy('')}
 };
 return {status,error,peer,localStream,remoteStream,mic,cam,busy,shared,ready,canRetry,toggle,
   reconnect:()=>setAttempt(n=>n+1),setShared:change=>send({type:'shared',...change}),
   setDrink:drink=>{profile.current.drink=drink;send({type:'profile',...profile.current})}};
}

