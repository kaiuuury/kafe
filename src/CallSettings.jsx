import React,{useEffect,useRef} from 'react';
import {X,RefreshCw} from 'lucide-react';

export function CallSettings({call,volume,onVolume,listening,onListening,onClose}){
 const preview=useRef(null);
 useEffect(()=>{call.refreshDevices()},[call.refreshDevices]);
 useEffect(()=>{
   const video=preview.current;
   if(video){video.srcObject=call.localStream;if(call.localStream)video.play().catch(()=>{})}
   return()=>{if(video)video.srcObject=null};
 },[call.localStream,call.cam]);
 const options=(kind,selected)=>{
   const items=call.devices.filter(d=>d.kind===kind&&d.deviceId&&d.deviceId!=='default');
   return <><option value="">Padrão do sistema</option>{selected&&!items.some(d=>d.deviceId===selected)&&<option value={selected}>Dispositivo selecionado</option>}{items.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||(kind==='audioinput'?'Microfone ':'Câmera ')+(i+1)}</option>)}</>;
 };
 return <div className="modal-backdrop" onClick={onClose}>
   <section role="dialog" aria-modal="true" aria-labelledby="call-settings-title" className="modal call-settings" onClick={e=>e.stopPropagation()}>
     <button className="close" aria-label="Fechar ajustes da chamada" onClick={onClose}><X/></button>
     <h2 id="call-settings-title">Áudio e vídeo, do seu jeito.</h2>
     <p className="settings-intro">Escolha os dispositivos e o volume para este encontro.</p>
     {call.cam&&<video ref={preview} className="settings-preview" autoPlay playsInline muted aria-label="Prévia da sua câmera"/>}
     <div className="settings-devices">
       <label>Microfone<select aria-label="Microfone da chamada" value={call.selectedDevices.audio} disabled={!call.ready||!!call.busy} onChange={e=>call.selectDevice('audio',e.target.value)}>{options('audioinput',call.selectedDevices.audio)}</select></label>
       <label>Câmera<select aria-label="Câmera da chamada" value={call.selectedDevices.video} disabled={!call.ready||!!call.busy} onChange={e=>call.selectDevice('video',e.target.value)}>{options('videoinput',call.selectedDevices.video)}</select></label>
     </div>
     <button className="settings-refresh" onClick={call.refreshDevices} disabled={!!call.busy}><RefreshCw size={15}/>Atualizar dispositivos</button>
     <p className="settings-note">Câmera e microfone só ligam quando você escolhe. Os nomes dos dispositivos aparecem após a permissão do navegador.</p>
     <label className="settings-volume">Volume da companhia <output>{Math.round(volume*100)}%</output><input aria-label="Volume da companhia" type="range" min="0" max="1" step="0.05" value={volume} onChange={e=>onVolume(Number(e.target.value))}/></label>
     <button className="outline" onClick={()=>onListening(!listening)} aria-pressed={listening}>{listening?'Silenciar som da chamada':'Ouvir som da chamada'}</button>
     <p className="settings-note">Este volume muda só o que você ouve. O som ambiente tem seu próprio controle.</p>
     {call.error&&<p className="call-error" role="alert">{call.error}</p>}
     <button className="primary" onClick={onClose}>Pronto</button>
   </section>
 </div>;
}
