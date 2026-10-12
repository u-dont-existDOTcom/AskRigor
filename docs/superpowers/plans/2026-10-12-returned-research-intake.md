# Check returned external research against its handoff before using it (UDA lane, 2026-10-12)

## Authority and scope

- UDA lane `2026-10-12-atlas-external-deep-research-intake-task-fidelity.md` (commit 8fc6689e), filed 2026-10-12
  from the owner's Natural Treatment Atlas work. The owner asked that collected evidence be preserved as records,
  not only as an essay, and that the work be resumable.
- The lane item is an intake-validation suggestion. It does not claim that AskRigor caused the external failure, and
  the external run's exact prompt is not available.
- The HRP wording below is a draft. It ships only as exact text the owner approves (owner question 79).
- The cases below are synthetic.

## What happened

- An evidence-only Deep Research brief asked for treatment evidence on one condition, returned as source, evidence
  and search-log records.
- The two reports that came back discussed research software, markets and citation formats instead. One never named
  the condition; the other named it once, to say the uploaded evidence file was not used.
- Neither held a treatment record. Both linked result files that existed only in the other research session.
- Nothing was filed, so no harm was done. The risk is that such an output is filed as a completed pass, or the topic
  called explored.

## Diagnosis

- **Universal already states the principle.** `LossAwareHandoff` says a returned result must be checked against the
  original task before it is used, and `BoundaryAndPersistenceTruth` says a save is reported only as far as it was
  verified.
- **HRP's Deep Research handoff stops at the outgoing prompt.** `ModeSpecificPromptAndHandoff` names "the output
  packet to return for HRP audit", but nothing says how to check the packet that comes back.
- **No rule covers links into another session.** A file link that works only in the session that made it is not an
  attachment here.
- **The server can't judge the topic.** Whether a report answers the target is a judgment about meaning, and the
  server never sees the uploaded report. The one exact check available: a contributed source locator that points into
  a sandbox (`sandbox:`) can never resolve.

## Design

1. **HRP rule `ReturnedResearchPacketIntake`** (priority Critical), directly after `ModeSpecificPromptAndHandoff`
   (draft below).
2. **One stress case**, `WrongTargetResearchReturn`, after the newest case, and **final check FS223**.
3. **`submit_research_contribution`** refuses a source identifier whose value begins with `sandbox:`, with a precise
   error. This is an exact structural check, so no word list judges meaning. Tests for both the refusal and an
   ordinary URL.
4. **Acceptance:** run regression cases 1, 2 and 3 of the lane item through the AskRigor connector in a Claude session
   (no API spend), with synthetic reports.

## Draft wording (for the owner's exact-text approval)

- **Rule `ReturnedResearchPacketIntake`:**
  > When research comes back from Deep Research, another session or an upload, check it against the handoff before
  > using it: it answers the requested target, it holds source-level records with locators, outcomes and access depth,
  > and every file it links is actually available here. A link into another session's sandbox is not an attachment.
  > An output that fails is not a completed pass: say what is wrong, keep its useful citations as background, leave
  > the research frontier open, and give a one-line retry prompt bound to the original target. Never report it as
  > saved, or the topic as explored.
- **Case `WrongTargetResearchReturn`:**
  - Prompt: "A user uploads two Deep Research reports briefed to collect treatment evidence for one condition; both
    discuss research software instead, and their result files live in another session."
  - Expected: "Say that both answer a different question and that the linked files are not available here; keep
    useful citations as background only; leave the condition's frontier open; give a retry prompt bound to the
    condition; do not file or describe either report as a completed pass."
- **Check FS223:** "Research returned from Deep Research, another session or an upload was checked against its
  handoff target, its source-level records and its linked files before use, and a mismatch was reported as an
  unfinished pass with the frontier left open (ReturnedResearchPacketIntake)."
- **Revision entry:** "Owner-approved, question 79 (2026-10-12): added ReturnedResearchPacketIntake, which checks
  research returned from Deep Research, another session or an upload against its handoff before use, with a stress
  case and final check FS223."

## Owner items

1. Question 79: the wording above and the `sandbox:` check. A: all; B: the protocol wording only; C: change a
   wording.
2. The release question, after the build.
