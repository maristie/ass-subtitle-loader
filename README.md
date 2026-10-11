# ASS Subtitle Loader

CSS-only moving and fixed ASS/SSA comments over HTML5 video in desktop Firefox 140+. Version 0.2.0 uses the existing CSS parser, compositor animation, lane scheduler, wrapping, and video bounds handling. All text renders with the bundled Noto Sans CJK JP font.

Click the extension's **Load ASS** button, then choose a local file in the in-page picker or drop it onto the picker. The encoding menu supports automatic detection, UTF-8, UTF-16 LE/BE, Shift JIS, GB18030, Big5, and Windows-1252. **Remove** clears the track. Delay, size, opacity (including zero), top/bottom padding, and lane spacing apply to the current tab. Seeking, playback-speed changes, tab visibility changes, fullscreen, and resizing synchronize with the media clock. A video source change or replacement clears the previous video's subtitles. Files can be selected while waiting for a video.

The picker and rendered text are part of the website's DOM: page scripts can access the selected file and displayed subtitle text. Load files only on pages where you accept this access. The extension does not isolate subtitle content from the website. See [PRIVACY.md](PRIVACY.md).

## Supported subset

Every nonempty dialogue needs exactly one leading `\pos(x,y)` or `\move(x1,y1,x2,y2[,t1,t2])`. Leading whole-line overrides support `\an1`–`\an9`, `\fs`, `\fn`, `\b`, `\i`, `\u`, `\s`, `\bord`, `\shad`, primary/outline/shadow colors (`\c`, `\1c`, `\3c`, `\4c`) and alpha (`\alpha`, `\1a`, `\3a`, `\4a`). Text escapes `\N`, `\n`, and `\h` are supported. Font requests use bundled Noto rather than the requested family. Styles use normal outline borders, 100% X/Y scale, zero angle, and zero extra spacing.

Drawing, karaoke, fades, transforms, clips, embedded fonts, effects, opaque boxes, and overrides after visible text are rejected. Malformed records and unsupported cues reject the entire new file with a reason and line number; the previous valid track keeps playing. Empty positioned text records are ignored. This release does not expand ASS fidelity beyond the existing CSS subset.

## Settings and diagnostics

Global and site adjustment defaults use local extension storage; site defaults take precedence. Legacy records are readable, ignoring renderer and performance fields. New records use schema version 2 and contain adjustment values only, without timestamps. Delay is temporary. In private tabs only global defaults are loaded; adjustments are temporary, and save/reset operations and logging are disabled in the UI and message handlers.

The collapsed status panel retains the transient filename, timing, bounds, and render statistics. Console diagnostics are off by default. Their checkbox enables numeric/boolean diagnostics for this tab session only; arbitrary strings, filenames, addresses, page titles, subtitle text, and stacks are omitted. No background log forwarding exists.

## Development and reviewer build

Build on macOS or Linux with Node.js 24+ and npm, and Python 3.10+. Install [Node.js](https://nodejs.org/en/download) and [Python](https://www.python.org/downloads/) using their official installers or OS packages. The lockfile pins dependency resolutions; install with `npm ci`.

```sh
npm ci
npm run check
npm run test:renderer
npm run test:e2e
npm run package
```

`FIREFOX_BIN` selects the Firefox executable for renderer tests; installed-extension tests accept `--firefox-bin`. All browser tests use disposable headless profiles. Tests cover supported synthetic files; no personal browser profile is used. An optional real-site smoke test is `npm run test:e2e -- --real-site PUBLIC_VIDEO_URL`. It runs locally and publishes no site diagnostics.

Packaging rebuilds bundles and cleans `build/` and `stage/` first. An explicit runtime file list in `scripts/build-extension.js` stages only two bundles, the popup, manifest, icons, font and licenses. ZIP generation uses only those staged files. No signing command exists.

From a clean, committed Git tree:

```sh
npm run prepare:release
```

This local command checks the tree, runs unit tests and desktop extension lint, and creates the unsigned XPI, readable reviewer source ZIP, SHA-256 checksums, and runtime inventory under `dist/`. It does not read signing credentials or contact AMO. Rebuild the reviewer archive by extracting it, running `npm ci`, then `npm run package`. Compare extracted XPI file bytes; ZIP metadata may be ignored. `python3 scripts/verify-reproducibility.py` additionally checks a fresh clone and reviewer archive against the prepared XPI.

Mozilla's linter currently assumes Android compatibility from the desktop minimum version when no Android declaration exists. The desktop lint wrapper records its full output and excludes only the Android 140 data-collection-key warning, since Android is unsupported. All other errors, notices, and warnings fail the check. The original linter report is in `dist/lint.json` for review.

The unsigned XPI is suitable for temporary installation through `about:debugging` → **This Firefox** → **Load Temporary Add-on** in a disposable profile. It is not signed for permanent installation. [Reviewer instructions](docs/REVIEWER.md) and [AMO listing draft](docs/AMO-LISTING.md) are prepared for review. AMO acceptance is not presumed.

## Migration and licensing

0.2.0 removes JASSUB, libass, canvas overlays, complex-file fallback, renderer/performance selectors, adaptive degradation, and background logging. Files that previously required a complex renderer are now rejected while preserving the active valid track. See [CHANGELOG.md](CHANGELOG.md).

Project code is MIT licensed. The unchanged Noto font retains its separate [SIL Open Font License](fonts/LICENSE).
