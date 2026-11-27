# Production release, 2026-11-27 (release J: the free-use notice in Gemini's own sign-in, 419a's terms page, and the privacy page)

- **Owner decision:** the owner chose 429a, "Yes: merge the four and release it", typed in the coordinator's chat at
  2026-11-27T20:25:36Z (question 429, "Release the Gemini fix: AskRigor shows its free-use notice during Gemini's
  sign-in?"): merge #529, #526, #531 and #532 in that order, then a server release with migration 0044 and the privacy
  page's new sentences; rollback: the previous image, after mapping the new label back. Nothing else: no setting change,
  no Auth0 change (419a's post-login Action stays in the repository, not installed: its own question), no new
  environment variable (`ASKRIGOR_AUTH0_TERMS_SECRET` stays unset, so `/account/terms` answers 503 and nothing links to
  it), no tool-list change. The Gemini sign-in step log (`ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled`, on since release
  E2) stays on as it is.
- **What changed for people:**
  - **Gemini's sign-in shows AskRigor's free-use notice (#532).** Gemini can't show the notice in its chat, so an
    account used only through Gemini could never accept it, and every research call there was refused (the owner's
    tries of 27 Nov: "gemini is still not working"). After the person signs in and before "Connect Google Gemini to
    AskRigor?", an account whose yes doesn't cover the current notice is shown it, word for word, on AskRigor's own page,
    with "Accept and continue" and "Decline". Accept records the yes as `accept_free_contributor` does, noted
    `PERSON_SIGN_IN_PAGE`, only for the notice version shown, then the consent step says it was recorded; Decline
    records nothing and the consent step follows all the same (Gemini connects; research stays refused until the notice
    is accepted or paid private access is active). Each step's form token answers once: a double press gets the same
    answer, the other answer is refused, a Decline never becomes a yes. An account whose yes covers the current notice,
    the owner's own login and an active paid private account go straight to the consent step, as before (its page
    byte for byte release I's but for two stylesheet rules used only by a note). A research refusal on Gemini for want
    of the notice now tells the person to remove AskRigor in Gemini's settings and add it again.
  - **419a's terms page (#531), not reachable yet.** `/account/terms`, AskRigor's page for the notice right after a
    first sign-in, between Auth0's post-login Action and Auth0's `/continue`, is in the code and answers 503 until the
    owner decides on the Action and its secret. Migration 0044 widens 0031's notice acceptance check, under its own
    name, to admit `PERSON_SIGN_IN_PAGE`, and adds `research_terms_page_answers` (a token's SHA-256, its first answer and
    when it can no longer be used; nothing that names a person), reached only by the research-access role, whose script
    now grants select, insert and delete on it.
  - **The Atlas clock test fix (#529):** the finding page passes its own clock to the person-claim marks.
  - **The privacy notice (the site release, @@SITE_TIME@@).** "Effective November 27, 2026"; in "Connecting Google Gemini",
    #532's sentences: the notice shown before the choice, what Accept records (the notice version, the time, and that the
    yes was given on that page), that Decline records nothing, and the one-way fingerprint of the step's form kept with
    the answer for about eleven minutes. The roadmap's 25 November fold (release I's) and 15 November fold (#473's
    record, #526) went live with it, and the fold for this release.
  - The same 35 tools (no app refresh), HRP 20.6.46 and Universal 20.5.46; no setting or plugin change.
- **Contents:** six merges since release I (`2ba3047d`, live since 25 Nov 01:37:49 UTC): #524 (`d78223bb`, release I's
  privacy page, live since its site release), #525 (`e3c3a31a`, release I's record and roadmap line), #529 (`ead32cb0`,
  at `1db1b871`), #526 (`209f586c`, at `afd87d11`), #531 (`f7360595`, at `7ed124fc`: the reader-role guard of 0044 that
  GitHub's real-database acceptance asked for) and #532, merged at 21:04:29 UTC as **M =
  `63a5688b21e546f906f064b5cd3e5629e97a0627`** (at `61bc8640`, #532's head with main merged in; tree equal; GitHub's 7
  checks passed on each head). Against `2ba3047d`: packages/, infra/, ops/ and scripts/ change in exactly twelve files
  (migration 0044, SHA-256 `eabb34ea5243004270fb1fc099276d17cf1a857a54d6892dcd8f44d3f2a93f4e`; the evidence
  repository's index.ts, postgres.ts (0044 last of 44), research-contributor-access.ts and terms-page-answers.ts; the
  access role script `804ed034...`, three lines added; the infra README's 0044 section; the Auth0 Action's three files;
  two acceptance scripts); the setting names the code reads are release I's 164 and `ASKRIGOR_AUTH0_TERMS_SECRET`;
  protocols/, the tool-list fixtures, the plugin's packaged files, the lockfile, every Dockerfile and compose file
  unchanged.
- **Before deploying:** GitHub's 7 checks passed on each merge's head (build.sh reads them: BUILD_CHECKS_OK at
  @@CHECKS_TIME@@). The kit's checks on M's tree before the build (KIT_READY, 27 Nov): its own image of the same tree, no
  network: CANDIDATE_OK, RELEASE_J_PROBE_OK (Gemini's notice step through its real routes and authorization server, a
  browser behind the proxy's no-referrer: shown, accepted, declined, another version shown, asked nothing of three kinds
  of accounts, a store that doesn't answer; /account/terms 503; migration 0044 last of 44), failing on release I's
  image as it must; RELEASE_I, H, G, F, E and D, LEDGER_OFF, NEW_SETTINGS, PUBLIC_DOSSIERS_OFF, PERSON_MARK,
  SAFETY_LIMITS, SAFETY_LIMITS_LIVE and SERVICE_READS all OK. On a throwaway PostgreSQL 17.6 built as production's
  (release I's migrate and role scripts, an account accepted in an AI app): stage B's 0044 gate, M's migrate twice, M's
  role scripts, stage B's database block as rendered (DB_CHECKS_OK), M's code recording a `PERSON_SIGN_IN_PAGE` yes and a
  token's one answer as the access role, the reader refused the new table, release I's code unable to read that
  account, the rollback's mapping, then release I's code reading both accounts and release I's migrate recording nothing
  new: DB_CHECK_LOCAL_OK.
- **Source and image:** @@BUILD@@
- **Prior state (stage A):** @@STAGE_A@@
- **Switch (stage B):** @@STAGE_B@@
- **Stage C:** @@STAGE_C@@
- **Acceptance through https://mcp.askrigor.com:** @@ACCEPTANCE@@
- **Readers, plugin receipt, connector probe, rollback read:** @@READS@@
- **The site:** @@SITE@@
- **Rollback (not used):** `FORCE_ROLLBACK=1 ./rollback.sh` in `/home/joel/askrigor-releases/20261127-release-j`: the
  promotion timer stopped, every account noted `PERSON_SIGN_IN_PAGE` mapped to `PERSON` as the migrator (counts only)
  before release I's image serves, the selector and runtime.env from `/opt/askrigor/rollbacks/pre-<M>`, research-mcp on
  `2ba3047d`'s image (tagged `askrigor-research:rollback-pre-63a5688b21e5`), the mapping again right after the switch,
  then no row may hold the label. 0044 stays (additive; undo no migration), with its table and the access role's grant.
  The site alone: `FORCE_ROLLBACK=1 ./site-rollback.sh` (d78223bb's archive again).
- **Not checked:** a real Gemini link through Google's relay with the notice step (the owner's step: remove AskRigor in
  Gemini, add it again, sign in and accept the notice); Firefox and Safari.
