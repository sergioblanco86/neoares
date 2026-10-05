# NeoAres transport controls contract

This contract applies to on-screen controls, focused-window keyboard shortcuts, and operating-system media controls.

## Commands

- Space toggles pause and resume while NeoAres is focused.
- Cmd/Ctrl + Right Arrow advances and crossfades when the next deck is ready.
- Cmd/Ctrl + Left Arrow uses the same behavior as the on-screen back button.
- While a DJ session is active, NeoAres registers only the operating system's Play/Pause, Next Track, and Previous Track media accelerators. Media Session remains as a fallback. Duplicate native and Media Session events within 100 milliseconds are collapsed into one command.
- NeoAres does not register ordinary global keyboard shortcuts.

Focused-window shortcuts are ignored during key repeat, while an editable control has focus, and while a modal dialog is open.

## Back behavior

The first back command restarts the current song. A second back command within 1,000 milliseconds returns to the previous queue entry. At the beginning of the queue, every back command only restarts the current song.

Returning to the previous entry does not reorder or duplicate the queue. The queue index moves back by one, making the song that was playing the first upcoming entry. NeoAres prepares the previous audio on the inactive deck and then switches directly to it without a fade. While paused, it changes decks without resuming audio.

Previous-track preparation and navigation are silent UI operations: they do not display transient informational or error banners.

The previous, current, and next source files are protected from cache cleanup while an active session snapshot references them.

## Concurrency and failure

- Transition and queue-action locks prevent overlapping navigation.
- A previous-track request supersedes stale next-deck preparation by advancing the playback generation.
- If previous-track preparation fails, the current track continues and NeoAres restores preparation of the next queue entry.
- Pause suspends playback but never cancels source preparation.
