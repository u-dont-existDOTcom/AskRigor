# Proactive Troubleshooting Intelligence (PTI)

Branch: `feature/proactive-troubleshooting-intelligence-20261004`. Status:
development. The candidate protocol text is not approved; nothing here is
merged, released or deployed.

## Owner request

On 2026-10-04 the owner pasted the "AskRigor worker directive — Proactive
Troubleshooting Intelligence development lane" and wrote: "optimize this and
begin working on it". The goal: when a problem's cause is uncertain, AskRigor
should propose, early, the best low-risk, reversible test or action that tells
the explanations apart or fixes the problem, instead of only listing
explanations, repeating what failed, or waiting for the user to find the
answer.

The directive authorizes planning, branch implementation, fixtures, candidate
protocol edits on the branch, and zero-spend evaluation through surfaces the
owner already uses. It does not authorize paid API inference, merge, release,
deployment, publication or a new external service. Protocol text becomes
current only after the owner approves the exact text on the owner questions
page.

## How the directive was optimized

| Directive | Optimization | Why |
| --- | --- | --- |
| Ten reasoning behaviors | Map each to its existing home first; add only what is missing (table below) | Existing gates already cover constraint reconstruction and sequential updating; a parallel PTI module would duplicate them (whole-argument reconstruction lesson) |
| New troubleshooting rules | Two Universal checks inside `evidence_discrimination_gate`, a constraint-map extension, a self-check, one sentence in the always-loaded `reasoning_style` section, a purpose clause that puts troubleshooting into the section index; HRP gets one safety rule, the skin regression case and final check FS212 | The gate is not a core section, so a rule there is unseen on a wiper or Wi-Fi question unless the core pointer and index summary lead to it (task-time activation lesson) |
| Simulated users | Fixed staged scripts: every arm gets the same user messages, whatever it said | Removes simulator variance and simulator-judge leakage; the score is what an arm proposed and when |
| Bare GPT through the ChatGPT app | `codex exec` on the owner's ChatGPT plan, labeled "GPT through Codex, not the ChatGPT app" | Rerunnable and scriptable at $0; MAST's browser driver depended on hard-coded IDs, a lost `/tmp` folder and Mission Control |
| Subjective scoring of A to I | The judge maps each reply's proposed actions to the case's action IDs; code computes the timing, rank and burden metrics | No metric rests on matching words; the judge's output is IDs and small integers (MAST lesson) |
| One judge | Two judges from different families, each blinded; a result counts only if it holds under each | Cross-family rule; judge disagreement is measured instead of hidden |
| Validation cases | Written by separate sealed authors (one Claude agent, one GPT through Codex), only a hash committed until the freeze | Development cases were written by a Claude agent; split authorship limits one family's style |

## The ten behaviors and where they live

| Behavior | Home |
| --- | --- |
| Constraint reconstruction | `high_information_qualifier_check` (existing), now also what provokes the problem as distinct from what only removes the trigger, and each intervention already tried; HRP `LongitudinalCausalConstraintMap` |
| Action generation and ranking | New `discriminating_action_check` |
| Discriminating test | `discriminating_action_check`: prefer an action that could refute the leading explanation; say what each result would mean |
| Matched provocation | New `matched_endpoint_and_attribution_check` |
| Combination attribution | `matched_endpoint_and_attribution_check` |
| Mechanism calibration | `matched_endpoint_and_attribution_check` plus the existing claim-scope gates |
| Local before systemic | `discriminating_action_check` |
| Safety boundary for self-tests | `discriminating_action_check` and HRP `SafeDiscriminatingSelfTest` |
| User-effort minimization | Existing `self_resolution_and_user_effort_minimization_gate`; user effort is a ranking factor; no questions about known facts (existing interview gate) |
| Sequential updating | Existing `reasoning_style` mid-thread update rule and HRP `AlreadyPresentEvidenceUpdateClassification`; no repeat of a failed action |

The exact edits are `tests/fixtures/protocol-edits/2026-10-04-pti-candidate.json`
(Universal 20.5.34 to 20.5.35, HRP 20.6.10 to 20.6.11). The chain tests undo
them to the live bytes, and `tests/pti-candidate-protocol-2026-10-04.test.ts`
checks placement, the safety sentences, the core pointer and the 240-character
index summary.

