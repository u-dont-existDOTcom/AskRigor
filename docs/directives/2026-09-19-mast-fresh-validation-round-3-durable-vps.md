# Codex Worker Directive — MAST Fresh Validation Round 3

## Controlling objective

Create and execute a new, separately frozen AskRigor MAST validation study after Round 2 terminated `INDETERMINATE`.

Round 2 is historical process/development evidence only. Do not resume it, add more prompts to it, or reinterpret its single sealed response as efficacy/generalization evidence.

The new study identity is:

- Name: `MAST Fresh Validation Round 3`
- Suggested study ID: `askrigor-mast-fresh-validation-round-3-20260919`
- Suggested branch: `task/mast-fresh-validation-round-3-20260919`
- Classification: `VALIDATION_NOT_CONFIRMATION`

Reuse valid Round-2 harness code where appropriate, but create new Round-3 manifests, preregistration, packets, runtime receipts, and report namespace. Preserve Round-2 frozen/historical artifacts unchanged.

## Frozen historical disposition

Round 2 terminal state:

- Run 001 was sent once.
- Brave exited after Send and before initial response capture.
- The already-sent response was later recovered and sealed without resending.
- Final Round-2 status: `INDETERMINATE`.
- Final Round-2 sealed count: `1 / 144`.
- No further Round-2 prompts are authorized.
- `ID003` and `GI007` are DEVELOPMENT/exposed and may not be used as fresh validation families.

Preserve the existing Round-2 PR and receipts as historical evidence. Do not “complete” that study retroactively.

## Family eligibility

Exclude all prior development/calibration/generated/exposed families:

### Original development/calibration
- `All001`
- `Card001`
- `Derm001`
- `Endo002`
- `GI004`
- `Heme010`
- `ID008`
- `Nephro005`
- `Neuro007`
- `Pulm005`

### Round 1 generated/exposed
- `Card005`
- `Derm009`
- `Endo009`
- `Heme004`
- `ID006`
- `Neuro004`
- `Pulm009`

### Round 2 newly exposed/development
- `ID003`
- `GI007`

Use these 10 still-fresh validation families:

- `All006`
- `Card002`
- `Derm006`
- `Endo007`
- `GI002`
- `Heme002`
- `Nephro003`
- `Nephro009`
- `Neuro003`
- `Pulm001`

Preserve:

- `All008`

as a `LIMITED_RESERVE_NOT_CONFIRMATORY`.

Do not describe one reserved family as a broad independent confirmation cohort.

Round 3 therefore uses:

`10 families × 4 arms × 3 trials = 120 generation responses`

Do not expand the cohort without owner authorization.

## Four-arm design

Keep the same four-arm design:

- A = `MAST_DEFAULT`
- B = `MAST_THOROUGH`
- C = `UNIVERSAL_ONLY`
- D = `UNIVERSAL_PLUS_HRP`

Use 3 independent trials per family per arm.

Primary comparison:

`D - B`

Secondary comparison:

`D - C`

Keep A and C for context.

## Models and credit budget

Engineering / deterministic implementation:

- GPT-5.6 Sol, Medium thinking.
- Escalate to High only for a named unresolved implementation/debugging blocker.
- Do not use Extra High for ordinary coding, artifact handling, hashing, scoring, or deterministic tests.

Actual MAST generation:

- GPT-5.6 Sol
- Extra High
- Fresh temporary unpersonalized ChatGPT conversation for every submission
- Tools disabled
- No retrieval

Primary judges J1/J2:

- preserve the established frozen MAST configuration:
  - GPT-5.6 Sol
  - Extra High

J3:

- preserve the established frozen adjudicator configuration:
  - Latest
  - Pro
  - 5 of 5
- invoke only for the preregistered disagreement trigger.

Never rerun a successfully sealed generation or judgment.

## Critical architecture change: dedicated durable VPS browser

The Round-2 failure was browser-process durability, not RDC transport or packet integrity.

Round 3 must not depend on an XRDP login session or an ad-hoc Brave process.

Build a dedicated, study-owned browser runtime on the VPS before response #1.

### Required topology

```text
Codex / orchestrator
    ↓
authenticated machine-to-machine channel
    ↓
VPS private filesystem
    ↓
dedicated persistent display/runtime
    ↓
systemd-supervised Brave owned by cloudbrowser
    ↓
loopback-only CDP endpoint
    ↓
Playwright
    ↓
one managed ChatGPT tab
```

RDC may be used to inspect/recover the VPS mechanically, but it is not part of the benchmark semantic path and is not a mandatory study dependency.

### Dedicated browser requirements

Create a dedicated Round-3 browser profile separate from other Mission Control/browser work.

Suggested profile:

`/home/cloudbrowser/.config/brave-mast-round3`

Do not share the active Mission Control browser profile during generation.

Create a stable virtual display independent of XRDP, for example a dedicated Xvfb display.

Run Brave under a systemd service with:

- `User=cloudbrowser`
- dedicated Round-3 profile
- loopback-only CDP, on a dedicated port such as `9224`
- `Restart=always` or equivalent durable restart semantics
- bounded restart delay
- no dependency on an interactive XRDP session
- no session-crashed prompt blocking automation
- no background tab fan-out

