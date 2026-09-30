# Codex Worker Directive — MAST Fresh Validation Round 4

## Objective

Create and execute a new prospective AskRigor MAST validation study that removes the unnecessary post-Send browser-restart recovery prerequisite discovered in Round 3.

The owner outcome remains OPEN: obtain a trustworthy fresh MAST validation result for the repaired AskRigor protocol.

Round 3 is historical process evidence only:
- no Round-3 MAST payload was opened;
- no Round-3 family was exposed;
- generation remained 0/120;
- the synthetic crash-recovery acceptance failed because ChatGPT temporary conversations were not recoverable after a deliberate Brave restart;
- therefore Round 3 was correctly stopped before response #1.

Do not resume or rewrite Round 3. Start a new study identity.

Suggested:
- name: `MAST Fresh Validation Round 4`
- study ID: `askrigor-mast-fresh-validation-round-4-20260919`
- branch: `task/mast-fresh-validation-round-4-20260919`

## Requirement correction

The Round-3 requirement that a temporary ChatGPT conversation must survive and be recoverable after a deliberate browser-process restart was an assistant-added assurance requirement, not an owner requirement and not an externally hard MAST requirement.

It is now rejected as a mandatory prerequisite.

Do NOT require:
- deliberate post-Send browser kill/restart recovery;
- guaranteed recovery of temporary ChatGPT conversations after browser restart;
- another round of architecture expansion to make temporary chats persistent.

The correct resilience boundary is:

- prevent browser loss through a dedicated durable supervised browser;
- pre-Send failures may retry within the frozen attempt rule;
- after Send, never duplicate the submission;
- if browser/session loss makes the already-sent response unrecoverable, fail closed and terminate the validation round as `INDETERMINATE`.

That failure mode is acceptable as an integrity boundary; it is not a prerequisite capability that must be eliminated before the study can start.

## Historical family exclusions

Exclude all prior development/calibration/generated/exposed families:

### Original development/calibration
`All001, Card001, Derm001, Endo002, GI004, Heme010, ID008, Nephro005, Neuro007, Pulm005`

### Round 1 exposed
`Card005, Derm009, Endo009, Heme004, ID006, Neuro004, Pulm009`

### Round 2 exposed/development
`ID003, GI007`

Round 3 exposed no MAST family and therefore adds no exclusions.

## Round-4 cohort

Use the same 10 still-fresh families:

`All006, Card002, Derm006, Endo007, GI002, Heme002, Nephro003, Nephro009, Neuro003, Pulm001`

Reserve:

`All008`

as `LIMITED_RESERVE_NOT_CONFIRMATORY`.

Design:

`10 families × 4 arms × 3 trials = 120 generation responses`

Arms:
- A = `MAST_DEFAULT`
- B = `MAST_THOROUGH`
- C = `UNIVERSAL_ONLY`
- D = `UNIVERSAL_PLUS_HRP`

Primary comparison: `D-B`
Secondary comparison: `D-C`

## Models / credit budget

Engineering:
- GPT-5.6 Sol Medium.
- High only for a concrete unresolved implementation/debugging blocker.
- No Extra High for deterministic engineering.

Generation:
- GPT-5.6 Sol Extra High.
- Fresh temporary unpersonalized conversation per submission.
- Tools/retrieval disabled.

J1/J2:
- GPT-5.6 Sol Extra High.

J3:
- Latest Pro 5/5 only for the preregistered disagreement trigger.

Never rerun sealed successful responses or judgments.

## Reuse the Round-3 durable VPS browser

Reuse the valid Round-3 infrastructure where unchanged:

- dedicated VPS browser profile;
- dedicated persistent display/Xvfb;
- systemd-supervised Brave;
- loopback-only CDP;
- Playwright;
- one managed ChatGPT tab;
- exact source → VPS packet → composer hash/length equality;
- packet transfer and exposure controls;
- frozen J1/J2/J3 evaluation pipeline;
- alias-safe joins;
- benchmark-target-integrity separation.

Do not return to:
- owner laptop browser;
- TryCloudflare;
- public relays;
- clipboard;
- manual copy/paste;
- attachment upload;
- tab fan-out.

RDC may be used only as an optional remote-host access/recovery mechanism. It is not a semantic component of the study.

## Normal-path browser durability qualification

Before MAST response #1, perform a bounded **normal-path durability acceptance**, not a deliberate crash-recovery test.

The acceptance must use a small harmless synthetic prompt and the exact generation model/session configuration.

Required acceptance:

1. dedicated systemd Brave service is healthy;
2. browser is independent of XRDP session lifetime;
3. CDP attaches;
4. correct ChatGPT account/session is authenticated;
5. GPT-5.6 Sol Extra High is selected;
6. temporary/unpersonalized fresh conversation is established;
7. synthetic prompt is inserted and read back exactly;
8. prompt is sent once;
9. response is captured and sealed normally;
10. browser service remains healthy through completion;
11. a fresh temporary conversation can be established afterward in the same managed tab;
12. service/CDP remain healthy for a bounded post-completion soak period.

