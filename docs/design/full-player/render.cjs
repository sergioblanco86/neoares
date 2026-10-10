// Isolated renderer for design artifacts. Does not load NeoAres main/preload,
// touch its profile, fetch remote data or play audio.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'neoares-player-design-')));
app.on('window-all-closed',()=>{});
app.whenReady().then(async () => {
  let window;
  try {
    const scenarios = [
      ['desktop',1280,720,{}], ['stacked',800,900,{}],
      ['compact',640,480,{}], ['queue',640,480,{queue:'open'}],
      ['minimum',360,320,{}], ['minimum-queue',360,320,{queue:'open'}],
      ['wide',1920,1080,{}], ['narrow',320,640,{}],
      ['portrait',390,844,{}], ['portrait-queue',390,844,{queue:'open'}],
      ['portrait-short',390,667,{}], ['portrait-user-size',583,925,{}],
      ['queue-short',390,667,{queue:'open'}], ['queue-user-size',583,925,{queue:'open'}],
      ['narrow-queue',320,640,{queue:'open'}],
      ['visual-clean',1280,720,{view:'visual'}], ['visual-controls',1280,720,{view:'visual',controls:'show'}],
    ];
    const results=[];
    for(const [name,width,height,query] of scenarios) {
      window=new BrowserWindow({width,height,useContentSize:true,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
      await window.loadFile(path.join(__dirname,'prototype.html'),{query});
      // Capture settled states deterministically even in hidden, throttled windows.
      await window.webContents.insertCSS('*{animation:none!important;transition:none!important}');
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const metrics=await window.webContents.executeJavaScript(`(() => {
        const m=window.designMetrics();
        const tools=document.querySelector('.tools').getBoundingClientRect();
        const transport=document.querySelector('.transport').getBoundingClientRect();
        const panel=document.querySelector('.queue').getBoundingClientRect();
        const visual=new URLSearchParams(location.search).get('view')==='visual';
        const portrait=!visual&&innerWidth<720&&innerHeight>=600&&innerHeight>innerWidth;
        const artwork=document.querySelector('.song>.cover').getBoundingClientRect();
        const songCopy=document.querySelector('.song-copy').getBoundingClientRect();
        return {...m,toolsVisible:visual||tools.bottom<=innerHeight&&tools.right<=innerWidth,
          portrait,artworkWidth:artwork.width,artworkHeight:artwork.height,
          artworkFirst:!portrait||artwork.bottom<=songCopy.top&&songCopy.bottom<=transport.top,
          artworkLarge:!portrait||artwork.width>=Math.min(innerWidth*.65,innerHeight*.35),
          transportUncovered:visual||!document.querySelector('.drawer-open')||panel.bottom<=transport.top,
          titleVisible:visual||document.querySelector('h1').getBoundingClientRect().top>=0,
          toolsBounds:{top:tools.top,bottom:tools.bottom,right:tools.right},transportTop:transport.top,queueBottom:panel.bottom,queueOffset:getComputedStyle(document.querySelector('.queue')).bottom,workBottom:document.querySelector('.work').getBoundingClientRect().bottom,queueParent:document.querySelector('.queue').offsetParent?.className};
      })()`);
      if(metrics.pageOverflow || query.view!=='visual'&&(!metrics.playerVisible||!metrics.toolsVisible||!metrics.transportUncovered||!metrics.titleVisible||!metrics.artworkFirst||!metrics.artworkLarge)) throw new Error(`${name}: ${JSON.stringify(metrics)}`);
      await new Promise(resolve=>setTimeout(resolve,250));
      fs.writeFileSync(path.join(__dirname,`${name}.png`),(await window.webContents.capturePage()).toPNG());
      if(name==='portrait-queue') {
        const interactions=await window.webContents.executeJavaScript(`(() => {
          const grip=document.querySelector('[data-grip="0"]');grip.focus();
          grip.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
          const reordered=[...document.querySelectorAll('[data-track]')].map(row=>Number(row.dataset.track));
          const keyboardOrder=reordered[0]===1&&reordered[1]===0;
          const focusPreserved=document.activeElement.dataset.grip==='0';
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
          const escapeClosed=!document.querySelector('.drawer-open')&&document.activeElement.id==='queueToggle';
          document.querySelector('#queueToggle').click();
          const reopened=document.querySelector('#queueToggle').getAttribute('aria-expanded')==='true'&&document.activeElement.id==='queueClose';
          const rows=document.querySelector('#rows');rows.scrollTop=rows.scrollHeight;
          const scrollContained=rows.scrollTop>0&&document.documentElement.scrollHeight===innerHeight;
          return {keyboardOrder,focusPreserved,escapeClosed,reopened,scrollContained};
        })()`);
        if(Object.values(interactions).some(value=>!value))throw new Error('Queue interactions: '+JSON.stringify(interactions));
        metrics.interactions=interactions;
      }
      results.push({name,...metrics});window.destroy();
    }
    fs.writeFileSync(path.join(__dirname,'layout-checks.json'),JSON.stringify(results,null,2));
    window=new BrowserWindow({width:1328,height:2000,useContentSize:true,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await window.loadFile(path.join(__dirname,'review.html'));
    fs.writeFileSync(path.join(__dirname,'review.png'),(await window.webContents.capturePage()).toPNG());
    window.destroy();
    window=new BrowserWindow({width:1328,height:1190,useContentSize:true,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await window.loadFile(path.join(__dirname,'portrait-review.html'));
    fs.writeFileSync(path.join(__dirname,'portrait-review.png'),(await window.webContents.capturePage()).toPNG());
    window.destroy();
    window=new BrowserWindow({width:1000,height:1250,useContentSize:true,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await window.loadFile(path.join(__dirname,'queue-review.html'));
    fs.writeFileSync(path.join(__dirname,'queue-review.png'),(await window.webContents.capturePage()).toPNG());
    window.destroy();
    console.log(JSON.stringify(results)); app.quit();
  }catch(cause){console.error(cause);window?.destroy();app.exit(1);}
});
