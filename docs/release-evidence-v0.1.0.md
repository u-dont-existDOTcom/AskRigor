
# AskRigor v0.1.0 release evidence

## 2026-08-23 deployed open-full-text audit release

PR #58 merged automatic DOI full-text acquisition through
Europe PMC and then Unpaywall. Unpaywall-discovered PDFs are fetched only through
bounded public-network transport that rejects mixed/private DNS answers and
pins each TLS request to a vetted public address. Copies are checked against the requested DOI or title,
version-labeled, segmented through a server-owned handle, and withheld from
synthesis until a source-linked study or review method audit validates. A copy
that cannot be fetched, extracted, or identity-checked remains a possibly useful
lead; its unseen contents are not evidence. PR #59 then hardened the public
Action boundary so malformed DOI and PMCID values return `422` before any
provider request.

The generated release Instructions are 7,957 characters (7,987 UTF-8 bytes),
SHA-256 `667623ebfd7ca9cf4417d8b58ec756c9a7e0967492f2ac95e84fba66826f86d1`.
The release Action OpenAPI SHA-256 is
`99e5f45fb0b27e7dc4943f0896d5a6de66c910819ad1a2a9bfd8df53212749e3`;
the synchronization ledger SHA-256 is
`2c896b263ad47a37637f823bc6f3807b9f05a1fb8724ff5af3bcb7576afad1bc`;
and the installation-bundle digest is
`ada3338d73a255088ee8b2033cb63201a4956fab3011b97bf5279bd561f5db30`.
The complete deterministic gate passed 1,121 tests with six declared skips
across 78 passing files and one skipped file, followed by typechecking and the
production build. Public-site validation passed for four pages, the deployment
suite passed 28/28, and `npm audit --omit=dev` reported zero vulnerabilities.
A bounded provider-diverse live Unpaywall smoke passed secure PDF retrieval,
extraction, and exact DOI verification. Direct probes indexed published copies
from Frontiers (`10.3389/fpsyg.2020.02084`) and Scientific Reports
(`10.1038/s41598-020-73777-8`) and an institutional submitted manuscript for
`10.7554/eLife.43882`; the release smoke accepts the first complete verified
copy from that small diverse set. The previous single Nature fixture now
correctly returns a possibly useful lead because its available locations fail
retrieval or identity verification; safeguards were not weakened to preserve a
brittle external URL.

The exact PR #59 merge `e7409dfc0567c07e5fba3f2641b735028d132e1f` is deployed
as `askrigor-research:e7409dfc0567c07e5fba3f2641b735028d132e1f`, image ID
`sha256:1968fa4cfeb4ad2b6c47b3b85e685d94d020f529b565b0023ab73596572b3409`,
in healthy container `3f333fadee14`. The exact secret-free archive SHA-256 is
`bc3b9589bc96ad95af9f5a6969d9d1d9b4b82d6b0fd7ed0f85b66e29d45bc103`
(1,213,273 bytes; 431 members). Active Compose SHA-256 is
`90d5bae8970975fa49eb14c0571e772b454f70e2a8ffbf5195c6448ecaff1f0b`.
Immediate rollback remains `askrigor-research:rollback-9703ef1-predeploy`, image
ID `sha256:a643cd1d5040a269e3f5b48516f98889eb44fe615f41f6e630cd470001642f08`,
plus `/opt/askrigor/compose.yaml.rollback-9703ef1`, SHA-256
`9bdb02a546ddddde7a39bc4ef448a191f51550b39f02ca492354f1c9923b718d`.

Fresh public acceptance passed health, 25 Actions, 21 MCP tools, the exact HRP
`20.5.22` and Universal `20.5.14` hashes, lesson isolation at `401`, malformed
full-text input at `422`, and a complete method-audit-locked open study. The
compact live OpenAPI SHA-256 is
`87711a1bcac4939137bd4166803c85f153a6a345036a400dc078b542c8f0041a`.
The personal plugin is current at `0.1.0+codex.20260823023619`; its installed
skill SHA-256 is
`97700c7930d4c28c9047a11d1f4131d715414d62847d78d01602a28a2b434658`.
Exact Custom GPT editor import and fresh product-interface acceptance remain
pending and are not inferred from server or plugin checks.

## 2026-08-22 Custom GPT editor-schema compatibility repair candidate

PR #55 merged the executable acceptance repair as
`61dc53e20aa3f66ede5fb576b53756960f57aa96`; that exact merge is deployed and
healthy. The first signed-in editor import then exposed a separate product
boundary: the new Spark-validator response used draft-7 tuple syntax inside an
OpenAPI 3.1 document, and the Custom GPT editor rejected the array-valued
`items` field before listing any operations.

The merged repair aligns that route with the existing 2020-12 Action schemas and
adds a whole-document regression that rejects every array-valued `items` field.
The Instructions remain 7,783 characters (7,815 UTF-8 bytes), SHA-256
`1de222a6ab29fe97bff4385be29348912142510f21519f8e10e530c6197ded08`;
the regenerated Action OpenAPI SHA-256 is
`884aa2758fbec92e384a1bd5534e3d85f86e6ab60ff1629587f9082b98b3f2fb`;
the synchronization ledger SHA-256 is
`ffecff639022b7b0cbdd338cb5adc8d76aa334714abeb3604e2381c16b4c9d73`;
and its installation-bundle digest is
`ac40a100a8fd0cabd8a4f01b5b091547e330a44353cb0fddb2d90c304e565c02`.
The Spark skill and Instructions bytes are unchanged. PR #56 merged as
`abcfb6728601f83f7589bbc195ad2b9683f710ad` and is deployed as image ID
`sha256:a643cd1d5040a269e3f5b48516f98889eb44fe615f41f6e630cd470001642f08`
in healthy container `ba29902d5b6e`. The compact live OpenAPI SHA-256 is
`3130bf9480ac85138a7ae585c0ae684c4d17ed1526204180e9131035e2d5ee0a`;
it exposes 21 operations and the corrected four-member `prefixItems` form with
no array-valued `items`. Compose SHA-256 is
`9bdb02a546ddddde7a39bc4ef448a191f51550b39f02ca492354f1c9923b718d`.
Immediate rollback is `askrigor-research:rollback-abcfb672-predeploy` plus
`/opt/askrigor/compose.yaml.rollback-abcfb672`, SHA-256
`cb95791899db20792281f3c7d9fb922c911af8e88e2ee68ea665037b2b78d103`.
The signed-in editor re-import, exact operation-list inspection, and fresh
product-interface acceptance remain required before the installation is current.


Release disposition at 2026-08-22: **PUBLIC SUBMISSION BLOCKED**. Developer
Mode connector retrieval is ready based on the recorded production Inspector and
ChatGPT evidence below, and the public website/support/privacy/terms URL gate is
now resolved. The fresh post-deployment ChatGPT interface check did not reproduce
the earlier routine-status presentation finding. Later treatment-decision runs
exposed formal-retrieval/Forum Signal, option-space, and later discovery/
weighting regressions. PR #36 closed the first two and was deployed and
installed, but successive product retests exposed deeper discovery/weighting
and creator-content verification gaps. PRs #40 and #41 now address those gaps
universally with transcript-verified claim selection rather than a
topic-specific required-answer list, and the exact PR #41 merge is deployed and
directly accepted. The owner installed the 7,946-character generic candidate-
quality Instructions (SHA-256
`019277ee0b3943c85bf70f521b1a28069f5e7fed9a9c1d9223527b5cd469a532`), but
public-directory review rejected that content as potentially providing tailored
medical or health advice. The successor 7,892-character public-educational-
scope Instructions are not yet installed. The current runtime and plugin
package are nevertheless deployed and independently verified as described
below.
Public submission cannot proceed until the current candidate passes fresh product-interface
acceptance, the publisher-identity/domain path is resolved, Scan Tools and the
demo recording pass, the opaque model-receipt release decision is explicit, and
final portal review and submission actions are complete. The repository candidate now
separates the validated distributable package from the portal-only handoff in
`docs/public-submission-packet-v0.1.0.json`; that file does not prove any hosted
state.

