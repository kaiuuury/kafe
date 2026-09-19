export class Ambient {
 async start(scene=0,volume=.18){
   this.stop();this.ctx=new AudioContext();await this.ctx.resume();
   const ctx=this.ctx,buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let last=0;
   for(let i=0;i<data.length;i++){const n=Math.random()*2-1;last=(last+.02*n)/1.02;data[i]=scene===0?n*.5:last*3;}
   const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=[1800,450,850][scene];this.gain=ctx.createGain();this.gain.gain.value=volume*.2;src.connect(filter).connect(this.gain).connect(ctx.destination);src.start();
 }
 volume(v){if(this.ctx&&this.gain)this.gain.gain.setTargetAtTime(v*.2,this.ctx.currentTime,.1)}
 stop(){if(this.ctx){this.ctx.close().catch(()=>{});this.ctx=null}}
}
