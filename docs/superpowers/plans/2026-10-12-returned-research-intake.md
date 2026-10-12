# Keep the target in a research handoff, and check what comes back (UDA lane, 2026-10-12)

## Authority and scope

- UDA lane `2026-10-12-atlas-external-deep-research-intake-task-fidelity.md`: filed 2026-10-12 (commit 8fc6689e) from
  the owner's Natural Treatment Atlas work, with an owner correction added at 02:59 UTC (commit 76beceb7). The owner
  asked that collected evidence be kept as records, not only as an essay, and that the work be resumable.
- The lane item is an intake-validation suggestion. It does not claim that AskRigor malfunctioned. The external run's
  exact prompt and trace are not available.
- The HRP wording below is a draft. It ships only as exact text the owner approves (owner question 79).
- The case below is synthetic.

## What happened

- An evidence-only Deep Research brief asked for one condition's treatment evidence, returned as source, evidence and
  search-log records.
- The owner's correction: the message that started Deep Research said "use AskRigor", and the actual brief was an
  attachment. The research model apparently took the message as a request to research AskRigor itself.
- The two reports that came back discussed AskRigor's architecture, markets and citation formats. One never named the
  condition; the other named it once, to say the uploaded evidence file was not used.
- Neither held a treatment record. Both linked result files that existed only in the other research session.
- Nothing was filed, so no harm was done. The risk is that such an output is filed as a completed pass, or the topic
  called explored.

## Diagnosis

- **The likely cause is the invocation.** The message named a tool while the task sat only in an attachment, so the
  tool's name read as the topic. Whether Deep Research could call AskRigor at all is unknown: the lane item cites
  OpenAI's help pages as saying Deep Research can use only some connected apps.
- **Universal already states the intake principle.** `LossAwareHandoff` says a returned result must be checked
  against the original task before it is used, and `BoundaryAndPersistenceTruth` says a save is reported only as far
  as it was verified.
- **HRP's handoff rule doesn't protect the target.** `ModeSpecificPromptAndHandoff` asks for the complete prompt and
  "the output packet to return for HRP audit". It doesn't say that the target must be in the message itself, that an
  unverified tool name can be misread as the topic, or how to check what comes back.
- **No rule covers links into another session.** A file link that works only in the session that made it is not an
  attachment here.
- **The server can't judge the topic.** Whether a report answers its target is a judgment about meaning, and the
  server never sees the uploaded report. The one exact check available: a contributed source locator that points into
  a sandbox (`sandbox:`) can never resolve.

## Design

1. **HRP rule `ResearchHandoffTargetFidelity`** (priority Critical), directly after `ModeSpecificPromptAndHandoff`
   (draft below). It covers both directions: the target in the outgoing message, and the check of what comes back.
2. **One stress case**, `HandoffTargetLost`, after the newest case, and **final check FS223**.
3. **`submit_research_contribution`** refuses a source identifier whose value begins with `sandbox:`, with a precise
   error. This is an exact structural check, so no word list judges meaning. Tests for both the refusal and an
   ordinary URL.
4. **Acceptance:** run the lane item's regression cases 1 to 3 through the AskRigor connector in a Claude session (no
   API spend), with synthetic reports, plus one handoff prompt checked for its first sentence and tool names.

## Draft wording (for the owner's exact-text approval)

- **Rule `ResearchHandoffTargetFidelity`:**
  > A handoff to Deep Research, another session or another tool states the research target in the message itself,
  > in its first sentence and not only in an attachment, and asks the destination to restate that target before it
  > starts. It names no tool the destination is not known to offer: an instruction such as "use AskRigor" can be read
  > as the topic. When research comes back, check it against the handoff before using it: it answers the requested
  > target, it holds source-level records with locators, outcomes and access depth, and every file it links is
  > actually available here. A link into another session's sandbox is not an attachment. An output that fails is not
  > a completed pass: say what is wrong and its likely cause when the invocation shows it, keep useful citations as
  > background, leave the research frontier open, and give a one-line retry prompt that states the original target
  > first. Never report it as saved, or the topic as explored.
- **Case `HandoffTargetLost`:**
  - Prompt: "A user's Deep Research request said "use AskRigor" and attached the actual brief for one condition's
    treatment evidence; both reports came back about AskRigor's software, and their result files live in another
    session."
  - Expected: "Say that both answer a different question, likely because the request named AskRigor while the task
    sat in an attachment, and that the linked files are not available here; keep useful citations as background
    only; leave the condition's frontier open; give a retry prompt that states the condition first and names no tool;
    do not file or describe either report as a completed pass."
- **Check FS223:** "A handoff stated its target in its own first sentence and named no tool the destination was not
  known to offer, and research that came back was checked against that target, its source-level records and its
  linked files before use, with a mismatch reported as an unfinished pass and the frontier left open
  (ResearchHandoffTargetFidelity)."
- **Revision entry:** "Owner-approved, question 79 (2026-10-12): added ResearchHandoffTargetFidelity, which keeps
  the research target in a handoff's own message and checks research that comes back against it before use, with a
  stress case and final check FS223."

## Owner items

1. Question 79: the wording above and the `sandbox:` check. A: all; B: the protocol wording only; C: change a
   wording.
2. The release question, after the build.