The generic candidate-quality runtime is deployed from PR #54 merge
`6d8ae92943fb2ae875b055221d85b146713e2aed`. Its first generated Instructions
were installed but failed public-directory content review. The successor public-
scope repair is 7,892 characters (7,920 UTF-8 bytes), SHA-256
`2299daae039e8c46df8a09b1e99e423e9361ff233648190dd3065d2f9b9528ba`;
the synchronization ledger is
`437b09f94eda9de6b6e0f8701e2db865b30a8ef86596d821ba067ad7e4783b62`;
and its 21-operation Action OpenAPI is
`280a26ddbcd512357f12733f896cd32b166102d45524492642618a403c0f5540`.
It restores Gemini Spark as an optional high-recall finder while keeping every
Spark summary provisional, independently validating public video identity, and
blocking broad synthesis when a material umbrella class lacks specific-program
search or a valid nonduplicate scout remains unscreened. The rule is generic;
hip arthritis appears only in historical/regression evidence.
The committed and live artifact receipts are recorded below.

## Public educational-scope repair candidate — 2026-08-22

- Public review of the installed 7,946-character packet failed with the stated
  content reason `May provide tailored medical/health advice`. This is a
  product-interface failure, not a runtime, Action, protocol, or plugin failure.
- The repaired public build opens with an educational-only scope. It cannot
  assess a person's symptoms, records, imaging, diagnosis, risk, suitability,
  prognosis, regimen, or dose; choose or rank care for a person; or say whether
  someone should start, stop, change, or delay care. Personal prompts receive
  only general population evidence and clinician-review questions.
- The public build no longer advertises `good idea for me`, `do you agree`, or
  `now versus wait or delay` as handled decision requests. The internal project
  router and canonical protocols remain generic and unchanged; only the public
  Custom GPT projection is narrowed.
- Exact repaired Instructions: 7,892 characters, 7,920 UTF-8 bytes, SHA-256
  `2299daae039e8c46df8a09b1e99e423e9361ff233648190dd3065d2f9b9528ba`.
  Exact synchronization ledger SHA-256:
  `437b09f94eda9de6b6e0f8701e2db865b30a8ef86596d821ba067ad7e4783b62`.
  Installation and a fresh public-directory review remain pending.
- The complete deterministic gate passed 1,064 tests with five declared skips,
  plus the production build. Public-site validation covered four pages and the
  deployment suite passed 28/28. The OpenAPI and server runtime are unchanged,
  so no production redeploy is required.
- The repository, personal-plugin source, and installed plugin skill remain
  byte-identical at SHA-256
  `d5c5731b4142b5c93ea21283a0855cc118f7bed15ee53decd19eaedd5199c834`;
  the installed plugin is already current.

## Generic candidate-quality production and plugin acceptance — 2026-08-22

- PR #54 passed deterministic verification, workflow policy, and CodeQL before
  merge. Local release verification passed 1,063 tests with 5 skipped, the
  production build, four public-site pages, and 28 deployment tests.
- The secret-free merge archive had 401 members, 1,117,416 bytes, and SHA-256
  `fd36810c147598a50dbfde4cb29a812822527fabbe9a9171296eb6a5409d4b01`.
  Production runs image
  `askrigor-research:6d8ae92943fb2ae875b055221d85b146713e2aed`, image ID
  `sha256:a0e98726a32b81d8e0de4c0171f06c2460f2fe2303bc03d0942c70306d98f17a`,
  in healthy container `b3adc7a5735f`. The runtime remains user `node`,
  read-only, capability-free, and `no-new-privileges:true`; its accepted log
  contained one startup line. Only `research-mcp` was recreated and Caddy kept
  its prior start time.
- Immediate rollback is `askrigor-research:rollback-6d8ae92-predeploy`, image
  ID `sha256:d4892bb61d4c05cfdc59943a1b4b5ab2e648798646cd93c3bcd46f6b31c351df`,
  plus `/opt/askrigor/compose.yaml.rollback-6d8ae92`, SHA-256
  `7ea1680c3ac2bccd82f352d2b2776a6f63fd6a18ad095d861d543c0b803faba4`.
  Current Compose SHA-256 is
  `ca773eaa40593f0e510c8cba454051d80bebb2f080ef8a681c9488bbe7493a47`.
- Public acceptance found 21 Action operations with live compact OpenAPI
  SHA-256 `a61a8ba9e1d4675a29e09a5010ab33b1119c388b7cf166669400cac554bbe535`,
  while standard MCP stayed at exactly 17 tools. HRP `20.5.20`, SHA-256
  `803060fb07fb0ed9198c066db9c3dbbc7579395833485b35d59730cfcc5b5f23`,
  and Universal `20.5.14`, SHA-256
  `8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221`,
  both verified true. The lesson route returned `401` without authorization and
  malformed Spark input returned its declared `422`.
- A bounded live Spark validator probe accepted three public video identities,
  with no rejected or unresolved candidates and frontier SHA-256
  `c560f06afac0f56e64722a249cab208249c1543ebc0bb3b473aeb71d384402fe`.
  The receipt explicitly keeps summaries provisional and does not establish
  creator content, efficacy, safety, causality, or selection.
- The personal plugin was synchronized, validated, and reinstalled as
  `0.1.0+codex.20260822072920`. Source and installed receipts match byte-for-byte
  at package SHA-256
  `d196d783895e3ed093e33f6779b91ae9bb4bdafb3550de327c5f91a9643876c6`;
  the skill SHA-256 is
  `d5c5731b4142b5c93ea21283a0855cc118f7bed15ee53decd19eaedd5199c834`.
  A new Codex thread is required to load the updated package.
- Custom GPT Instructions, Action-schema import, Spark skill upload, and fresh
  product-interface acceptance remain unobserved and must not be inferred from
  runtime or plugin acceptance.

A later owner-provided GPT-UI result exposed a partial-answer escape,
intervention-program conflation, and implementation-jargon leakage. PR #44
merged the reviewed instruction repair as
`b8e110404130d1d1e85d56112b837c499106086e`. Its generated Instructions are
7,962 characters with SHA-256
`4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`;
its synchronization-ledger SHA-256 is
`a1e6e4390fb640a95ab01e51be9b3c70774368fa3208d65cc0723e1df4427ecc`.
The OpenAPI is unchanged. Complete pre-merge gates and independent review
passed, followed by successful post-merge deterministic verification (run
`32464548386`), workflow policy (run `32464548449`), and CodeQL (run
`32464548011`). After reviewing those 7,962-character Instructions, the owner
reported that exact artifact was already installed. The subsequent 7,978-
character candidate is not installed. Fresh UI acceptance is still required;
no earlier runtime or UI receipt proves the repaired behavior.

The subsequent generated candidate additionally incorporates the compact citation-
display repair: direct links on the shortest supported claim phrase, a compact
linked `(inferred)` marker for synthesis, and no repetitive citation narration.
The 7,978-character Instructions have SHA-256
`207249668ba176b0372422d61d9fe4f2096428db27a3b9b57e3d75ba525e4488`;
the synchronization-ledger SHA-256 is
`a85ea88ba9ab908431deb5fc5da25824b8390e48f8975798dde31b7d3febb928`.
The Action OpenAPI remained unchanged at that point. This candidate is not installed
or accepted in a fresh GPT UI run; the owner-reported installation applies only
to the preceding 7,962-character artifact.

PR #47 merged exact reviewed head
`51e420c69b9e811d857977b95a310a93f4975637` as
`7b6dac66a67bbfb43bcabbbbf37c5dd60a0dc7a3`. Protected pre-merge deterministic
verification (run `32507689060`), workflow policy (run `32507689167`), and
CodeQL (run `32507685987`) passed. Exact post-merge deterministic verification
(run `32507846373`), workflow policy (run `32507846508`), and CodeQL (run
`32507846256`) also passed. ARL-0007 was then accepted, incorporated, and closed;
the post-closeout lesson checkpoint reported 1 open candidate, 1 needing review,
0 accepted but not incorporated, 3 incorporated or closed, and 0 deletion
eligible. This repository completion does not replace the pending editor
installation and fresh GPT-UI acceptance boundary.

