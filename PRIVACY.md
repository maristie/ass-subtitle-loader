# Privacy

ASS Subtitle Loader processes selected subtitle files locally and performs no extension-initiated data transmission, telemetry, remote code loading, or remote font lookup. It uses activeTab to operate on the page selected through the toolbar action and storage to retain adjustment defaults.

The file picker and subtitle overlay are website-visible DOM elements. Website scripts can access the selected file and rendered subtitle text. The website's own collection and transmission are outside this extension's control. Do not treat the picker as isolated from the website.

Subtitle content, filenames, delays, and render statistics are temporary and are not written to extension storage. Global defaults store normalized adjustment values. Site defaults additionally use the page origin in the existing storage key. New records contain no timestamps. Legacy records may retain their old timestamp until saved again or reset; they are never copied into new records.

Diagnostics are off by default and can be enabled for one normal tab session. Logs accept only selected numeric and boolean statistics. They do not include filenames, URLs, origins, page titles, subtitle text, or arbitrary error stacks, and are not forwarded to a background process.

Private tabs read only global defaults. Adjustment changes remain temporary. Diagnostic logging and all default save/reset operations are disabled, including direct messages. No private origin or timestamp is persisted. Firefox must separately allow this extension in private windows for the temporary private-window tests or normal private use.
