# Production release: comprehensive inositol Atlas dossier (16 November 2026)

## Requested outcome and source

- The owner requested one readily discoverable, detailed Atlas research overview linking inositol forms, effectiveness, safety, negative findings and earlier inositol conversations; mainstream facts should be retained when together they save extensive research effort.
- Source PR [#479](https://github.com/u-dont-existDOTcom/AskRigor/pull/479), merged commit `80ebc0066fbf7559940631338d4592dea06bcf6d` at 03:16:52 UTC. Original reviewed branch head `3c69b4c8baa53a221f7cd6a18d943e6a79093576` and merged main have identical Git tree `63a428f1af4fd708518bdd22ed5efab3e3fb2f74`.
- This is an authored inositol source-linked public article, not a dynamically stored, server-generated full research dossier. General automatic deep-research archival remains [issue #477](https://github.com/u-dont-existDOTcom/AskRigor/issues/477).

## What reached production

- `/atlas/topics/inositol` now combines myo-, D-chiro-, scyllo-inositol, IP6/phytic acid, their combinations and D-pinitol. It gives a six-form comparative overview, detailed primary studies, quantified effects where recoverable, limitations, null studies, harms, and supporting source links. It explicitly differentiates human trials, rodent work, and selected self-reports. It labels the synthesis as AI-prepared, not supervisor-checked; the topic remains `noindex` while its underlying findings are unreviewed.
- `/atlas/search?q=inositol` returns the original seven P-number findings: P-1216, P-1218, P-1219, P-1220, P-1221, P-1227, P-1228. Umbrella aliases find IP6/phytate; the separate `/atlas/search?q=IP6` remains limited to IP6. Existing original topic and finding URLs resolve normally.
- The seven records had previously been kept from public search; the owner had already used `show_on_pages` to make them visible. The new family index only reads publicly shown findings: **other `kept_for_research` findings stay out of public lists**.
- HRP upgraded to 20.6.42, SHA-256 `bef2125fc273d2c67c02ba0197739bce60b3134d5d59e25aca413cb943932b46`. Universal remains 20.5.46. The protocol adds time-saving whole-research value as an alternative to novelty alone, retaining privacy, source/provenance and consent requirements.

## Tests and release provenance

- Local `npm run typecheck`, targeted 80 dossier/page tests, `npm run test:site` (8 pages) and `npm run test:site-deploy` (30 tests) passed. Local full run had 6,870 passed and one 10-second integration timeout under concurrent load; isolated rerun of that entire test suite passed 89/89. Hosted GitHub PR checks passed: deterministic verification, workflow policy and CodeQL checks for actions, JavaScript/TypeScript, Python and Ruby.
- Source archive SHA-256 `fb91f864e82977631784cbcd41d2daf386dd718d63c3dadaadfb018679bad5b7`. Image archive SHA-256 `33d327aeaee1fdd1e200c6bafe2f7176870eae25057a62391e60443bda87df77`. Image ID `sha256:7854b3928e3d8242ce8b8887dc1a6710435a20da3028e3f3528498ce6245c8a6`; the image's OCI revision label names the PR source commit whose Git tree matches merged main.
- Exact archive checksums were revalidated on the production host before image load. Production `research-mcp` was recreated using the reviewed image at approximately 03:21:52 UTC; prior image and `runtime.env`/promotion image selector were backed up under `/opt/askrigor/rollbacks/pre-inositol-80ebc0066fbf7559940631338d4592dea06bcf6d`. No database schema or public site source change was needed for the Atlas route. The research promotion service ran once and its timer was left enabled.
- Live production: service healthy; `/version` names merged build `80ebc0066fbf7559940631338d4592dea06bcf6d`, HRP 20.6.42. Read-only connector reports 35 tools, accepted research access and matching HRP/Universal versions. HTTPS checks from outside the host returned 200 for the full inositol dossier (44,839 bytes), both queries, the IP6 and adverse-effect topic pages and the original sample P-number finding pages. The HTML included all six form headings, trial counts and endpoint data, source links and original finding links.
- Rollback: use the saved prior image tag `askrigor-research:rollback-pre-inositol-80ebc0066fbf7559940631338d4592dea06bcf6d`, restore the two backed-up `.env` files, recreate only the `research-mcp` service with that image, verify health, and keep the promotion timer's selector consistent.

## Explicit remaining scope

- The comprehensive article is curated/source-linked and will require supervisor review; it is not a medically validated recommendation or automatic systematic review.
- Generic automatic ingestion of every sufficiently useful future deep-research run, a server-persisted versioned long-form dossier, and dynamic cross-thread merging are **not yet implemented**. These remain open in issue #477. A PR, protocol instruction, or the present one-off article does not prove that generic pipeline works.
- The installed plugin's exact packaged skill-file bytes were not independently read back in this release; its 35-tool shape and live versions were checked. No plugin tool catalog change was made.