## Custom GPT research bridge — CURRENT RUNTIME DEPLOYED AND DIRECTLY ACCEPTED; INSTALLED CANDIDATE PUBLIC-REVIEW REJECTED; PUBLIC-SCOPE CANDIDATE INSTALLATION AND REVIEW PENDING

PR #15 merged exact implementation head
`be641bf568c401992ff4aa9fe885552d6cfb2dca` as
`dd73d7dccb6bc3f96b964aafa6a2f74f96ab16c4`; compatibility PR #17 merged as
`6639086a33b44f029c9f8405f69bd06b725e78d0`. The YouTube continuation chain
then landed through PRs #19 through #23. PR #23 exact head
`11f3a68a73bc68bc23f1854b6bd8d4c06f9b843f` merged as
`905ac22ab42479c15ff0d6385a51de864271f862`. PR #27 merged the sanitized UI
receipt and current Universal `20.5.13` ancestry as
`5585a9ca34ce01403044b1085b85d4f2de9783f4`. PR #32 then merged and deployed
the pinned privacy-model repair as revision
`d1af238325ee1e0584574e47bbcbe7764d17cf7e`. The current release exposes 18
read-only operations through Custom GPT Actions while retaining the separate
consequential lesson write; its standard and Gemini MCP surfaces each remain
frozen at 17 read-only tools. `ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true` is active;
the Actions use MCP's same transient provider flow, shared public token bucket
and concurrency pool, **60,000-byte** serialized-response ceiling, and
**48,000-byte** exact protocol chunks.

PR #36 then merged the completion/option-space repair as
`cfce806345fe65a13fd0330aa7e8f000c1587d01`. PR #41 now runs as image
`askrigor-research:386497415a187354c6396e69a902d5bece9a9c96` / image ID
`sha256:84fb1527d37f4003dc0f3670818c3d7f5987a1a1c53861fca236da1f8975db1e`
after PR #41 merged the transcript/evidence-frontier and Gemini production
reconciliation. The owner previously installed exact 7,753-character Instructions
`efd1567e185d2c9c3c209812a26dde630de802ba7a0b878ee9640af7886c14ec`
with empty Knowledge. The later 7,962-character repair, SHA-256
`4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`,
  has an owner-reported signed-in editor installation receipt. The owner later
  installed the 7,946-character generic candidate-quality Instructions,
  SHA-256
  `019277ee0b3943c85bf70f521b1a28069f5e7fed9a9c1d9223527b5cd469a532`,
  and reported the public-content rejection. The repaired 7,892-character
  public-scope candidate is not yet installed. The editor was not independently
  inspected.

The earlier deployed bridge release passed direct protocol, PubMed, ClinicalTrials.gov,
Crossref, YouTube, malformed/oversized transport, rate/recovery, private lesson,
append-only duplicate, authentication isolation, health, and frozen MCP checks.
The complete sanitized receipts are in
`docs/custom-gpt-action-live-acceptance.md`. Product-interface protocol and
formal-source cases passed on 2026-08-16.
The repaired two-call Custom GPT UI retest passed on 2026-08-17.
Universal `20.5.13` UI load passed later that day with exact 3-chunk,
98,154-byte coverage and matching chunk/whole digests. The first synthetic
lesson check failed safe before any call. Hardened Instructions then displayed
the complete shell and enforced exact consent, but two approved calls returned
`action_auth_required` before the Bearer key was applied to the existing editor
Action; no lesson was submitted. Saving that corrected Action triggered the
public-content warning `May provide tailored medical/health advice`. The new
public-only boundary preserves general and subgroup evidence while prohibiting
individualized diagnosis and treatment direction; it does not alter the plugin,
MCP, protocols, or server. The owner then reported successful public
publication. In a new published-GPT chat, exact consent and ChatGPT's
confirmation reached the authenticated Action, but the fully generalized
source-audit lesson returned non-retryable `privacy_rejected` before GitHub. The
private queue remained unchanged. A pinned privacy-model repair was prepared
and verified. Exact merge `d1af238325ee1e0584574e47bbcbe7764d17cf7e` is now
deployed, and its exact-code non-stored safe-candidate probe returns
`generalized`. In a new published-GPT chat, the repaired path then submitted
`ARL-0007`; a separately consented identical duplicate returned the same ID
with occurrence count 2. The aggregate private queue independently confirmed
one open candidate awaiting review. The published direct URL is
`https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol`.
At `2026-08-18T01:34:40Z`, both HTTP and HTTPS for `gpt.askrigor.com` returned
one temporary redirect to that exact URL and ended at HTTP `200`. The public
page identified **AskRigor.com Heterodox Research Protocol**. The previous
`/share/...` target is retained as the explicit rollback in the live acceptance
record.

A later fresh published-GPT treatment-alternatives run loaded both protocols
but skipped PubMed, Europe PMC, ClinicalTrials.gov, and the required Forum
Signal YouTube survey/audits, then incorrectly labeled the result HRP-complete.
The later audit did not retroactively validate that answer. Its separately
attempted generalized lesson submission failed closed as non-retryable
`privacy_rejected` and was not retried. The merged TDD repair makes treatment
alternatives and avoiding replacement or surgery explicit Forum Signal
triggers; blocks `HRP-complete` and the full-HRP opening until all formal
retrieval required by the applicability ledger and every required receipt pass;
and grounds Custom GPT community completion in each selected video's
Action-returned `receipt.synthesis_lock: pass`. It adds privacy-only model
guidance for an already-generalized, non-identifying `protocol_execution`
lesson without weakening strict schema, deterministic screening, metadata
equality, non-storage, or fail-closed behavior.

A second fresh run did execute YouTube community work for a clinician-proposed
celecoxib-to-surgery pathway, but it audited only the named treatments and did
not discover or compare realistic alternatives. The expanded repair therefore
adds an independent option-space gate for treatment endorsement, choice, and
start/defer/sequence decisions. It requires proposed care, diagnosis alternatives,
nonaction/natural history, conventional nonsurgical care,
lifestyle/rehabilitation/mechanical approaches, relevant heterodox or adjunct
approaches, and procedural or surgical care to be searched across plausible
classes, with exclusions justified before a verdict. The Forum Signal matrix
contains 15 required and 9 affirmative nontrigger cases; the separate
option-space matrix contains 9 broad-review and 6 narrow-review controls. The
expanded focused suite passed 75/75. The complete Node `24.18.0` gate passed
typecheck, 53 test files with one declared credential-gated file skipped, 933
tests with five declared skips, and build. Skill/plugin validation, repository-
policy audit, and patch hygiene passed.
After installation, a third broad treatment-pathway run did execute the option
space and retrieve 1,179 YouTube records (418 returned for analysis), but still
treated conventional/provider-ranked videos as adequate without a candidate-
selection ledger. It did not decompose exercise/PT programs, distinguish
preoperative conservative care from postoperative rehabilitation, bound
decisive THA trials to exact comparators, or fully steelman hydration/collagen
signals after exact matched studies were not located. The first follow-up
Instructions were 7,799 characters with SHA-256
`8cbc6a3a5741f46e08cb184dfb32277d85a4897aa86e993865bfdc219f1b41d6`.
That repair merged as PR #37 (`d49cad990f21dfdf9649951248798293650f2a4a`).
The owner then supplied a fresh product result after installing/testing that
candidate. It audited three generic pools totaling 1,458 provider-reported and
retrieved records and 284 returned for analysis, but omitted several plausible
hard-to-find hypotheses, used a postoperative rehabilitation pool for a
preoperative decision, collapsed materially different programs, and still
labeled the result HRP-complete. The retrieval counts establish comment-corpus
work, not creator-content verification or adequate hypothesis coverage.

The current deployed release is deliberately universal. Vernacular phrases
such as `how I cured/reversed/fixed my [condition]`, standard-care failure, and
`what finally worked` expand evidence-frontier discovery but do not increase
credibility. Candidate selection records the exact program, stage, outcome,
horizon, surprise, decision value, and independence. Creator content must then
be verified through timestamped captions; metadata and comments cannot stand in
for the video. Comments are audited separately for replication, failure, and
harm. The final **Videos worth watching** section admits only exact,
nonredundant, transcript-verified videos and supplies the relevant canonical
timestamp link and reason to watch without padding.