The skin case is a permanent regression and HRP's `PressureProvokedSkinRetest`
states its answer, so the PTI arm passing it shows the regression holds, not
that PTI generalizes. Generalization is judged on the other development cases
and, finally, on the sealed validation set.

## Prior work (research before reinvention)

- Decision-theoretic troubleshooting (Heckerman, Breese and Rommelse): order
  repairs by probability of fixing over cost, and observe only when that
  lowers the expected cost of repair. Here: rank by chance of fixing, cost and
  effort, and prefer a test whose result changes the next step.
- Delta debugging and half-splitting: the webmail case's extension half-split.
- Naranjo adverse-reaction scale: a positive rechallenge weighs more than a
  dechallenge. Here: the matched provocation, limited to harmless triggers.
- Single-case experimental designs: matched conditions and reversal (put the
  old part back once) as confirmation.
- MAI-DxO and SDBench (sequential diagnosis with test costs): the closest
  benchmark, but it scores diagnostic accuracy and cost, not time to the
  first useful action, its rank, user burden, matched rechallenge or
  calibration.
- MediQ: models often ask nothing or ask naive questions; multi-turn
  evaluations show large drops from single-turn performance; explicit
  hypothesis lists help. Here: staged turns and the "no known facts asked"
  flag.

No benchmark found scores time to the first top action, its rank, the burden
before it, matched provocation and calibration together; that part is new.

## Benchmark

### Cases

Schema `askrigor.pti.case.v1`, contract-tested in `tests/pti-benchmark.test.ts`:
staged user turns; reveal turn `r1` (more attempts that failed) and the
solution turn `r2`; the decision window is every turn before the solution;
constraints with their source turns; an action catalogue in tiers (`top`,
`acceptable`, `low_value`, `failed_or_low_value` with the turn that reported
the failure, `unsafe`), each with its hidden outcome; the matched endpoint;
supported and unsupported claims after the solution; stop and escalation
conditions; severe-failure flags; scoring definitions A to I.

Development set (`evals/pti/cases/development/`, all `DEVELOPMENT`):

| Case | Structure |
| --- | --- |
| `skin-pressure-prickle` | Owner's case, deidentified: pressure-provoked skin, failed attempts, combination fix (permanent regression) |
| `wiper-chatter-haze` | Surface contact against a remote explanation (motor, linkage) |
| `washer-heavy-spin-banging` | Provocation-dependent; a quiet small load is called a fix |
| `pepper-seeds-not-sprouting` | A fails, B fails, A plus B works |
| `wifi-evening-slowdown` | Obvious attempts already failed; split the path at the failing time |
| `webmail-attach-button-dead` | Configuration-specific; private window, then half-split |
| `external-drive-backup-dropouts` | Intermittent connection; one-element swap; back up first |
| `morning-stuffiness-home-only` | Mild environmental health trigger; confounded natural contrast |
| `speaker-hum-laptop-connected` | Power and earth interference; unsafe ground lift as the trap |

The eight synthetic cases were drafted by a separate agent with outcomes
authored, not observed (`provenance` says so).

### Arms

