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
| 3 MCP research session, ledger, finalize gate (community receipts, study validator receipts, no open continuations) | Built | Signed receipts plus `finalize_research`; see below |
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

## Server gate: research receipts and `finalize_research` (built 2026-09-26)

Before this change no MCP tool issued a verifiable completion receipt: the
survey and audit receipts were plain JSON, full-text handles lived in a
process-local store, and `assess_treatment_landscape_coverage` checked only the
internal consistency of what the model reported. The gate now works like this:

- Five tools return a signed `research_receipt` when a unit of work finishes:
  `survey_youtube_community` (at least one completed search),
  `audit_youtube_video_community` and `audit_youtube_community` (terminal
  completion state only), `acquire_open_full_text` (only when it returns
  `possibly_useful_lead`, proving the attempt), and both method-audit
  validators (only when validated; the receipt names the study's DOI, PMID and
  PMCID from the server-held document index).
- Receipts are HMAC-SHA256 tokens with readable claims
  (`rr1~kind~claims~issued~mac`), keyed by a domain-separated key from
  `ASKRIGOR_FINALIZATION_SIGNING_SECRET` or else the existing YouTube
  continuation secret, so production needs no new configuration. They are
  stateless (survive restarts), carry only public identifiers and counts, and
  expire after 24 hours.
- `finalize_research` takes the receipts, the community decision (researched,
  or not relevant with a reason), and the key studies (validated or lead-only).
  It returns `not_ready` with next steps (no survey, an unaudited material
  video, a key study without a validator receipt, a DOI lead without an
  acquisition attempt, a forged or altered receipt), `ready_with_limits` with the
  limits the answer must state (bounded audits, server-confirmed leads), or
  `ready`, plus a signed finalization receipt that the run ledger records.
- Instruction side: one sentence in the skill (replacing 60 words of meta text)
  and in the MCP server instructions, which were also cut from 2,531 to 2,030
  characters because Claude clients truncate server instructions near 2,048
  characters (the old text lost its last sentences there). The protocol and
  router edits that point to the gate, and the deletion of the prose gates it
  replaces, go in the next protocol batch.
- MCP only: the tool is not a Custom GPT Action (the controlled session keeps
  its own finalization permits) and is left out of the Gemini catalog budget.

## Clean baseline pair (2026-09-26, running)

Claude app tool surface (AskRigor tools plus `Skill` and `ToolSearch`), Opus
5.5 at max effort, `dev-hip-avoid-replacement`, YouTube key working, Gemini
scout available on the branch (free-tier key, no billing; local budget ledger
capped at USD 50 as in production):

- `main`: `load_protocol` still fails on size, so this arm researches with no
  protocol text at all (the skill and tool descriptions only).
- `e1176f8` (section loading): the model loaded the Universal and HRP indexes
  and then 62 sections one by one, about 569,000 characters (about 140K
  tokens), nearly every runtime section. Section loading makes the protocol
  reachable but does not by itself reduce instruction load; that needs the
  consolidation phase and server-enforced gates.

The pair is therefore also a natural test of whether the protocol text adds
research quality for a strong model: no protocol versus nearly all of it.

YouTube Data API quota bounds the test rate: about 10,000 units per day per
project, 100 units per search, up to 6 searches per `survey_youtube_community`
call, so roughly 2,000 to 3,000 units per research run, or about 3 to 4
community-heavy Claude runs per day on the test key. Production runs (ChatGPT
arm) use the production key's separate quota.

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