The release adds `get_youtube_transcript` only to the public Custom GPT
Action bridge. Its bounded pages preserve language, automatic-caption status,
timestamps, cursor provenance, and literal failure/access states. It uses an
unofficial public YouTube interface, so availability remains bounded by the
public caption surface; direct production acceptance observed both truthful
`not_found` and a complete captioned control. Production exposes 18 public
research reads plus the lesson write through Actions. The checksum-
locked MCP remains exactly 17 tools, and canonical protocol bytes are
unchanged. Generated Instructions are 7,797 characters with SHA-256
`4b0d3382ee1f214a54c87e8c493d34b42e02467a66ee031f06fd33a2215b90bc`;
generated OpenAPI SHA-256 is
`9a7e19fc4b9b3b8e7e330865925628da7deea54529800dfcf630626ee03efc31`.
Synchronization-ledger SHA-256 is
`1ca16c082fcfed4f1c90e919aa541827fe1ca8c37e7b1de5c4968cba96ad2f3e`.
The eight-case discovery/weighting matrix and separate unrelated held-out
fixture keep topic-specific answers out of production rules. The focused
router/skill/matrix/packet/transcript/registry suite passed 53/53. The complete
Node `24.18.0` gate passed typecheck, 57 test files with one declared
credential-gated file skipped, 960 tests with five declared skips, and build.
Public-site validation covered four pages and its deployment suite passed 28/28.
PR #41 merged as `386497415a187354c6396e69a902d5bece9a9c96`; its exact
runtime and privacy site are deployed. Fresh direct acceptance passed standard
MCP, Gemini MCP, all 19 Action operations, exact HRP `20.5.18` and Universal
`20.5.14`, bounded live providers, transcript success/unavailability states,
transport limits, CORS, rate limiting, hardening, and health. Editor installation
is owner-reported for the preceding 7,962-character Instructions, SHA-256
`4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`. The
current 7,978-character citation-display candidate is not installed; fresh
product-interface acceptance remains pending.
The first real multi-call YouTube case failed closed after ChatGPT altered the
several-thousand-character continuation token twice. Sixty-six records had been
retrieved after restart, but zero were returned for analysis, replies were not
reconciled, and `synthesis_lock:block` prevented a conclusion. The bounded
short-handle, overlap reconciliation, fail-closed terminal sample, and 50-ID
refetch repairs are now merged and deployed. Fresh direct acceptance on the
same video completed the two-call chain with 149 cumulative records, a
111-record deterministic sample, no error or further continuation, and
`synthesis_lock:pass`. The fresh Custom GPT UI retest matched the two-call
counts and terminal state. It loaded the then-deployed Universal `20.5.12`;
the later Universal `20.5.13` product-interface refresh passed independently.

Continuation-relay lesson disposition: **transferable with bounded scope**. The
several-thousand-character model relay failure is preserved with its
counterexample and limits: direct MCP clients remain stateless, while a short
Action handle adds bounded transient server memory, restart/eviction loss, and
a privacy-disclosure obligation. The exact merged repair now passes both direct
and product-interface continuation acceptance; any universal promotion remains
a separate evidence-preserving owner review.

## Unreleased treatment-landscape selection candidate

The 2026-08-21 source candidate adds HRP `20.5.19`, the Action-only
`assess_treatment_landscape_coverage` read, a 19-read/one-write generated Custom
GPT schema, compact Instructions under 8,000 characters, and regressions that
separate treatment-space breadth from per-video transcript/comment depth. The
new route makes no provider call or medical conclusion and keeps the public MCP
registry frozen at 17 tools.

This paragraph is source-candidate evidence only. It does not amend the exact
production image, deployed HRP `20.5.18`, live Action inventory, installed GPT
editor contents, or product-interface acceptance recorded below. Those states
remain unchanged until their separate deployment and live checks occur.

## Artifact and endpoint identity

| Item | Evidence |
| --- | --- |
| Local packet base | `cd19514e8701af3a2e6294fa0c2ab74fad5af466` (`docs: add ChatGPT plugin connection workflow`). |
| Production connector revision | PR #54 merge `6d8ae92943fb2ae875b055221d85b146713e2aed`, image tag `askrigor-research:6d8ae92943fb2ae875b055221d85b146713e2aed`, image ID `sha256:a0e98726a32b81d8e0de4c0171f06c2460f2fe2303bc03d0942c70306d98f17a`, healthy container `b3adc7a5735f`. Current Compose SHA-256 is `ca773eaa40593f0e510c8cba454051d80bebb2f080ef8a681c9488bbe7493a47`. Immediate rollback is `askrigor-research:rollback-6d8ae92-predeploy` plus `/opt/askrigor/compose.yaml.rollback-6d8ae92`, SHA-256 `7ea1680c3ac2bccd82f352d2b2776a6f63fd6a18ad095d861d543c0b803faba4`, restoring image ID `sha256:d4892bb61d4c05cfdc59943a1b4b5ab2e648798646cd93c3bcd46f6b31c351df`. |
| Production MCP endpoint | `https://mcp.askrigor.com/mcp` (public streamable HTTP). |
| Published Custom GPT | `https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol`; `gpt.askrigor.com` reaches it through one verified temporary redirect. |
| Deployed production protocols | HRP `20.5.20`, revision `2026-08-22`, SHA-256 `803060fb07fb0ed9198c066db9c3dbbc7579395833485b35d59730cfcc5b5f23`; Universal `20.5.14`, revision `2026-08-18`, SHA-256 `8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221`. Current direct production integrity checks matched both hashes and returned verified true. |
| Production source packet | Exact secret-free `git archive` from `6d8ae92943fb2ae875b055221d85b146713e2aed`; SHA-256 `fd36810c147598a50dbfde4cb29a812822527fabbe9a9171296eb6a5409d4b01`, 401 members, 1,117,416 bytes. The image was built on the server from that verified archive; no image archive was created. |
| Protocol evidence | Formal-source Inspector evidence: `/opt/askrigor/validation/https-20260811T045226Z`. |
| YouTube evidence | Keyed YouTube Inspector evidence: `/opt/askrigor/validation/youtube-20260811T152149Z`. |
| Fresh public YouTube Inspector | `/opt/askrigor/validation/youtube-20260811T172256Z`; validator image `askrigor-youtube-validator:2.1.0`. |
| Historical live-provider suite | `/opt/askrigor/validation/live-suite-20260811T172130Z-71611`; source `9d1d751`; retained as the initial provider-green run whose wrapper had an ANSI false negative. |
| Historical fresh live-provider suite | Controller remote validation at `/root/askrigor-validation-stage/live-suite-v6-6a9d536b7845`; clean archive/image build, scanner, ANSI-safe parser, and evidence checksum all passed. |
| Public site source | Current privacy disclosure active at `/opt/askrigor/site/releases/386497415a18/site`; live privacy bytes SHA-256 `229ea4e7a86efcfc005570666b1c2fbb2c8fefda8b1f2ca60ee7c802f9995abc`, effective `2026-08-21`. |
| Public site packet | Deployment archive `site-386497415a18.tar.gz`, 18,929 bytes; transactional installer SHA-256 `faeb5f9f6394473f9402c3ae008b2391219ded14cbcd892a4536fa1176e94e09`. The four live page hashes are recorded in the current direct acceptance document. |
| Custom GPT packet | Live compact OpenAPI SHA-256 `a61a8ba9e1d4675a29e09a5010ab33b1119c388b7cf166669400cac554bbe535`; committed pretty OpenAPI `280a26ddbcd512357f12733f896cd32b166102d45524492642618a403c0f5540`. Current repaired Instructions are `2299daae039e8c46df8a09b1e99e423e9361ff233648190dd3065d2f9b9528ba`, 7,892 characters. Runtime/schema acceptance is complete. The owner installed the preceding `019277ee0b3943c85bf70f521b1a28069f5e7fed9a9c1d9223527b5cd469a532` Instructions and reported public-content rejection. Repaired editor installation and fresh public review remain pending. |
| Package version | `0.1.0`; the ingestion-valid manifest includes the verified website, privacy-policy, and terms URLs, square SVG logo/composer assets, and no environment-specific `.app.json` reference. The portal handoff separately records `https://askrigor.com/support` because the package schema exposes no support-URL field. |

