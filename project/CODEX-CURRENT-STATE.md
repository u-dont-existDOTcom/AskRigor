# AskRigor Codex Current State

Updated: 2026-08-19

## Goal

Make AskRigor's Codex/GitHub workflow reproducible, reviewable, secure, and resumable without allowing workflow metadata, release receipts, or remembered lessons to supersede the complete canonical protocols.

## Authority / baseline

- Repository: `u-dont-existDOTcom/AskRigor`
- Canonical branch: `main`; current verified GitHub baseline is PR #39 merge
  `793c331ad90b9918246105e5f998ab9d1a258de9`. PR #37 merged the first
  discovery/weighting repair as
  `d49cad990f21dfdf9649951248798293650f2a4a`; PRs #38 and #39 then advanced
  canonical Universal source to `20.5.14`. Production still runs PR #36 merge
  `cfce806345fe65a13fd0330aa7e8f000c1587d01` on image ID
  `sha256:8c5441430b8dbe0cd532908831c1637e405a668943792cabcef4884870bfc360`;
  rollback tag `askrigor-research:rollback-cfce806` resolves the prior PR #32
  image. The privacy-model repair head
  `87433b8829da835f1e8c2b1bd5cd613ac14046b6` passed protected checks before
  merge and exact post-merge checks afterward. The
  public-boundary task started from PR #30 merge
  `8ac8b068cbf316d9a9802674ec27df0b55467afb`. The
  consent-shell repair started from PR #28 merge
  `c6a12c950dad432ea0e8b157d9d13cdcd2bf4bd1`. Exact PR #29 head
  `81328fc439b6cd6a199a9b707aeafe5b9881fadc` merged as
  `25849647969a4bf333659feaa30f0b418cc24d57`, while production now runs exact
  revision `cfce806345fe65a13fd0330aa7e8f000c1587d01`. The continuation implementation
  passed direct and Custom GPT UI two-call acceptance, and deployed Universal
  `20.5.13` passed fresh direct production acceptance.
  Recovery branch `recovery/custom-gpt-bridge-pre-main-7be7923` preserves the
  pre-integration bridge candidate.
- Verified packet-repair boundary:
  `0d8ef69fa7fd73c34c571a07723b5a6b5bad5fec`
- Exact packet-repair head merged by PR #12:
  `9c2c78e86391457c4b1bcd81a862456661db216e`
- Pre-integration recovery branch: `recovery/askrigor-compliance-pre-main-9d9dc78`
- Protocol authority: current explicit owner correction, then the exact complete bytes of `protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml`
- Canonical source byte receipts: HRP `20.5.18` / 2026-08-16 / `4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5`; Universal `20.5.14` / 2026-08-18 / `8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221`. Production remains separately verified at Universal `20.5.13` / 2026-08-17 / `3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4` pending the recorded rollout boundary.
- Runtime: Node `24.18.0`; bootstrap `npm ci`; complete deterministic gate `npm run verify`
- Universal policy: `u-dont-existDOTcom/universal-dev-architecture/patterns/codex-github-operating-system.md`
- Universal integration: `20.5.13` added the source-wide whole-argument reconstruction gate; canonical source `20.5.14` adds the research-before-reinvention gate. HRP bytes remain unchanged.

## Active 2026-08-18 treatment-decision regressions

- In a fresh public-GPT run for a treatment-alternatives question, the GPT
  loaded and verified Universal and HRP but did not run PubMed, Europe PMC,
  ClinicalTrials.gov, or the mandatory Forum Signal YouTube survey/audit. It
  nevertheless labeled the answer HRP-complete. The later audit correctly
  identified the omitted formal retrieval, omitted community module, and
  ineffective applicability/completion ledger. The later YouTube work does not
  retroactively validate the first answer.
- This is an observed product-interface failure, not merely one of the three
  opaque remote-MCP receipts. Do not accept those opaque limitations or proceed
  to v0.1 submission until this regression is repaired and retested.
- The GPT then attempted to report the validated failure, but the lesson Action
  returned the non-retryable privacy rejection. Do not retry or resubmit that
  failed candidate. The repair must keep the fail-closed privacy boundary while
  ensuring a fully generalized `protocol_execution` lesson—with no medical
  topic, exact prompt, quotations, URLs, turn references, or execution
  transcript—passes the deterministic contract and receives explicit
  privacy-model guidance.
- Existing source instructions already state that Forum Signal is required
  when firsthand outcomes, harms, tolerability, discontinuation, or patient
  decision-making could plausibly matter. The current generated Custom GPT
  artifact lacks a permanent explicit treatment-alternatives regression, and
  the observed model ignored the general trigger. The narrow repair is to make
  treatment alternatives, avoiding replacement, and avoiding surgery explicit
  fail-closed examples; require a passing Forum Signal receipt before any
  HRP-complete label; and preserve the existing public non-tailored health
  boundary.
- A second fresh public-GPT treatment-decision run did execute YouTube
  community work, but it stayed anchored to the clinician-proposed
  celecoxib-to-surgery pathway. It audited the named treatments without first
  discovering and comparing realistic alternatives. Forum Signal execution
  therefore did not satisfy HRP's independent broad heterodox option-space
  requirement.
- The expanded repair separates Forum Signal applicability from treatment
  option-space breadth. Personal/practical decisions require Forum Signal even
  when alternatives are unstated. Endorsement, choice, and start/defer/sequence
  decisions also
  require an option-space ledger covering proposed care, diagnosis
  alternatives, nonaction/natural history, conventional nonsurgical care,
  lifestyle/rehabilitation/mechanical approaches, relevant heterodox or
  adjunct approaches, and procedural/surgical care. Plausible classes must be
  searched and exclusions justified before a verdict.
- PR #36 merged and deployed that repair. The owner installed exact
  7,753-character Instructions
  `efd1567e185d2c9c3c209812a26dde630de802ba7a0b878ee9640af7886c14ec`
  with empty Knowledge.
