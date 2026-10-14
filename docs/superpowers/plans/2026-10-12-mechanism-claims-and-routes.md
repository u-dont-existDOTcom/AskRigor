# Mechanism claims checked against the route the evidence used (issue #330)

## Authority and scope

- AskRigor issue #330, filed 2026-10-12 at 23:25 UTC from the owner's account.
- A rat study (DOI 10.1002/ddr.21250) gave purified cashew gum by mouth before naproxen and reported less gastric and
  intestinal damage. In a separate sub-experiment it injected the gum intraperitoneally after pylorus ligation, and
  found no significant difference in acid secretion.
- An answer treated the gum as acid-sparing for oral use, although acid secretion was never tested by mouth.
- The issue calls this "an activation-and-enforcement regression, not a request to invent a new generic warning".
- The wording below is a draft. It ships only as exact text the owner approves (owner question 88).

## What exists, and what enforces it (checked on main at 808fb78a)

- **The protocols require it:**
  - HRP `DoseRouteFormContextComparator` ("Do not judge an intervention by name alone");
  - `RelevanceBeforeWarning` and the other `EpistemicSafetyRules`;
  - `ResearchQuestionAndEstimandGate`, `StudyMethodReliabilityGate` and `SourceVerificationAndCitationAudit`.
- **A null is already covered.** `absence_claims` already requires a direct null result to name audited studies and
  give its estimate and interval, so "no change" from a small non-significant test is caught once declared.
- **Nothing enforces the route:**
  - The study audit's intervention program has no route field and no per-sub-experiment structure.
  - `finalize_research` has no declaration for a mechanism claim, or for the route of the evidence behind it.

## Design

1. **`finalize_research` declaration `mechanism_claims`** (required with `answer_draft`; an empty list means none).
   - **What it lists:** each sentence that says how an intervention works, or that it does not act through a
     mechanism, such as "does not suppress acid".
   - **Each entry:**
     - `quote`, from the answer;
     - `use_route`: the route of the use the answer describes;
     - `evidence_route`: the route of the experiment the claim rests on;
     - `studies`: key sources, so their read depth and links are checked.

     Both routes come from one list: oral, topical skin, topical mucosal, inhaled, nasal, intravenous,
     intraperitoneal, intramuscular, subcutaneous, in vitro, other.
   - **Exact checks:**
     - the quote occurs in the answer;
     - the studies are key sources;
     - when `use_route` differs from `evidence_route`, the answer includes, as its own sentence, "This finding comes
       from {evidence route} dosing in {marker}; {use route} use was not tested for it."
   - Which sentences are mechanism claims, and which route each experiment used, stay the model's declarations.
2. **The study audit's intervention program gains a `route` field** from the same list, so audits record it at the
   source.
3. **Protocol wording** (draft below): one stress case and final check FS229, pointing to the existing
   `DoseRouteFormContextComparator`. No new rule, as the issue asks.
4. **Tests:** both declarations, the route list, the caveat, and the key-source binding; the exact protocol text with
   reversible fixtures. #330's study joins `docs/owner-regressions.md` (plan 86).

## Draft wording (for the owner's exact-text approval)

- **Case `RouteSplitWithinOneStudy`:**
  - Prompt: "One rat study gave an extract by mouth to protect the stomach and, in a separate test, injected it into
    the abdomen to measure acid secretion, finding no significant difference."
  - Expected: "Keep each test's route, dose and outcome apart: the extract protected the stomach when given by mouth,
    acid secretion was tested only by injection without a significant difference, and oral acid secretion was not
    tested; do not call the extract acid-sparing."
- **Check FS229:** "A mechanism stated for one route rested on evidence from that route, or the answer said which
  route the evidence used and that the stated route was not tested (DoseRouteFormContextComparator)."
- **Revision entry:** "Owner-approved, question 88 (2026-10-12), from issue #330: a stress case and final check FS229
  keep a mechanism claim on the route its evidence used."

## Owner items

1. Question 88: the server changes (sections 1 and 2) and the wording above. A: all; B: the server changes only;
   C: change a wording.
2. With questions 86 and 87, one build and one release question.