The two Inspector locations are recorded production evidence supplied by the
successful deployment/validation work. The controller's validation runner
accessed the server-side runtime environment without exposing, reading back, or
logging provider keys; evidence was read only after a fail-closed server-side
secret scan. This worktree contains no provider secret and did not independently
run the VPS validation.

## Recorded production validation

| Check | Recorded outcome |
| --- | --- |
| MCP metadata | Current public discovery found the exact ordered 17-tool catalog and strict annotations on standard MCP. Gemini MCP exposed the same 17 handlers through a 12,239-byte compatibility catalog without unsupported `outputSchema` or `execution` fields. |
| Formal sources | Production Inspector passed protocol integrity, PubMed, Europe PMC, ClinicalTrials.gov, and Crossref/retraction cases with their expected access/failure semantics. |
| YouTube | Production Inspector passed YouTube discovery and complete comment-plus-reply retrieval for the bounded public target, including reply-page reconciliation. Fresh compound-tool acceptance returned `api_visible_complete` with `synthesis_lock:pass` for the recorded 2+1 corpus in 3.76 seconds. An oversized corpus returned `partial`, `youtube_comment_budget_elapsed_ms`, and `synthesis_lock:block` in 18.35 seconds under the default 60-second MCP request deadline. |
| Fresh public YouTube Inspector | Exit 0; all 15/15 expected outcomes matched: tools list plus valid, zero, empty, malformed discovery/video/comments, complete reply corpus, and targeted zero-result cases. |
| Historical live providers | The provider test process at `/opt/askrigor/validation/live-suite-20260811T172130Z-71611` exited 0 and 5/5 passed, including PubMed, Crossref, and YouTube; the fail-closed server-side secret scan found no match. Its original wrapper exit 1 was an ANSI status-parser false negative only. |
| Historical fresh live providers | Controller-run v6 validation at `/root/askrigor-validation-stage/live-suite-v6-6a9d536b7845` passed the clean image build, server-side scanner, ANSI-safe parser (exit 0, exactly one passing file and five passing tests, zero skips), and evidence-side relative checksum. `status.txt` reported `Live suite v6 accepted`. |
| ChatGPT Developer Mode | End-to-end smoke passed protocol integrity, PubMed, and complete YouTube 2+1 replies through the deployed connector. No AskRigor write tools were exposed or called. |
| Historical ChatGPT release finding | An earlier ChatGPT run narrated a stale update-check date/status despite the routine-status prohibition. The fresh 2026-08-15 post-deployment acceptance below did not reproduce it; the historical finding remains provenance rather than a current release block. |
| Fresh ChatGPT interface acceptance | Fresh isolated calls visibly ran `verify_protocol_integrity` once with the exact HRP digest and returned `verified:true`, then ran `load_protocol` once and returned the complete-text field with HRP `20.5.17`, revision `2026-08-13`, and SHA-256 `d09d60c5c9b7694c08520314349007edccb6283e3d4d991f74cc209ff6934242`. An ordered manifest/verify/load prompt returned all three successful receipts, no write confirmation, no research synthesis, and no routine status diagnostic. Its copied combined transcript collapsed or mislabeled the visible card as `get_protocol_manifest` while displaying the load response's `text` field; isolated cards prove the individual tool identities, but exact combined card rendering remains a declared product presentation limitation. |
| HRP 20.5.16 execution-reliability rollout | The public `get_protocol_manifest` result returned version `20.5.16`, revision date `2026-08-12`, and exact SHA-256 `d41e37b13357542c8439ca5199d50eef9eec8aa6ec4beeafbfbbe44213362597`. Public `load_protocol` contained `CommunityCorpusCompletionGate` and `OneQueryBoundedYouTubeCommentPresentedAsReconnaissance`. The previous image remains tagged `askrigor-research:rollback-3e6686a341b1`. |
| Forum Signal router rollout | Production exposes the compact Project router package and the compound YouTube audit. Pre-traffic validation passed exact 15-tool discovery and schema checks. Only `research-mcp` was recreated as container `4f72903f8789`; Caddy remained `81b212e28866`, the site release remained `f928b95e29cd`, and both loopback and public health checks passed. The immediately prior application image remains tagged `askrigor-research:rollback-1c308231c67a`. |
| Automated public review | Final protected run `20260815T110708.728Z-baa07445` used clean commit `8ed8c0f7aaab9609dfb067780c05838f98903bab`, case-file SHA-256 `daf2b0e895956d759f382f9d592632d5ea094b0a28f0711efdc9c0f09f7bd7c1`, and `chat-latest` as both requested and returned model. Direct production checks passed 9/9; model checks passed 6/9 and left three explicit `model_output` blocks because the remote-MCP layer supplied opaque receipts. Run failure class was none; the report and summary passed their checksum manifest and safety scan. |
| Current Custom GPT bridge direct acceptance | The prior full reconstruction loaded HRP `20.5.18` in 11/11 contiguous chunks totaling 490,256 bytes and Universal `20.5.14` in 3/3 totaling 105,798 bytes. The current deployment separately verified HRP `20.5.20` and unchanged Universal `20.5.14`, exposed 21 Actions, retained exactly 17 MCP tools, kept unauthenticated lesson isolation at `401`, and accepted a bounded real-identity Spark packet with no rejected or unresolved candidates. The owner installed the 7,946-character candidate and reported public-content rejection. Current 7,892-character public-scope Instructions and fresh review remain pending. |
| Historical OpenAI Action importer compatibility | Exact merge `6639086a33b44f029c9f8405f69bd06b725e78d0` introduced the live-compatible schema and remains in the current release ancestry. At that checkpoint, public schema checks found 18 operations, object-valued `components.schemas`, every summary/description within 300 characters, and both repaired legacy descriptions at 201 characters. The GPT editor subsequently imported that historical schema. The current 21-operation runtime schema is deployed and directly accepted; the repaired 7,892-character Instructions are not installed. Fresh UI acceptance must still confirm the current Action is usable from the product interface. |
| YouTube terminal-refetch release | PR #23 merge `905ac22ab42479c15ff0d6385a51de864271f862` remains in current production ancestry. A test-first provider-boundary regression limits `comments.list` ID filters to 50 after the exact provider returned `200` for 50 IDs and `400 invalidFilters` for 51. The known 16-record video remained one-call `api_visible_complete`; the formerly failing two-call video reached 149 records, returned a deterministic 111-record sample, ended `completed_with_access_boundary`, reported no error or further continuation, and passed synthesis. The repaired two-call GPT UI continuation retest passed on 2026-08-17. The subsequent Universal-only runtime rollout did not repeat provider calls. |

The first compatibility build was rejected in a disposable pre-traffic smoke
test: over-restricting the extracted archive made source modules unreadable to
the runtime `node` user. Production was never switched to that image. The
verified archive was re-extracted with its internal modes preserved, and the
replacement passed the same non-root, read-only, capability-dropped smoke test
before the research service alone was recreated. The rejected image is retained
as `askrigor-research:rejected-permissions-6639086`; it is not a release.

Interface-evidence lesson closeout: **project-specific / no-new-lesson**. The
separation of direct server proof, API-model proof, and product-interface proof
is already part of the approved architecture; this acceptance adds bounded
AskRigor evidence and does not justify a new universal rule.

## Public URL gate — direct HTTPS evidence

Fresh direct checks were run 2026-08-12 after activating immutable release
`f928b95e29cd`. Apex DNS returned only A `191.215.38.123` and no AAAA. The leaf
certificate contains `DNS:askrigor.com`, is valid from 2026-08-12 through
2026-11-10, and has SHA-256 fingerprint
`70:68:BF:28:C8:6A:CC:6A:5B:2C:2E:86:9D:9D:6B:9C:E6:02:1E:73:64:CB:A9:43:24:01:23:77:F0:67:AF:92`.

