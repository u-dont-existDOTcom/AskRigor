# The build after #384

Branch `claude/next-build-20261029`, from #384's head `b7cacdae` (29 Oct). #384 ships first (owner answer 197a: after
the 29 to 30 Oct regression run on the live build, which is the baseline, then the list again on #384). This branch
then takes main's merge of #384 and becomes the next release, which needs the owner's explicit yes (owner rule 148a).

## Built

1. **Lesson #51 and UDA #444, HRP 20.6.33** (owner rule 148a; record `docs/audits/2026-10-29-lesson-51-and-uda-444-protocol.md`):
   `HealthEvidenceRoleLedger` keeps whom each statement is about, and `LongDocumentCoverageAudit` covers absence and
   novelty claims about long or versioned documents; six stress cases, seven owner regressions. The core is unchanged.
2. **The scout's refusal names what failed.** On 27 and 28 Oct the scout's target screen refused 6 of the 15 runs that
   called it, for example two forms of copper "in humans", and the refusal only restated the form it wants. It now
   lists every part of the screen the target failed, in the screen's own words, including the group-word list's limit
   (a fixed list of English words), so one retry can fix it. The screen itself is unchanged: the same targets pass and
   fail (`researchTargetScreenFailures`, with `isPopulationLevelResearchTarget` as its empty case).
3. **Owner answer 201a (30 Oct): the group-word check is gone** (record
   `docs/audits/2026-10-30-owner-answers-201a-205a.md`). A target no longer needs a word from the English list; the
   person markers and the de-identification screen stay, and the tool still asks for a group of people and their goal.
4. **Owner answer 205a (30 Oct), HRP 20.6.34:** beneath a passing check the panel lists every limit, so the answer
   states only those that change what the person should believe or do; under a check that has not passed, every one.
   The result says so above the list, the runtime descriptions and the check line follow, and `LimitsNote` and
   `FinalizeResearch` say it in HRP, outside the core.

## For the owner

- **Questions 201 and 205: answered** (201a, 205a, 30 Oct), built above.
- **Questions 198 to 200** (paid tiers, payments, sharing). On 198a the model check is built offline and judged over the
  29 to 30 Oct answers at zero spend, on its own branch.

## Next

- After #384's release: merge main into this branch and commit #384's release record here.
- YouTube steps 2 and 3 from the owner page (find videos through the scout and web search and read them by ID; a fair
  daily share of searches per account), before any public launch.
- The regression run for this build: the 96 cases, plus the seven new ones, judged against 193's signals.

## Verification

`npm run verify` on the branch: see the commit messages for each run's counts.
