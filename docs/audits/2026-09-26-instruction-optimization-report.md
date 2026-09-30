# AskRigor instruction optimization: interim report

Date: 2026-09-26. Branch `claude/askrigour-instruction-optimization-cffyp2`
(no PR yet; nothing merged or deployed). Plan and run details:
`docs/superpowers/plans/2026-09-26-instruction-optimization.md`.

Status: interim. The four measures below come from one development question
(`dev-hip-avoid-replacement`) on Claude Opus 5.5 at max effort in the Claude
app tool surface. The held-out comparison, the GPT arm and the smoke test of
HRP 20.6.0 are still to run.

## What changed

1. Protocols reach Claude at all: `load_protocol` serves the canonical files by
   section in bounded pages. Before this, Claude clients rejected the whole-file
   result and researched with no protocol text.
2. The server checks completion: five research tools return signed receipts, and
   `finalize_research` verifies them before the answer (community survey, every
   material video's comment audit, a validated full-text audit or a proven lead
   for every key study). Forged or altered receipts are rejected.
3. Results fit client limits: YouTube audits, full-text pages and server
   instructions stay under the sizes Claude accepts; comment records are compact
   and pseudonymous (no author names or channel ids reach the model).
4. HRP 20.6.0 (and Universal 20.5.29, numbered 20.5.28 before the merge with
   main's 20.5.27): seven process, output and meta sections
   rewritten around what they actually add; no method change. Output: answer
   first, one short limits note at the end, no protocol banner.
5. Fixes found by the runs: PubMed pacing, error reasons visible to the model,
   continuation robustness, the connector's missing coverage checker and
   Gemini scout.

## Measures (reported separately)

**1. Research quality** (blinded Opus judge, three spot-checked citations per
answer):

| Pair | Winner | Confidence |
|---|---|---|
| no protocol (`main`) vs section loading (`e1176f8`) | section loading, 5 of 5 criteria | medium |
| no protocol vs finalize gate (`6e2763d`) | finalize gate, 4 of 5 criteria | medium |
| section loading vs finalize gate | section loading, narrowly | low |

Protocol substance helps (red flags, options, next steps); the gate improved
evidence appraisal and heterodox judgment. Every protocol answer was faulted
for length and process clutter, which 20.6.0 addresses. No arm yet surfaced
the community options the owner is looking for (diet, gelatin or collagen,
named physiotherapy methods).

**2. Gate compliance**: before the gate, 12 of 20 video audits were left
incomplete without any check. With the gate, all 48 receipts the model passed
back verified, and the gate correctly withheld "ready" while three material
videos were unfinished (a continuation bug, since fixed).

**3. Instruction load**: protocol text loaded per run went from 0 (broken) to
about 569,000 characters (section loading) to 326,000 (gate run, 31 loads).
HRP's default research load is now 326,000 characters (was 443,000); its core
sections 27,000 (was 35,500). Server instructions 2,531 to 2,030 characters.

**4. Cost and latency** (API-equivalent estimates; actual spend $0 on the plan):
19 min / $7.77 (no protocol), 27 min / $12.25 (section loading, server crashed
partway), 111 min / $36.38 (gate run). The gate run's cost came from 61
video-audit calls and long reasoning; compact comment records and the
continuation fixes target that. Cost is now the main open risk.

## Owner decisions

1. GPT route: manual GPT-6 runs, the Mission Control relay (needs your OK and a
   staging connector), or GPT-6 Pro as judge only.
2. YouTube quota: about 3 runs a day on one key; extra free keys in separate
   Google Cloud projects would let the 12-run held-out comparison finish in a day.
3. HRP 20.6.0 output defaults (applied; veto any): no banner, versions line at
   the end, compact comparison table.
4. Batch 2 method compression (−12%, wording only) and the larger options in
   `docs/audits/2026-09-26-hrp-batch2-proposal.md`.
5. Euphemism rule: unchanged unless you decide otherwise.

## Next

Smoke test of HRP 20.6.0 after the YouTube quota resets (scheduled), then
parallel reply fetching to cut audit calls, the held-out comparison, the GPT
arm, PRs with Codex review, and deployment only on your explicit approval.
