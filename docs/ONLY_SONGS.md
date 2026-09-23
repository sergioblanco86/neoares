# Only Songs — discovery contract

This contract applies to the `only-songs` branch and separates autonomous discovery from explicit user search.

## Providers

- Autonomous DJ discovery uses the public YouTube Music catalogue through its song-only search surface.
- Explicit user search continues to use the general YouTube search surface.
- Both providers return a YouTube video ID, so preparation, caching and playback continue through the existing source pipeline.
- The YouTube Music integration is an unofficial internal API and must remain isolated behind `MusicSourceService`.

## Autonomous acceptance

An autonomous candidate can enter the queue only when all of the following are true:

1. It is returned as a YouTube Music `song`, or it passes the conservative general-search fallback assessment.
2. Its artist matches an explicit or genre-related artist in the active DJ plan.
3. Its duration is inside the DJ profile limits.
4. It does not match a DJ exclusion or a non-song content pattern.
5. It has not already been used or reserved in the current/recent session.

Strong rejection always takes precedence over positive metadata. A result marked as a song is still rejected when its title explicitly identifies a trailer, isolated vocal/instrument track, backing track, karaoke track, tutorial or instrument cover.

Unknown general-search content is rejected. Unknown never means accepted.

## Continuity fallback

If the music catalogue is unavailable or returns no results for an entire discovery batch, NeoAres may query general YouTube to preserve playback continuity. That fallback uses the strict assessment; it cannot lower the acceptance threshold merely to fill the queue.

## Explicit user selection

The search dialog queries general YouTube. Once the user explicitly selects a result, the queued source is marked `requestedByUser`. This bypasses autonomous content classification because the user may intentionally choose a rare upload or a track absent from YouTube Music. Availability, preparation and audio decoding checks still apply.

## Compatibility

- Existing session snapshots remain valid because catalogue and music metadata fields are optional.
- New YouTube Music results persist their catalogue, artist and album metadata with the session.
- macOS and Windows packages bundle the JavaScript music client into the Electron main process; no Python runtime or API key is added.

## Regression examples

Must reject autonomously:

- `AGNOSTIC FRONT - Recording Get Loud! (OFFICIAL TRAILER)`
- `Agnostic Front - Addiction (Vocals Only) / No Backing Track`
- guitar-only, isolated-instrument, backing-track, karaoke and tutorial variants

Must accept when returned as a YouTube Music song:

- `Only in America` by Agnostic Front
- songs whose legitimate title contains `only`
- official album tracks with clean titles and album metadata

