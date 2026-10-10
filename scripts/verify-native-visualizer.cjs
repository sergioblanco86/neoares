// Feasibility proof only. No production main/preload, profile, downloads or music.
const { app, BrowserWindow, MessageChannelMain, screen } = require('electron');
const { mkdtempSync, writeFileSync, mkdirSync, copyFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const tailOnly=process.argv.includes('--tail');
const packaged=process.argv.includes('--packaged');
const ownerThrottled=process.argv.includes('--owner-throttled');
const output=mkdtempSync(path.join(tmpdir(),'neoares-native-proof-'));
app.setPath('userData',path.join(output,'profile'));
app.name='NeoAres Technical Validation';
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.on('window-all-closed',()=>{});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={output,mode:packaged?'packaged-file':tailOnly?'remaining-lifecycle':'development-pcm',ownerBackgroundThrottling:ownerThrottled,checks:[],phases:{},cycles:[],errors:[]};
let owner,visual,server,timeout;
const save=()=>writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
function check(name,condition,evidence){report.checks.push({name,passed:!!condition,evidence});save();if(!condition)throw Error(name+': '+JSON.stringify(evidence));console.log('PASS '+name)}
const call=(window,expression)=>window.webContents.executeJavaScript(`window.proof.${expression}`);
const memory=()=>app.getAppMetrics().map(({pid,type,memory,cpu})=>({pid,type,workingSetKb:memory.workingSetSize,cpu:cpu.percentCPUUsage}));
function makeWindow(role){
  const win=new BrowserWindow({show:false,width:role==='owner'?480:640,height:360,useContentSize:true,minWidth:360,minHeight:360,title:'NeoAres isolated proof · '+role,backgroundColor:'#0d1119',webPreferences:{preload:path.join(__dirname,'native-visualizer-proof-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:role==='owner'?ownerThrottled:false}});
  win.webContents.setAudioMuted(true);
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3){report.errors.push(event.message);console.error('[renderer] '+event.message)}});
  win.webContents.on('render-process-gone',(_event,details)=>{report.errors.push({role,details})});
  return win;
}
async function openVisual(){
  visual=makeWindow('visual');
  await visual.loadURL(report.url);
  const metadata=await call(visual,`initVisual(${report.audio.sampleRate})`);
  for(const kind of ['pcm','control']){
    const {port1,port2}=new MessageChannelMain();
    visual.webContents.postMessage('proof:port',{kind},[port2]);
    owner.webContents.postMessage('proof:port',{kind},[port1]);
  }
  visual.showInactive();await sleep(350);return metadata;
}
async function closeVisual(){
  const stats=await call(owner,'detachOwner()');
  await call(visual,'disposeVisual()');
  const closing=visual;visual=null;closing.close();
  await sleep(80);return stats;
}
async function phase(name,settle=250,duration=1100){
  await sleep(settle);await call(visual,'reset()');await sleep(duration);
  const stats=await call(visual,'visualStats()');report.phases[name]=stats;save();
  check(name+' delivers rendered PCM',stats.samples>15&&stats.errors.length===0,stats);return stats;
}
async function nativeFullscreen(){
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native fullscreen timeout')),6000);visual.once('enter-full-screen',()=>{clearTimeout(timer);resolve()});visual.setFullScreen(true)});
  const entered=visual.isFullScreen();
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Leave fullscreen timeout')),6000);visual.once('leave-full-screen',()=>{clearTimeout(timer);resolve()});visual.setFullScreen(false)});
  return {entered,exited:!visual.isFullScreen()};
}
async function finish(code){clearTimeout(timeout);try{if(visual&&!visual.isDestroyed())await closeVisual();if(owner&&!owner.isDestroyed()){await call(owner,'disposeOwner()');owner.destroy()}await server?.close()}catch(error){report.cleanupError=String(error)}save();console.log(JSON.stringify({output,passed:code===0,checks:report.checks.length}));app.exit(code)}
app.whenReady().then(async()=>{
  timeout=setTimeout(()=>{report.failure='Overall timeout';void finish(1)},180000);
  try{
    report.environment={platform:process.platform,arch:process.arch,electron:process.versions.electron,chromium:process.versions.chrome,displays:screen.getAllDisplays().map(({bounds,workArea,scaleFactor})=>({bounds,workArea,scaleFactor}))};
    if(packaged){
      const directory=path.join(output,'packaged');mkdirSync(directory);
      require('esbuild').buildSync({entryPoints:[path.join(__dirname,'native-visualizer-proof.mjs')],bundle:true,format:'esm',platform:'browser',target:'es2023',outfile:path.join(directory,'native-visualizer-proof.mjs')});
      for(const file of ['native-visualizer-proof.html','native-visualizer-proof-worklet.js'])copyFileSync(path.join(__dirname,file),path.join(directory,file));
      report.url=pathToFileURL(path.join(directory,'native-visualizer-proof.html')).href;
    }else{
      const {createServer}=await import('vite');
      server=await createServer({configFile:false,root:path.join(__dirname,'..'),server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'warn'});
      await server.listen();report.url=server.resolvedUrls.local[0]+'scripts/native-visualizer-proof.html';
    }
    console.log('Evidence: '+output);console.log('Isolated server: '+report.url);
    owner=makeWindow('owner');await owner.loadURL(report.url);report.audio=await call(owner,'initOwner()');owner.showInactive();
    owner.on('close',event=>{if(visual&&!visual.isDestroyed()){event.preventDefault();owner.hide()}});
    report.visualMetadata=await openVisual();
    if(!tailOnly){
    const baseline=await phase('baseline');
    check('Single real mixer feeds separate visual process',baseline.averages.consumedRms>.01&&Math.abs(baseline.averages.consumedRms-baseline.averages.rms)<1e-6&&report.visualMetadata.contextState==='suspended',{audio:report.audio,visual:report.visualMetadata,baseline});
    check('Stereo channels preserved',baseline.averages.aL>baseline.averages.wrongL*5&&baseline.averages.aR>baseline.averages.wrongR*5,baseline.averages);
    check('Nominal transport/render latency below 100ms at p95',baseline.renderAgeP95<100,baseline);
    await call(owner,"command('volume',.4)");const half=await phase('halfVolume');
    check('Post-master volume applied once',half.averages.rms/baseline.averages.rms>.43&&half.averages.rms/baseline.averages.rms<.57,{ratio:half.averages.rms/baseline.averages.rms});
    await call(owner,"command('volume',0)");const muted=await phase('mute',400);
    check('Mute consumes real silence',muted.averages.consumedRms<.002,muted.averages);
    await call(owner,"command('volume',.8)");await call(owner,"command('eq',true)");const eq=await phase('equalizer');
    const bassRatio=eq.averages.aL/baseline.averages.aL,otherRatio=eq.averages.aR/baseline.averages.aR;
    check('EQ changes arrive in the visual window',bassRatio>1.4&&otherRatio<1.2,{bassRatio,otherRatio});
    await call(owner,"command('eq',false)");await call(owner,"command('pause')");const paused=await phase('pause',200);
    check('Paused renderer clears stale PCM',paused.averages.consumedRms===0,paused.averages);
    const beforeResume=await call(owner,'ownerStats()');await call(owner,"command('resume')");const resumed=await phase('resume');
    check('Resume restores PCM',resumed.averages.rms>.01&&beforeResume.state==='suspended',resumed.averages);
    await call(owner,"command('seek',10)");const sought=await phase('seek',200,700);
    check('Seek maintains the same audio stream',sought.averages.aL>.02,sought.averages);
    const start=await call(owner,'ownerStats()');owner.minimize();await sleep(250);
    const minimized=await phase('ownerMinimized',100,1500);const afterMinimize=await call(owner,'ownerStats()');
    check('Minimizing owner does not freeze audio or visuals',owner.isMinimized()&&visual.isVisible()&&afterMinimize.time-start.time>1&&minimized.frames>30,{before:start.time,after:afterMinimize.time,frames:minimized.frames});
    }
    if(owner.isMinimized())await new Promise(resolve=>{owner.once('restore',resolve);owner.restore()});
    owner.showInactive();await sleep(200);owner.hide();await sleep(200);
    const hidden=await phase('ownerHidden',100,1500);
    check('Hidden owner continues feeding visible visuals',!owner.isVisible()&&hidden.frames>30&&hidden.averages.rms>.01,hidden);
    owner.showInactive();owner.close();await sleep(100);
    const closed=await phase('ownerCloseIntercepted',100,800);
    check('Candidate close policy preserves audio owner',!owner.isDestroyed()&&!owner.isVisible()&&closed.averages.rms>.01,{destroyed:owner.isDestroyed(),visible:owner.isVisible(),rms:closed.averages.rms});
    owner.showInactive();await call(visual,'reset()');
    const beforeStall=await call(owner,'ownerStats()');
    await visual.webContents.executeJavaScript('(()=>{const until=performance.now()+900;while(performance.now()<until){};return true})()');
    await sleep(450);const stalledOwner=await call(owner,'ownerStats()'),recovered=await phase('afterConsumerStall',100,700);
    check('Backpressure bounded to 3 frames while consumer is blocked',stalledOwner.bridge.maxOutstanding<=3&&stalledOwner.bridge.skipped>beforeStall.bridge.skipped&&recovered.averages.rms>.01,{before:beforeStall.bridge,after:stalledOwner.bridge});
    visual.minimize();await sleep(350);const minVisualStats=await call(owner,'ownerStats()');visual.restore();visual.showInactive();await phase('visualRestored',250,700);
    check('Visual minimize/restore does not suspend audio owner',minVisualStats.state==='running',minVisualStats);
    report.fullscreen=await nativeFullscreen();check('Independent native fullscreen',report.fullscreen.entered&&report.fullscreen.exited,report.fullscreen);
    owner.setContentSize(360,360);visual.setBounds({x:screen.getPrimaryDisplay().workArea.x+80,y:screen.getPrimaryDisplay().workArea.y+80,width:720,height:420});
    check('Native minimum size and independent geometry',owner.getContentSize()[0]===360&&visual.getBounds().width===720,{owner:owner.getContentSize(),visual:visual.getBounds()});
    if(screen.getAllDisplays().length>1){
      report.monitorMoves=[];
      for(const display of screen.getAllDisplays()){
        visual.setBounds({x:display.workArea.x+60,y:display.workArea.y+60,width:640,height:390});await sleep(300);
        const stats=await phase('display-'+display.id,100,500);
        const actual=screen.getDisplayMatching(visual.getBounds());
        const dpr=await visual.webContents.executeJavaScript('devicePixelRatio');
        report.monitorMoves.push({target:display.id,actual:actual.id,scaleFactor:display.scaleFactor,dpr,frames:stats.frames,p95:stats.renderAgeP95});
        check('Independent visual on monitor '+display.id,actual.id===display.id&&stats.averages.rms>.01,{dpr,scaleFactor:display.scaleFactor,frames:stats.frames});
      }
    }
    await call(visual,'reset()');await call(owner,"command('crossfade',1.6)");await sleep(500);
    const mixed=await phase('crossfadeMidpoint',0,500);await sleep(900);const afterFade=await phase('afterCrossfade',100,700);
    check('Crossfade carries both real decks',mixed.averages.aL>.01&&mixed.averages.bL>.01&&afterFade.averages.bL>afterFade.averages.aL*5,{during:mixed.averages,after:afterFade.averages});
    report.presets=[];
    for(let i=0;i<6;i++){const preset=await call(visual,`snapshotPreset(${i})`);report.presets.push(preset);check('External PCM renders bundled preset '+i,preset.mean>2,{index:i,mean:preset.mean})}
    writeFileSync(path.join(output,'native-visual.png'),(await visual.webContents.capturePage()).toPNG());
    const timeBeforeClose=(await call(owner,'ownerStats()')).time;await closeVisual();owner.showInactive();await sleep(500);
    const withoutVisual=await call(owner,'ownerStats()');check('Closing visuals releases bridge, not playback',withoutVisual.time>timeBeforeClose&&withoutVisual.state==='running'&&!withoutVisual.active,withoutVisual);
    console.log('Lifecycle stress: 30 real window/engine/port/worklet reopen cycles');
    for(let i=0;i<30;i++){
      await openVisual();const stats=await call(visual,'visualStats()');const bridge=await closeVisual();
      check('Lifecycle '+(i+1),stats.lastSequence>0&&stats.errors.length===0&&bridge.maxOutstanding<=3,{sequence:stats.lastSequence,frames:stats.frames});
      report.cycles.push({cycle:i+1,frames:stats.frames,bridge,memory:(i===4||i===29)?memory():undefined});
    }
    const final=await call(owner,'ownerStats()');report.final=final;
    check('No owned worklets/taps left after 31 close cycles',final.created===31&&final.disposed===31&&!final.active,final);
    report.sampleRates=[];
    // Exact engine frequency metadata, not a hardcoded 48kHz assumption.
    await openVisual();
    for(const rate of [44100,48000]){const result=await call(visual,`rateProbe(${rate})`);report.sampleRates.push(result);check('Engine respects sample rate '+rate,result.actual===rate,result)}
    await closeVisual();
    report.passed=true;report.finishedAt=new Date().toISOString();save();await finish(0);
  }catch(error){report.failure=String(error);report.passed=false;console.error(error);await finish(1)}
});
