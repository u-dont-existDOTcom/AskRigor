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
  `integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md`
  restricts Gemini to
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
- The second owner-run scout corrected the literal statuses to
  `api_visible_complete`, produced the requested query ledger and creator
  incentives, and surfaced a hydration regimen. It still generated blank
  timecode placeholders and selected six adjacent tutorials with zero exact
  outcome matches, despite the first run proving firsthand candidates were
  discoverable. The next revision replaces bare timecodes with rendering-safe
  clickable Markdown deep links paired with
  descriptive segment cues, and runs at least three exact-outcome discovery
  directions before adjacent mechanism or tutorial searches. The owner
  confirmed that Gemini returned the missing timestamps when directly asked to
  fix them; the failure was therefore a skill-format gap, not proof that Gemini
  could not locate timecodes. Clean consumer-Gemini acceptance remains pending.
- The next displayed consumer-Gemini output passed the rendering-safe timestamp
  and literal-status checks but repeated six adjacent tutorials after only one
  broad avoidance query and retained zero non-clinician firsthand patient
  accounts. Owner/Gemini diagnosis correctly identified clinic SEO dominance
  and technical-diversity selection pressure; the existing exact-outcome rule
  was soft and lacked a patient-creator quota. The next revision adds
  patient-specific queries with negative practitioner/institution terms,
  separate patient/clinician-self/practitioner-case evidence classes, and a
  `min(3, ceil(dossier size / 2))` patient target. A real corpus shortfall must
  remain explicit; the skill cannot pad or misclassify accounts to meet it.
  Clean consumer-Gemini acceptance remains pending.
- Owner review then narrowed the desired firsthand signal: a patient speaking on
  a personal channel does not qualify when the video mainly reviews a clinic,
  provider, procedure, program, or product. The scout now reserves its quota for
  `independent_patient_self_learning` accounts that expose personal hypotheses,
  experiments, routines, failures, adaptations, and takeaways. It classifies
  `independent_provider_treatment_review`, `clinic_patient_testimonial`, and
  `independence_unclear` separately; none counts toward the quota. Clean
  consumer-Gemini acceptance remains pending.
- Owner review then replaced the premature one-pass summary slate with a staged
  browse graph. Gemini now defaults to `seed_discovery`: diverse
  model-provenance query probes, exact/umbrella/anatomy/intervention search
  rings, fuzzy title recall, metadata triage, and two or three distinct
  comment-audit seeds without inferred comment findings. AskRigor performs the
  protocol-governed comment audit and may return a `youtube_rediscovery_packet`;
  Gemini's optional `targeted_rediscovery` mode then finds and summarizes narrow
  intervention videos. Broad leads must be back-searched against the exact
  target, and one creator ecosystem remains one discussion pool. Clean staged
  consumer-Gemini acceptance remains pending.
- Owner review then corrected the seed-stage ordering because titles and
  descriptions can hide the actual intervention. Gemini now must run a
  lightweight `remedy_extraction_scan` on 6–12 plausible videos and search each
  promising intervention name before AskRigor spends substantially more work on
  comment-corpus acquisition. Detailed regimen and dossier work remains deferred
  to targeted rediscovery. Clean staged consumer-Gemini acceptance remains
  pending.
- The next owner-run test found the held-out `GROWING MY HIP BACK` video and
  useful remedy families, establishing a major discovery-recall improvement.
  It nevertheless emitted the obsolete eight-record full dossier, old creator
  classes, and `Videos worth watching` instead of the staged seed packet. That
  fingerprint indicates an old or cached skill copy. The diagnostic skill is
  now distinctly named `scout-youtube-for-askrigor-staged` and requires
  `Scout contract: staged-remedy-scan-v2` as the first response line plus the
  active mode on line two. Clean acceptance requires those markers and only
  two or three comment-audit seeds in `seed_discovery`.
