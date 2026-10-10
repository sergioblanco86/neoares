import { DualDeckMixer } from '../src/audio/dual-deck-mixer.ts';
import { defaultEqualizerSettings } from '../src/shared/equalizer.ts';
import { loadBundledPresetDefinitions } from '../src/visualizer/butterchurn-renderer.ts';
import butterchurn from 'butterchurn';

let owner=null,visual=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rms=values=>Math.sqrt(values.reduce((sum,x)=>sum+((x-128)/128)**2,0)/values.length);
const energy=(bytes,hz,rate)=>{let re=0,im=0;for(let i=0;i<bytes.length;i++){const x=(bytes[i]-128)/128,angle=2*Math.PI*hz*i/rate;re+=x*Math.cos(angle);im+=x*Math.sin(angle)}return Math.hypot(re,im)*2/bytes.length};
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]:0;

async function initOwner(){
  const mixer=new DualDeckMixer(),initialTap=mixer.createPostMasterAnalysisTap(),context=initialTap.context;
  initialTap.release();await context.audioWorklet.addModule(new URL('./native-visualizer-proof-worklet.js',import.meta.url));
  const loudness={integratedLufs:-14,samplePeakDbfs:-1,recommendedGainDb:0,targetLufs:-14,ceilingDbfs:-1,analysisVersion:'loudness-v2'};
  for(const [slot,hz] of [['A',[93.75,375]],['B',[1500,6000]]]){
    const buffer=context.createBuffer(2,context.sampleRate*180,context.sampleRate);
    for(let channel=0;channel<2;channel++){const data=buffer.getChannelData(channel);for(let i=0;i<data.length;i++)data[i]=.18*Math.sin(2*Math.PI*hz[channel]*i/context.sampleRate)}
    mixer.loadPrepared(slot,{buffer,analysis:{bpm:120,firstBeatSeconds:0,confidence:1,loudness},waveform:[]});
  }
  owner={mixer,context,node:null,tap:null,control:null,created:0,disposed:0,lastStats:null};
  mixer.setVolume(.8);await mixer.play('A');
  return {sampleRate:context.sampleRate,baseLatency:context.baseLatency,outputLatency:context.outputLatency,state:context.state};
}
async function attachOwner(peer){
  const tap=owner.mixer.createPostMasterAnalysisTap();
  const node=new AudioWorkletNode(owner.context,'proof-pcm',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});
  tap.node.connect(node);node.connect(owner.context.destination);
  owner.node=node;owner.tap=tap;owner.created++;
  node.port.postMessage({type:'attach',peer},[peer]);
}
function controlOwner(peer){owner.control=peer;peer.start();peer.postMessage({type:'state',state:owner.context.state})}
async function detachOwner(){
  if(!owner.node)return;
  const node=owner.node;
  const stats=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Worklet disposal acknowledgement timed out')),2000);
    node.port.onmessage=({data})=>{if(data.disposed){clearTimeout(timer);resolve(data)}};
    node.port.postMessage({type:'dispose'});
  });
  node.disconnect();owner.tap.release();node.port.close();owner.control?.close();
  owner.node=null;owner.tap=null;owner.control=null;owner.disposed++;owner.lastStats=stats;return stats;
}
async function ownerStats(){
  const bridge=owner.node&&owner.context.state==='running'?await new Promise(resolve=>{owner.node.port.onmessage=({data})=>resolve(data);owner.node.port.postMessage({type:'stats'})}):owner.lastStats;
  return {time:owner.context.currentTime,state:owner.context.state,created:owner.created,disposed:owner.disposed,active:!!owner.node,bridge};
}
async function command(type,value){
  if(type==='volume')owner.mixer.setVolume(value);
  if(type==='pause')await owner.mixer.pause();
  if(type==='resume')await owner.mixer.resume();
  if(type==='seek')owner.mixer.seek('A',value);
  if(type==='eq')owner.mixer.setEqualizer({...defaultEqualizerSettings(),enabled:value,gainsDb:value?[0,0,8,0,0,0,0,0,0,0]:Array(10).fill(0)});
  if(type==='crossfade')return owner.mixer.crossfade('A','B',value);
  owner.control?.postMessage({type:'state',state:owner.context.state});
}
async function initVisual(rate){
  document.querySelector('#owner').hidden=true;
  const canvas=document.querySelector('canvas');canvas.hidden=false;canvas.width=640;canvas.height=360;
  document.querySelector('#label').hidden=false;
  // Metadata context only: no audio source and no connection to its destination.
  const context=new AudioContext({sampleRate:rate});
  await context.suspend();
  const engine=butterchurn.createVisualizer(context,canvas,{width:640,height:360,onlyUseWASM:true});
  const definitions=Object.values(await loadBundledPresetDefinitions());
  await engine.loadPreset(definitions[0],0);
  visual={context,engine,canvas,definitions,peer:null,control:null,latest:null,frame:0,state:'running',lastReceive:0,lastSequence:0,errors:[],stallUntil:0,readings:[],frames:0,rejected:0};
  const silent=new Uint8Array(1024).fill(128);
  let lastTime=performance.now();
  const draw=()=>{
    const now=performance.now(),v=visual;
    if(now<v.stallUntil){v.frame=requestAnimationFrame(draw);return}
    const packet=v.latest;v.latest=null;
    const stale=Date.now()-v.lastReceive>100||(packet&&Date.now()-packet.producedAt>100);
    const usePacket=packet&&v.state==='running'&&!stale;
    const mono=usePacket?new Uint8Array(packet.buffer,0,1024):silent,l=usePacket?new Uint8Array(packet.buffer,1024,1024):silent,r=usePacket?new Uint8Array(packet.buffer,2048,1024):silent;
    try{
      v.engine.render({elapsedTime:Math.min(.1,(now-lastTime)/1000),audioLevels:{timeByteArray:mono,timeByteArrayL:l,timeByteArrayR:r}});
      if(packet||stale||v.state!=='running'){
        const consumed=v.engine.audio.timeArray;
        const consumedRms=Math.sqrt(consumed.reduce((sum,x)=>sum+(x/128)**2,0)/consumed.length);
        v.readings.push({rms:rms(mono),left:rms(l),right:rms(r),consumedRms,
          aL:energy(l,93.75,rate),aR:energy(r,375,rate),bL:energy(l,1500,rate),bR:energy(r,6000,rate),
          wrongL:energy(l,375,rate),wrongR:energy(r,93.75,rate),
          arrival:packet?.arrival??0,renderAge:packet?Date.now()-packet.producedAt:0,sequence:packet?.sequence??0,stale});
        if(v.readings.length>1200)v.readings.shift();
      }
      v.frames++;
    }catch(error){v.errors.push(String(error))}
    if(packet)v.peer.postMessage({type:'return',buffer:packet.buffer},[packet.buffer]);
    lastTime=now;v.frame=requestAnimationFrame(draw);
  };
  draw();return {contextState:context.state,sampleRate:context.sampleRate,renderer:engine.gl.getParameter(engine.gl.RENDERER)};
}
function attachVisual(peer){
  visual.peer=peer;
  peer.onmessage=({data})=>{
    if(data.type!=='pcm'||!(data.buffer instanceof ArrayBuffer)||data.buffer.byteLength!==3072||data.sampleRate!==visual.context.sampleRate||data.sequence<=visual.lastSequence){visual.rejected++;return}
    if(visual.latest)peer.postMessage({type:'return',buffer:visual.latest.buffer},[visual.latest.buffer]);
    visual.lastSequence=data.sequence;
    if(Date.now()-data.producedAt>100){peer.postMessage({type:'return',buffer:data.buffer},[data.buffer]);return}
    visual.lastReceive=Date.now();visual.latest={...data,arrival:Date.now()-data.producedAt};
  };peer.start();
}
function controlVisual(peer){visual.control=peer;peer.onmessage=({data})=>{if(data.type==='state')visual.state=data.state};peer.start()}
function visualStats(){
  const v=visual,values=v.readings;
  const keys=['rms','left','right','consumedRms','aL','aR','bL','bR','wrongL','wrongR'];
  return {frames:v.frames,samples:values.length,lastSequence:v.lastSequence,rejected:v.rejected,errors:v.errors,
    averages:Object.fromEntries(keys.map(key=>[key,values.reduce((sum,x)=>sum+x[key],0)/Math.max(1,values.length)])),
    arrivalP95:percentile(values.map(x=>x.arrival),.95),renderAgeP95:percentile(values.map(x=>x.renderAge),.95),renderAgeMax:Math.max(0,...values.map(x=>x.renderAge)),
    contextState:v.context.state};
}
function reset(){visual.readings=[];visual.frames=0}
async function snapshotPreset(index){
  await visual.engine.loadPreset(visual.definitions[index],0);await sleep(700);
  const thumb=document.createElement('canvas');thumb.width=32;thumb.height=18;
  const ctx=thumb.getContext('2d');ctx.drawImage(visual.canvas,0,0,32,18);
  const pixels=[...ctx.getImageData(0,0,32,18).data].filter((_,i)=>i%4!==3);
  return {index,mean:pixels.reduce((a,b)=>a+b,0)/pixels.length,pixels};
}
async function disposeVisual(){
  cancelAnimationFrame(visual.frame);visual.peer?.close();visual.control?.close();visual.engine.loseGLContext();await visual.context.close();visual=null;
}
window.addEventListener('message',event=>{
  // file:// pages have an opaque postMessage origin ('null') in Chromium.
  // Keep the source-window check; accept null only for this local file fixture.
  const sameOrigin=event.origin===location.origin||(location.protocol==='file:'&&event.origin==='null');
  if(event.source!==window||!sameOrigin||event.data?.type!=='proof:port'||!event.ports[0])return;
  if(owner){if(event.data.kind==='pcm')void attachOwner(event.ports[0]);else controlOwner(event.ports[0])}
  if(visual){if(event.data.kind==='pcm')attachVisual(event.ports[0]);else controlVisual(event.ports[0])}
});
window.proof={initOwner,initVisual,ownerStats,command,detachOwner,visualStats,reset,snapshotPreset,disposeVisual,
  stall:ms=>{visual.stallUntil=performance.now()+ms},disposeOwner:async()=>{await detachOwner();await owner.mixer.dispose()},
  async rateProbe(rate){const context=new AudioContext({sampleRate:rate});const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const engine=butterchurn.createVisualizer(context,canvas,{width:64,height:64,onlyUseWASM:true});const actual=engine.audio.audioContext.sampleRate;engine.loseGLContext();await context.close();return {requested:rate,actual}}
};