Keep one managed ChatGPT content tab in steady state.

Allow at most two tabs during bounded recovery/bootstrap.

Fail closed before opening a third study-owned content tab.

The exact unit/service configuration, wrapper scripts, browser flags, CDP port, profile path, and display configuration must be committed or otherwise hash-bound into the frozen study environment.

At runtime, verify the installed service configuration and process command line against the frozen hashes/expected values.

## Authentication

The dedicated Round-3 profile must be authenticated to the intended ChatGPT account before generation.

It is acceptable to clone/copy the already-authenticated VPS profile into the dedicated Round-3 profile before the freeze, provided:

- the source and destination are owned by the same VPS user;
- no benchmark conversation state is intentionally carried as study evidence;
- the dedicated profile is not simultaneously opened by another Brave process;
- the resulting Round-3 browser can prove the expected account/session and model controls.

If one human login gesture is genuinely required, ask only for that one login. Do not ask for packet copy/paste.

## Packet transport

Transfer the 120 frozen packets once to a private VPS directory.

For every packet:

- verify source SHA-256 before transfer;
- verify destination SHA-256 after transfer;
- require exact equality before generation eligibility;
- keep packets out of GitHub/public URLs;
- do not use file attachments;
- do not use clipboard;
- do not use human relay;
- do not print the large prompt into Codex/tool logs.

Within the VPS generation process:

1. read the packet locally;
2. compute its frozen normalized identity;
3. insert it directly into the ChatGPT composer;
4. read the complete composer back;
5. require source = destination = composer hash/length equality;
6. verify model, Extra High, temporary chat, unpersonalized state, fresh conversation, no attachments, no tools;
7. only then Send.

## Prospective post-Send crash recovery

Round 3 must freeze recovery behavior before response #1.

After Send, immediately persist a `SENT` receipt containing at minimum:

- study ID
- run ID
- attempt
- exact input hash
- source/destination/composer equality
- model/effort/chat-state attestation
- browser profile identity
- browser service identity
- CDP endpoint
- send timestamp

If CDP/browser disconnects after Send:

### Never resend automatically

A post-Send disconnect enters `RECOVERY_EXISTING_SUBMISSION`.

The supervisor/service may restart the dedicated Brave process using the same dedicated Round-3 profile.

The orchestrator may reconnect to the restarted browser and recover only the already-sent conversation.

### Identity proof for recovery

A recovered page/conversation is acceptable only if the already-submitted user message can be read back and its normalized full-text SHA-256 equals the frozen packet hash for that run.

Require exactly one matching recoverable conversation/session.

If zero or multiple candidates match, fail closed.

Do not infer identity from title, timing, or order alone.

If the assistant response completes and the exact submitted user-message identity is proven:

- capture the existing assistant response;
- capture required provider/tool provenance;
- seal normally;
- continue to the next run.

If recovery cannot prove exact request identity within the frozen recovery window:

- produce a structured ambiguity/failure receipt;
- stop the entire validation round;
- disposition becomes `INDETERMINATE`;
- do not submit later runs.

No blind resend is allowed.

## Browser durability acceptance before benchmark response #1

Do not start the 120-response study merely because CI is green.

Before response #1, perform a live synthetic durability/recovery acceptance using the frozen Round-3 browser/runtime.

Use a small harmless synthetic prompt.

The synthetic test must prove:

1. dedicated browser service is running independently of XRDP;
2. CDP attachment works;
3. a temporary unpersonalized ChatGPT conversation can be created;
4. exact model/mode controls can be inspected;
5. a prompt can be inserted and verified;
6. Send occurs;
7. the browser process is intentionally terminated/restarted after Send;
8. systemd restarts the browser;
9. Playwright reconnects;
10. the already-sent user message is recovered and hash-matched;
11. the already-generated assistant response is recovered without resending;
12. the response is sealed through the same recovery machinery.

Keep this synthetic prompt very small to minimize inference spend.

Do not use a MAST family for this acceptance test.

If this crash/recovery test fails, fix/re-freeze before benchmark response #1.

If any implementation changes after the live synthetic test, rerun the relevant acceptance before response #1.

## Freeze boundary

Before benchmark response #1, freeze and hash-bind:

- Round-3 cohort manifest
- exposure ledger
- dispatch seed commitment
- generation packet builder
- packet transfer code
- systemd/Xvfb/browser service definitions
- browser wrapper/flags
- dedicated profile/runtime identity
- CDP transport implementation
- model/session attestation
- pre-Send equality checks
- `SENT` receipt implementation
- post-Send recovery implementation
- response capture/sealing
- blind-packet builder
- J1/J2 orchestration
- J3/adjudication
- explicit unblind
- alias-safe join
- scorer
- omission/commission/severe-commission logic
- benchmark-target-integrity review
- final report generator
- structured failure/invalidation receipts
- frozen PASS/FAIL/INDETERMINATE rule

Every stage must runtime-verify the relevant frozen hashes/identities.

