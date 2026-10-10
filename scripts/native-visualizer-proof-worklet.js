// Bounded PCM transport directly from the audio thread to the visual renderer.
class ProofPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left=new Float32Array(1024);this.right=new Float32Array(1024);
    this.cursor=0;this.lastEmit=0;this.sequence=0;this.active=true;this.peer=null;
    this.pool=Array.from({length:3},()=>new ArrayBuffer(3072));
    this.sent=0;this.skipped=0;this.outstanding=0;this.maxOutstanding=0;
    this.port.onmessage=({data})=>{
      if(data.type==='attach'){
        this.peer=data.peer;
        this.peer.onmessage=({data:reply})=>{
          if(reply.type==='return'&&reply.buffer instanceof ArrayBuffer&&reply.buffer.byteLength===3072&&this.outstanding>0){this.pool.push(reply.buffer);this.outstanding--}
        };
        this.peer.start();
      }
      if(data.type==='stats')this.port.postMessage(this.stats());
      if(data.type==='dispose'){this.peer?.close();this.peer=null;this.active=false;this.pool=[];this.port.postMessage({...this.stats(),disposed:true})}
    };
  }
  stats(){return {sent:this.sent,skipped:this.skipped,outstanding:this.outstanding,maxOutstanding:this.maxOutstanding,pool:this.pool.length}}
  process(inputs,outputs){
    if(!this.active)return false;
    // Output remains zero: this is analysis, never a second audible path.
    const channels=inputs[0],left=channels?.[0],right=channels?.[1]??left;
    for(let i=0;i<128;i++){this.left[this.cursor]=left?.[i]??0;this.right[this.cursor]=right?.[i]??0;this.cursor=(this.cursor+1)%1024}
    if(this.peer&&currentFrame-this.lastEmit>=sampleRate/60){
      this.lastEmit=currentFrame;
      if(!this.pool.length){this.skipped++;return true}
      const buffer=this.pool.pop(),mono=new Uint8Array(buffer,0,1024),l=new Uint8Array(buffer,1024,1024),r=new Uint8Array(buffer,2048,1024);
      const byte=value=>Math.max(0,Math.min(255,Math.floor((value+1)*128)));
      for(let i=0;i<1024;i++){const j=(this.cursor+i)%1024;l[i]=byte(this.left[j]);r[i]=byte(this.right[j]);mono[i]=byte((this.left[j]+this.right[j])*.5)}
      this.sent++;this.outstanding++;this.maxOutstanding=Math.max(this.maxOutstanding,this.outstanding);
      this.peer.postMessage({type:'pcm',sequence:++this.sequence,producedAt:Date.now(),sampleRate,buffer},[buffer]);
    }
    return true;
  }
}
registerProcessor('proof-pcm',ProofPcm);
