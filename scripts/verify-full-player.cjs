// Actual production main/preload/React UI, deterministic source IPC fixtures.
// All profile/cache writes stay in a new temporary directory.
const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');
const output = mkdtempSync(path.join(tmpdir(), 'neoares-full-player-'));
const profile = path.join(output, 'NeoAres'); mkdirSync(profile);
app.setPath('appData', output); app.setPath('userData', profile);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const packaged = process.argv.includes('--packaged');
const searchOnly = process.argv.includes('--search-only');
const eqStabilityOnly = process.argv.includes('--eq-stability-only');
const visualizerControlsOnly = process.argv.includes('--visualizer-controls-only');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], errors = [], layouts = [];
function check(value, name) { checks.push({ name, passed: !!value }); console.log(`${value ? 'PASS' : 'FAIL'} ${name}`); if (!value) throw new Error(name); }
async function until(predicate, name, timeout = 15000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await predicate()) return; await wait(80); } throw new Error(`Timeout ${name}`); }
let owner, server;
const run = (win, code) => win.webContents.executeJavaScript(code, true);
const click = (win, selector) => run(win, `document.querySelector(${JSON.stringify(selector)})?.click()`);
const visual = () => BrowserWindow.getAllWindows().find(win => win !== owner);
const probe = win => run(win, `window.qa.inspect()`);
async function verifyVisualizerControls() {
  // Only the OS picker is simulated. Production IPC, conversion, repositories,
  // preloads, React state and real-time notice expiry remain real.
  const good = path.join(output, 'trusted.milk'), bad = path.join(output, 'invalid.milk');
  writeFileSync(good, '[preset00]\nfRating=3.0\nfGammaAdj=1.0\nfDecay=0.98\nper_frame_1=wave_r=sin(time);\n');
  writeFileSync(bad, 'not a MilkDrop preset');
  const originalOpen = dialog.showOpenDialog, originalMessage = dialog.showMessageBox;
  let selection = { canceled: true, filePaths: [] }, rejectPicker = false;
  const pickerModes = [];
  dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  dialog.showOpenDialog = async (_parent, options) => {
    pickerModes.push(options.properties.includes('openDirectory') ? 'directory' : 'files');
    if (rejectPicker) throw new Error('QA_PICKER_FAILED');
    return selection;
  };
  try {
    await click(owner, '.visualizer-toggle');
    await until(() => visual(), 'native visualizer created');
    const win = visual();
    await until(() => run(win, `document.querySelector('.visualizer-status-dot')?.dataset.status==='ready'`), 'visualizer ready', 30000);
    const state = selector => run(win, `(() => {const b=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(b);return {pressed:b.getAttribute('aria-pressed'),background:s.backgroundColor,color:s.color,shadow:s.boxShadow,icon:b.querySelector('svg').getAttribute('class'),title:b.title};})()`);
    const pinOff = await state('.visualizer-pin');
    await click(win, '.visualizer-pin');
    await until(() => run(win, `document.querySelector('.visualizer-pin').getAttribute('aria-pressed')==='true'`), 'pin active');
    const pinOn = await state('.visualizer-pin');
    check(pinOff.pressed==='false' && pinOn.background!==pinOff.background && pinOn.shadow!=='none' && pinOn.icon!==pinOff.icon && pinOn.title!==pinOff.title, 'Pin has distinct icon, surface, border, tooltip and accessible state');
    await wait(2800);
    check(await run(win, `!document.querySelector('.visualizer-controls-hidden')`), 'Pin keeps controls visible after inactivity');
    const lockOff = await state('.visualizer-lock');
    await click(win, '.visualizer-lock');
    await until(() => run(win, `document.querySelector('.visualizer-lock').getAttribute('aria-pressed')==='true'`), 'lock active');
    const lockOn = await state('.visualizer-lock');
    check(lockOff.pressed==='false' && lockOn.background!==lockOff.background && lockOn.icon!==lockOff.icon && lockOn.title!==lockOff.title, 'Lock has distinct icon, surface, tooltip and accessible state');
    check(await run(win, `(async()=> (await window.desktop.visualizer.loadSettings()).locked)()`), 'Lock state persists through real IPC and repository');
    writeFileSync(path.join(output, 'visualizer-controls-active.png'), (await win.webContents.capturePage()).toPNG());
    await run(win, `window.dispatchEvent(new KeyboardEvent('keydown',{key:'l',bubbles:true,cancelable:true}))`);
    await until(() => run(win, `document.querySelector('.visualizer-lock').getAttribute('aria-pressed')==='false'`), 'keyboard unlock');
    check((await state('.visualizer-lock')).icon===lockOff.icon, 'Keyboard shortcut also restores unlocked visual state');
    await click(win, '.visualizer-pin');
    // Clear keyboard activity as a real pointer action would do.
    await run(win, `window.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
    await wait(2800);
    check(await run(win, `!!document.querySelector('.visualizer-controls-hidden')`), 'Unpin restores control auto-hide');
    await run(win, `document.querySelector('.visualizer-window').dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))`);
    writeFileSync(path.join(output, 'visualizer-controls-inactive.png'), (await win.webContents.capturePage()).toPNG());
    await click(win, '.visualizer-controls button[aria-expanded]');
    const importClick = async (directory=false) => {
      await click(win, `.visualizer-import-actions button:nth-child(${directory?2:1})`);
      await until(() => run(win, `!document.querySelector('.visualizer-import-actions button').disabled`), 'import finished');
    };
    const notice = () => run(win, `document.querySelector('.visualizer-notice,.visualizer-toast')?.textContent || ''`);
    await importClick();check(!await notice(), 'Cancel file import does not produce a zero-result notice');
    await importClick(true);check(!await notice(), 'Cancel folder import does not produce a zero-result notice');
    check(pickerModes[0]==='files' && pickerModes[1]==='directory', 'Both real import IPC modes reach the picker');
    selection = { canceled: false, filePaths: [good] };
    await importClick();
    check((await notice()).startsWith('1 '), 'Successful real MilkDrop conversion displays imported count');
    check(await run(win, `(async()=> (await window.desktop.visualizer.listPresets()).some(p=>p.name==='trusted' && p.compatibility==='ready'))()`), 'Imported preset is stored and playable in real library');
    await until(async () => !await notice(), 'success notice auto-dismissed', 6500);
    check(true, 'Success notice disappears without closing visualizer');
    await importClick();const duplicate = await notice();
    check(duplicate.includes('1 ') && !duplicate.startsWith('1 '), 'Duplicate import displays skipped count');
    await wait(2200);await importClick();
    check(await notice()===duplicate, 'Repeated identical summary is displayed again');
    await wait(3100);check(await notice()===duplicate, 'Repeated summary restarts the full five-second lifetime');
    await until(async () => !await notice(), 'repeated notice auto-dismissed', 3000);
    selection = { canceled: false, filePaths: [output] };
    await importClick(true);
    check((await notice()).includes('invalid.milk') && (await notice()).includes('VISUALIZER_PRESET_INVALID_FORMAT'), 'Folder import reports incompatible file and reason');
    await click(win, '.visualizer-library-header button');
    check(await run(win, `!!document.querySelector('.visualizer-toast') && !document.querySelector('.visualizer-notice')`), 'Notice follows library close without duplication');
    await until(async () => !await notice(), 'canvas notice auto-dismissed', 6500);
    check(true, 'Incompatible notice also expires on canvas');
    await click(win, '.visualizer-controls button[aria-expanded]');
    rejectPicker = true;await importClick();
    check(!!await notice(), 'Actual picker rejection displays import failure');
    rejectPicker = false;selection = { canceled:true, filePaths:[] };await importClick();
    check(!await notice(), 'Starting a cancelled import clears previous notice');
    rejectPicker = true;await importClick();
    await until(async () => !await notice(), 'failure notice auto-dismissed', 6500);
    check(true, 'Failure notice disappears without reopening visualizer');
    await click(win, '.visualizer-title-actions button:last-child');
    await until(() => !visual(), 'visualizer closed');
    check(await run(owner, `!!document.querySelector('button[aria-label="Pausar"]:not(:disabled)')`), 'Owner playback remains active after controls and import checks');
  } finally { dialog.showOpenDialog = originalOpen; dialog.showMessageBox = originalMessage; }
}
async function verifyEqStability() {
  for (const [locale,choice] of [['es',3],['en',2]]) {
    await click(owner,'.sidebar-open-button');await click(owner,'.language-trigger');await click(owner,`.language-menu button:nth-child(${choice})`);
    await until(()=>run(owner,`document.documentElement.lang==='${locale}'`),'EQ test locale');await click(owner,'.sidebar-close');
    await click(owner,'.equalizer-toggle');
    for(const [width,height] of [[360,713],[390,667],[583,925],[1280,720]]) {
      owner.setContentSize(width,height);await wait(180);
      const stability=await run(owner,`(async()=>{
        const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,height:r.height,bottom:r.bottom};};
        const measure=()=>[...document.querySelectorAll('.equalizer-band input'),document.querySelector('.equalizer-footer')].map(rect);
        const initial=measure(),samples=[],statuses=new Set();
        const sliders=[...document.querySelectorAll('.equalizer-band input')];
        for(let index=0;index<sliders.length;index++){
          const input=sliders[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,Number(input.value)===5?-5:5);
          input.dispatchEvent(new Event('input',{bubbles:true}));
          await new Promise(requestAnimationFrame);samples.push(measure());statuses.add(document.querySelector('.equalizer-save-status span').textContent);
        }
        for(let i=0;i<35;i++){await new Promise(requestAnimationFrame);samples.push(measure());statuses.add(document.querySelector('.equalizer-save-status span').textContent);}
        const maxDelta=Math.max(...samples.flatMap(sample=>sample.flatMap((rect,index)=>['top','height','bottom'].map(key=>Math.abs(rect[key]-initial[index][key])))));
        return {maxDelta,statuses:[...statuses],samples:samples.length,sliders:sliders.length,initial,final:measure()};
      })()`);
      layouts.push({eqStability:{locale,width,height,...stability}});
      check(stability.sliders===11 && stability.maxDelta<0.1,`EQ ${locale} ${width}x${height} eleven sliders and footer never move while saving`);
      check(stability.statuses.some(s=>/Saving|Guardando/.test(s)) && stability.statuses.some(s=>/Settings saved|Ajustes guardados/.test(s)),`EQ ${locale} ${width}x${height} observed saving and saved states`);
    }
    await click(owner,'.equalizer-titlebar button');
  }
}
async function verifySearch(searchTracks) {
  await run(owner, `document.querySelector('.queue-toolbar button').focus()`);
  await click(owner, '.queue-toolbar button');
  await until(() => run(owner, `!!document.querySelector('.track-search-dialog')`), 'search dialog opens');
  await run(owner, `(() => {const i=document.querySelector('.track-search-input input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'QA música');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await run(owner, `document.querySelector('.track-search-form').requestSubmit()`);
  await until(() => run(owner, `document.querySelectorAll('.track-search-result').length===10`), 'real search IPC results');
  check(await run(owner, `!document.querySelector('.placement-picker') && [...document.querySelectorAll('.track-search-result')].every(r=>r.querySelectorAll('button[data-placement]').length===2)`), 'two direct placement actions per row, no global selector');
  for (const [width,height] of [[1280,720],[800,600],[583,925],[390,667],[360,713],[360,360]]) {
    owner.setContentSize(width,height);
    await run(owner, `document.querySelector('.track-search-input input').focus()`);
    await wait(220); // Compare final border color, not an in-flight focus transition.
    const layout=await run(owner, `(() => {const r=s=>document.querySelector(s).getBoundingClientRect().toJSON(),d=document.querySelector('.track-search-dialog'),input=document.querySelector('.track-search-input input');input.focus();return {width:innerWidth,height:innerHeight,dialog:r('.track-search-dialog'),list:r('.track-search-results'),close:r('.track-search-dialog .icon-button'),field:r('.track-search-input'),icon:r('.track-search-input svg'),input:r('.track-search-input input'),inputShadow:getComputedStyle(input).boxShadow,inputOutline:getComputedStyle(input).outlineStyle,fieldBorder:getComputedStyle(input.parentElement).borderColor,primary:getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),scrollWidth:d.scrollWidth,clientWidth:d.clientWidth,buttons:[...d.querySelectorAll('.track-result-actions button')].map(b=>b.getBoundingClientRect().toJSON())};})()`);
    layouts.push({search:layout});
    check(layout.scrollWidth===layout.clientWidth && layout.dialog.bottom<=height && layout.close.bottom<=height && layout.list.height>0 && layout.buttons.every(b=>b.left>=layout.dialog.left && b.right<=layout.dialog.right), `search ${width}x${height} actions fit and only results scroll`);
    if(width<=719) check(layout.dialog.left===0 && layout.dialog.top===0 && layout.dialog.width===width && layout.dialog.height===height, `search ${width}x${height} fills entire window`);
    check(layout.inputShadow==='none' && layout.inputOutline==='none' && layout.icon.left>layout.field.left && layout.icon.right<layout.field.right && await run(owner, `(() => {const f=document.querySelector('.track-search-input'),probe=document.createElement('div');probe.style.color='var(--primary)';document.body.append(probe);const ok=f.matches(':focus-within') && getComputedStyle(f).borderTopColor===getComputedStyle(probe).color;probe.remove();return ok;})()`), `search ${width}x${height} focus is on complete field including icon`);
    if([360,1280].includes(width) && height!==360) writeFileSync(path.join(output,`search-${width}x${height}.png`),(await owner.webContents.capturePage()).toPNG());
  }
  await run(owner, `(() => {const b=document.querySelector('.track-search-result [data-placement="END"]');b.click();b.click();})()`);
  await until(() => run(owner, `document.querySelector('.auto-queue-item:last-child .queue-track-copy strong')?.textContent===${JSON.stringify(searchTracks[0].title)}`), 'one click appends requested song');
  check(await run(owner, `document.querySelectorAll('.track-search-result:first-child button').length===0 && document.querySelector('.track-search-result:first-child .track-in-queue')!==null`), 'appended result becomes In queue and cannot duplicate');
  await click(owner, '.track-search-result:nth-child(2) [data-placement="NEXT"]');
  await until(() => run(owner, `document.querySelector('.auto-queue-item:first-child .queue-track-copy strong')?.textContent===${JSON.stringify(searchTracks[1].title)} && !!document.querySelector('button[aria-label="Pausar"]:not(:disabled)') && !document.querySelector('.track-search-result:nth-child(2) button')`), 'one click prepares requested song next');
  check(await run(owner, `(() => {const titles=[...document.querySelectorAll('.auto-queue-item .queue-track-copy strong')].map(n=>n.textContent);return titles.filter(t=>t===${JSON.stringify(searchTracks[0].title)}).length===1 && titles.filter(t=>t===${JSON.stringify(searchTracks[1].title)}).length===1;})()`), 'NEXT and END keep correct order without duplicate entries');
  check(await run(owner, `(() => {const d=document.querySelector('.track-search-dialog'),nodes=[...d.querySelectorAll('button:not(:disabled),input:not(:disabled)')];nodes.at(-1).focus();nodes.at(-1).dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));return document.activeElement===nodes[0];})()`), 'search keyboard focus stays inside dialog');
  await run(owner, `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
  await until(() => run(owner, `!document.querySelector('.track-search-dialog')`), 'search closes with Escape');
  check(await run(owner, `document.activeElement===document.querySelector('.queue-toolbar button') || document.activeElement===document.querySelector('.queue-toggle')`), 'Escape closes search and restores visible queue focus after resize');
  await click(owner, '.queue-toolbar button');
  check(await run(owner, `document.querySelector('.track-search-input input').value==='' && !document.querySelector('.track-search-result')`), 'reopen starts clean without stale results');
  await click(owner,'.track-search-dialog .icon-button');
}
function wav() {
  const rate = 44100, seconds = 120, length = rate * seconds, data = Buffer.alloc(44 + length * 4);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(length * 4, 40);
  for (let i = 0; i < length; i++) { data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 93.75 * i / rate) * 5000), 44 + i * 4); data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 375 * i / rate) * 5000), 46 + i * 4); }
  return data;
}
const timeout = setTimeout(() => { console.error('full-player timeout', output); app.exit(1); }, 180000);
app.whenReady().then(async () => {
  try {
    const fixture = path.join(output, 'fixtures.cjs');
    buildSync({ stdin: { contents: `export { DjRepository } from './electron/dj-repository'; export { AppStateRepository, SessionRepository } from './electron/state-repository'; export { createDefaultDj } from './src/domain/default-djs';`, resolveDir: path.join(__dirname, '..'), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: fixture });
    const { DjRepository, AppStateRepository, SessionRepository, createDefaultDj } = require(fixture);
    const data = path.join(profile, 'data'), dj = createDefaultDj({ name: 'Punk Underground', description: 'Isolated QA', prompt: 'QA', genres: ['Punk'] });
    const artwork = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="#333d4a"/><text x="250" y="220" text-anchor="middle" fill="#f3dfad" font-family="sans-serif" font-size="48" font-weight="bold">NO USE</text><text x="250" y="280" text-anchor="middle" fill="#f3dfad" font-family="sans-serif" font-size="42">FOR A NAME</text></svg>');
    const tracks = Array.from({ length: 12 }, (_, index) => ({ id: `qa${String(index).padStart(9, '0')}`, title: index ? `Canción siguiente ${index} — título de prueba largo` : 'Let It Slide', creator: index ? `Artista ${index}` : 'No Use For A Name', canonicalUrl: `https://www.youtube.com/watch?v=qa${String(index).padStart(9, '0')}`, durationSeconds: 120, thumbnailUrl: artwork, requestedByUser: true }));
    const searchTracks=Array.from({length:10},(_,index)=>({...tracks[0],id:`qs${String(index).padStart(9,'0')}`,canonicalUrl:`https://www.youtube.com/watch?v=qs${String(index).padStart(9,'0')}`,title:`Resultado ${index+1} — Canción con título largo`,creator:`Artista del catálogo ${index+1}`}));
    await new DjRepository(data).save(dj);
    await new AppStateRepository(data).save({ schemaVersion: 2, lastSelectedDjId: dj.id, languagePreference: 'es', updatedAt: new Date().toISOString() });
    await new SessionRepository(data).saveActive({ schemaVersion: 1, sessionId: 'full-player-qa', djId: dj.id, djRevision: dj.revision, phase: 'PLAYING', queue: tracks, currentIndex: 0, positionSeconds: 0, discoveryRound: 0, savedAt: new Date().toISOString(), recoverable: true });
    if (!packaged) {
      const { createServer } = await import('vite');
      server = await createServer({ configFile: path.join(__dirname, '../vite.config.ts'), server: { port: 0, strictPort: false, hmr: false } });
      await server.listen(); process.env.VITE_DEV_SERVER_URL = server.resolvedUrls.local[0];
    } else delete process.env.VITE_DEV_SERVER_URL;
    const probeBundle = path.join(output, 'probe.js');
    if (packaged) {
      // Packaged smoke has no instrumentation: UI/IPC/canvas/lifecycle only.
      writeFileSync(probeBundle, '');
    }
    const sources = wav(), leases = new Set();
    app.on('browser-window-created', (_event, win) => {
      win.webContents.setAudioMuted(true);
      win.webContents.on('console-message', event => { if (event.level === 'error') { errors.push(event.message); console.error('[renderer]', event.message); } });
      win.webContents.on('did-finish-load', () => {
        if (!packaged) void run(win, `import('/scripts/full-player-probe.ts').then(m => {window.qa=m;return true})`).catch(console.error);
      });
      if (!owner) owner = win;
    });
    require('../dist-electron/main.cjs');
    await until(() => owner, 'owner created');
    // Replace only remote source/connectivity boundaries, keeping real repositories,
    // native host, both preloads, mixer, renderers and React components.
    for (const name of ['connectivity:check', 'sources:prepare', 'sources:read', 'sources:release', 'sources:cancel-playback', 'sources:search']) ipcMain.removeHandler(name);
    ipcMain.handle('connectivity:check', () => true);
    ipcMain.handle('sources:search', () => searchTracks);
    ipcMain.handle('sources:prepare', (_event, source) => { const leaseId = crypto.randomUUID(); leases.add(leaseId); return { ...source, leaseId, byteLength: sources.length, format: 'm4a' }; });
    ipcMain.handle('sources:read', (_event, id) => { if (!leases.has(id)) throw new Error('bad lease'); return sources; });
    ipcMain.handle('sources:release', (_event, id) => { leases.delete(id); });
    ipcMain.handle('sources:cancel-playback', () => 0);
    await until(() => run(owner, `!!document.querySelector('.autopilot-panel')`), 'real player UI');
    const testDisplay = screen.getAllDisplays().sort((a,b) => b.workArea.height-a.workArea.height)[0];
    owner.setPosition(testDisplay.workArea.x+16,testDisplay.workArea.y+16);
    check(await run(owner, `!document.querySelector('.hero')`), 'marketing block removed');
    await click(owner, 'button.primary-button');
    await until(() => run(owner, `!!document.querySelector('button[aria-label="Pausar"]:not(:disabled)') && document.querySelectorAll('[data-preparation="ready"]').length===4`), 'resume with four ready');
    check(true, 'real session/mixer and four-track reserve');
    if (!packaged) check((await probe(owner)).prepared === 5, 'only current plus four prepared');
    if(visualizerControlsOnly){
      await verifyVisualizerControls();check(errors.length===0,'no renderer errors');
      writeFileSync(path.join(output,'result.json'),JSON.stringify({packaged,visualizerControlsOnly,checks,errors},null,2));console.log(JSON.stringify({output,passed:checks.length,packaged,visualizerControlsOnly}));
      clearTimeout(timeout);for(const win of BrowserWindow.getAllWindows())win.destroy();await server?.close();app.quit();return;
    }
    if(eqStabilityOnly){
      await verifyEqStability();check(errors.length===0,'no renderer errors');
      writeFileSync(path.join(output,'result.json'),JSON.stringify({packaged,eqStabilityOnly,checks,layouts,errors},null,2));console.log(JSON.stringify({output,passed:checks.length,packaged,eqStabilityOnly}));
      clearTimeout(timeout);for(const win of BrowserWindow.getAllWindows())win.destroy();await server?.close();app.quit();return;
    }
    if(searchOnly) {
      await verifySearch(searchTracks);check(errors.length===0,'no renderer errors');
      writeFileSync(path.join(output,'result.json'),JSON.stringify({packaged,searchOnly,checks,layouts,errors},null,2));
      console.log(JSON.stringify({output,passed:checks.length,packaged,searchOnly}));
      clearTimeout(timeout);for(const win of BrowserWindow.getAllWindows())win.destroy();await server?.close();app.quit();return;
    }
    for (const [width, height] of [[1280,720],[1024,600],[800,900],[800,600],[640,480],[583,925],[390,844],[390,667],[360,713],[360,360]]) {
      const current = await run(owner, `({width:innerWidth,height:innerHeight})`), outer = owner.getSize();
      owner.setSize(width + outer[0] - current.width, height + outer[1] - current.height); await wait(180);
      console.log('size', {requested:[width,height],outer:owner.getSize(),content:owner.getContentSize(),actual:await run(owner,`[innerWidth,innerHeight]`)});
      const result = await run(owner, `(${packaged ? `() => { const r=s=>document.querySelector(s)?.getBoundingClientRect().toJSON(); return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,controls:r('.player-controls'),queue:r('.queue-surface'),artwork:r('.now-track-artwork'),track:r('.now-track-copy')}; }` : 'window.qa.layout'})()`);
      layouts.push(result);
      check(result.scrollWidth === width && result.scrollHeight === height && result.controls.y >= 0 && result.controls.bottom <= height, `layout ${width}x${height} no overflow / transport visible`);
      if (width < 720 && height >= 600) check(result.artwork.bottom <= result.track.top + 2 && result.artwork.width >= 200 && Math.abs(result.artwork.width - result.artwork.height) < 2, `portrait ${width}x${height} large square cover above track`);
      if (width < 720 && height >= 600) check(await run(owner, `(() => {const line=document.querySelector('.player-waveform').getBoundingClientRect(),end=document.querySelector('.player-time time:last-child').getBoundingClientRect();return Math.abs(line.right-end.right)<1;})()`), `duration ${width}x${height} aligned to timeline end`);
      if (width <= 760) check(await run(owner, `(() => {const b=document.querySelector('.autopilot-actions button'),s=b.querySelector('svg'),r=b.getBoundingClientRect(),i=s.getBoundingClientRect();return Math.abs(r.x+r.width/2-i.x-i.width/2)<1 && Math.abs(r.y+r.height/2-i.y-i.height/2)<1;})()`), `stop icon ${width}x${height} centered`);
      if (width === 390 && height === 667) {
        check(await run(owner, `(() => {
          const panel=document.querySelector('.autopilot-panel');
          for(let i=0;i<2;i++){const e=document.createElement('div');e.className='session-error qa-stress';e.textContent='Mensaje de error largo: no se pudo preparar esta canción. Puedes reemplazarla desde el menú y continuar escuchando.';panel.prepend(e);}
          const controls=document.querySelector('.player-controls').getBoundingClientRect(),track=document.querySelector('.now-track-copy').getBoundingClientRect();
          const valid=controls.bottom<=innerHeight && track.bottom<controls.top && document.documentElement.scrollHeight===innerHeight;
          document.querySelectorAll('.qa-stress').forEach(e=>e.remove());return valid;
        })()`), 'portrait error banners preserve track and transport');
      }
      if (width < 1000 || height < 550) {
        await click(owner, '.queue-toggle'); await wait(240);
        const bounds = await run(owner, `(() => {const q=document.querySelector('.queue-surface'), c=document.querySelector('.player-controls'); return {queue:q.getBoundingClientRect().toJSON(),controls:c.getBoundingClientRect().toJSON(),visible:getComputedStyle(q).visibility};})()`);
        layouts.at(-1).openQueue = bounds;
        check(bounds.visible === 'visible' && bounds.queue.bottom <= bounds.controls.top, `queue sheet ${width}x${height} does not cover transport`);
        check(bounds.queue.left === 0 && bounds.queue.right === width && bounds.queue.top === 56, `queue sheet ${width}x${height} full width below topbar`);
        if (width===360 && height===713) writeFileSync(path.join(output, 'queue-360x713.png'), (await owner.webContents.capturePage()).toPNG());
        await click(owner, '.queue-sheet-heading button'); await wait(240);
        if (width <= 650) {
          await click(owner, '.equalizer-toggle'); await wait(180);
          const eq = await run(owner, `(() => {const e=document.querySelector('.equalizer-window'),f=e.querySelector('.equalizer-sliders'),r=e.getBoundingClientRect();return {bounds:r.toJSON(),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,bands:[...f.querySelectorAll('.equalizer-band')].map(b=>({bounds:b.getBoundingClientRect().toJSON(),labels:[...b.querySelectorAll('label,output,input')].map(n=>n.getBoundingClientRect().toJSON())}))};})()`);
          layouts.at(-1).equalizer=eq;
          check(eq.bounds.left===0 && eq.bounds.right===width && eq.bounds.top===bounds.queue.top && eq.bounds.bottom<=height, `EQ ${width}x${height} shares full width and top with queue`);
          check(eq.scrollWidth===eq.clientWidth && eq.bands.length===11 && eq.bands.every(b=>b.labels.every(r=>r.left>=0 && r.right<=width)), `EQ ${width}x${height} all eleven columns fit without horizontal clipping`);
          if (height>=600) check(eq.scrollHeight<=eq.clientHeight+1 && eq.bounds.bottom>bounds.queue.bottom, `EQ ${width}x${height} complete vertically and taller than queue`);
          if (width===360 && height===713) writeFileSync(path.join(output, 'equalizer-360x713.png'), (await owner.webContents.capturePage()).toPNG());
          await click(owner, '.equalizer-titlebar button');
        }
      }
      if ([390,583,1280,360].includes(width)) writeFileSync(path.join(output, `player-${width}x${height}.png`), (await owner.webContents.capturePage()).toPNG());
    }
    check(await run(owner, `document.querySelectorAll('.queue-track-artwork').length===11`), 'queue retains miniartworks');
    await click(owner, '.queue-toggle'); await wait(240);
    await click(owner, '.queue-menu-trigger'); await wait(80);
    check(await run(owner, `(() => {const m=document.querySelector('.queue-floating-menu').getBoundingClientRect(); return m.top>=0 && m.bottom<=innerHeight && m.left>=0 && m.right<=innerWidth;})()`), 'queue action menu escapes short sheet and fits minimum viewport');
    await click(owner, '.queue-floating-menu button:nth-child(4)'); await wait(150);
    check(await run(owner, `document.querySelector('.auto-queue-item .queue-track-copy').textContent.includes('Canción siguiente 2')`), 'queue reorder menu changes actual playback order');
    await click(owner, '.queue-sheet-heading button'); await wait(240);
    if (!packaged) check((await probe(owner)).prepared === 5, 'resize/sheets did not reload audio');
    await click(owner, '.sidebar-open-button'); await click(owner, '.language-trigger');
    check(await run(owner, `(() => {const m=document.querySelector('.language-menu').getBoundingClientRect(); return m.top>=0 && m.bottom<=innerHeight;})()`), 'language menu opens upward inside sidebar');
    await click(owner, '.language-menu button:nth-child(2)');
    await until(() => run(owner, `document.documentElement.lang==='en'`), 'locale changes');
    await until(() => run(owner, `(async()=> (await window.desktop.appState.load()).languagePreference==='en')()`), 'language persistence completes');
    check(true, 'sidebar language choice persisted');
    await click(owner, '.sidebar-close');
    await click(owner, '.equalizer-toggle');
    check(await run(owner, `document.querySelectorAll('.equalizer-window input[type="range"]:not(:disabled)').length===11`), 'EQ controls available at minimum');
    await click(owner, '.equalizer-titlebar button');
    owner.setContentSize(800, 600);
    await click(owner, '.visualizer-toggle');
    await until(() => visual(), 'native visual created');
    let win = visual();
    await until(() => run(win, `document.querySelector('.visualizer-status-dot')?.dataset.status==='ready'`), 'visual ready', 30000);
    check(true, 'actual native window loads actual preset');
    check(await run(win, `!window.desktop.sources && !window.desktop.djs && !window.desktop.sessions && !window.desktop.cache`), 'visual preload cannot access source/profile APIs');
    await click(owner, '.sidebar-open-button'); await click(owner, '.language-trigger'); await click(owner, '.language-menu button:nth-child(3)');
    await until(() => run(win, `document.documentElement.lang==='es'`), 'visual follows live owner locale');
    check(true, 'live language update reaches native window');
    await click(owner, '.language-trigger'); await click(owner, '.language-menu button:nth-child(2)'); await click(owner, '.sidebar-close');
    if (!packaged) {
      await until(async () => (await probe(win)).rms > .01, 'actual PCM reaches engine');
      const pcm = await probe(win); check(Math.abs(pcm.rms - pcm.consumed) < .000001 && pcm.contextState === 'suspended', 'PCM consumed matches and auxiliary context suspended');
      await click(owner, '.volume-button'); await wait(250); check((await probe(win)).consumed === 0, 'mute propagates to actual engine');
      await click(owner, '.volume-button'); await wait(250);
      await click(owner, 'button[aria-label="Pause"]'); await wait(250); check((await probe(win)).consumed === 0, 'pause has no stale PCM');
      await click(owner, 'button[aria-label="Resume"]'); await wait(250);
      owner.minimize(); await wait(350); check((await probe(win)).rms > .01, 'native visual continues with minimized owner');
      owner.restore(); await wait(150); owner.hide(); await wait(350); check((await probe(win)).rms > .01, 'native visual continues with hidden owner'); owner.show();
      win.minimize(); await wait(250); check((await probe(owner)).position>0, 'minimizing visual does not stop owner');
      win.restore(); await wait(350); check((await probe(win)).rms>.01, 'restoring visual resumes fresh PCM');
    }
    await run(win, `window.desktop.nativeVisualizer.toggleFullscreen()`); await until(() => win.isFullScreen(), 'native fullscreen');
    check(true, 'native fullscreen enters');
    await run(win, `window.desktop.nativeVisualizer.toggleFullscreen()`); await until(() => !win.isFullScreen(), 'leave native fullscreen');
    check(true, 'native fullscreen exits');
    await wait(500);
    await wait(2800);
    check(await run(win, `document.querySelector('.visualizer-controls-hidden')!==null && getComputedStyle(document.querySelector('.visualizer-track')).opacity==='1'`), 'immersive controls hidden, song card retained');
    writeFileSync(path.join(output, 'native-visual.png'), (await win.webContents.capturePage()).toPNG());
    await run(win, `document.querySelector('section').dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))`);
    await click(win, 'button[aria-label="Preset library"]');
    check(await run(win, `document.querySelectorAll('.visualizer-preset-row').length>=6`), 'existing preset library retained');
    owner.close(); await wait(200); check(!owner.isDestroyed() && !owner.isVisible(), 'closing owner keeps audio window alive while visual open');
    win.close(); await wait(250); check(owner.isVisible() && !owner.isDestroyed(), 'closing visual restores player');
    for (let i=0; i<30; i++) {
      await click(owner, '.visualizer-toggle'); await until(() => visual(), 'reopen'); win=visual();
      await until(() => run(win, `document.querySelector('.visualizer-status-dot')?.dataset.status==='ready'`), 'reopen ready');
      win.close(); await wait(150);
    }
    check(true, 'thirty integrated reopen cycles');
    if (!packaged) check((await probe(owner)).bridges === 0, 'no owned bridge remains after thirty cycles');
    await wait(200); check(errors.length===0, 'no renderer errors');
    writeFileSync(path.join(output,'result.json'),JSON.stringify({packaged,checks,layouts,errors},null,2));
    console.log(JSON.stringify({output,passed:checks.length,packaged}));
    clearTimeout(timeout); for (const win of BrowserWindow.getAllWindows()) win.destroy(); await server?.close(); app.quit();
  } catch (error) {
    console.error(error); writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,layouts,errors,failure:String(error)},null,2));
    console.error('Evidence:',output); clearTimeout(timeout); await server?.close(); app.exit(1);
  }
});
