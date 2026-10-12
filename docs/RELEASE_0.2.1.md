# NeoAres 0.2.1 — visualizer title alignment hotfix

The native header's growing identity grid used two auto-sized columns. Free
space expanded the status-dot column and moved the title away from the left
edge. Fix the dot column at 7px and let only the text column grow/shrink.
No window commands, audio routing, presets or auto-hide behavior are changed.

The regression was reproduced against the 0.2.0 production renderer: 360px
passed, while 768px failed the title-to-status-dot spacing assertion.

The production window QA now checks title/subtitle left alignment, the 8px
dot-to-title gap and separation from controls at requested widths 360, 768,
1194 and 1920px, with a long preset name, 200% zoom, maximized and fullscreen.
It retains the existing minimize, restore, close and playback lifecycle tests.

Before publication, require successful Desktop QA in Mac and Windows, build
all four packages from this commit and verify their bundled assets and hashes.
Publish v0.2.1, then remove the flawed v0.2.0 GitHub release and its download
assets at the user's request. Preserve Git history/tags and unrelated releases.

Packages: Mac arm64, Mac Universal (Intel + Apple Silicon), Windows x64 portable,
Windows x64 NSIS installer, and SHA256SUMS.txt. All eight presets remain bundled.
Mac uses ad-hoc signing without notarization; Windows has no Authenticode
publisher signature. Physical Intel Mac, Snap/DPI/multi-monitor and hardware GPU
performance are not certified by the automated CI checks.
