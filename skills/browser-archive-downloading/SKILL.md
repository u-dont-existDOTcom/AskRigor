---
name: browser-archive-downloading
description: Use when bulk-downloading a public document or archive site where direct HTTP is blocked or challenged, browser automation is required, documents open inline, repeated retrievals hit 403/429, or the resulting corpus must be resumable and uploadable.
---

# Browser Archive Downloading

## Overview

Use the least invasive retrieval path that actually works. Keep deterministic discovery separate from browser-only byte retrieval, preserve resumable state, and treat browser/WAF behavior as empirical rather than something to guess around.

## Core pattern

1. **Discover deterministically first.** Enumerate public issue/item landing pages and record canonical URLs, metadata, and expected files in persistent SQLite/JSON state.
2. **Try ordinary HTTP only when it works.** If public file requests return a browser challenge (for example `202` with `x-amzn-waf-action: challenge`) or equivalent interstitial, stop hammering the file endpoint.
3. **Use one visible persistent browser context/profile.** Let the browser execute ordinary public JavaScript challenges. Never bypass login, CAPTCHA, paywalls, private URLs, or access controls.
4. **Keep the context alive.** Maintain one harmless keeper tab. Use a fresh disposable HTML tab per item so inline viewers cannot contaminate the next retrieval.
5. **Avoid browser PDF viewers.** Resolve the real public file URL from the landing page, then fetch it from JavaScript inside the authorized browser session. Validate the response, convert it to a Blob, trigger a browser download, verify the actual bytes, save atomically, then close only the disposable tab.
6. **Throttle from evidence.** Space requests conservatively. Treat repeated `403`/`429` after earlier successes as rate limiting: cool down, retry the same item with bounded escalation, and stop the bulk loop if the limit persists. Do not mark the rest of the archive permanently failed.
7. **Make interruption cheap.** Hash verified files, recheck them on resume, preserve successful state, print the item and stage before blocking calls, use hard per-item time budgets, and generate diagnostics automatically on nonzero exit.
8. **Package for the destination.** For ChatGPT uploads, cap every ZIP at **90,000,000 bytes** (90 MB), safely below the 100 MB limit. Measure the actual compressed ZIP size and recursively split oversized groups into numbered parts. Remove stale completed-corpus upload ZIPs before a rebuild while preserving diagnostics/source files. Never emit an oversized ZIP.

## GVSU reference

For the empirical failure history, rate-limit evidence, and known-working ScholarWorks implementation, read `GVSU-REFERENCE.md` and `SUCCESS-PROFILE.json`. The maintained reference implementation is under `tools/gvsu-communal-societies-archive/`.
