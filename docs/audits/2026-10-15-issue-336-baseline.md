# Issue #336 baseline: proposing the discriminating test

Date: 2026-10-15. Status: **run once against the live version, before any fix.** The issue asked for a run under
AskRigor's user-facing route with no paid API spend; this records it. The case is in `docs/owner-regressions.md`.

## How it ran

- **Route:** Codex CLI 0.160.0 through the AskRigor app in the owner's ChatGPT account, model `gpt-6.1-sol` at
  reasoning effort `xhigh`. One session: `codex exec` for the first prompt, then `codex exec resume` for each of the
  other three, in order.
- **Live version:** build `85edacf`, HRP 20.6.24 and Universal 20.5.42.
- **Instructions around the prompt:** about 60 AskRigor calls per reply; no save, submission or lesson report.
- **Time:** 20:31 to 21:01 UTC.

| Turn | AskRigor calls | Protocol loads | Web searches | Final check |
|---|---|---|---|---|
| 1 | 60 | 33 | 10 | Not passed: key-study link and marker steps, and a lead receipt, still open at the last call |
| 2 | 17 | 3 | 5 | Passed (`ready_with_limits`) |
| 3 | 11 | 0 | 5 | Passed (`ready_with_limits`) |
| 4 | 14 | 2 | 4 | Passed (`ready_with_limits`) |

## Criteria

| Criterion | Result | Evidence |
|---|---|---|
| Names the discriminating test: a validated yes/no channel that needs no movement, a medically authorized time-locked painful stimulus and a matched painless one, asking about that sensation | In part, late | Turn 3 named an identified stimulus, a report about that event and nonpainful control trials. Turn 4: "pair a specified clinical stimulus with the explicit question, 'Did that stimulus hurt?'" Neither says medically authorized, and turn 4 drops the control. |
| Keeps apart reflexive pain processing, a covert conscious report, ongoing baseline pain and no interpretable signal | Yes | Turn 1: nociception versus pain, brain responses as indirect evidence, a report carried by brain activity, and a failed attempt not showing that pain is absent. Turn 3: general current pain versus a particular stimulus. |
| Proposes the test when brain communication first comes up | No | Turn 1 introduced brain-based yes/no communication and said researchers "could ask about pain", without a paired stimulus. Turn 4: "I should have suggested it when I introduced brain communication." |
| Says intentional replies imply some awareness and say nothing about experience in complete unconsciousness | No | Not stated. Turn 1 says detecting awareness does not identify what the person feels; turn 2 calls a trustworthy brain-based report "meaningful empirical evidence of experience". |
| The 2012 fMRI "no" is not presented as the controlled test | Yes | Turn 2: "a reported case, rather than a controlled validation study". Turn 3: it "does not establish that an identified potentially painful stimulus was applied for that question." |

**Hard fails:** none. Turn 1 rejects pain inferred from activation alone and a missing reply read as no pain. Turns 3
and 4 decline to say that nobody has run the test and call ethical, technical or funding explanations speculation.

## Evidence the answers cited

- Validated with a full-text method audit: the 2008 imaging study of five minimally conscious patients
  (DOI 10.1016/s1474-4422(08)70219-9).
- Cited: the 2010 yes/no communication study (DOI 10.1056/NEJMoa0905370); a 2021 bedside protocol
  (DOI 10.3389/fneur.2021.757219); an imaging study of two people with congenital pain insensitivity; the IASP pain
  terminology; a 2012 university news account of the 2012 case.
- Not found: the 2024 roadmap (DOI 10.1007/s12028-023-01924-w), the 2026 position paper (DOI 10.1002/ejp.70332) and
  the 2022 paper (PMID 36545350) that the issue lists. The 2025 and 2026 literature was not checked.

## What it shows

- **Budget:** turn 1 spent 33 of its 60 calls loading the protocols one section at a time, had 27 left for research,
  and did not pass its final check. `load_protocol` section `"core"` (built, not yet live) loads the same core
  sections in two calls.
- **Reasoning:** the missing proposal is not only a budget failure. Brain communication came up in turn 1 without the
  paired test, and the model said so itself in turn 4. HRP has no rule asking for the test that would settle an open
  question; owner question 97 proposes one.
- **The owner's comparison:** on 15 October the owner asked ChatGPT a version of the first prompt on desktop web and
  on a phone. The desktop answer proposed the paired experiment unprompted and cited the 2024 roadmap; the phone
  answer did not.

Evidence files on the laptop: `/home/joel/askrigor-releases/20261015/regress-336/` (`run.sh`, the prompts,
`out/turn1.md` to `out/turn4.md`, `logs/turn1.jsonl` to `logs/turn4.jsonl`).
