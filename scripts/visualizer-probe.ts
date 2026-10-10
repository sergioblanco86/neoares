import { DualDeckMixer } from "../src/audio/dual-deck-mixer";
import { ButterchurnRenderer, loadBundledPresetDefinitions } from "../src/visualizer/butterchurn-renderer";
import { bundledPresetCatalog } from "../src/visualizer/preset-catalog";
import { AudioAnalyzer } from "../src/visualizer/audio/audio-analyzer";

function wav(hz: number): Uint8Array {
  const rate = 24000, count = rate * 60;
  const bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  ascii(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); ascii(8, "WAVE"); ascii(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const time = i / rate;
    const envelope = 0.25 + 0.75 * Math.exp(-(time % 0.5) * 12);
    view.setInt16(44 + i * 2, Math.sin(2 * Math.PI * hz * time) * envelope * 13000, true);
  }
  return bytes;
}

export async function runVisualizerProbe() {
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "640px", height: "360px", zIndex: "99999" });
  document.body.append(canvas);
  const mixer = new DualDeckMixer(), tap = mixer.createPostMasterAnalysisTap(), analyzer = new AudioAnalyzer(tap), renderer = new ButterchurnRenderer();
  let frame = 0;
  let activePreset = "initial", failed = false;
  const renderErrors: Array<{ id: string; error: string }> = [];
  const draw = () => {
    if (!failed) {
      try { renderer.render(); analyzer.sample(performance.now()); }
      catch (error) { failed = true; renderErrors.push({ id: activePreset, error: String(error) }); console.error(`${activePreset}: ${error}`); }
    }
    frame = requestAnimationFrame(draw);
  };
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const readings = async () => {
    const samples: Array<{ rms: number; bass: number; mids: number }> = [];
    for (let i = 0; i < 15; i++) { await wait(50); samples.push({ rms: renderer.getAudioRms(), bass: analyzer.frame.bass, mids: analyzer.frame.mids }); }
    return samples;
  };
  try {
    console.log("probe: loading preset catalog");
    const presets = bundledPresetCatalog(await loadBundledPresetDefinitions());
    console.log(`probe: initializing ${presets.length} presets`);
    await renderer.initialize(canvas, tap);
    console.log("probe: engine created");
    await renderer.loadPreset(presets[0].definition, 0);
    console.log("probe: first preset compiled");
    draw();
    await mixer.load("A", wav(80)); await mixer.load("B", wav(1000)); console.log("probe: decks decoded"); await mixer.play("A"); console.log("probe: playback started");
    const audible = await readings();
    mixer.setVolume(0); await wait(400); const muted = await readings();
    mixer.setVolume(0.9); await wait(300);
    await mixer.crossfade("A", "B", 1.5); await wait(200); const crossfade = await readings();
    await wait(900); const afterFade = await readings();
    const snapshots = [];
    const grid = document.createElement("canvas"); grid.width = 1280; grid.height = 880;
    const context = grid.getContext("2d")!; context.fillStyle = "#101018"; context.fillRect(0, 0, grid.width, grid.height);
    for (const [index, preset] of presets.entries()) {
      console.log(`probe: capturing ${preset.id}`);
      activePreset = preset.id;
      await renderer.loadPreset(preset.definition, 0.35); failed = false; await wait(2500);
      const thumbnail = document.createElement("canvas"); thumbnail.width = 32; thumbnail.height = 18;
      const thumbnailContext = thumbnail.getContext("2d")!; thumbnailContext.drawImage(canvas, 0, 0, 32, 18);
      const pixels = [...thumbnailContext.getImageData(0, 0, 32, 18).data].filter((_, i) => i % 4 !== 3);
      snapshots.push({ id: preset.id, pixels, pcmRms: renderer.getAudioRms() });
      const x = index % 2 * 640, y = Math.floor(index / 2) * 220;
      context.drawImage(canvas, x, y, 640, 190);
      context.fillStyle = "#ffffff"; context.font = "15px sans-serif"; context.fillText(`${preset.author ?? ""} — ${preset.name}`, x + 12, y + 211);
      mixer.setVolume(0); await wait(450);
      if (renderer.getAudioRms() > 0.002) throw new Error(`Preset did not consume silence: ${preset.id}`);
      mixer.setVolume(0.9);
    }
    return { audible, muted, crossfade, afterFade, snapshots, renderErrors, image: grid.toDataURL("image/png"), csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") };
  } finally { cancelAnimationFrame(frame); renderer.dispose(); analyzer.dispose(); tap.release(); await mixer.dispose(); canvas.remove(); }
}