- A fresh-chat staged run then passed the browse-graph structure: heterogeneous
  probes, eight remedy scans, three metadata-validated seeds, explicit audit
  questions, and no final watchlist. It nevertheless populated the post-audit
  `youtube_rediscovery_packet` from creator content, including inferred
  community outcomes and counter-signals, labeled clinician self-management as
  the independent-patient role, and reported no access boundary despite every
  comment count being unavailable. Contract v2 now leaves only an unpopulated
  AskRigor return schema, forbids predictions about unseen comments, adds an
  honestly labeled clinician fallback, and preserves missing counts as access
  boundaries.
- Contract v2 passed the skill validator at 499 lines, focused Gemini tests 6/6,
  typecheck, and build. The standard parallel host suite passed 964 tests and
  timed out in five unrelated tests; those four files then passed 44/44 under
  isolated serial execution. A complete host serial suite passed all 969
  runnable tests with five declared skips, confirming the parallel result was
  load-sensitive rather than a v2 regression.
- The next owner-run v2 output preserved the post-comment boundary but again
  selected three overlapping movement/PT ecosystems, predicted unseen comment
  contents, repeated a seed role, displayed only six of ten claimed scans, used
  a metadata status as a query-search result, and omitted radical layperson
  phrasing that had previously found the held-out natural-recovery video.
  Contract v3 makes terse prompts sufficient, runs default overlooked and
  conventional-feedback lanes, adds general rebuilt/regrew/restored/healed
  wording, preserves search-vs-metadata states, requires a complete scan ledger,
  limits dominant mechanical/PT seeds, reserves heterodox and conventional
  pools when located, and offers evidence-neutral rabbit-hole depth plus simple
  `dig into` choices.
- Contract v3 validates at 496 lines. Its focused contract suite passed 7/7,
  typecheck and build passed, and the complete serial host suite passed all 970
  runnable tests with five declared skips. The standard parallel verifier also
  reached 969 passes but one existing live-suite security scan exceeded its
  five-second timeout; that test passed 11/11 in isolation and in the complete
  serial suite with the established 15-second timeout.
- The next owner-run v3 report was useful but Gemini appended rich YouTube
  result surfaces that slowed rendering. Contract v4 requires ordinary Markdown
  text links only and forbids response-owned embeds, players, cards, carousels,
  previews, thumbnails, bare YouTube URLs, unnecessary duplicate link lists,
  and raw search-result appendices. Provider-owned search/tool traces outside the response
  remain a Gemini interface boundary rather than controllable report content.
- Contract v4 validates at 489 lines. Its focused contract suite passed 7/7,
  typecheck and build passed, and the complete serial host suite passed all 970
  runnable tests with five declared skips.
- Audit of the same v3 artifact found additional contract drift: speculative
  unseen-comment descriptions, omitted radical-outcome rows, specific diagnoses
  mislabeled exact despite an unspecified baseline, one mismatched rabbit-hole
  shortcut, untraceable direction counts, result-title query backfilling, and a
  harm-only conventional seed. Contract v5 freezes prospective probes, requires
  displayed radical rows, preserves adjacent diagnostic scope, uses balanced
  conventional seeds and nonpredictive audit rationales, and ties every rabbit-
  hole count and shortcut to displayed candidate rows and matching semantics.
- Contract v5 validates at 483 lines. Its focused contract suite passed 7/7,
  typecheck and build passed, and the complete serial host suite passed all 970
  runnable tests with five declared skips.
- The next owner-run v5 artifact fixed most earlier gates but still emitted a
  malformed candidate table, selected two supplement-family seeds under
  different roles, used unsupported rabbit-hole terms and counts, treated
  formal-evidence questions as access gaps, asked comments to confirm structural
  harm, and displayed a rich YouTube panel for nearly every broad query. Contract
  v6 batches 14–22 logical probes into 4–6 text-first site searches, defers native
  YouTube understanding to 8–12 shortlisted videos, uses complete numbered
  candidate records, requires unique seed roles and intervention families,
  enforces neutral audit questions, and maps every rabbit-hole term and count to
  source rows while separating retrieval gaps from research questions.
- Contract v6 validates at 482 lines. Its focused contract suite passed 7/7,
  typecheck and build passed, and the complete serial host suite passed all 970
  runnable tests with five declared skips.
