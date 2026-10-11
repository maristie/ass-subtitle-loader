# Changelog

## 0.2.0

- Render supported moving and fixed comments exclusively with CSS.
- Remove complex-renderer fallback, libraries, workers, WASM, canvas overlays, renderer/performance selectors, Android support, and the background page.
- Reject malformed and unsupported new tracks before replacing the active valid subtitle session; report a reason and line number without quoting authored text.
- Retain playback synchronization, lane scheduling, wrapping, bounds, file encodings, picker/drop workflow, adjustments, and the exact Noto font.
- Migrate defaults to adjustment-only schema 2 while reading legacy records and preserving site-over-global precedence.
- Restrict private tabs to temporary adjustments and global default reads; block persistence and diagnostics.
- Make diagnostics opt-in per tab session and redact private content.
- Use explicit runtime packaging, local unsigned release preparation, locked build tools, and synthetic desktop browser CI.

Migration: complex ASS files that formerly fell back to JASSUB/libass are unsupported. Select a file within the documented CSS subset. No original Git history is imported into this independently created repository.