- A third broad treatment-pathway product run then executed Forum Signal and
  option-space work, retrieving 1,179 YouTube records and returning 418 for
  analysis, but exposed a discovery/weighting failure. It treated four largely
  conventional/provider-ranked pools as adequate without a candidate-selection
  ledger, collapsed distinct exercise/PT programs, did not separate
  preoperative conservative care from postoperative rehabilitation, did not
  constrain decisive THA trials to their exact comparators, and gave little
  structured steelman treatment to hydration/collagen evidence after exact
  matched studies were not located.
- The owner then exercised the first discovery/weighting candidate
  (`8cbc6a3a5741f46e08cb184dfb32277d85a4897aa86e993865bfdc219f1b41d6`)
  through another fresh product run. It audited generic conservative care
  (`partial` / `completed_with_access_boundary`, 272/272/71), general NSAID
  experience (`api_visible_complete`, 197/197/110), and postoperative
  replacement mistakes (`api_visible_complete`, 989/989/103), where each tuple
  is provider-reported/retrieved/returned-for-analysis. It omitted separate
  gelatin/collagen and hydration hypotheses, did not locate program-matched
  preoperative PT videos, collapsed distinct PT/exercise programs, and still
  labeled the result HRP-complete. This owner-provided UI receipt disproves the
  sufficiency of the first follow-up; tool execution and passing per-video locks
  did not establish option-space coverage.
- The first test-first follow-up merged as PR #37. RED was
  observed because the Project router, Forum module, plugin skill, and generated
  Custom GPT packet lacked the new executable controls. The candidate adds a
  candidate-selection ledger, exact intervention/comparator decomposition,
  preoperative/postoperative separation, comparator-bounded inference, and
  steelman-without-inflation rules, plus regenerated Instructions/sync artifacts
  and a new seven-case discovery/weighting matrix. No canonical
  protocol, OpenAPI operation, MCP tool, production deployment, or private
  lesson changed in that follow-up. The owner installed and product-tested its
  exact generated Instructions; that test produced the failure immediately
  above. The rejected lesson was not retried. The
  dirty original checkout and its unrelated credential-looking files remain
  untouched.
- A topic-specific second follow-up was tested locally and then superseded
  before publication because baking the observed hip answers into production
  would contaminate future tests and fail to generalize. The active candidate
  instead uses universal evidence-frontier search, exact claim fingerprints,
  creator-transcript verification, independent comment audits, and a no-padding
  timestamped watchlist. The failed hip answer remains historical evidence, not
  a shipped checklist.
- Owner-reported OpenAI state: individual identity is verified. Business/
  organization verification is blocked after an apparent signup timeout; the
  owner believes the retry delay may be three months, but the exact duration is
  not independently verified. Official OpenAI documentation permits submission
  under either a verified individual identity or a verified business identity,
  and requires the listing identity, website, support, privacy, and terms to
  match. Publishing under the individual identity now exposes/uses the
  individual's publisher identity; waiting preserves the AskRigor business-name
  alignment but delays submission. This remains an owner identity/privacy choice.

## Active Custom GPT research bridge acceptance

- PRs #19 through #23 are merged. The continuation release merge is
  `905ac22ab42479c15ff0d6385a51de864271f862`, exact PR #23 head
  `11f3a68a73bc68bc23f1854b6bd8d4c06f9b843f`. The exact formerly failing
  YouTube video now completes its direct two-call Action chain with a
  deterministic terminal sample and `synthesis_lock:pass`; the repaired
  two-call Custom GPT UI retest passed on 2026-08-17. PR #27 then merged its
  sanitized receipt and the current Universal ancestry as production revision
  `5585a9ca34ce01403044b1085b85d4f2de9783f4`.
- The owner approved the compatibility bridge and clear reversible changes.
  PR #15 merged accepted head `be641bf568c401992ff4aa9fe885552d6cfb2dca`
  as `dd73d7dccb6bc3f96b964aafa6a2f74f96ab16c4`; its deterministic,
  workflow-policy, and CodeQL checks passed before merge and again on the merge
  commit. The 17-tool MCP v0.1 inventory remains frozen.
- Design/implementation provenance remains `5c149c7`, `eaaf671`, `2a2a988`,
  `1ea0c0b`, `b6575d1`, `1387c2d`, `b441382`, `ee52876`, `fbd9c28`, and
  `d14f530`. Independent review's two Important findings were fixed before
  merge: enabled research Actions now require the server-only continuation
  secret at startup, and all operations declare the router-owned 500 response.
- Production runs exact application revision
  `d1af238325ee1e0584574e47bbcbe7764d17cf7e` as image
  `sha256:8575134332df001ddbbb5b40a041a468cff76b3388b4f6deb267b1c3363998dd`
  in healthy container
  `9976fc89f8bb4065e6c46f7fa6cacb49e1a0eb4e526c11ca2ac346bf788fcf51`.
  Rollback is `askrigor-research:rollback-d1af238` plus
  `/opt/askrigor/compose.yaml.rollback-d1af238`, restoring image
  `sha256:95b86a1135701149c17125d1a5994e41063f868eefd903a38e28b4c09e0f6953`.
  Current Compose SHA-256 is
  `f9ebc08643d25d3a54590dd885fbbe795f5aa4c0cea1f28a51c21bb7455dc4c4`;
  rollback Compose SHA-256 is
  `cf2fa82cbe4ba6e6b9ce515e2f260d07dacf09f1df6ac2feb66cfc485f9c69cf`.
  Only the research service was recreated for the privacy-model repair.
- `ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true` is active. Research Actions share
  MCP's transient provider flow, per-client token bucket, and 16-request
  concurrency pool. Responses remain limited to **60,000 serialized UTF-8
  bytes** and exact protocol chunks to **48,000 UTF-8 bytes**.
