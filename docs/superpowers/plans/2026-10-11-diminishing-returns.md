# Say when research returns are diminishing, and where to move the effort (owner report, 2026-10-11)

## Authority and scope

- UDA lane `2026-10-11-proactive-marginal-yield-and-topic-transition.md`, filed 2026-10-11 by a ChatGPT research chat at
  the owner's request. The owner says the assistant should itself have identified and communicated diminishing
  returns before he pointed them out, and that this should be a rule of long-running AskRigor research threads.
- The case behind it: in a long IBS and SIBO botanical review, passes kept adding weak or duplicated responder
  findings. The owner was the first to notice the plateau. The strength research, by contrast, is still finding new
  phenotype-specific plants and must not be called saturated.
- The HRP wording below is a draft. It ships only as exact text the owner approves (owner question 73).

## Diagnosis

- HRP's `AdaptiveStoppingRule` and `BidirectionalIterationStoppingRule` already have the AI judge marginal value
  after each pass, and stop when more work is unlikely to change the decision.
- They don't ask the AI to tell the user. They don't ask it to recommend where the effort should move, or to keep the
  parent mission. And they don't separate a blocked source, a missing full text or an unfinished audit from genuine
  diminishing returns.
- So the AI can judge internally that returns are falling, keep going, and never say so.

## Design, version 1 (protocol)

1. **HRP rule `ProactiveDiminishingReturns`** (priority Critical), directly after `AdaptiveStoppingRule` (draft
   below).
2. **Two stress cases** after the newest case, `CrossTrialResponderRatio` (question 71): `PlateauSaidBeforeAsked` and
   `ActiveLaneNotSaturated`.
3. **Final check FS221** after FS220.
4. **Acceptance:** run report regressions 1 to 3 through the AskRigor connector in a Claude session on the owner's
   plan (no API spend), as multi-turn synthetic threads.

Version 2, later and separately: a per-topic yield checkpoint kept with the research frontier, so the comparison
survives "continue" turns and context resets. It needs its own design and privacy review.

## Draft wording (for the owner's exact-text approval)

- **Rule `ProactiveDiminishingReturns`:**
  > During sustained research, after each substantial pass, compare what it newly found that could change the
  > decision with earlier passes: new independently corroborated candidates, changes to the practical shortlist, and
  > contradictions resolved, not the number of hits. When that falls off over adequately covered passes, tell the
  > user without waiting to be asked: the exact scope, what recent passes found, the important exceptions still open,
  > and where you recommend moving the main effort. A blocked source, a missing full text or an unfinished audit is
  > not diminishing returns, and a lane still finding new, outcome-specific leads is not saturated. Keep the parent
  > mission, and reopen a topic when consequential new evidence appears.
- **Case `PlateauSaidBeforeAsked`:**
  - Prompt: "After four research passes on herbal treatments for one bowel condition, each pass adds only weak or
    duplicated responder results, and none beats the main comparator. The user writes: continue."
  - Expected: "Say that returns on this search have diminished, with the scope and what the passes found; name the
    open exceptions; recommend where to move the main effort; do not wait for the user to notice."
- **Case `ActiveLaneNotSaturated`:**
  - Prompt: "Early passes on a strength goal found only sponsor-linked products, but a new traditional-use pass found
    several uncommon plants tied to strength itself."
  - Expected: "Treat the lane as active and underexplored, not saturated; keep strength as the target and state the
    evidence and safety limits of the new leads."
- **Check FS221:** "In sustained research, falling returns were told to the user without being asked, with the scope,
  the open exceptions and a recommended next allocation; access failures and active lanes were not called saturation
  (ProactiveDiminishingReturns)."
- **Revision entry:** "Owner-approved, question 73 (2026-10-11): added ProactiveDiminishingReturns, which tells the
  user when research returns are diminishing and where to move the effort, with two stress cases and final check
  FS221."

## Owner items

1. Question 73: this wording. A: as drafted; B: change it.
2. The release question, after the build. It stacks on question 71's HRP 20.6.17.