- Gemini's file-upload security scan rejected the first v6 artifact without a
  diagnostic. The file was valid UTF-8 Markdown with no executable payload; its
  only clear byte-shape regression from the uploadable v5 artifact was a new
  1,066-character line, crossing a common 1 KiB scanner heuristic boundary.
  The compatibility revision wraps that schema instruction without changing the
  contract and adds a regression test requiring every source line to remain at
  or below 800 characters. The external scanner cause remains an evidence-based
  inference until an owner upload succeeds.
- The compatibility revision validates at 499 lines with a 595-character
  maximum line. The skill validator and focused contract suite passed 8/8;
  typecheck and build passed. The complete host-boundary serial suite passed 969
  tests with two fixed-five-second timeout failures; both timeout-prone files
  then passed 15/15 in isolation, covering all 971 runnable tests, with five
  declared skips.
- The owner reported the same security-scan rejection on the wrapped artifact,
  disproving line length as the operative cause. Contract v7 instead bisects the
  v6-only semantic delta against uploadable v5: it removes explicit tool-routing
  phrases such as instructions not to invoke or attach native YouTube entities
  and removes the literal site-search operator. It preserves four to six broad
  discovery batches, delayed content inspection, the 12-video ceiling, text-only
  report output, intervention-family diversity, neutral audit questions, and
  row-level rabbit-hole traceability. External upload remains the decisive test.
- Contract v7 validates at 499 lines and 35,551 bytes with a 595-character
  maximum line. The skill validator and focused contract suite passed 8/8;
  typecheck and build passed. The preceding compatibility revision covered all
  971 runnable tests, with its two load-sensitive fixed-timeout tests passing in
  isolation, and v7 changes no runtime source.
- The first successful v7 owner run confirmed upload compatibility and reduced
  raw search-panel clutter, but its output still violated the contract: named
  diagnoses and replacement queries were labeled exact despite an unspecified
  baseline; batched probes cited nonmatching rows; all candidate titles were
  unlinked; cyclic exercise was relabeled behavioral to manufacture seed-family
  diversity; an exercise-only seed filled the heterodox role; rationales
  predicted unseen comment content; an audit question requested a proportion;
  and several rabbit-hole terms mapped to rows that did not contain them.
- Contract v8 requires one-remedy heterodox probes, explicit probe-to-row match
  reasons, adjacent scope for every named pathology or procedure under an
  unspecified baseline, morphologically varied `grow/growing/grew ... back`
  discovery, linked candidate titles, scan records capped at 110 words, immutable
  modality-based families, honest role gaps, row-labeled non-prevalence comment
  questions, and verbatim row-derived rabbit-hole terms. It also requires blank
  lines so the contract marker, mode, headings, and fields render separately.
- Contract v8 validates at 499 lines and 37,811 bytes with a 607-character
  maximum line. The skill validator and focused contract suite passed 8/8;
  typecheck and build passed. This revision changes no runtime source; the
  immediately preceding full validation covered all 971 runnable tests with five
  declared skips after the two load-sensitive files passed in isolation.
- The owner's v8 forward run successfully rediscovered the held-out independent
  `GROWING MY HIP BACK` video and preserved diagnostic uncertainty, but four
  comment-audit questions cited unselected candidates, prevalence language
  leaked into rabbit-hole questions, several directions mixed unrelated
  intervention families, and an osteoarthritis account inherited exact target
  distance from its broad discovery query. Contract v9 makes comment questions
  executable from selected seeds only, exposes six distinct probe-family labels,
  derives scope from candidate content, records reach metadata without treating
  it as evidence, and separates current-seed rabbit holes from future seed
  candidates with coherent row relevance and retrieval-only gaps.
- Contract v9 validates at 499 lines and 40,324 bytes with a 760-character
  maximum line and SHA-256
  `afd0e18d8b6fb7c91806a82e7a8d873d86cebeaefe843272d55801737144fcbb`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. This revision changes no runtime source, so the immediately preceding
  complete-suite coverage remains applicable.
- The owner's external Gemini upload rejected v9 at the security-scan step.
  Because uploadable v8 was 37,811 bytes while v9 crossed 40 KB at 40,324
  bytes, contract v10 tests the file-size boundary by removing duplicated prose
  while preserving the v9 seed-executability, family, scope, reach, and rabbit-
  hole invariants. External upload remains the decisive compatibility test.