| Required listing URL | Fresh direct result | Gate |
| --- | --- | --- |
| `https://askrigor.com/` | HTTPS `200`; title `AskRigor \| Evidence-first research retrieval`; exact apex canonical. | Resolved. |
| `https://askrigor.com/privacy` | HTTPS `200`; title/canonical exact; discloses public YouTube identity/comment processing, application non-persistence, infrastructure-provider retention boundaries, and applicable privacy requests. | Resolved. |
| `https://askrigor.com/terms` | HTTPS `200`; title/canonical exact. | Resolved. |
| `https://askrigor.com/support` | HTTPS `200`; title/canonical exact; live `joel@askrigor.com` support contact. | Resolved. |

Each HTTP counterpart returned `308` to the same HTTPS route. The same-origin
stylesheet returned `200`; every HTTPS page included the reviewed CSP and HSTS
headers and omitted `Server`; no mixed-HTTP reference or unrelated redirect
remained. Public TCP listeners were only 22, 80, and 443, while MCP port 3000
remained loopback-only. `https://mcp.askrigor.com/healthz` returned `200` and a
plain GET to `/mcp` returned the expected transport response `406`. The MCP
container ID remained `5e57f8481aac` before bootstrap, after bootstrap, and
after site activation.

The later protocol-only HRP 20.5.16 rollout recreated only `research-mcp` as
container `d845c5a980de`; Caddy remained `81b212e28866`, the active site remained
`/opt/askrigor/site/releases/f928b95e29cd/site`, all five public health/site
checks returned `200`, and port 3000 remained loopback-only. The runtime-env
file remained `root:root`, mode `0600`, with unchanged mtime; its contents were
not read, copied, printed, or checksummed.

The Forum Signal rollout later recreated only `research-mcp` as container
`4f72903f8789` from revision
`bb2245f04f6e1f7bfed8d146c92497364d6488f7`; Caddy remained
`81b212e28866`, the active site remained
`/opt/askrigor/site/releases/f928b95e29cd/site`, all five public health/site
checks returned `200`, the MCP transport probe returned the expected `406`, and
port 3000 remained bound only to `127.0.0.1`. The runtime-env file remained
`root:root`, mode `0600`; its contents were not read, copied, printed, or
checksummed.

## Automated public review and refetch rollout — 2026-08-15

The first protected all-case run, from clean commit
`9715812bfbe3133a755f7ec8ffb91a870629a137`, exposed a production defect rather
than weakening the case: video `W42rwWD6zjw` reported 16 API-visible comments
but returned zero records for analysis, leaving completion `incomplete` and
`synthesis_lock:block`. The live YouTube `comments.list` ID-filter response may
omit both `pageInfo` and `snippet.videoId`; the old parser rejected that valid
shape. A failing fixture regression preceded the minimal parser repair. The
focused suite, full repository gate, isolated read-only image gate, and
independent review passed before deployment.

At that 2026-08-15 rollout, the production research service ran image tag
`9715812bfbe3133a755f7ec8ffb91a870629a137`, image ID
`sha256:e4838746679323050adb636f132ee3c4f72eb8d6c7765906357718531c54578b`,
as container `37dadae8bb20e3aba33d597b06f11bdc4ae0077054e0ed3c39636f367a0da37c`;
that deployment is superseded by the current identity table above.
Only `research-mcp` was recreated. Caddy remained
`5d849df160bda42b924feef49a4aff26a7d8df5e5cfa7f0d5e16ac378c43c23e`;
public and loopback health returned `200`; the Action schema returned `200`;
an unauthenticated Action submission returned `401`; and the existing
read-write Action-state mount remained the only service mount. The service
still runs as `node` with a read-only root filesystem, all capabilities
dropped, and `no-new-privileges`. Rollback is the old image through
`askrigor-research:rollback-9715812` plus root-owned mode-`0640`
`/opt/askrigor/compose.yaml.rollback-9715812`.

The protected runner's first container stopped before network evaluation
because the pinned Node slim image lacked Git, which the commit/case-byte proof
requires. TDD added `Dockerfile.public-review`, pinning Node `24.18.0` by image
digest and Debian Git `2.39.5-0+deb12u3`. The verified toolchain image ID is
`sha256:01d6e903b4590df22e9ed3a3432ddc1ad3164ba762f63f17dc646ba3437f905b`.
The source checkout was reconstructed from the exact Git archive, raw commit
object, and expected tree ID before each accepted run; the runner reported a
clean commit and compared the working case file with `git show` at that commit.

Final full run `20260815T110708.728Z-baa07445` started
`2026-08-15T11:07:08.728Z` and finished `2026-08-15T11:08:05.172Z` from clean
commit `8ed8c0f7aaab9609dfb067780c05838f98903bab`. The endpoint was
`https://mcp.askrigor.com`; the case-file SHA-256 was
`daf2b0e895956d759f382f9d592632d5ea094b0a28f0711efdc9c0f09f7bd7c1`.
All 17 discovered tools were verified read-only and had ordered-name SHA-256
`d79698ff9e1d124c17c0e7244194786fb989af6a9e96872358f9760f3cddb0f8`.
All 9/9 direct cases passed, including the repaired terminal YouTube receipt.
Six of nine `chat-latest` cases passed. `positive-6`, `negative-1`, and
`negative-2` remain `BLOCKED` at the model layer because OpenAI returned only
opaque success/error receipts, which cannot prove conditional continuation,
pre-provider schema rejection, or the explicit video-visibility boundary.
Their exact tool selections are present; the direct results pass; neither is
misrepresented as model proof. Total Responses usage was 6,272 tokens.

The sanitized `report.json` SHA-256 is
`5f624939b877c39eb5274e16c4a13044d0a3edc49b231e067413365bee5c66bc`;
the sanitized `SUMMARY.md` SHA-256 is
`f7a24bf50b502b9d3f558fa51d21c9719a6ee82373b0a50ad7b8f800bfd4fe2e`.
`SHA256SUMS` verified both files, and `scanEvidenceSafety` passed without a
secret value. Raw protocol text, comments, provider bodies, model text,
continuation tokens, credentials, and private health data are not retained in
the repository.

Lesson closeout: the YouTube response-shape repair is project-specific. The
separation of direct server proof, API-model selection proof, and product-UI
proof, plus the requirement that a commit-verifying runner actually package
Git, were already explicit in the approved architecture; this run adds
project evidence and no new universal rule. No universal-lesson change is
claimed from this acceptance.

## YouTube continuation and terminal-refetch release — 2026-08-17

PR #19 merged the bounded Action continuation handle as
`56b3dff6d7c32b732f37c6a59bf9e3a9c5506829`. PRs #20 through #22 then
reconciled moving and exact continuation overlap and made terminal refetch
errors fail closed. The PR #22 candidate image
`sha256:725cc20b4830e53989f0268ace1597838ce74948873c7f6240788da28d90487b`
passed its pre-traffic gate but was automatically rolled back after the exact
product video reached a terminal 149-record corpus and YouTube rejected its
100-ID sample-refetch batch with HTTP `400 invalidFilters`. Production returned
to image
`sha256:b6bf6df118e47eff766371717b48c3b732edf91053ef9e7915eb55edb5534a95`
with the prior Compose hash and unchanged Caddy before repair work continued.

A bounded private probe retained no identifiers or comment text and established
the provider boundary directly: 50 valid comment IDs returned HTTP `200` and 50
items; 51 returned HTTP `400 invalidFilters` and zero items. PR #23 added a
failure-sensitive test that models that response above 50, observed the test
fail against the 100-ID implementation, and then introduced one named 50-ID
batch constant. The focused segment suite passed 22/22. Independent review
passed the affected segment and audit suites 49/49 and found no Critical,
Important, or Minor issue. The complete host-boundary gate passed typecheck,
build, 50 test files, and 914 tests; one file and five credential-gated tests
were skipped as declared.

