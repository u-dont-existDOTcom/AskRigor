# Production release, 2026-11-17 (research dossiers: registry numbers aren't phone numbers, the rules stated, an index)

- **Owner decision:** 337a, typed in chat on 17 Nov 2026 at about 01:26 UTC (and chosen in the Inbox at 00:51 UTC), in
  the session that released. Not a pure-fix release: it changes what a privacy screen lets through.
- **Why:** the first real research dossier (16 Nov, on #481's build) was not saved. The privacy screen read a trial's
  registry number, ACTRN12620000032954, as a phone number (a refusal final for the research); the researching AI broke
  the dossier's form rules 30 times, because the shape never stated them; and nine server-filed study analyses of the
  same research were cancelled by the research-access role's 5-second statement timeout in the proposal lookup by
  idempotency key, which had timed out daily since 5 November (80 times that day, 16 on 16 November).
- **Contents:** #483, merged as `6a7db60500612e28d5699a921030cb321bf2258b` at 01:27:42 UTC at its checked head
  `dfb38922`. Research identifiers in their exact published shapes set aside before the phone and contact rules
  (`findings/research-identifiers.ts`; the dossier screen takes the trial registries, the findings card keeps DOI, PMID,
  PMCID and NCT); the dossier's shape states its ids, forms and citing, and each problem's rule is explained once;
  migration `0038_research_proposal_idempotency_index` (one partial index, no grants). Role scripts, HRP 20.6.43, the
  site, compose and the tool lists unchanged.
- **Before deploying:** `npm run verify` 7,028 tests; PostgreSQL acceptance 117 checks (0038 applied, re-runnable, used
  by the lookup's own query, kept by the previous image's migrate); living-evidence acceptance 42; hosted checks 7 of
  7; Codex red-teamed the identifier screen three times and reviewed the whole branch ("release"; one P2 test gap: a
  test that reproduces nine concurrent full-payload lookups under the 5-second timeout).
- **Build and stage A (01:28 to 01:30 UTC):** research archive 122,635,876 bytes; the new image's dossier screen with no
  network passed the registry sentence and refused both phone sentences (DOSSIER_SCREEN_FIXED); the host on
  `bc71b90e`; role scripts `1649203c…` and `3292cbcf…`; both dossier lines of #481's stage D present.
- **Before stage B:** quiet for 329 seconds; no active database connection of the service.
- **Stage B (01:34 to 01:35 UTC):** dump 18,164,539 bytes kept; the prior image tagged
  `askrigor-research:rollback-pre-6a7db6050061`; 0038 applied: 4,771 proposals, 56 MB before and 57 MB after, the
  index valid and ready; grants as before (review 39, access 26); the dossier boundary 5|0|0|6|0|O; both dossier lines
  kept, and the new service reads them (dossiers saved, privacy reading on); research-mcp on the new image from
  01:34:59 UTC, healthy.
- **Stage C:** build `6a7db605` and HRP 20.6.43 served; 35 tools, list versions equal to the fixtures; every site page
  equal to the merge's; the dossier screen probe: the new image DOSSIER_SCREEN_FIXED, the rollback image
  DOSSIER_SCREEN_OLD, as expected; a read-only EXPLAIN (generic plan) of the lookup uses
  `research_contribution_proposals_idempotency_idx` (INDEX_PLAN_OK). BC_DONE at 01:36:14 UTC.
- **After:** readers-read: dossiers enabled, privacy reading on, no reading failure; plugin receipt: 0 packaged files
  changed; rollback read: the kept `runtime.env` names `bc71b90e` and holds both dossier lines. A rollback leaves the
  0038 index in place: the previous image uses it too.
- **Still to watch:** the statement timeouts on the lookup after the first research that files study analyses, and
  again the next day (the kit's `timeout-watch.sh`); the next dossier, content-free.
- **Kit:** `/home/joel/askrigor-releases/20261117-483` (made by `make-kit-483.py` from #481's kit).
