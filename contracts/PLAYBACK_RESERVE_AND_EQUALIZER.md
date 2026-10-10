# Playback reserve, temporary audio retention and equalizer

Approved scope: user request of 2026-10-10. Full features, not an MVP.
Work continues on `feature/visualizer`; do not push or merge without a request.

## 1. Four prepared upcoming tracks

- The reserve is the first **four upcoming tracks**, excluding the playing track.
- Prepared means downloaded, decoded to an AudioBuffer and analyzed, not merely
  discovered or downloaded. Two concurrent preparation jobs, in queue order.
- Readiness is per source ID. Next depends only on the immediately next source,
  not on completion of the other three. Existing pause/busy guards still apply.
- Starting playback does not wait for the reserve. Consuming one starts preparing
  the new fourth immediately. Reordering reuses ready results by ID; removed
  entries and stale completions cannot alter decks or resurrect a queue.
- At most four desired reserve buffers plus the two mixer deck buffers are held.
  In-flight jobs removed by edits may finish, but their results are discarded.
- Failed sources are removed from the upcoming queue, replacements are discovered,
  and the remaining music continues. Stop/restart/unmount invalidate pending work.
- Next can interrupt a crossfade: finish the previous fade, stop its outgoing
  source, install the already-decoded next buffer, and start the new fade. Old
  timers must not stop a reused deck. No new audible output path is created.
- UI displays preparing/ready for all four and a ready-count, not just track one.

Implementation: `src/domain/upcoming-preparation.ts`,
`src/components/AutonomousDjPanel.tsx`, `src/components/UpcomingQueue.tsx`,
`src/audio/dual-deck-mixer.ts`. No PCM transport beyond existing source read IPC.

## 2. Garbage collection

- With track9 playing, delete track1–track4; retain track5–track8 and track9.
- Only managed temporary audio files are deleted, never music metadata, history,
  user files, presets or original source media. Older history can be revisited by
  preparing its source again.
- Protect current, four previous and all upcoming tracks. Leases protect downloads
  and reads even when a snapshot changes. A repeated ID in the protected range wins.
- Record expired played IDs on every saved snapshot and at startup; collect
  immediately, and retry pending IDs on lease release and periodic cleanup.
- Serialize collectors, recheck protection immediately before unlink, handle
  ENOENT idempotently. Pending retired IDs persist in the cache index so a closed
  session cannot lose deferred deletions. Cache index v1 remains readable.
- The existing age/budget policy still applies to other unprotected cache files.
- Collection failure is logged/retryable; it must not interrupt playback or make
  a successfully saved session appear lost.

Implementation: `electron/media-cache.ts`, `electron/main.ts`,
`src/domain/playback-retention.ts`; no renderer-selected filesystem deletion paths.

## 3. Equalizer

- A button immediately before Visualizer opens a floating, draggable, nonmodal
  panel, initially closed. Closing it never disables equalization.
- Ten bands: 31, 63, 125, 250, 500 Hz; 1, 2, 4, 8, 16 kHz. ±12 dB, 0.5 dB steps.
  Preamp ±12 dB. Enable/bypass, flat reset, current values and keyboard controls.
- Exactly eight predefined styles: Rock, Salsa, Merengue, Bajos, Agudos, Reggae,
  Rap, R&B. These are NeoAres tuning suggestions, not genre mastering standards.
- Named personal presets can be saved, selected, overwritten and deleted (max20,
  names1–60 chars). Preset application enables EQ. Editing marks it custom.
- Current settings and personal presets persist globally across songs, sessions
  and app restarts. Atomic writes, validation, backup recovery, surfaced failures,
  retry; no silent claim that an unsuccessful save succeeded.
- Audio chain: normalized decks → crossfade gains → EQ preamp → ten peaking
  filters → existing safety gain → limiter → volume → output and visualizer tap.
  Adjust existing AudioParams smoothly; do not rebuild, resume, seek or stop audio.
- Correction 2026-10-10 after listening feedback: no curve-dependent broadband
  attenuation. Each band changes only its filter; preamp controls broadband gain
  independently. Keep the existing fixed safety gain/dynamics limiter. It is not
  a brickwall/true-peak guarantee; UI advises lowering Preamp for strong boosts.
  Bypass restores unity preamp/zero gains. Filter frequency is clamped below
  Nyquist on low sample rates. Do not reintroduce automatic gain compensation
  based on a band's theoretical boost, including 31 Hz and 16 kHz.
- English/Spanish labels, focus return, Escape closes, bounded drag on resize,
  native range accessibility; no shortcuts stealing typing or other modal input.

Implementation: `src/audio/equalizer.ts`, `src/shared/equalizer.ts`,
`src/equalizer/`, `electron/equalizer-repository.ts`, typed preload + two settings
IPC channels. Disk: `<userData>/data/equalizer/settings.json` (+backup).

## Verification gates

- Deferred-promise unit tests: first-ready unlock, four bound, two concurrent,
  slide/refill, reorder/remove, failures, stale completion after reset.
- Filesystem tests: exact nine-track example, leases/deferred retry, repeated IDs,
  restart, manual clear safety and concurrent sweeps; no actual user-file deletion
  during development tests.
- Mixer tests: prepared buffers reuse, superseded loads, interrupted fade timers;
  settings validation/persistence/personal presets, bypass and independent preamp.
- Isolated Electron probe: actual filter frequency response and rendered PCM;
  individual 31 Hz/16 kHz ±12 dB edits must preserve 1 kHz within 0.1 dB,
  rapid skips and UI controls/persistence with test fixtures. Run existing
  visualizer probes for regression; typecheck, all unit tests, production build.
- Document actual results and untested platforms. Do not equate automated tests
  with a prolonged listening review or packaged Windows/macOS Universal QA.

Web Audio reference: https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode
and https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime.