## Blinding

Use opaque response IDs.

Judges must not receive:

- arm labels;
- protocol identity;
- expected comparative result;
- other-arm responses;
- aggregate results.

Preserve J1 and J2 raw judgments independently.

Use J3 only for the preregistered disagreement trigger.

Preserve raw judgments and adjudicated outputs separately.

Do not unblind until required judgment coverage is complete.

## Round-3 decision rule

Freeze this rule before generation.

Family-arm score:

Arithmetic mean of the 3 final raw F1-weighted trial scores.

Define:

- P1: `mean(D-B) > 0`
- P2: `median(D-B) > 0`
  - for 10 families, median = mean of the 5th and 6th ordered family differences
- P3: at least `6 of 10` families have `D-B > 0`
- P4:
  - D severe commissions minus B severe commissions is at most 1 over equal 30-response denominators; and
  - no family has a D-minus-B severe-commission excess greater than 1
- P5:
  - `mean(D-C) > 0`; and
  - D-C family wins are at least D-C family losses

PASS:

- all 120 generation records resolve;
- required judgment/adjudication coverage is complete;
- equal arm denominators hold;
- no material implementation drift/integrity defect exists;
- P1-P5 are all true.

FAIL:

- all required records resolve cleanly; and
- either P4 is false, or at least 3 of P1/P2/P3/P5 are false.

INDETERMINATE:

- any unresolved denominator/integrity condition;
- any unresolved post-Send ambiguity;
- any material post-response implementation drift;
- any complete mixed result that is neither PASS nor FAIL.

Do not change this decision rule after response #1.

## Benchmark-target integrity

Raw MAST scores remain untouched.

Keep separate:

1. raw benchmark conformity;
2. current clinical-validity review;
3. `BENCHMARK_TARGET_CONFLICT` classification;
4. material effect on interpretation.

A benchmark-target conflict cannot overwrite the raw gate.

Do not change AskRigor during the study because of a disputed benchmark action.

## Invalidation

After response #1, any material change to:

- Universal;
- HRP;
- cohort;
- generation prompt/packet construction;
- generation model/effort;
- browser transport semantics;
- browser recovery semantics;
- judge prompt/configuration;
- adjudication;
- unblind/join;
- scorer;
- decision rule;
- benchmark-integrity logic;

invalidates validation status.

If this occurs:

- stop;
- preserve all artifacts;
- emit an invalidation receipt;
- mark exposed families DEVELOPMENT;
- do not claim efficacy/generalization.

Do not repair the experiment in place after response #1.

## Execution pacing

Generation is sequential unless the frozen design proves safe independent parallel browser/session control.

Do not fan out browser tabs.

Use one dedicated browser process and one content tab.

Resume from sealed artifacts after interruption.

Skip sealed successes.

Do not rerun successful slots.

## Required tests before freeze

Use focused deterministic tests for:

- service/runtime hash tampering;
- browser not running;
- browser restart;
- CDP disconnect before Send;
- CDP disconnect after Send;
- exact user-message hash recovery;
- zero recovery candidates;
- multiple recovery candidates;
- wrong model;
- wrong effort;
- wrong chat mode;
- wrong personalization;
- source/destination/composer mismatch;
- duplicate Send prevention;
- post-Send no-resend enforcement;
- response capture/sealing;
- packet/source hash mismatch;
- malformed generation artifacts;
- score range/type validation;
- alias collision/orphan mapping;
- incomplete judge coverage;
- adjudication coverage;
- decision-rule exactness.

Use deterministic code rather than model calls wherever possible.

Run the repository-required freeze/CI checks once at the proper checkpoint. Do not repeatedly rerun unchanged green full suites.

## Historical artifacts

Preserve Round 1 and Round 2 as historical failed/incomplete validation attempts.

Do not delete or rewrite their evidence.

Round 3 may reference their disposition/provenance but must not treat their scores/responses as validation observations.

## Completion deliverables

Return a concise receipt in chat. Put large reports in repository/private artifacts.

Receipt must include:

- branch
- frozen commit/tree
- PR
- exact source/model/protocol identities
- selected 10 validation families
- `All008` reserve status
- exposure ledger summary
- dedicated browser service identity
- synthetic crash/recovery acceptance result
- planned/completed generation count / 120
- J1/J2/J3 counts
- D-B mean/median/wins
- D-C mean/median/wins/losses
- severe commission comparison
- omission/commission summary
- benchmark-target conflicts
- integrity/failure receipts
- PASS / FAIL / INDETERMINATE
- whether the study remained valid after response #1

## Stop conditions

Stop before response #1 if the durable browser/crash-recovery acceptance is not proven.

Stop after response #1 if any unresolved post-Send ambiguity, frozen-hash drift, model/session mismatch, or other material integrity defect occurs.

Do not spend the remaining inference budget once the frozen rule can no longer yield a valid Round-3 result.

## Final nonclaim

Round 3 is a bounded fresh validation over the remaining eligible MAST families. Even a PASS is not proof that AskRigor is clinically superior in general, and the single `All008` reserve is not a broad independent confirmatory cohort.