PR #23 head `11f3a68a73bc68bc23f1854b6bd8d4c06f9b843f` merged as
`905ac22ab42479c15ff0d6385a51de864271f862`. PR deterministic run
`31989179171`, workflow-policy run `31989179207`, and CodeQL run
`31989177726` passed. Post-merge deterministic run `31989275597`,
workflow-policy run `31989275612`, and CodeQL run `31989275700` also passed.

The exact merge image runs as unprivileged `node` from `/app`, is `amd64`, and
has image ID
`sha256:b7273c24f568bbd8d9c9f5a4758a89e08b9142af4d23a18d79a62e6df0b3b067`.
Its disposable gate passed a read-only root filesystem, dropped all
capabilities, `no-new-privileges`, health `200`, 18 Action operations,
unauthenticated lesson `401`, and startup-only logs. Only `research-mcp` was
recreated. Caddy remained
`06ead4ec8e2aeeac99d13e36dc31b7c474a07d3bc61e3638275086daee174cf1`;
that release's accepted Compose SHA-256 was
`c806aabe2949f976ab882baabae19c28216233b915b62f36a5ed3cc5c51284d9`.

Fresh public acceptance returned health `200`, exact 18-operation OpenAPI,
lesson isolation `401`, the current HRP and Universal identities, and the exact
17-tool ordered MCP inventory. Video `W42rwWD6zjw` remained a one-call,
16-record `api_visible_complete` pass. The exact formerly failing video
`nIRABXSJwSw` completed across two Action calls: call one retained 66 records
and returned the 37-character `arh1_` handle; call two reached 149 cumulative
records, returned a deterministic 111-record sample, ended
`completed_with_access_boundary`, reported no error or continuation, and set
`synthesis_lock:pass`. The partial access status and three limitations preserve
the observed pagination/reply boundaries rather than claiming false complete
coverage. Raw comments, provider responses, continuation values, and
credentials were not retained.

The pre-deployment lesson aggregate at `2026-08-17T19:32:19.089Z` was available:
0 open, 0 needs review, 0 accepted not incorporated, 2 incorporated or closed,
and 0 deletion eligible. The fresh Custom GPT product session now proves the
short-handle relay. The lesson is transferable only with the recorded stateless
MCP counterexample and the privacy, expiry, eviction, restart, and scaling
limits of transient Action state.

## Universal 20.5.13 production freshness rollout — 2026-08-17

Then-current GitHub main `5585a9ca34ce01403044b1085b85d4f2de9783f4` passed all PR and
post-merge deterministic, workflow-policy, and CodeQL checks. The exact
secret-free source archive SHA-256 was
`024cb1f552fddc82b24c89a6c2ca84ba5d8de4a66f76e50e88c4c2e77f0cf283`.
Its pinned Node 24 image built with zero audited dependency vulnerabilities;
the resulting image ID is
`sha256:95b86a1135701149c17125d1a5994e41063f868eefd903a38e28b4c09e0f6953`
and its archive SHA-256 is
`81da2e8e5c9e727e884c20dd560c76537072c5913380334130cd7bc7d14b0cf0`.

The disposable non-root/read-only/capability-dropped/no-new-privileges gate
passed health, exact 18-operation OpenAPI, importer boundaries, lesson `401`,
and Universal `20.5.13` manifest, exact digest, and complete 3-chunk/98,154-byte
load. The production transaction changed only the `research-mcp` image line;
the automatic rollback trap did not fire. Current Compose SHA-256 is
`cf2fa82cbe4ba6e6b9ce515e2f260d07dacf09f1df6ac2feb66cfc485f9c69cf`.
Immediate rollback is `askrigor-research:rollback-5585a9c` plus the mode-`0640`
`/opt/askrigor/compose.yaml.rollback-5585a9c`, whose SHA-256 is
`c806aabe2949f976ab882baabae19c28216233b915b62f36a5ed3cc5c51284d9`.

Fresh public acceptance passed health, the unchanged compact live OpenAPI
SHA-256 `402e369f25a2b27da114c5f018be1c64cc5f8a2ef81983f2588b30c6875438e2`,
Universal exact manifest/integrity/full loading, unchanged HRP `20.5.18`,
unauthenticated lesson `401`, privacy SHA-256
`d73d9557852a17975b345ae20bfe24edc70267a3f595959b2bfb5d7198c26453`,
and the exact 17-tool MCP inventory. Caddy container
`06ead4ec8e2aeeac99d13e36dc31b7c474a07d3bc61e3638275086daee174cf1`
and site release `/opt/askrigor/site/releases/56b3dff6d7c3/site` were unchanged.
No provider request or lesson write was repeated.

## Required submission work remaining

- If unmerged, merge the universal transcript/evidence-frontier follow-up;
  deploy its runtime and privacy notice, install the exact generated
  Instructions with empty Knowledge; and pass fresh
  candidate-selection, intervention-decomposition, comparator-scope,
  heterodox-weighting, and matched-video product cases before
  resuming portal work. Do not retry the rejected lesson candidate.
- The owner reports individual identity verified and business/organization
  verification currently unavailable after a signup timeout. Choose the
  publisher-identity path, then complete matching listing URLs, country
  availability, and the portal's HTTPS domain-verification challenge. Do not
  infer the business retry interval.
- Submit the fixed production URL, select **Scan Tools**, and compare discovered
  tool metadata with `docs/public-review-checklist.md`. Any metadata change
  requires deploy → rescan → review.
- Record and host the privacy-safe reviewer demo using
  `docs/public-submission-demo-recording.md`, then publish the real URL and
  non-secret receipt through the protected repository workflow.
- Resolve or expressly accept the three opaque remote-MCP model receipts from
  run `20260815T110708.728Z-baa07445`; the 9/9 direct pass must not be used as a
  substitute for model-layer proof.
- Confirm the portal's final scanned responses expose no credentials, debug
  payloads, internal identifiers, or data outside the reviewed privacy notice.
- Update each portal-only state in
  `docs/public-submission-packet-v0.1.0.json` from direct evidence; do not infer
  hosted completion from repository files.

## Local release verification record

These commands were run from the Task 16 worktree on 2026-08-11. Live provider
checks run only with safely available credentials; credentials are never printed.

| Command | Task 16 result |
| --- | --- |
| `npm ci` | Passed outside the restricted sandbox: 156 packages installed and 161 audited; npm reported 0 vulnerabilities. The sandboxed attempt was blocked by an `esbuild` postinstall `EPERM`. |
| `npm run verify` | Passed outside the restricted sandbox after the runner repair: typecheck and build passed; Vitest reported 17 passed files, 1 skipped file, 337 passed tests, and 5 guarded live tests skipped. The sandboxed attempt failed only where loopback-server tests hit `listen EPERM` on `127.0.0.1`. |
| HRP 20.5.16 verification | Typecheck and build passed; the focused protocol/MCP suite passed 49/49; the serialized full suite passed 386 tests with 5 credential-guarded skips; site validation covered 4 pages; public-site deployment tests passed 28/28; plugin validation and diff checks passed. Independent re-review found no remaining Critical or Important issue. |
| Forum Signal router verification | Router/audit/MCP/release focused checks passed 54/54; post-latency-fix audit/MCP checks passed 46/46; typecheck and build passed; the final serialized full suite passed 401 tests with 5 credential-guarded skips; site validation covered 4 pages; skill validation and diff checks passed. |
| Historical credential-bound live suite | Recorded production evidence at `/opt/askrigor/validation/live-suite-20260811T172130Z-71611`: provider process exit 0 and 5/5 passed, including PubMed, Crossref, and YouTube. The old wrapper exit 1 was solely an ANSI-grep false negative. This run is historical, superseded by v6 below. |
| Current credential-bound live suite | Controller-run v6 evidence at `/root/askrigor-validation-stage/live-suite-v6-6a9d536b7845`: clean archive/image build, server-side scan, ANSI-safe parser exit 0 with exactly `Test Files 1 passed (1)` and `Tests 5 passed (5)` and zero skips, relative evidence checksum, and `Live suite v6 accepted` status all passed. The controller's runner accessed server-side runtime environment without exposing, reading back, or logging provider keys; evidence was read only after the fail-closed scan. This worktree contains no secret and did not independently rerun the remote suite. |
| `npm audit --omit=dev` | Passed outside the restricted sandbox: 0 production-dependency vulnerabilities. The sandbox could not resolve `registry.npmjs.org`. |
| `npm outdated` | Exit 0 with no output; no outdated packages reported. No dependency upgrades were attempted. |
| Public-review automation candidate | TDD observed the missing-Git toolchain and underspecified compound prompt fail before their fixes. Focused review/release tests passed 69/69. The pre-evidence canonical `npm run verify` passed typecheck/build with 42 passing files, one skipped credential-gated file, 842 passing tests, and five credential-gated skips. Final post-evidence verification is recorded by the public-review PR checks rather than this pre-evidence row. |

