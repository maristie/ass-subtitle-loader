# AMO submission: 0.2.0

Submitted on October 11, 2026 UTC (October 10 locally) through AMO’s **listed** channel. The authenticated API currently reports **unreviewed**, meaning awaiting review. This is a successful submission, not a claim of Mozilla approval or a live public listing.

- Add-on ID: `3037222`; Gecko ID: `ass-subtitle-loader@example.local`.
- Version ID: `6563741`; file ID: `5107879`.
- [Developer Hub version status](https://addons.mozilla.org/en-US/developers/addon/ass-subtitle-loader/versions/6563741) (owning Mozilla account required).
- Exact uploaded source revision: `c3ca9f6eba03cb7575dda190d07f053b1dcd376d`.
- XPI SHA-256: `81862003b6b813101852b60946c3a0508e7f0335dff3fd02dc1f33d56b467477`.
- Reviewer source SHA-256: `2657ddad77c5c8a88b0ae99c07f769d4a98a382669cbeea4168a28482ebd2648`.

The XPI and matching source archive were accepted together. The license is MIT for extension code; the bundled Noto font retains its separate SIL OFL notice. Reviewer notes, release notes, the danmaku-focused description, both ASS Danmaku Continued links, the privacy policy, GitHub support link, and the Photos, Music & Videos category have been saved. Compatibility is desktop Firefox 140+ only. Tags are empty because the proposed keywords are not allowed AMO tags.

AMO validation reported **0 errors and 1 warning**: the documented Android-only minimum-version warning for the no-data declaration. Android is excluded from the submitted version’s application compatibility. The page-visible picker and subtitle DOM access are explicitly disclosed; reviewer assessment remains authoritative.

The AMO-served XPI has been downloaded and compared with the upload: every code and asset file is identical, and the parsed manifests match. AMO normalizes directory entries and manifest whitespace, so whole-archive hashes differ.

The listing icon and both synthetic screenshots have been uploaded. The screenshots use local test fixtures and contain no personal browsing or account data. The main screenshot caption is saved; the picker screenshot caption is pending AMO’s daily write limit. This does not undo the accepted version or image uploads.

The existing extension projects use the official AMO v5 API with credentials held in macOS Keychain. This submission used that authenticated API route after browser sign-in encountered a client challenge. No credentials were stored in the repository, release source, command arguments, or logs. CI continues to validate and package only; it does not sign or publish.

The exact uploaded XPI, source ZIP, checksums, inventory, lint report, and private submission receipt are retained locally under ignored `artifacts/amo/0.2.0/`. The source revision above, rather than a later documentation-only commit, identifies the uploaded reviewer snapshot.

Before any retry, query `/api/v5/addons/addon/3037222/versions/0.2.0/`. A signing delay or browser sign-in challenge does not mean the accepted version failed. Do not submit 0.2.0 again. Mozilla’s [API documentation](https://mozilla.github.io/addons-server/topics/api/addons.html) describes version status and source submission.
