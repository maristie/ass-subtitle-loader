# Reviewer instructions

This package is unsigned. Use temporary installation in a disposable desktop Firefox 140+ profile. Do not install into a personal profile. macOS and Linux integration CI run the minimum and latest desktop Firefox.

Build dependencies: Node.js 24+, npm, Python 3.10+, the included package-lock.json. See README for official tool installation links. Run `npm ci`, `npm run check`, and `npm run package`. The output is `dist/ass-subtitle-loader-0.2.0-unsigned.xpi`. No credentials, AMO access, signing, or publication is required. Source bundling uses the locked esbuild without minification; runtime staging is an explicit list. The bundled Noto font and its license are in fonts/.

The main use case is danmaku: scrolling comments and fixed text. General subtitles work only within the same positioned ASS subset. The optional ASS Danmaku Continued links in the listing help users obtain files and require no runtime integration or extra test account.

For the synthetic manual fixture, run `python3 -m http.server 8000` in the extracted source and visit `http://127.0.0.1:8000/test/recorded-video.html`. The included synthetic video starts automatically. Click Load ASS, select test/amo-danmaku.ass for a readable demonstration, then test/dom-fixed-wrap.ass, change to test/dom-dense-lanes.ass, then drop test/dom-synthetic-lane-matrix.ass into the picker. Check removal, encoding choices, delay, seeking, speed, opacity zero, resizing, fullscreen, and returning from another tab. Replacing the video clears subtitles. A file selected before a video appears waits for it.

Try a file with an unsupported override such as a clip or drawing. It must report a line/reason and keep the previous track playing. Console diagnostics start disabled and remain disabled privately. The status disclosure remains collapsed initially and shows useful transient render information when opened.

In a private window, allow the extension explicitly through Firefox's temporary-addon test setup. Global defaults may load; adjustment changes must work temporarily. All save/reset buttons and equivalent content messages must fail to write storage. Private origin and timestamps must not be persisted.

Automated verification: `npm run test:unit`, `npm run test:renderer`, `npm run test:e2e`. The latter temporarily installs the real XPI and tests normal/private windows. No real-site test runs in CI. Use the optional `--real-site` command locally if desired.

The desktop lint wrapper preserves raw linter output and excludes only the known Android compatibility warning for the no-data declaration; there is no Android compatibility declaration. Review `dist/lint.json` for the full output.

The page-visible picker and subtitle text are deliberately documented as accessible to website scripts. The no-data-transmission declaration describes extension behavior, not website behavior. The only web-accessible resource is the unchanged bundled font. There is no background page, renderer library, worker, WASM, remote code, or signing automation.

The committed synthetic.webm fixture is a generated VP8 test pattern. It needs no additional build dependency. To regenerate it for test development only, use FFmpeg with `ffmpeg -f lavfi -i 'testsrc2=size=640x360:rate=30:duration=8' -c:v libvpx -b:v 350k -an -y test/synthetic.webm`.

Local validation used macOS with Firefox 155.0.1 and Firefox 140.0. The local 140 media-decoder process stalled until `MOZ_DISABLE_RDD_SANDBOX=1` was set for its disposable synthetic test process. This workaround is confined to local synthetic media testing. CI's macOS 14 and Linux jobs run both versions with normal sandbox settings. The extension does not modify browser preferences or sandbox settings.