- Contract v10 validates at 458 lines and 37,052 bytes with a 760-character
  maximum line and SHA-256
  `7a2faeed65d93777dc5c80458d8fb8be0e8a9c78ba03206e012b111e57fd8e3b`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. This revision changes no runtime source.
- The successful v10 owner run confirmed the compact artifact uploads, but
  exposed semantic failures: batched queries omitted linked probe anchors,
  radical variants were bundled into one row, probe-family labels leaked into
  intervention families, a postoperative diary displaced an available
  independent nonsurgical outcome, audit questions invented uncited diet and
  injection examples, prevalence wording returned in rabbit questions, mixed-
  family rabbit holes persisted, and displayed `title_link` fields lacked
  actual Markdown destinations. Contract v11 makes each of these auditable with
  closed family values, batch-anchor coverage, seed-derived terms, banned
  prevalence phrasings, same-family rabbit rows, and literal link syntax.
- Contract v11 validates at 459 lines and 36,896 bytes with a 726-character
  maximum line and SHA-256
  `b84f679df5c4bfc017a53a82c6fdc4d240171447d0364207ba3ef68cb2310586`.
  It remains smaller than the uploadable v10 artifact. The skill validator and
  focused contract suite passed 8/8; typecheck and build passed. This revision
  changes no runtime source.
- The owner's v11 forward run uploaded successfully and improved family-safe
  rabbit holes, seed/question alignment, and independent seed classification,
  but exposed new structural gaps. Its 16 probes were collapsed into five
  mixed-family batches whose executed queries omitted several linked concepts;
  no literal grow/rebuild/regrow radical probe ran, so the held-out independent
  outcome disappeared. It also displayed 9 candidates after claiming 10, used
  `adjacent` as a semantic scope, omitted literal Markdown title destinations,
  introduced question details absent from seed rows, and selected a harm-led
  surgical video without an explicit recognized-benefit field.
- Contract v12 uses closed probe and semantic-scope enums, separate target
  distance, 6–10 one-family batches of at most three probes, per-probe required
  anchors, distinct radical roots including `grow/growing/grew ... back`, exact
  scan/display counts, contiguous candidate IDs, per-candidate video IDs,
  evidence-mapped question terms, and explicit conventional benefit/limitation
  fields. It validates at 387 lines and 36,287 bytes with a 780-character
  maximum line and SHA-256
  `fcee4476b45bce7d566260f31746244a939f0795e8bac3867a6b4fa9c2c18491`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. This revision changes no runtime source and remains below the
  uploadable v10 and v11 artifacts.
- The owner's v12 forward run populated 10 single-family batches and all 10
  displayed candidate rows, selected an independent nonsurgical outcome, and
  preserved conventional benefit plus limitation. It nevertheless treated
  rapid relief, temporary traction, and a cartilage-mechanism tutorial as direct
  radical outcomes; counted only five overlooked intervention families once
  outcome lanes were excluded; supplied only two distinct negative conventional
  probes; leaked uncited terms and prevalence/efficacy wording into audit
  questions; and emitted one malformed duplicated rabbit-hole key. The held-out
  independent `GROWING MY HIP BACK` result was not rediscovered.
- Contract v13 separates search access from direct claim alignment, requires
  exact creator-claim evidence for a direct radical match, counts only eight
  eligible overlooked intervention families, requires two conventional-benefit
  and three separate conventional-negative rows, and exact-maps every named
  question term while banning prevalence and efficacy formulations. It also
  requires a duplicate/malformed-key self-check and states that Gemini is an
  optional parallel discovery lane: AskRigor may continue formal, grey,
  clinical, and other-community work while the manual Spark handoff is pending.
  The setup guide now documents this parallel-but-manual operating model.
- Contract v13 validates at 357 lines and 36,422 bytes with a 759-character
  maximum line and SHA-256
  `e9c6ee9f5a3ce336f55c0b0edd2c3c4184f597624bd56b599a53e31ae7e41352`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. `git diff --check` passed. This revision changes no runtime source and
  remains smaller than the uploadable v11 artifact; external Gemini upload and
  a fresh forward run remain the decisive compatibility and behavior tests.
