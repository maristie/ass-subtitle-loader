# AMO listing draft

Name: ASS Subtitle Loader

Summary: Load local moving and fixed ASS/SSA comments over HTML5 video with CSS.

Description:
Choose a subtitle file on the video page or drag it onto the picker. Adjust subtitle delay, font size, opacity, padding, and lane spacing. Save adjustment defaults globally or per website. The CSS overlay follows video playback, seeking, speed changes, and resizing.

For desktop Firefox 140+. This extension supports a conservative subset of positioned and moving ASS text; complex styling, karaoke, drawings, and embedded fonts are unsupported. Unsupported or malformed new files are rejected while the previous valid track keeps playing.

Files are processed locally. The in-page picker and rendered text are accessible to website scripts. Use only on websites where you accept this access. Private tabs allow temporary adjustments with global defaults only; saving and diagnostic logging are disabled.

Permissions: activeTab to work on the selected video page; storage for adjustment defaults. No telemetry or extension-initiated data transmission.

Release note: Version 0.2.0 removes complex-renderer fallback and uses CSS exclusively. Existing adjustment defaults remain readable.

Screenshots: synthetic screenshots under docs/screenshots, produced from the bundled test fixtures. These are draft listing assets, not screenshots of personal websites.

Review status: unpublished, unsigned, not submitted to AMO.