- The generated packet remains reproducible: deployed committed OpenAPI SHA-256
  `0e166153faf37b3c7b4963fde2ad0b9c02cc5c7a4acd9620446c308c291c8e94`,
  current public-boundary Instructions
  `0d87dc53f1b717a9e2d8e3d360f462fa4748800159f588095def5b2203e8f4b8`,
  and sync ledger
  `621d0795872719903ed7ed3bd4b7aab85f875c8923b17b26d1f373d15af19081`.
  The consent-shell candidate installed for the latest UI run was
  `b4fd87ccff39e787eefb706257e49f0956b24e40cfb4c4e2fb24035b80b5c6af`.
  The failed-safe UI run used the prior Instructions digest
  `ef4c9845b3e50d3978f718fe10fff64ef53e55a3a4c045e8b1eb389b15bb9aad`.
  The sole editor instruction source is `docs/custom-gpt-instructions.md`;
  Knowledge must remain empty.
- The transactional site release is
  `/opt/askrigor/site/releases/56b3dff6d7c3/site`. All four pages returned
  200, and live privacy bytes match SHA-256
  `d73d9557852a17975b345ae20bfe24edc70267a3f595959b2bfb5d7198c26453`.
- The bridge release's direct production acceptance passed complete Universal
  2/2 and HRP 11/11 byte coverage, PubMed, ClinicalTrials.gov, Crossref,
  YouTube survey/audit,
  malformed/oversized requests, rate limiting/recovery, exact 18-operation
  Action security, health, and the 17-tool MCP inventory. Detailed sanitized
  receipts are in `docs/custom-gpt-action-live-acceptance.md`. The 2026-08-17
  release reverified health, schema, protocols, inventory, the 16-record
  one-call audit, and the exact 149-record two-call terminal-refetch chain. The
  later Universal-only rollout freshly passed health, exact OpenAPI, current
  Universal `20.5.13` manifest/integrity/3-chunk full load, unchanged HRP
  `20.5.18`, lesson `401`, privacy hash, and the exact 17-tool inventory without
  repeating provider calls or lesson writes.
- `AskRigor-lessons` is private again. The exact selected-repository GitHub App
  path created synthetic `ARL-0006`; the duplicate returned the same ID with
  occurrence count 2 while preserving the issue body byte-for-byte. The issue
  was labeled rejected and closed as not planned. Final queue status has 0
  open, 0 needs review, 0 accepted-not-incorporated, 2 incorporated-or-closed,
  and 0 deletion eligible.
- GitHub Free cannot protect a private personal repository: the hosted API
  returned HTTP 403 with the exact Pro/public requirement. This is a declared
  `AskRigor-lessons` governance exception, not a claim of protection.
- The first Custom GPT schema import exposed three editor-compatibility defects:
  missing object-valued `components.schemas`, plus 357- and 493-character
  descriptions over OpenAI's 300-character operation limit. The deployed repair
  emits `schemas: {}`, gives both legacy YouTube Action routes
  exact 201-character descriptions, and rejects any future exported description
  over 300. Focused red/green coverage passed 16/16; complete verification
  passed 49 files and 881 tests with one file and five tests skipped as declared,
  typecheck/build passed, site validation covered four pages, deployment-policy
  tests passed 28/28, and the portable audit returned no findings. PR #17 merged
  the exact repair head `b4d3db5d2b3f05debc4dd2c37cfa0d12290f67af` as
  `6639086a33b44f029c9f8405f69bd06b725e78d0`; protected and post-merge
  deterministic, workflow-policy, and CodeQL checks all passed.
- The exact merge is deployed. Fresh public OpenAPI validation found 18
  operations, object-valued `components.schemas`, no description over 300
  characters, and both affected descriptions at exactly 201 characters. Health,
  unauthenticated lesson isolation, current protocol identities, and the frozen
  17-tool MCP inventory passed without provider calls or lesson writes.
- Custom GPT product testing is now partial rather than wholly pending.
  Universal loaded completely in 2/2 chunks and HRP in 11/11; PubMed,
  ClinicalTrials.gov, and conservative Crossref metadata cases passed through
  the product interface. A real survey-first YouTube case then exposed the
  remaining defect: ChatGPT altered the multi-kilobyte stateless continuation
  token twice. The server correctly rejected both attempts and kept
  `synthesis_lock:block`; 66 records had been retrieved before the terminal
  error, zero were returned for analysis, and replies were unreconciled. That
  is retained as the pre-repair product failure, not the current result.
- The owner approved an Action-only repair after the privacy tradeoff was
  disclosed. Design commit `b5a760a` and implementation commit `7701a68` keep
  the exact frozen MCP operation/inventory unchanged while the Custom GPT
  adapter maps a 37-character handle to the existing signed minimized token in
  process memory for at most one hour, 2,048 entries, and 16 MiB. Expiry,
  restart, or capacity eviction fails closed and requires restart from the video
  identifier. This is now deployed direct behavior; only the fresh product UI
  relay remained unverified at that checkpoint. The 2026-08-17 UI retest passed:
  call one retained 66 records and returned the 37-character handle; call two
  reached 149 cumulative records, returned 111 for analysis, ended
  `completed_with_access_boundary`, and set `synthesis_lock:pass` with no error
  or further continuation.
- The first unused build candidate failed its disposable non-root smoke test
  because the staging workflow made archived source files unreadable to the
  runtime user. It never received traffic. Re-extracting the verified archive
  while preserving internal file modes produced the accepted image. This is a
  provisional transferable deployment lesson pending universal disposition;
  the OpenAI 300-character constraint remains project-specific evidence.
- Pre-UI-retest lesson status was `available` at
  `2026-08-17T23:45:43.207Z`: 0 open, 0 needs review, 0 accepted not
  incorporated, 2 incorporated or closed, and 0 deletion eligible.