## Live-runner status-parser repair

`npm run test:live` now sets `NO_COLOR=1`, and
`scripts/assert-live-suite-output.mts` independently strips ANSI escape
sequences before requiring process exit 0, exactly one passing test file,
exactly five passing tests, and zero skipped tests. Its CLI emits only a fixed
success statement rather than the provider log. Unit coverage proves that an
ANSI-split successful Vitest summary is accepted and that nonzero exits,
skipped tests, failed test files, and a color-enabled package command are
rejected. The repair does not turn the historical wrapper exit into a fresh
wrapper run.

## v3 Docker preflight finding and v4 replacement

The v3 isolated runner failed during its Docker image build, before a provider
request: `npm run build` reported `TS2307` workspace-resolution errors for
`@askrigor/contracts`, `@askrigor/protocol`, and `@askrigor/sources`. No provider request occurred. Root cause was Docker running `npm ci` after only copying the
root package metadata, so npm could not create workspace links. The v4
Dockerfile copies `apps` and `packages` before `npm ci`; a clean tracked v4
archive then completed `npm ci`, `npm run build`, and the non-root final image
locally. Do not reuse the failed v3 archive or remote stage; v4 requires a new
root-owned stage and a fresh remote validation run.

## v4 scanner failure and v5 replacement

The v4 provider container started, but the server-side scanner failed closed
before evidence publication with `Live-suite output contains configured sensitive
value`. No raw log was exposed; the `--rm` container destroyed it, and no evidence was published. Synthetic TDD reproduced the likely false positive without reading runtime values: `NCBI_TOOL=askrigor` matched the normal npm banner `askrigor@0.1.0`. v5 exact-scans only actual configured API keys (`YOUTUBE_API_KEY` and optional `NCBI_API_KEY`), retains generic `AIza[0-9A-Za-z_-]{35}` and API-key-assignment checks, and does not exact-scan the nonsecret tool label, emails, or public video ID. Do not reuse the failed v4 archive or remote stage.

## v5 startup failure and v6 replacement

The v5 scanner accepted and published a sanitized log, but Vitest exited before providers with `ENOENT` while creating `/app/node_modules/.vite-temp` under the read-only root filesystem. No provider request occurred. V6 adds a writable noexec/nosuid tmpfs at that exact Vite path. The v5 evidence checksum also used absolute `/evidence/provider-test.log`; v6 writes the checksum relative to its evidence directory so the host-side `sha256sum -c` command succeeds. Do not reuse the failed v5 archive or remote stage.

## v6 remote integration evidence

Controller-run remote validation at `/root/askrigor-validation-stage/live-suite-v6-6a9d536b7845` is green. The archive checksum and clean image build passed; the server-side scanner accepted the log; and the ANSI-safe parser accepted process exit 0, exactly `Test Files 1 passed (1)`, exactly `Tests 5 passed (5)`, and zero skipped tests. The evidence-side relative checksum verified with `(cd evidence && sha256sum -c provider-test.log.sha256)`, and `status.txt` reported `Live suite v6 accepted`. This is recorded remote evidence; this worktree did not rerun providers or access runtime secrets.

## Anonymized Lesson Action live acceptance — 2026-08-14

Before Action traffic was enabled, the transactional site installer activated
the August 13 privacy/terms disclosure from source commit
`56d13b73e74c377cfd6d513a5f4ceeec9949e0bf` as site release
`56d13b73e74c`, recreated only Caddy, and preserved the research container.
All four public pages passed the release archive and direct HTTPS acceptance.

The append-only duplicate path was accepted from exact code revision
`1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a`. Its secret-free source archive
SHA-256 was `d128247d2aa12a830514e515c9f74666a4e0558955f3de60a301af1ec2690600`;
the resulting non-root image ID is
`sha256:b78653b181346727eefedc31c903e93818d51a88cd4ad967d91e936e9d8f57a8`.
The isolated no-provider image gate passed a read-only root filesystem, dropped
all capabilities, `no-new-privileges`, health `200`, Action OpenAPI `200`,
unauthenticated Action `401`, and fixed startup-only logs.

The final deployment recreated only `research-mcp` as container
`85fcd68645d24d2b7d941a2a845f8fc2bf13b45f297ce6a8868c613f3e67e37c`.
Caddy remained container
`5d849df160bda42b924feef49a4aff26a7d8df5e5cfa7f0d5e16ac378c43c23e`.
The only Action-state mount is the intended read-write bind from
`/opt/askrigor/state/actions` to `/var/lib/askrigor-actions`; the source is UID
and GID 1000, mode `0700`. The immediately usable Actions-disabled rollback is
the prior image
`sha256:4d397a3c5bf5eff3c0ed350720a16e92a20786871072527732a1d9c03487ee81`
plus
`/opt/askrigor/releases/1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a/compose.pre-actions.yaml`.

Fresh public checks passed health `200`, Action OpenAPI `200` with SHA-256
`9dd8caee3e85a3b7a581ccf05e7e0f6b59c8395390c4fd802a9c4911518dcad3`,
and unauthenticated Action `401`. MCP initialization and `tools/list` returned
the existing 17 tools; the ordered-name SHA-256 remained
`5719a8539fbf75c8bb2db58fc5aa7849c8ed307216544c221ab602bf7b983b29`.
The Universal manifest remained version `20.5.11`, revision date `2026-08-07`,
SHA-256 `1a4c61627b593a8ddabbc68608f69d4c7062896535b480056b6b5efe5f47d9aa`;
the HRP manifest returned version `20.5.17`, revision date `2026-08-13`, SHA-256
`d09d60c5c9b7694c08520314349007edccb6283e3d4d991f74cc209ff6934242`.

The first non-stored synthetic attempt failed closed as `privacy_rejected`
before GitHub. Production was immediately restored to the prior image with
Actions disabled, no Action mount, healthy service, and unchanged Caddy. One
GitHub-disconnected diagnostic of the identical input then returned completed
HTTP `200`, `safe:true`, zero risk codes, exact optional-metadata preservation,
a passing deterministic post-screen, and a committed charge of 101,550
nano-USD. This established a conservative model false negative rather than a
transport, metadata, or post-screen failure. After a fresh transactional
activation, the bounded acceptance retry returned HTTP `200`, status
`existing_candidate`, public ID `ARL-0004`, occurrence count 2, and
`retryable:false`.

Private verification found the synthetic issue body byte-identical, exactly one
canonical generated occurrence comment, exact metadata keys `fingerprint`,
`occurrence_count`, and `observed_at`, and no repeated candidate text. A
credential-shaped synthetic request then returned local HTTP `422`
`privacy_rejected`; aggregate AI spend remained unchanged at 40,354,200
nano-USD and GitHub remained unchanged. Post-isolation health and the 17-tool
inventory passed again. The synthetic issue was labeled `rejected`, had
`needs-review` removed, received the note `Synthetic live acceptance only; not
a product lesson.`, and was closed as not planned. Its body remained unchanged.
`npm run lessons:status` then reported `open_candidates:0`, `needs_review:0`,
`accepted_not_incorporated:0`, `incorporated_or_closed:1`, and
`deletion_eligible:0`.

Final pre-evidence implementation verification passed `npm run verify` with 39
passing files, one skipped credential-guarded file, 776 passing tests, and five
skipped credential-guarded tests. Typecheck and build passed. `npm run
test:site` validated all four public pages. No private issue body, private URL,
credential, raw model output, or raw request is retained in this evidence.