- The required lesson checkpoint at `2026-08-20T17:37:51.600Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded skill-contract repair.
- The owner's v13 forward run uploaded successfully, rediscovered the held-out
  independent `GROWING MY HIP BACK` account, counted seven eligible remedy
  families, distinguished the second radical tutorial as adjacent, populated
  balanced conventional and mechanical seeds, and emitted neither embeds nor a
  raw result dump. It also included the parallel handoff note. However, several
  batch queries omitted anchors belonging to linked probes, so claimed
  conventional-negative and other coverage was not fully executed. Two
  `single_intervention` probes bundled distinct treatments, only two explicit
  firsthand rows ran, candidate rows used `canonical_intervention_family`, and
  audit questions invented unmapped stomach, soreness, skin-irritation, and
  messiness details. Topical and device directions also reused the all-signals
  shortcut. The copied rendered output did not preserve link destinations, so
  literal Markdown-link compliance remains unverified rather than failed.
- Contract v14 requires nonempty anchors and per-probe `batch_anchor_evidence`
  for every probe, counts families and conventional/firsthand directions only
  after passing coverage, requires three separately anchored firsthand rows,
  prevents distinct treatments from masquerading as one intervention, and
  standardizes the candidate field as `intervention_family`. Question evidence
  maps must now precede questions, with only a small neutral unmapped vocabulary;
  plausible adverse details require exact source mappings. Rabbit-hole
  shortcuts now map to topical, device, regenerative, behavioral, mechanical,
  nutrition, or conventional families, while `all high-yield` is map-level only.
- Contract v14 validates at 354 lines and 36,467 bytes with a 660-character
  maximum line and SHA-256
  `50781cb39e00af21fe08b7223e4fba4c836c34d4063ddefa91947b93531d1549`.
  The skill validator and focused contract suite passed 8/8; typecheck, build,
  and `git diff --check` passed. This revision changes no runtime source and is
  only 45 bytes larger than uploadable v13 while remaining below v11.
- The required lesson checkpoint at `2026-08-20T18:01:02.751Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded forward-test repair.
- The owner reports that Gemini rejected the v14 upload at its security scan.
  The 45-byte increase over uploadable v13 is a possible boundary signal, but
  size alone is not a demonstrated cause because larger v10 and v11 artifacts
  uploaded successfully. Treat the receipt as content- or scanner-sensitive
  until an external upload establishes otherwise.
- Contract v15 preserves the v14 anchor, provenance, family, and question-map
  controls while compacting the final audit, removing newly introduced concrete
  medical examples, and replacing non-ASCII shortcut arrows. A regression test
  now caps the upload artifact at 35,600 bytes as well as 800 characters per
  line. The artifact validates at 350 lines and 35,419 bytes with a
  660-character maximum line and SHA-256
  `cd5c832be43358a57633064be4c50e0999bd22336ab9c79801d472f759383275`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. The sandboxed complete gate recorded 67 listener-related failures
  (`EPERM` on localhost or a local pipe), then the required host-boundary test
  rerun passed 971 tests with 5 skipped. This revision changes no runtime
  source. External Gemini upload is still the decisive scanner test.
- The required lesson checkpoint at `2026-08-20T18:15:06.138Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded scanner-compatibility repair.
- The owner reports that the smaller v15 artifact also failed Gemini's security
  scan. This falsifies the working byte-ceiling explanation; the rejection is
  content-sensitive, nondeterministic, or an external scanner change.
- The current upload artifact is therefore a diagnostic control restored
  byte-for-byte to the owner's last known accepted v13 file: 357 lines, 36,422
  bytes, maximum line length 759, SHA-256
  `e9c6ee9f5a3ce336f55c0b0edd2c3c4184f597624bd56b599a53e31ae7e41352`.
  Tests pin that exact hash. The v14/v15 improvements remain recoverable in Git
  history but are intentionally absent from the upload control. If this exact
  artifact now fails, the scanner behavior changed outside the tested content
  delta and further prompt edits should stop pending platform-side diagnosis.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. A complete host-boundary rerun passed 971 tests with 5 skipped.
- The required lesson checkpoint at `2026-08-20T18:23:58.250Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  diagnostic rollback.
- The owner then clarified that exact v13 still uploads successfully. This
  rules out a platform-wide rejection and makes the post-v13 content delta the
  controlled variable. The rollback commit remains historical evidence, but
  v15 is restored as the canonical development skill at SHA-256
  `cd5c832be43358a57633064be4c50e0999bd22336ab9c79801d472f759383275`.