- Lesson closeout: the AskRigor product failure, repaired UI pass, and exact
  limits are preserved in `docs/custom-gpt-action-live-acceptance.md`. The
  model-mediated relay finding is **transferable with bounded scope**:
  multi-kilobyte opaque,
  high-entropy continuation state can be mutated when an AI controller must
  reproduce it as a tool argument. The bounded short-handle adapter is not a
  universal default—it trades stateless restart resilience for short-lived
  server memory and needs truthful privacy disclosure. Promote only after the
  evidence-preserving universal review; exact merge, deployment, direct
  acceptance, and product-interface continuation now pass. Direct MCP clients
  remain the counterexample that should stay stateless.
- Universal `20.5.13` Custom GPT UI loading passed with exact 3-chunk,
  98,154-byte coverage and matching chunk/whole digests. The following
  synthetic lesson-consent shell failed safe: the GPT displayed raw candidate
  fields, falsely treated the shell wording as unavailable, and made no lesson
  Action call. The generated Instructions now contain the complete canonical
  shell and explicit authority routing. The later retest used
  `docs/custom-gpt-instructions.md`, empty Knowledge, the live OpenAPI URL,
  Bearer authentication, and a new chat. At that checkpoint,
  `gpt.askrigor.com` could not be repointed until the consent/duplicate cases
  passed and the actual direct `/g/...` URL was verified; the 2026-08-18 direct
  URL and routing acceptance below closes that gate.
- The hardened shell subsequently displayed correctly and rejected lowercase
  `yes`; exact `Yes` reached ChatGPT's consequential confirmation. Two calls
  then failed safe as `action_auth_required` because the existing editor Action
  had not yet been configured with the Bearer key. Production health remained
  `ok`; a no-write authenticated probe reached the expected `415
  action_json_content_type_required` boundary, proving the current server key
  path; and the lesson queue remained 0 open, 0 needs review, 0 accepted not
  incorporated, 2 incorporated or closed, and 0 deletion eligible.
- After the owner applied the existing key to that Action, the builder blocked
  public listing with `May provide tailored medical/health advice`. **Only me**
  is not the product goal. The generated public Custom GPT now preserves all
  general and subgroup evidence while prohibiting only individualized diagnosis
  and treatment direction. This public Custom GPT boundary does not alter the
  plugin, MCP server, canonical protocols, or production tools.
- PR #31 merged that boundary as
  `ed45bf42dfaea9f57bbf9268fabdbcd4a64b34c5` after all pull-request and
  post-merge checks passed. The owner then reported successful public
  publication. A new published-GPT chat passed the consent shell, exact `Yes`,
  ChatGPT confirmation, and Action authentication, then returned non-retryable
  `privacy_rejected` for the fully generalized source-audit lesson. No private
  candidate was created; the queue remained 0 open, 0 needs review, 0 accepted
  not incorporated, 2 incorporated or closed, and 0 deletion eligible.
- The displayed lesson passes the deterministic privacy screen. The previously
  deployed model `gpt-5-nano-2025-08-07` is now deprecated in official OpenAI
  documentation and has a recorded prior one-off rejection of the existing safe
  fixture. PR #32 pins `gpt-5.4-nano-2026-03-17`, updates exact
  token accounting and reasoning syntax, and adds explicit privacy-only
  guidance. Its non-stored synthetic compatibility probe passed 8/8 safe cases
  and 3/3 identifier cases with zero identifier leakage. Exact merged code is
  now deployed; its GitHub-disconnected, non-stored safe-candidate probe returned
  `generalized` without touching the production lesson ledger or GitHub.
- On 2026-08-18, a new published-GPT chat displayed the complete consent shell
  and exact `Yes` plus ChatGPT confirmation submitted `ARL-0007`. An independent
  identical recheck displayed the shell again and returned the same candidate
  with occurrence count 2. The read-only aggregate at
  `2026-08-18T00:32:43.437Z` confirmed 1 open candidate, 1 needs review, 0
  accepted not incorporated, 2 incorporated or closed, and 0 deletion eligible.
- The published GPT direct URL is
  `https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol`.
  The public page returned HTTP `200` and identified **AskRigor.com Heterodox
  Research Protocol**. At `2026-08-18T01:34:40Z`, both HTTP and HTTPS for
  `gpt.askrigor.com` returned one temporary `302` redirect to that exact URL and
  ended at HTTP `200`. The prior `/share/...` destination is the rollback
  target. DNS remains Porkbun forwarding; production VPS/Caddy/application
  state was unchanged and public health remained `200`.
- The required lesson checkpoint at `2026-08-18T01:37:36.024Z` reported 1 open
  candidate, 1 needs review, 0 accepted not incorporated, 2 incorporated or
  closed, and 0 deletion eligible.

## Completed

- Recovery inspected the complete instruction chain, profile/state/README/indexes, scripts/lock/runtime, workflows, ownership/dependency/security posture, recent commits, PR #7, and hardening issue #6.
- The dirty original `main` checkout and its unrelated untracked files remain untouched; all work is isolated here.
- During the initial 2026-08-15 recovery, then-current `main` was semantically
  merged without losing the Action implementation, live-acceptance evidence,
  privacy/release records, or compliance controls. Project-installation
  conflicts preserved separate MCP/Action surfaces, governance-file exclusion,
  and complete-protocol authority.
- The repository profile declares only exact commands run on this candidate and distinguishes hermetic CI from the separately authorized bounded provider smoke.
- `npm ci` passed on Node `24.18.0`: 156 packages installed, 0 audited vulnerabilities.
- At that 2026-08-15 recovery checkpoint, deterministic verification passed 42
  files with one credential-gated live file skipped; 843 tests passed with five
  skipped; typecheck and build passed. The current PR #23 release verification
  is recorded separately below.
- Site checks passed: four pages validated and 28/28 deployment tests passed. Protocol SHA-256 values match the authoritative XML bytes.
- The opt-in live provider smoke passed separately: two public-provider tests passed and three credential-gated providers skipped truthfully.
- `npm run lessons:status` returned available at `2026-08-15T22:33:40.515Z`: 0 open candidates, 0 needs review, 0 accepted-not-incorporated, 1 incorporated-or-closed, and 0 deletion eligible.
- At that same recovery checkpoint, the universal portable audit passed with 0
  errors and four truthful hosted-control warnings after token-shaped privacy
  fixtures were runtime-fragmented without changing their tested values.