Keep the synthetic prompt tiny to minimize inference spend.

Do NOT kill/restart Brave after Send as part of acceptance.

Also run deterministic process-supervision tests without model calls:
- stop Brave before Send and verify systemd restart;
- disconnect/reconnect CDP before Send;
- verify a pre-Send failure is safely retryable;
- verify a simulated post-Send disconnect produces `NO_RESEND / STOP_ROUND`;
- verify the browser does not depend on XRDP logout.

If the normal-path synthetic acceptance fails, fix and re-freeze before response #1.

## Runtime browser health guard

Before each MAST Send, verify:
- systemd service healthy;
- expected browser process/profile/flags;
- CDP reachable;
- exactly one managed ChatGPT content tab, or at most two during bounded transition;
- authenticated state;
- exact model / Extra High;
- temporary / unpersonalized / fresh chat;
- exact source/destination/composer identity.

After Send:
- write the frozen `SENT` receipt immediately;
- monitor browser/CDP health and response completion;
- capture and seal normally.

If browser/CDP is lost **before Send**:
- no provider request occurred;
- recover browser state;
- retry within the frozen pre-Send attempt ceiling.

If browser/CDP is lost **after Send**:
- do not resend;
- attempt only non-invasive recovery of the already-sent response if it is naturally available;
- recovery is optional, not required;
- if exact request identity and response cannot be proven, emit the structured ambiguity receipt;
- stop the entire study;
- final disposition `INDETERMINATE`;
- submit no later MAST prompts.

Do not modify the study after response #1 to improve crash recovery.

## Freeze boundary

Before response #1, freeze/hash-bind the complete Round-4 executable state, including:
- cohort/exposure ledger;
- generation packet builder;
- packet transfer;
- browser service definitions and exact runtime flags;
- Playwright transport;
- model/session checks;
- pre-Send exactness checks;
- immediate `SENT` receipt;
- browser health monitoring;
- normal response capture/sealing;
- post-Send `NO_RESEND / STOP_ROUND` behavior;
- judge/adjudication/unblind pipeline;
- scoring;
- benchmark-target-integrity reporting;
- PASS/FAIL/INDETERMINATE rule.

Create a new Round-4 freeze commit/PR and require green CI before response #1.

Do not merge historical Round-3 semantics into Round 4 silently.

## Frozen decision rule

Use the 10-family rule already designed for Round 3:

- P1: `mean(D-B) > 0`
- P2: `median(D-B) > 0`
- P3: at least `6/10` families have `D-B > 0`
- P4:
  - D severe commissions minus B severe commissions ≤ 1 over equal 30-response denominators;
  - no family has D-minus-B severe-commission excess > 1
- P5:
  - `mean(D-C) > 0`;
  - D-C wins ≥ D-C losses

PASS:
- all 120 generation records and all required judging/adjudication resolve;
- equal denominators;
- no material integrity drift;
- P1-P5 all true.

FAIL:
- all records resolve cleanly; and
- P4 is false, or at least 3 of P1/P2/P3/P5 are false.

INDETERMINATE:
- unresolved denominator/integrity condition;
- unresolved post-Send ambiguity;
- material post-response implementation drift;
- complete mixed result that is neither PASS nor FAIL.

Freeze this rule before response #1.

## Benchmark-target integrity

Preserve:
- raw MAST score;
- benchmark conformity;
- clinical-validity review;
- `BENCHMARK_TARGET_CONFLICT`;
- material effect on interpretation.

Never rewrite the raw score because the clinical target is contested.

Do not tune AskRigor during the study.

## Invalidation

After response #1, any material change to protocol, cohort, model/effort, generation semantics, judge configuration, adjudication, join, scorer, benchmark-integrity logic, or decision rule invalidates the study.

If invalidated:
- stop;
- preserve artifacts;
- mark exposed families DEVELOPMENT;
- do not claim efficacy/generalization.

## Completion receipt

Return only a concise chat receipt. Put long reports in artifacts.

Include:
- branch / frozen commit / PR;
- 10-family cohort;
- `All008` reserve status;
- normal-path synthetic durability acceptance result;
- planned/completed generation count / 120;
- J1/J2/J3 counts;
- D-B mean/median/wins;
- D-C mean/median/wins/losses;
- severe commissions;
- omission/commission summary;
- benchmark-target conflicts;
- integrity failures;
- final PASS / FAIL / INDETERMINATE;
- whether validity remained intact after response #1.

## Stop condition

Do not keep building new recovery infrastructure merely because temporary chats cannot survive an intentional browser restart.

The decision-changing question is now whether the supervised normal browser path is stable enough to complete the prospective study.

If normal-path acceptance passes, proceed to the benchmark.

If a post-Send ambiguity occurs during the real benchmark, fail closed and stop immediately rather than burning the remaining inference budget.