| Arm | Surface | Model | Tools |
| --- | --- | --- | --- |
| Bare GPT | `evaluation/pti/runner/run-codex.mjs`: `codex exec`, clean `CODEX_HOME` (apps, plugins, memories and the shell off, so it cannot read this machine's files), owner's ChatGPT plan; a run that uses any other tool is rejected | gpt-6.1-sol, xhigh | Web search |
| Bare Claude | `run-claude.mjs --bare`: clean workspace, no MCP server, skill or harness note, owner's Claude plan | claude-opus-5-5, max | Web search |
| Current AskRigor | `run-claude.mjs --ref 27deb4a5` (the live build: HRP 20.6.10, Universal 20.5.34) | claude-opus-5-5, max | AskRigor's 33 tools, skill, web search |
| PTI candidate | `run-claude.mjs --ref <branch commit>` | claude-opus-5-5, max | Same as current AskRigor |

The two AskRigor arms differ only in protocol bytes, so their comparison
isolates the protocol change. No API key reaches any child process.

### Judging and metrics

`evaluation/pti/judge/judge-pti.mjs` scores one transcript at a time. The
packet holds the user turns, the replies with arm-revealing names redacted,
and the case key; never the arm, model, folder or metrics. The judge returns
IDs only: per decision-window turn, the proposed actions in order, whether it
asked for known information, repeats of failed actions, unsafe proposals;
then the matched endpoint, calibration, overclaims, severe-failure flags and
five 0 to 3 scores. Output is validated against the case and retried once
with the identical prompt. Judges: Claude Opus 5.5 at max effort with no
tools, and GPT gpt-6.1-sol at xhigh through Codex with the shell off; a Codex
judgment that used any tool is rejected, since it could have looked outside
its packet.

Code derives `time_to_useful_test`, `gold_action_capture`, `top_rank`,
`burden_before_top`, `first_good_action_turn` and repeats. Each judge's
metrics are reported separately, a claim must hold under each judge alone, and
every disagreement on a primary field is listed for review. No third model
breaks ties, since either family would favor its own side.

## Validation

- Set: 8 families x 3 cases = 24, 4 arms = 96 conversations, 2 judges each.
- Authors: two sealed agents (one Claude, one GPT through Codex), 12 cases
  each, from a brief holding the ten behaviors and the case contract but not
  the candidate text or the development cases. Only the bundle's SHA-256 is
  committed until the freeze.
- Freeze: the PTI commit, judge prompts and thresholds are fixed before the
  bundle is opened, and nothing is tuned afterwards. Development cases may
  shape the candidate; validation cases may only test it.
- Provisional thresholds, to be fixed before the reveal:
  1. Under each judge, PTI reaches the top action earlier than current
     AskRigor (or reaches it when current AskRigor does not) in more cases
     than the reverse, one-sided sign test p < 0.05.
  2. No more unsafe proposals or severe failures than current AskRigor, and
     no unsafe proposal in a health case.
  3. No more overclaims after the solution, and median burden before the top
     action no higher.
- Run order is randomized per case; raw transcripts stay private under
  `~/askrigor-pti-runs/` (mode 0700); only verdicts (IDs) and metric tables are
  committed.

## Status

| Step | State |
| --- | --- |
| Bootstrap, lesson queue, MAST map, prior-work scan | Done |
| Staged-conversation runner (`--turns-file`, `--bare`), bare-GPT runner, judge, tests | Done |
| Skin regression and eight development cases | Done |
| Candidate protocol edits on the branch | Done, pending owner approval of the text |
| Development runs and judging (9 cases x 4 arms) | Running: skin case, three baseline arms |
| Development report and candidate revision | Next |
| Sealed validation authoring, freeze, validation run | After development |
| Owner report and approval question | After validation |

## Active lesson contract

| Lesson | Trigger and required behavior | Failure condition | Enforcement |
| --- | --- | --- | --- |
| Whole-argument reconstruction | Extend the existing gates where each behavior already lives | A parallel module restates existing rules | Behavior map above; placement tests |
| Transformation preservation | Every protocol byte change is a recorded exact edit | Undoing the edits does not give the live bytes | Fixture plus chain tests |
| Task-time activation | The rule must be reachable where a troubleshooting answer is written | The gate exists but is never loaded on non-health questions | Core `reasoning_style` pointer; index summary test; tool logs show which sections each run loaded |
| Pattern-matching fit | Words and patterns decide only exact questions | A metric or check decides meaning by word lists | Judge maps meaning to IDs; code computes from IDs |
| Epistemic phase | Development cases shape the candidate; validation cases only test it | Tuning after the validation reveal | Sealed bundle hash; freeze before reveal |
| Delivery truth and honest labels | Record the surface, model and effort actually used | "ChatGPT" results that came from Codex | Labels in `metrics.json`; plan names Codex |
| Zero spend | Owner plans only; no API key in any child | Any paid call | Child environments strip API keys; runners record the surface |
| MAST lessons | Web-search policy fixed up front; ID-only judge output; smoke runs first; redaction against blinding leaks; artifacts outside `/tmp` | A lost or unblinded run | Same web-search setting for all arms; validated verdicts; private run folder |
| Privacy | No raw provider output or private history committed | Transcripts in the repository | Only IDs and tables committed; skin case deidentified |
| Recurring-finding check | If a failure class returns after a fix, diagnose the mechanism | Another local exception | Development report names classes, not instances |
| Owner approval | Protocol text needs the owner's approval of the exact text | Candidate text merged or called current | Revision entries say "Candidate for owner approval" |
