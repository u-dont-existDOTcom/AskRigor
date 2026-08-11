# GVSU Communal Societies browser archive reference implementation

Current reference package: `communal-societies-gvsu-downloader-r11.zip`

SHA-256: `b371ff57e900b55120de348e40626af0624350ee38b545bc41fcf8b477fd4035`

r11 is the known-good descendant of the live-tested r10 retrieval method. It preserves the visible persistent browser/WAF session, keeper tab, fresh HTML item tabs, browser-origin PDF fetch → Blob → browser download, resumable SQLite state, SHA-256 verification, bounded 403/429 cooldown/retry, and automatic diagnostics. r11 adds an enforced ChatGPT packaging ceiling: every output ZIP is <=90,000,000 bytes based on actual compressed size, with automatic numbered splitting.

The package itself contains the complete source, tests, run scripts, release instructions, manifest, and checksums. Use the sibling `skills/browser-archive-downloading/` files as the reusable decision guide; do not blindly copy GVSU-specific timing to unrelated sites.
