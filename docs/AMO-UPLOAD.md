# AMO upload preparation

This guide prepares a listed version of ASS Subtitle Loader 0.2.0. No AMO upload, account action, agreement acceptance, signing, or publication has been performed by these preparation scripts.

## Upload files

From the clean committed repository, run `npm ci`, `npm run prepare:release`, and `python3 scripts/verify-reproducibility.py`.

- Extension: `dist/ass-subtitle-loader-0.2.0-unsigned.xpi`.
- Matching source: `dist/ass-subtitle-loader-0.2.0-source.zip`. Provide source because esbuild combines source modules into bundles, even though they are readable and not minified.
- Integrity evidence: `dist/SHA256SUMS`, `dist/inventory.json`, and `dist/lint.json`. These are local/reviewer evidence, not substitutes for the two upload files.
- Listing images: `docs/screenshots/amo-danmaku.png` and `docs/screenshots/amo-picker.png`.
- Listing fields and version notes: `docs/AMO-LISTING.md`.
- Reviewer instructions: `docs/REVIEWER.md`.
- Privacy policy text: `PRIVACY.md`.

The XPI is unsigned. AMO performs its own validation and signing after upload. Before submission, verify the current checksum file and attach the source archive produced alongside that XPI, rather than GitHub's generic repository ZIP.

To reproduce the listing images, run `npm run bundle` followed by `python3 scripts/capture-amo-screenshots.py`. The script uses a disposable headless Firefox profile and a generated local fixture; it never reads a personal browser profile.

## Proposed listing fields

| Field | Prepared value |
| --- | --- |
| Distribution | Listed on addons.mozilla.org ("On this site") |
| Name | ASS Subtitle Loader |
| Requested slug | ass-subtitle-loader, if available |
| Default listing language | English (US) |
| Version | 0.2.0 |
| Category | Photos, Music & Videos |
| Tags | None selected: AMO’s allowed tag list does not include danmaku, subtitles, ass, or video; those terms appear naturally in the listing |
| Homepage | https://github.com/maristie/ass-subtitle-loader |
| Support website | https://github.com/maristie/ass-subtitle-loader/issues |
| License | MIT for extension code; bundled Noto font retains SIL OFL |
| Compatibility | Desktop Firefox 140+; macOS and Linux tested; leave Android unselected |
| Payment or external purchase | None |
| Privacy policy | Paste PRIVACY.md, including the website-visible file picker disclosure |
| Required data collection | none, as declared in the manifest |

Use the summary, description, release notes, and screenshot captions from AMO-LISTING.md. Its description links both the optional ASS Danmaku Continued AMO extension and its GitHub project. Do not claim ordinary unpositioned subtitles or every exported ASS feature is supported.

## Notes for reviewers (paste-ready)

ASS Subtitle Loader 0.2.0 is a CSS-only local ASS/SSA danmaku loader for desktop Firefox 140+. No account, payment, real-site login, or companion extension is needed to test it. The optional ASS Danmaku Continued links are a way for users to obtain files; there is no runtime integration with that extension.

Matching source is attached. Build with Node.js 24+, npm, and Python 3.10+ on macOS or Linux: `npm ci`, then `npm run package`. Output: `dist/ass-subtitle-loader-0.2.0-unsigned.xpi`. All generated runtime files should match the uploaded XPI byte for byte. Readable esbuild bundles are not minified. There are no runtime renderer libraries, workers, WASM, remote code, or remote fonts. The unchanged Noto font has its SIL OFL notice in fonts/LICENSE.

Serve the source root with `python3 -m http.server 8000`, open `http://127.0.0.1:8000/test/recorded-video.html`, and use the toolbar's Load ASS button. Select `test/amo-danmaku.ass` for a short readable demonstration, then the dense, fixed-wrap, and synthetic-matrix fixtures described in docs/REVIEWER.md. Confirm unsupported tracks preserve the previous valid session. The version supports a conservative positioned/moving ASS subset, not full ASS fidelity.

The picker and rendered text are deliberately website-visible. Website scripts can access the selected file and subtitle DOM; this is disclosed in the listing, README, and privacy policy. The extension initiates no data transmission. Site-default saves explicitly store the origin as a local storage key; private tabs read global defaults only and block all save/reset messages. Diagnostics are off by default, numeric/boolean only, and disabled privately.

Raw lint retains an Android-only warning about the Firefox 140 no-data declaration because Android is unsupported and no Android compatibility declaration exists. The desktop lint wrapper excludes that single warning; other warnings/errors fail. See docs/REVIEWER.md for automated tests and the local minimum-version decoder caveat. Mozilla's own validation and reviewer assessment remain authoritative.

## Official submission references

- [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/): upload the XPI, attach matching source, provide listing details and reviewer notes, then submit the version.
- [Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/): source, locked dependencies, build environment, and reproducible build instructions.
- [Create an appealing listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/): summary maximum 250 characters; screenshots recommended at 1280 × 800.

Actual submission can use an authenticated Mozilla account in the Developer Hub or AMO’s authenticated v5 API. The existing local extension projects use API credentials held in macOS Keychain. Keep credentials out of the repository, shell arguments, and diagnostic output. Local preparation remains offline and does not perform signing or submission. See [AMO-SUBMISSION.md](AMO-SUBMISSION.md) for the submitted release status.