- Upload-only probe 01 starts from exact v13 and adds only execution/anchor
  controls. It is a local ignored artifact at
  `.artifacts/gemini-upload-bisect/01-execution-anchor/SKILL.md`, 36,505 bytes,
  SHA-256
  `99d1e3d26bde76a01eb47a90e7ced09ced68cbf48225f79dda7d57ea942174bd`.
  A pass moves the bisect to schema/question changes; a failure splits this
  execution group. The durable procedure is recorded in
  `docs/audits/2026-08-20-gemini-skill-upload-security-bisect.md`. Both skill
  artifacts passed the skill validator; the canonical focused suite passed
  8/8, and typecheck and build passed. The complete host suite passed 970 tests
  before one unrelated 5-second evidence-test timeout; that file then passed
  all 11 tests standalone. Five tests remained skipped.
- The required lesson checkpoint at `2026-08-20T18:53:43.444Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded upload bisect.
- The owner reports upload probe 01 failed Gemini's security scan, localizing
  the rejection to its six execution/anchor substitutions. Probe 02 now tests
  only the three counting/granularity substitutions from exact v13. Its local
  ignored path is
  `.artifacts/gemini-upload-bisect/02-counting-granularity/SKILL.md`; it is
  36,429 bytes with SHA-256
  `a97bf7073bdb391901db4109990fa230f17eaf9dcb4d79aa96c08856b15e1298`
  and passed the skill validator. A failure splits these three substitutions; a
  pass moves to the excluded anchor-evidence half.
- The required lesson checkpoint at `2026-08-20T18:59:43.800Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded second bisect step.
- The owner reports upload probe 02 also failed, localizing the scanner trigger
  to its three counting/granularity substitutions. Probe 03 changes only the
  overlooked-family counting and `single_intervention` paragraph from exact
  v13. Its ignored path is
  `.artifacts/gemini-upload-bisect/03-family-granularity/SKILL.md`; it is 36,437
  bytes with SHA-256
  `8807a426f843ff8b2729891486bff0559c29ed4576dfa9f90f6b47d3886539b2`
  and passed the skill validator. A failure splits that paragraph; a pass moves
  to the conventional/firsthand count pair.
- The required lesson checkpoint at `2026-08-20T19:03:12.702Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded third bisect step.
- The owner reports upload probe 03 failed, isolating the scanner trigger to its
  one family-count/granularity paragraph. Probe 04 is exact v13 plus one inserted
  clause requiring passing batch coverage before counting an overlooked family.
  Its ignored path is
  `.artifacts/gemini-upload-bisect/04-family-count-coverage/SKILL.md`; it is
  36,487 bytes with SHA-256
  `81a79526e554c3fa4c40845bcc97f8309f48e4b50858380e992efddb093d2c34`
  and passed the skill validator. A failure identifies that clause as
  sufficient; a pass identifies the excluded granularity rewrite.
- The required lesson checkpoint at `2026-08-20T19:09:31.968Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded fourth bisect step.
- The owner reports Probe 04 failed despite differing from accepted v13 by only
  one benign coverage clause. Because every changed artifact has failed, Probe
  05 is a mutation control: exact v13 plus one trailing LF byte and no semantic
  change. Its ignored path is
  `.artifacts/gemini-upload-bisect/05-blank-line-control/SKILL.md`; it is 36,423
  bytes with SHA-256
  `36af81951bcede7ac83955d7995e9c7ef417ea18f9fd127be1b8b782097f89f2`
  and passed the skill validator. A failure stops content bisecting and points
  to exact-artifact caching/allowlisting or unstable scanner behavior; a pass
  confirms the Probe 04 clause is sufficient.
