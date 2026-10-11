# NeoAres 0.2.0 — release gate

The release must come from the exact feature commit that passed Desktop QA on
Windows and macOS. Do not merge or publish while either job is failing.

## Automated checks

- TypeScript, unit tests, production Electron/renderer build.
- Production file:// renderer with real sender-scoped IPC: minimize, maximize,
  restore, external state synchronization, fullscreen exit and close in both
  frameless windows. Closing player with visualizer open preserves the audio
  owner; closing visualizer restores player.
- All eight bundled presets: compilation, non-black/distinct output, real PCM,
  mute and crossfade. Explicit SwiftShader in Windows CI (native GPU on Mac);
  physical GPU performance,
  manual drag/resize, Snap, multiple displays and OS DPI remain manual QA.
- Isolated temporary profiles and muted output; no user library or credentials.
- Evidence is uploaded even when the run fails. Windows last-window automatic
  quit is intercepted only by the test harness so final assertions are saved.

## Packages

Build from the validated commit after merging it to main:

- NeoAres-macOS-arm64.zip
- NeoAres-macOS-Universal.zip (Intel and Apple Silicon)
- NeoAres-Windows-Portable-x64.zip
- NeoAres-Windows-Setup-x64.exe
- SHA256SUMS.txt

Packaging copies the complete `dist` and `dist-electron` trees, including the
six MilkDrop chunks, two NeoAres presets, Butterchurn/WASM engine and PCM worklet.
Presets imported by a user live in that user's profile and are not redistributed.
Presets require no download at runtime; music discovery/preparation needs internet.

Inspect archive contents and compare bundled asset hashes with the validated
build before uploading. Existing releases must not be overwritten. Use v0.2.0.

## Release notes

Full responsive artwork-first player, native independent immersive visualizer,
eight bundled presets and MilkDrop import, ten-band EQ with saved settings,
four-track preparation reserve, played-track cleanup, English/Spanish interface,
custom cross-platform window controls and high-resolution cover loading.

The Mac apps have an ad-hoc signature, not Apple notarization. The Windows
installer is not Authenticode-signed. Gatekeeper/SmartScreen may show warnings;
do not describe these artifacts as notarized or signed by a trusted publisher.