- Release-truth TDD now rejects stale pre-deployment claims. README, privacy map, review checklist, and release evidence consistently record the deployed Action, live August 13 notice, exact 17-tool inventory, rollback, and still-blocked public submission gates.
- Production Action acceptance is preserved from exact code revision `1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a`; it remains a separate consequential route and not an MCP tool. PR #8 merged the code as `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f`.
- Universal PR #4 exact head `1d1e6d03a92bbcec65bdc02ea6490af6e640eda8` contains the promoted AskRigor controls and passed run `31848203559`, job `94918801742`.
- The owner selected a scoped `AGPL-3.0-or-later` grant for original software.
  `LICENSE.md` keeps complete protocols, health-research policy, evidence,
  editorial content, recorded fixtures, and archived/third-party tools outside
  that grant; the exact official license bytes are integrity-tested.
- Hosted governance is directly verified. Active ruleset `20882388` requires
  pull requests plus strict `Deterministic verification` and `workflow-policy`,
  blocks deletion/force pushes, and retains the sole owner as the only bypass
  without requiring fake independent approval.
- Actions are limited to the three exact SHA-pinned checkout/setup-node
  revisions used by current workflows; default workflow tokens are read-only.
  Secret scanning, push protection, vulnerability alerts, Dependabot security
  updates, private vulnerability reporting, and CodeQL are enabled.
- CodeQL setup run `31862487322` succeeded. Two alerts were dismissed with
  durable false-positive/test-only reasons. The real prototype-pollution alert
  has a red/green regression and a null-prototype path-map fix on this branch.
- Public-review automation now binds every run to the exact Git commit and
  committed case-file bytes, separates direct MCP and raw Responses evidence,
  enforces serial request/case/full-run limits, and writes only checksum-covered
  sanitized artifacts. A Git-capable runner image is pinned by Node digest and
  Debian Git version after the first end-to-end attempt exposed the missing Git
  executable before network evaluation.
- At the 2026-08-15 automated-review rollout, the live YouTube comment-ID
  response-shape regression had a failing-then-green fixture test. That rollout's
  production research image
  `sha256:e4838746679323050adb636f132ee3c4f72eb8d6c7765906357718531c54578b`
  was healthy at acceptance and is now superseded by the PR #23 image recorded
  above. Caddy was not recreated, the Action state/auth boundary was unchanged,
  and all 17 public MCP tools remained read-only.
- Final protected run `20260815T110708.728Z-baa07445` used clean commit
  `8ed8c0f7aaab9609dfb067780c05838f98903bab`: all 9 direct cases passed,
  6 model cases passed, and 3 model cases remained honestly blocked by opaque
  remote-MCP receipts. The report/summary manifest and evidence safety scan
  passed. Exact bounded evidence is in `docs/release-evidence-v0.1.0.md`.
- PR #9 merged into `main` as `e63a0f73ec28a4b91673eed768d8e72f41986418`.
  Post-merge deterministic verification, workflow policy, and both CodeQL
  analyses passed on that exact merge commit.
- Fresh post-deployment ChatGPT interface acceptance on 2026-08-15 visibly
  passed exact isolated integrity and load calls and returned a successful
  ordered manifest/verify/load receipt with the current HRP identity. It did not
  reproduce the earlier routine-status narration and showed no write
  confirmation. The copied combined transcript collapsed or mislabeled its tool
  card; that presentation limitation remains declared.
- Lesson closeout for this acceptance is project-specific / no-new-lesson; the
  three-layer proof distinction was already promoted and tested universally.
- PR #10 merged the interface evidence into `main` as
  `287bac798f9e61568b56194385e43a21b899a4f8`. Post-merge deterministic
  verification, workflow policy, and both CodeQL analyses passed on that exact
  merge commit.
- PR #11 merged the bounded interface-state closeout into `main` as
  `57340f4ee2d9165fc7d680fe01cae9c8ca0f251a`.
- OpenAI's current primary submission documentation was rechecked on
  2026-08-16. The owner approved Approach A and confirmed the durable design at
  `docs/superpowers/specs/2026-08-16-public-submission-packet-repair-design.md`.
- The public plugin package no longer references environment-specific
  `.app.json`, uses the 28-character `Auditable research retrieval` short
  description, and includes self-contained square SVG logo/composer assets.
  The current local `plugin-creator` validator passes on the clean package.
- `docs/public-submission-packet-v0.1.0.json` now separates portal-only fields
  from package metadata, selects exactly `positive-1` through `positive-5` and
  `negative-1` through `negative-3`, and keeps every hosted gate explicit.
  The extended 6+3 case file and all historical receipts remain unchanged;
  `positive-6` remains extended regression evidence.
- TDD observed seven expected failures before the package/packet/assets
  existed. The final focused package/packet gate passes 12/12. The existing
  public-review safety suite passes 61/61 after its deliberately credential-
  shaped runtime fixture was assembled from safe source fragments so the
  portable repository audit does not mistake the test source for a credential.
- For the 2026-08-16 PR #12 packet-repair checkpoint, bootstrap passed on Node
  `24.18.0`: `npm ci` added 156 packages, audited
  161, and found zero vulnerabilities. `npm run lessons:status` returned
  available at `2026-08-16T00:49:00.120Z`: 0 open, 0 needs review, 0 accepted
  not incorporated, 1 incorporated-or-closed, and 0 deletion eligible.
- That PR #12 packet-repair verification passed 43 files, with one live-provider
  file skipped; 848 tests passed, five credential-gated tests skipped;
  typecheck and build passed. Site validation covered four pages, deployment
  tests passed 28/28, and the universal portable audit at that checkpoint had no
  findings. No live provider call, production deployment, portal submission,
  credential access, or protocol/application behavior change occurred in that
  packet-repair task.