- The required lesson checkpoint at `2026-08-20T19:20:55.628Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  mutation-control step.
- Owner correction superseding the preceding probe receipts: the intended Probe
  01 file at
  `.artifacts/gemini-upload-bisect/01-execution-anchor/SKILL.md` passed Gemini's
  security scan. The reported Probe 01 through Probe 04 failures came from
  uploading a different file and are invalid; Probes 02 through 05 remain
  untested. Resume from Probe 01's pass by testing the excluded schema/question
  half. The canonical skill was never moved, but diagnostic files were created
  under `.artifacts/`; before asking the owner to use any moved, renamed, or
  alternate file, explicitly announce the path change and identify the old and
  new paths.
- Upload-only Probe 06 is the complementary schema/question half after Probe
  01's confirmed pass. It starts from exact v13, retains the v13 contract
  marker, and adds only the post-v13 `intervention_family` schema wording,
  evidence-first question construction, compact candidate-ledger wording,
  exact-family rabbit-hole shortcuts, and compact final self-check. It is a
  local ignored alternate at
  `.artifacts/gemini-upload-bisect/06-schema-question-selfcheck/SKILL.md`, 349
  lines and 35,336 bytes, SHA-256
  `da09e2276c9dcdff93b042db1d90a02938558286215c9ae637a61cd5593a539a`.
  It passed the skill validator. The canonical v15 skill remains unmoved and
  unchanged at SHA-256
  `cd5c832be43358a57633064be4c50e0999bd22336ab9c79801d472f759383275`.
  A pass means both split halves are individually accepted and the next test is
  their combination with the v13 marker; a failure splits Probe 06's group.
- The owner reports Probe 06 failed Gemini's security scan. Probe 07 splits that
  group and starts from exact v13 with only three hunks: the exact
  `intervention_family` field contract, evidence-first question construction,
  and matching candidate-ledger wording. It excludes Probe 06's shortcut and
  compact final-self-check changes and all Probe 01 execution-body changes. Its
  announced local ignored alternate is
  `.artifacts/gemini-upload-bisect/07-schema-question/SKILL.md`, 358 lines and
  36,209 bytes, SHA-256
  `939d47bb5467a0ffb523a47b66e75cafd81eba12db79de1b7dca102b7af6b257`.
  It passed the skill validator. A failure splits schema from questions; a pass
  tests the excluded shortcut/self-check half. The canonical v15 skill remains
  unmoved and unchanged.
- The owner reports Probe 07 also failed. Probe 08 isolates the exact
  intervention-family schema from the evidence-first question rewrite: it
  starts from exact v13 and changes only the core candidate/seed field clause
  and its matching candidate-ledger output clause. The question rules are exact
  v13. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/08-intervention-family-schema/SKILL.md`, 357
  lines and 36,239 bytes, SHA-256
  `1493e548dab9659b6386110b21a6ba61bcc637bccdd977b537977c0086c16b1b`.
  It passed the skill validator. A failure splits the two schema hunks; a pass
  isolates the excluded question rewrite. The canonical v15 skill remains
  unmoved and unchanged.
- The required lesson checkpoint at `2026-08-20T19:36:27.067Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded complementary upload probe.
- For an earlier diagnostic revision, local validation passed the skill
  validator at 499 lines, the focused Gemini
  contract suite 6/6, typecheck, and build. The sandboxed complete test run
  passed 899 tests but recorded 70 failures dominated by prohibited localhost
  listeners plus secondary timeouts. Two attempts to rerun `npm run verify`
  through the required host boundary expired in the automatic approval review
  before execution, so the complete deterministic gate remains unverified for
  this diagnostic revision rather than failed on product behavior.
- The required lesson checkpoint at `2026-08-20T08:55:45.993Z` remained
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

Delete or disable the old Gemini scout skill, upload
`integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md`, invoke
`/scout-youtube-for-askrigor-staged` in a fresh Spark chat, and reject the run
immediately if the two diagnostic lines are absent. Separately finish the
matched Gemini/transcript timing comparison after the recorded
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
