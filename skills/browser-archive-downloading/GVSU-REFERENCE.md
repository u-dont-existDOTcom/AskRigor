# GVSU / Digital Commons empirical reference

Source: *Communal Societies*, Grand Valley State University ScholarWorks, tested on Joel's Zorin/Opera environment in August 2026.

## What failed

- r01-r04: direct `cgi/viewcontent.cgi` retrieval returned non-PDF responses. Diagnostics later identified HTTP `202` plus `x-amzn-waf-action: challenge` — an AWS WAF JavaScript/browser challenge.
- r05: visible browser passed the challenge and opened a real PDF, but code waited only for a Playwright download event while ScholarWorks rendered the PDF inline.
- r06: accepting inline PDF navigation still left the tab in Chromium/Opera's PDF viewer and stalled the next item.
- r07: closing all startup tabs killed the persistent browser context; the next `new_page()` failed with `Target.createTarget` / `Target closed`.
- r08: keeper tab fixed zero-tab context death, but navigating item tabs into the inline PDF viewer still produced `TargetClosedError` after successful retrieval.
- r09: browser-origin `fetch` from the ordinary ScholarWorks HTML page → PDF Blob → browser download worked. It verified 30 PDFs in 66 seconds, then the 31st and all later PDF fetches returned HTTP 403.
- r10: retained the working browser-origin Blob path, added ≥4 s spacing, 90 s bounded cooldown/escalation on 403/429, and stopped the loop rather than poisoning hundreds of items.
- r11: adds destination-aware packaging: every ChatGPT-upload ZIP is capped at 90,000,000 bytes using actual compressed ZIP size; oversized groups are recursively split. Before rebuilding, stale completed-corpus upload ZIPs/checksums are removed so an older oversized r10 package cannot be mistaken for a valid r11 output.

## Known-good invariants

- Discovery can stay deterministic HTTP; the browser is needed for challenged file bytes.
- Persistent collector-owned browser profile/context across items and reruns.
- One keeper tab remains alive.
- Fresh disposable HTML tab per item.
- Resolve the real Download/PDF URL from the public landing page.
- Never navigate Playwright into the built-in PDF viewer.
- Browser-origin JavaScript fetch with current browser session, require successful PDF response, Blob, real browser download, byte validation, SHA-256, atomic save.
- Minimum ~4 s between PDF fetch starts on this site; 403/429 after prior successes means cooldown/retry, not “bad article.”
- SQLite resume, hash recheck, automatic diagnostics, Ctrl+C safe.
- No OCR unless a later task explicitly needs it.
- All upload ZIPs <=90,000,000 bytes; remove stale completed-corpus upload ZIPs before rebuilding, preserve diagnostics/source PDFs, and if one individual file cannot fit, stop with an explicit packaging error.

These are empirical defaults, not universal constants. A different site can require a different interval or retrieval path; preserve the decision logic and evidence gathering rather than copying numbers blindly.