- Lesson closeout for this repair is project-specific / no-new-lesson. The
  distinction between repository-visible and hosted proof and the runtime-
  fragmented credential-fixture pattern were already promoted and tested in
  the universal repository.
- PR #12 merged the exact packet-repair head into `main` as
  `0d8ef69fa7fd73c34c571a07723b5a6b5bad5fec`. Post-merge deterministic
  verification run `31918684165`, workflow-policy run `31918685565`, and both
  CodeQL analyses in run `31918683952` passed on that exact merge commit.
- PRs #19 through #22 merged the short Action handle, pagination-overlap
  reconciliation, and fail-closed terminal sample handling. The PR #22
  candidate was rolled back after direct acceptance exposed YouTube's live
  comment-ID filter ceiling: 50 IDs returned `200`, while 51 returned `400
  invalidFilters`.
- PR #23 added the failure-sensitive 50-ID regression and merged as
  `905ac22ab42479c15ff0d6385a51de864271f862`. Focused tests passed 22/22;
  independent affected-suite verification passed 49/49 with no findings; the
  full host-boundary gate passed 914 tests with five credential-gated skips,
  typecheck, and build. PR and post-merge deterministic, workflow-policy, and
  CodeQL checks passed.
- Production is healthy on exact image
  `sha256:b7273c24f568bbd8d9c9f5a4758a89e08b9142af4d23a18d79a62e6df0b3b067`.
  The known 16-record audit remains one-call complete. The exact formerly
  failing video reached 149 records across two Action calls, returned a
  deterministic 111-record sample, ended `completed_with_access_boundary`,
  reported no error or continuation, and set `synthesis_lock:pass`. Caddy and
  the site release were unchanged; exact rollback image and Compose remain
  ready.

## Current checkpoint

- The current repair plan is
  `docs/superpowers/plans/2026-08-18-youtube-transcript-evidence-frontier-repair.md`.
  The generated local Instructions are 7,797 characters, SHA-256
  `4b0d3382ee1f214a54c87e8c493d34b42e02467a66ee031f06fd33a2215b90bc`;
  generated OpenAPI SHA-256 is
  `9a7e19fc4b9b3b8e7e330865925628da7deea54529800dfcf630626ee03efc31`.
  Synchronization-ledger SHA-256 is
  `a8dffdece8bff02a596f5a462ed1debc261283366c4cadf493af7751ca61ec5a`.
  Production still has 17 research reads plus the lesson write. The source
  candidate has 18 reads plus the write because `get_youtube_transcript` is
  Action-only; the exact checksum-locked MCP remains 17 tools. The Forum Signal matrix has 15
  required and 9 not-required cases; the option-space matrix has 9 broad-review
  and 6 narrow-review controls; the discovery/weighting matrix has eight cases,
  plus an unrelated held-out evidence-frontier fixture. The focused
  router/skill/matrix/packet/transcript/registry suite passed 53/53. The complete
  Node `24.18.0` gate passed typecheck, 58 test files with one declared
  credential-gated file skipped, 964 tests with five declared skips, and build.
  Public-site validation covered four pages and the deployment suite passed
  28/28. Static tests do not establish deployed transcript access or GPT UI
  behavior.
- The transcript adapter uses exact `youtube-transcript-plus@2.0.1` behind
  AskRigor's host allowlist, timeout, response-size, pagination, provenance, and
  access-state boundaries. It retrieves public caption tracks through an
  unofficial YouTube interface. Production availability, caption accuracy, and
  corpus visibility are explicitly unverified; transcript text is not retained
  between requests.
- Owner-authorized isolated Gemini/YouTube evaluation is recorded in
  `docs/audits/2026-08-18-gemini-youtube-discovery-evaluation.md`. With generic,
  de-identified prompts, Gemini 3.6 produced materially more specific and
  diverse search directions than the static query families across the failed
  hip case and two unrelated cases. Ungrounded Gemini URL generation failed
  independent validation for all 14 generated identifiers and is prohibited by
  the recommended design. Direct summaries of five real public URLs were rich
  but took 22.7-33.9 seconds and 82,152-171,688 prompt tokens per video; initial
  transcript acquisition was `api_visible_complete` and took 2.8-12.2 seconds.
  Later transcript retries returned `rate_limited`, and an independent subtitle
  request returned HTTP 429, so the matched transcript-plus-model timing test
  and the apparent creator-transcript hydration substring remain unresolved
  rather than negative evidence. A separate bounded `top`-sorted community
  sample returned 2,000 of an estimated 5,374 comments as `partial` and did
  locate hydration/electrolyte and gelatin discussion. This confirms that the
  missed signals were present in the independent comment lane, not that the
  creator made those claims in the video. No API key, raw transcript, comment
  corpus, or unrestricted provider response was retained in the repository,
  and no production or protocol behavior changed.
- A 2026-08-19 official YouTube Data API follow-up validated a temporary local
  key without retaining it. Exact metadata for three videos was
  `api_visible_complete` in 344 milliseconds. The discovery-video comment
  traversal exhausted 11 top-level pages in 5.358 seconds and returned 1,055
  threads, 921 embedded replies, and 1,976 unique records, but 35 reply-count
  mismatches require overall `partial`. Aggregate matches included nine
  hydration/electrolyte records (two uploader records), nine gelatin records,
  and 119 collagen records. This supports the official API for
  search/metadata/comments; it cannot download arbitrary public captions,
  which Google limits to OAuth users with edit permission.
- Google documents direct Gemini video input as audio plus one visual frame per
  second at roughly 300 tokens per video-second by default, explaining the
  measured 22.7-33.9 seconds and 82,152-171,688 input tokens. Consumer Gemini's
  approximately one-second YouTube summary uses an undocumented Connected App
  retrieval contract and may be transcript/metadata or cache based. There is no
  supported consumer-Gemini API. A personal laptop browser bridge remains a
  possible but brittle and policy-sensitive experiment; a VPS is higher risk,
  Gemini Spark MCP runs in the reverse direction, and the supported NotebookLM
  Enterprise API is disproportionate for this use case.
