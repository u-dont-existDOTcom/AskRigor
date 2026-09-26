# AskRigor instruction optimization plan

Status: Phase 0 complete (2026-09-26). Next: fix broken tool references, build the
test runner, run the baseline pilot, then the server session and finalize gate.
Branch: `claude/askrigour-instruction-optimization-cffyp2`.
Phase 0 findings: `docs/audits/2026-09-26-instruction-optimization-phase0.md`.

## Owner outcome

AskRigor research results at least as rigorous with far less instruction text
and more rules enforced by the server. If adherence and intelligence improve,
AskRigor can run well on GPT's unlimited consumer chats instead of relying on
Claude Opus 5.5 (owner, 2026-09-26).

## Owner decisions recorded in the Claude Code session of 2026-09-26

1. Refactor first, with the minimum testing needed to show adherence and
   intelligence improve. A full MAST rerun is not a goal: MAST runs with tools
   off, so it cannot exercise AskRigor's research machinery.
2. Test questions are real-user-style questions with no answer key. Good
   answers surface credible non-mainstream options with community and forum
   signal, appraise studies rigorously, and separate plausible heterodox signal
   from crackpot claims.
3. Judges for hard cases: GPT-6 Pro (ChatGPT) and Claude Opus 5.5 at max effort.
4. Test in product conditions: each product's normal system prompt plus the
   AskRigor connector. Exclude only developer-only instructions.
5. Reach ChatGPT through Mission Control's ChatGPT chats on the VPS, not Codex.
6. Hold out as many questions as makes sense (6 of 11).
7. Change whatever rules need changing, including the rule that
   `load_protocol` returns the complete canonical text. Clinical or scientific
   method changes in HRP are batched into one list for explicit owner approval,
   as the original brief requires.
8. Zero spend: Claude plan usage and ChatGPT consumer chats only; no paid API
   calls. Keep Claude usage credits off.
9. Standing holds: the Mission Control A19–A20 alignment task stays on hold and
   is not resent; PR #234 is frozen unless the owner says otherwise.

## Assurance lanes (UDA `patterns/development-assurance-lanes.md`)

- Iteration for each candidate: focused tests plus one or two development
  questions.
- Decision for the final before/after comparison on held-out questions.
- Release (full `npm run verify`, Codex review, owner approval naming the PRs,
  deployment with rollback, plugin receipt) only at merge/deploy.

## Measures (always reported separately)

1. Research quality: blinded side-by-side comparison, old versus new, per
   question and per model; judges GPT-6 Pro and Opus 5.5 max.
2. Gate compliance: receipts obtained before synthesis (from the server ledger
   once it exists; from run transcripts before that).
3. Instruction load: bytes and estimated tokens per typical run, per surface.
4. Cost and latency: tool calls, wall time, tokens (Claude Code reports an
   API-equivalent estimate; actual spend is $0 on the plan).

## Test design

- Questions: `evaluation/instruction-optimization/questions.json`: 5 development
  (including the owner's two real hip questions) and 6 held out. Held-out
  questions run only in the final comparison, after the refactor is frozen.
- Claude runs: local AskRigor server (old = `main`, new = branch) and a child
  `claude -p` session per run, started outside the repository so developer
  instructions are not loaded, connected through `--mcp-config`. Community tools
  need a YouTube Data API key in the environment.
- GPT runs: ChatGPT chats on the VPS through Mission Control. The relay service
  is not running and is pinned to GPT-5.6 Sol labels; a GPT-6 route is still to
  be built. The "new" arm on ChatGPT needs a staging connector.
- Judging: blinded pairs (old versus new) with a short rubric: credible options
  beyond the mainstream answer, correct study appraisal (judges spot-check
  citations), plausible versus crackpot separation, safety (never talks people
  out of care they need), usefulness to the person.

## Phases

| Phase | Status | Notes |
|---|---|---|
| 0 Orient: sources, sizes, rule inventory, server map | Done | Findings doc above |
| 1 Baseline pilot: one run per model on a development question | Next | Needs runner; YouTube key for Claude-side community tools |
| 2 Fix broken tool references and stray text; runtime view without stress tests, revision history, maintainer rules | Planned | No method change |
| 3 MCP research session, ledger, finalize gate (community receipts, study validator receipts, no open continuations) | Planned | Reuse controlled-session logic |
| 4 Consolidate protocol text; resolve contradictions; owner approval list for method changes | Planned | Batches, smoke-tested |
| 5 Serve the protocol by step | Planned | Keep canonical files and hashes |
| 6 Final comparison, cross-family check (GPT-6 Pro), PRs, owner-approved deploy | Planned | Release lane |

## Pilot run 1 (2026-09-26, not a clean baseline)

`main`, Claude Opus 5.5 at max effort, Claude Code tool surface (file-reading
and sub-agent tools available), question `dev-hip-avoid-replacement`, no
YouTube key: 21.6 minutes, 80 tool calls, about 12.4M tokens processed (11.7M
cached reads, 0.53M cache writes, 96K output), API-equivalent estimate $9.71
(actual spend $0 on the plan). `load_protocol` failed on size; the model read
about 780,000 characters of the saved results from disk with `Read`, which
drives most of the token cost. Four full-text chains were read to the end and
validated; the YouTube survey was inaccessible; PubMed and Crossref calls
failed intermittently; the local server process then crashed on an unhandled
socket `ECONNRESET` (the runner uses the production server factory, so this
may affect production). The answer was labelled partial. Later baseline runs
use the Claude app tool surface and need the YouTube key.

## Time and cost estimate (to be replaced by pilot measurements)

- Phase 0 used about 4.1M subagent tokens on the Claude plan, about 40 minutes
  wall clock in parallel, $0 spend.
- Final comparison: 6 held-out questions × old/new × GPT-6 and Opus 5.5 = 24
  research runs, plus 12 blinded pairs × 2 judges. Assumed 30–60 minutes per
  research run; the ChatGPT side is the bottleneck (about 10-minute gaps between
  consumer sends were needed in September). Roughly 1–1.5 days of mostly
  unattended running.
- Smoke checks: one or two development runs per candidate batch.

## Boundaries

No paid API calls. No production change without the owner's explicit approval
naming the PRs. No credentials in logs, commits, or packets. No private data in
cross-provider review packets. Do not touch queued Mission Control work.
