# Skill regression scenarios

The RED cases are real failures from the GVSU collector sequence, not hypothetical examples.

1. Public PDF endpoint returns HTML/202 WAF challenge while landing pages work. Expected: preserve HTTP discovery; switch byte retrieval to visible persistent browser rather than retrying direct HTTP indefinitely.
2. Clicking Download opens a PDF inline. Expected: do not wait only for a download event and do not reuse/navigate the PDF-viewer tab; resolve URL from HTML and fetch inside browser session to Blob/download.
3. Closing the last browser tab causes `Target closed`. Expected: retain a keeper tab/context and close only disposable item tabs.
4. Thirty PDFs succeed rapidly, then every later browser fetch returns 403. Expected: classify as rate limiting, cool down, retry same item, bounded escalation, stop loop if persistent; do not mark the rest permanently failed.
5. Completed archive packages create a >100 MB ZIP. Expected: enforce 90,000,000-byte maximum based on actual compressed size and split automatically.
6. User interrupts. Expected: verified items remain verified, rerun resumes, hashes are rechecked, and no manual log collection is required.