- The supported Gemini Spark direction passed account-side connection on
  2026-08-19 through `https://mcp.askrigor.com/mcp/gemini`. The standard endpoint
  reached initialization and `tools/list`, but Gemini rejected its 68,038-byte
  richer catalog. The accepted compatibility profile preserves the same ordered
  17 read-only tools and handlers while emitting a 12,239-byte catalog without
  output or execution declarations. This establishes transport and catalog
  compatibility only.
- Owner correction rejected the initial `run-askrigor-research` skill because
  it assigned complex Universal/HRP orchestration and completion judgment to
  Gemini. The replacement
  `integrations/gemini-spark/askrigor-youtube-scout/SKILL.md` restricts Gemini to
  intelligent YouTube discovery, fast creator summaries, selective visual
  observations, and exact-link validation through `get_youtube_video`. It
  returns a structured handoff to a separate capable AskRigor agent and cannot
  claim HRP, Forum Signal, evidence, or recommendation completion. The
  connection and skill upload are one-time; consumer Gemini's reverse-direction
  custom-app architecture still requires one compact handoff per research task.
  `docs/gemini-spark-setup.md` records the corrected installation, scope,
  removal, and synthetic scout acceptance flow. The replacement passed its
  skill validator, focused contract 4/4, and complete deterministic gate: 58
  test files passed with one credential-gated skip; 967 tests passed with five
  skips; typecheck and build passed. An independent capability-denied forward
  test failed closed; real consumer-Gemini scout acceptance remains pending
  owner upload.
- The first owner-run consumer-Gemini scout then demonstrated useful discovery
  and detailed regimen extraction, including the previously missed clinician
  self-management direction, but failed the output contract. It returned
  `available` rather than a literal AskRigor status, left every timestamp blank,
  blurred creator summaries with uninspected visual support, and did not
  distinguish exact long-term outcome matches from adjacent or promotional
  material. No substantive claim was promoted to evidence. The next skill
  revision adds a literal-status allowlist, empty-timestamp rejection,
  attribution/source checks, outcome-match and incentive classes, and a final
  self-audit; real replacement-skill acceptance remains pending.
- The required lesson checkpoint at `2026-08-19T04:56:46.422Z` remained
  available with 1 open candidate, 1 needs review, 0 accepted not incorporated,
  2 incorporated or closed, and 0 deletion eligible. The failed current
  candidate was not resubmitted.

- PR #29 merged the hardened consent-shell packet as
  `25849647969a4bf333659feaa30f0b418cc24d57`. Its protected PR checks and exact
  post-merge deterministic, workflow-policy, and both CodeQL analyses passed.
  This was an instruction/documentation artifact change; no server deployment
  was required or performed.
- The 2026-08-17 consent-shell repair was test-first: the generated-packet
  regression failed against the incomplete shell, then the focused Custom GPT,
  release-packet, and conversation-contract suite passed 26/26. The complete
  Node `24.18.0` gate passed 51 files with one credential-gated file skipped,
  917 tests with five declared skips, typecheck, and build. The initial sandbox
  run failed only on prohibited local loopback/IPC listeners; the exact host-
  boundary rerun passed.
- Current production passed the privacy-model rollout: public health was `ok`;
  Universal remained exact `20.5.13`; live OpenAPI remained SHA-256
  `402e369f25a2b27da114c5f018be1c64cc5f8a2ef81983f2588b30c6875438e2`
  with 17 non-consequential reads and one consequential write; and the VPS
  runs healthy container
  `9976fc89f8bb4065e6c46f7fa6cacb49e1a0eb4e526c11ca2ac346bf788fcf51`
  on image `sha256:8575134332df001ddbbb5b40a041a468cff76b3388b4f6deb267b1c3363998dd`.
  The exact state mount, read-only root filesystem, dropped capabilities,
  no-new-privileges, Caddy identity, and image-only Compose delta passed.
- PR #32 merge `d1af238325ee1e0584574e47bbcbe7764d17cf7e` is the current
  deployed release. Production is healthy on the
  exact merged image, with the rollback image/config and active site release
  recorded above. Server-side direct acceptance, including the exact repaired
  two-call YouTube chain, is complete. The first privacy rollout transaction
  restored the prior healthy release after detecting a short-versus-full Caddy
  ID comparison mismatch; the corrected full-ID transaction then passed.
- The privacy repair was test-first. Its focused suite passed 63/63, the broader
  affected suite passed 144/144, and the complete Node `24.18.0` gate passed 51
  test files with one credential-gated file skipped, 919 tests with five
  declared skips, typecheck, and build. Protected PR and exact post-merge
  deterministic, workflow-policy, and CodeQL checks passed.
- Repository-controlled packet repair and bridge implementation are merged and
  verified. V0.1.0 remains
  **PUBLIC SUBMISSION BLOCKED** for
  portal identity/domain verification, Scan Tools, a real demo-recording URL,
  the explicit release decision on three opaque remote-MCP model receipts,
  final portal response/privacy review, and submission.
  The direct production contract is 9/9 green and the ChatGPT interface check is
  complete with the declared card-presentation limitation.
- The earlier 2026-08-16 `Verifying identity` report is superseded by the
  owner's 2026-08-18 report that individual identity is verified. Business/
  organization verification remains unavailable after a signup timeout. The
  packet keeps the publisher path `in_progress` because the publisher identity
  has not been selected and no independent portal receipt is recorded.
- The separate Custom GPT compatibility surface is deployed and owner-reported
  as publicly published.
  The corrected schema imported successfully, and protocol/formal-source UI
  cases, the repaired two-call YouTube handle UI chain, and canonical Universal
  `20.5.13` UI loading passed. The hardened consent shell, Action
  authentication, public-content review, privacy-model repair, and exact
  deployment probe now pass. The fresh-chat lesson and separately consented
  duplicate also pass with `ARL-0007` occurrence count 2. The direct `/g/...`
  page and reversible `gpt.askrigor.com` route also pass.

