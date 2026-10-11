# AMO listing draft

## Name

ASS Subtitle Loader

## Summary

Load local ASS/SSA danmaku over HTML5 video. Tuned for scrolling comments and fixed text, with timing and layout controls.

## Description

Watch danmaku—scrolling video comments—from your own local ASS/SSA files over HTML5 video. ASS Subtitle Loader uses CSS rendering tuned for dense moving-comment lanes, fixed-text wrapping, and video bounds. It also displays general subtitles encoded within the same supported positioned ASS subset.

Choose a file in the in-page picker or drop it onto the picker. Adjust delay, font size, opacity, top/bottom padding, and lane spacing. Save adjustment defaults globally or per website. The overlay follows playback, seeking, speed changes, tab visibility, fullscreen, and resizing.

Need a danmaku file? [ASS Danmaku Continued on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/5178368745564f49b810/) downloads comments from its supported video sites as ASS files. See its [GitHub project](https://github.com/maristie/ass-danmaku) for instructions. Download the file, then open it here on the video you want to watch. That extension is optional and operates separately; this loader validates every file against its supported subset.

For desktop Firefox 140+. Each nonempty dialogue must use a supported leading position or move tag. Ordinary unpositioned ASS subtitles, SRT, and WebVTT are not supported. Complex styling, karaoke, drawings, clips, transforms, and embedded fonts are unsupported. Text uses the bundled Noto Sans CJK JP font. Unsupported or malformed new files show a reason and line number while the previous valid track keeps playing. Protected Firefox pages cannot host the overlay.

Files are processed locally, with no telemetry or extension-initiated data transmission. The in-page picker and rendered text are accessible to website scripts, including the file selected in the picker. Load files only on websites where you accept this access. Private tabs allow temporary adjustments and global defaults only; saving defaults and diagnostic logging are disabled.

Permissions: activeTab to work on the page you select through the toolbar action; storage to retain adjustment defaults.

## Version 0.2.0 release notes

CSS-only rendering for supported moving danmaku and fixed text, with lane scheduling, wrapping, timing, and video bounds controls. This version removes complex-renderer fallback: files outside the supported subset are rejected while the active valid track continues. Existing adjustment defaults remain readable. Private tabs cannot save/reset defaults or enable diagnostics.

## Screenshot order and captions

1. `docs/screenshots/amo-danmaku.png`: Scrolling danmaku and fixed text rendered over a synthetic local video fixture.
2. `docs/screenshots/amo-picker.png`: Choose or drop a local ASS file in the page picker. The selected file and rendered text are accessible to the website.

These images use the production CSS bundle in the synthetic test harness; they contain no personal video, website account, or downloaded comments. Existing dense-lane and bounds regression screenshots remain available as reviewer evidence, rather than primary listing images.

## Submission status

Version 0.2.0 has been submitted to AMO’s listed channel and is awaiting review. The local upload XPI remains unsigned. See [AMO-SUBMISSION.md](AMO-SUBMISSION.md) for release identifiers and the exact uploaded source revision. AMO approval and a live public listing are not presumed.