## Remaining

- After the transcript-provider rate limit resets, one matched
  transcript-plus-Gemini versus direct-video comparison may characterize the
  fallback. The default is transcript-first: direct video used
  82,152-171,688 input tokens per video, cannot see comments, and should be
  limited to a small identified segment when a material claim genuinely
  depends on visuals. Do not integrate Gemini before an owner decision on the
  Google privacy/data-flow boundary. If approved later, use Gemini for query
  planning, real-candidate selection, and bounded text summary; never accept an
  ungrounded generated YouTube identifier.
- Complete local verification and review, branch publication, protected PR
  review, and merge. Then deploy the changed runtime and privacy notice, import
  the 19-operation Action schema, install the exact generated Instructions with
  empty Knowledge, and pass bounded direct and fresh Custom GPT acceptance for
  transcript availability, evidence-frontier selection, transcript/comment
  separation, access gaps, and the no-padding timestamped watchlist.
- The owner reports individual identity verified and business/organization
  verification currently unavailable after a signup timeout. Choose the
  publisher-identity path, then complete the portal HTTPS domain challenge; do
  not infer the business retry interval.
- Run Scan Tools against `https://mcp.askrigor.com/mcp`, compare all 17 tools
  with the committed inventory, and review the portal's response/privacy output.
- Record and host the bounded demo from
  `docs/public-submission-demo-recording.md`; publish only its verified HTTPS
  URL and non-secret receipt.
- Resolve or expressly accept the three opaque remote-MCP receipts at the
  release-decision boundary; direct proof must not be relabeled as model proof.

## Blockers / unresolved

- The completion and option-space failures were merged, deployed, and installed.
  The first discovery/weighting repair merged as PR #37 but failed its product
  retest; the resulting creator-content verification gap remains a public-
  submission blocker until the universal runtime/privacy/instruction follow-up
  is merged, deployed, installed, and passes fresh direct and GPT UI cases.
  Static instruction assertions do not prove model obedience or provider
  availability. The rejected lesson is non-retryable.

- The importer fix is merged, green, deployed, and passed the product importer.
  Protocol and formal-source UI cases passed. The short-handle and terminal
  refetch repairs are deployed and accepted through both direct and fresh
  product-interface tests. Universal `20.5.13` also passed the fresh product
  interface. The hardened consent shell, authentication, public publication,
  privacy-model repair, exact deployment, direct non-stored probe, fresh-chat
  lesson, separately consented duplicate, direct `/g/...` page, and reversible
  `gpt.askrigor.com` route now pass.
- `AskRigor-lessons` is private on GitHub Free, so private `main` branch
  protection is plan-limited and explicitly unverified/unavailable until Pro.
- OpenAI's remote-MCP Responses receipts are opaque for conditional successful
  output and the two tested error boundaries. The runner preserves these as
  `model_output` blocks. Direct proof does not establish model-layer semantics.
- V0.1.0 public submission remains blocked by the publisher-identity/domain
  path, Scan Tools, a real demo recording, final portal review, and the explicit
  opaque-receipt release decision.

## Evidence / artifacts

- Repository profile: `.github/codex-repository.json`
- Compliance plan: `docs/superpowers/plans/2026-08-14-codex-github-compliance.md`
- Compliance report: `docs/audits/2026-08-14-codex-github-compliance.md`
- Release/production receipt: `docs/release-evidence-v0.1.0.md`
- Privacy/reviewer truth: `docs/privacy-data-map.md` and `docs/public-review-checklist.md`
- Portal handoff: `docs/public-submission-packet-v0.1.0.json`
- Demo recording script: `docs/public-submission-demo-recording.md`
- Repair design and plan:
  `docs/superpowers/specs/2026-08-16-public-submission-packet-repair-design.md`
  and
  `docs/superpowers/plans/2026-08-16-public-submission-packet-repair-implementation.md`
- Forum Signal regression repair plan:
  `docs/superpowers/plans/2026-08-18-custom-gpt-forum-signal-regression-repair.md`
- Heterodox discovery/weighting repair plan:
  `docs/superpowers/plans/2026-08-18-heterodox-discovery-weighting-regression-repair.md`
- Universal transcript/evidence-frontier repair plan:
  `docs/superpowers/plans/2026-08-18-youtube-transcript-evidence-frontier-repair.md`
- Gemini YouTube discovery evaluation:
  `docs/audits/2026-08-18-gemini-youtube-discovery-evaluation.md`
- Public-review runner/cases: `docs/public-review-automation.md` and
  `docs/public-review-cases-v0.1.0.json`
- Ignored local sanitized evidence:
  `.artifacts/public-review-eval/20260815T110708.728Z-baa07445/`
- Hosted follow-up: issue #6
- Universal promotion: `u-dont-existDOTcom/universal-dev-architecture/audits/2026-08-14-askrigor-transferable-controls.md`

## Next safe action

Finish the matched Gemini/transcript timing comparison after the recorded
provider rate limit resets, then make the owner privacy/data-flow decision
before any production integration. Separately finish exact local verification
and diff review of the existing transcript/evidence-frontier follow-up, commit
the durable evaluation note, and inspect GitHub before any push or PR update.
Do not retry the failed lesson, change production, update the GPT editor,
deploy, or resume portal Scan Tools before the protected merge sequence.

## Recovery rule

After interruption, inspect actual Git/GitHub and production state, this
checkpoint, complete protocol files, current release evidence, merged PRs #9
through #39, AskRigor hardening issue #6, private synthetic lessons `ARL-0006`
and `ARL-0007`, and newer owner instructions. Resume from the latest verified
boundary without
touching the dirty original checkout or repeating direct production acceptance
unless production identity has changed. The recorded GitHub source baseline is
PR #39 merge `793c331ad90b9918246105e5f998ab9d1a258de9`; production remains PR #36
merge `cfce806345fe65a13fd0330aa7e8f000c1587d01`.
