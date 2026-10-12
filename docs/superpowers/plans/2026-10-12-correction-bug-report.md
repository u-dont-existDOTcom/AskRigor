# When the user corrects AskRigor and is right, ask to send a bug report (owner request, 2026-10-12)

## Authority and scope

- Owner request in a Claude session, 2026-10-12: "make sure that when user corrects askrigor, askrigor asks if it can
  send a bug report on that or if they need to clarify something ifrst (assuming user was correct and askrigor was
  wrong)".
- This changes Universal, so it ships only as exact text the owner approves (owner question 78).
- No server change is needed: the connector's lesson tool already sends only what the user agreed to.

## What exists

- Universal `corrections_and_calibration`, added after an owner report on 2026-09-30, says: when a correction,
  rechecked and found valid, shows an AskRigor failure that could recur for other users, say it is worth saving as an
  AskRigor lesson, show the proposed lesson, and submit it only after the user says yes, through a lesson tool or
  Action the surface offers.
- The connector's `submit_lesson_candidate` saves one lesson to the owner's private review queue, only after the user
  says yes to the lesson as shown.

## Gaps

1. The offer depends on the model judging that the failure could recur for other users, so an error it takes for a
   one-off is never offered.
2. It offers to save "a lesson" rather than asking a question, so the offer is easy to skip or miss.
3. The user can't clarify before the report goes, so a report could carry a misreading of the correction.
4. No point-of-generation check reminds the model at the end of the reply.

## Design

1. Replace that paragraph with the draft below (Universal 20.5.38 to 20.5.39). The recheck stays: a user who was not
   right gets what the source supports, not a report.
2. Add a point-of-generation check directly after "Overcorrection check".
3. Tests: exact text and placement, independent approved constants, and a reversible fixture chained from 20.5.38.
4. Acceptance in a Claude session through the AskRigor connector (no API spend), with synthetic wording:
   - a valid correction: the reply asks the question and shows the report;
   - "let me clarify first": the reply applies the clarification and shows the revised report;
   - "yes": `submit_lesson_candidate` returns a receipt (the owner then rejects the synthetic report);
   - a correction where the user was wrong: no report is offered.

## Draft wording (for the owner's exact-text approval)

- **Replaces the paragraph that begins "When a correction, rechecked and found valid":**
  > When the user corrects AskRigor and a recheck shows the user was right, acknowledge the error and, in that reply,
  > ask one short question: may AskRigor send a bug report about it, or does the user want to clarify something first?
  > Show the report it would send, on its own and apart from any engineering report: "When [general situation],
  > AskRigor should [correct behavior] because [reason]." Include no identity, personal health story, quotation or
  > unnecessary link. Send it only after the user says yes, and only through a lesson tool or Action this surface
  > actually offers; if it offers none, say so and tell the user it can be sent through AskRigor's lesson Action. When
  > the user clarifies, apply the clarification and show the revised report before sending it. When the recheck shows
  > the user was not right, say what the source supports and offer no report.
- **Check, after "Overcorrection check":**
  > Correction-report check: When the user corrected AskRigor and a recheck showed the user was right, did this reply
  > ask whether AskRigor may send a bug report or whether the user wants to clarify first, with the report shown, and
  > is nothing sent before the user's yes?
- **Revision entry:**
  > Owner-approved, question 78 (2026-10-12): when the user corrects AskRigor and a recheck shows the user was right,
  > AskRigor asks whether it may send a bug report or whether the user wants to clarify first, shows the report, and
  > sends it only after the user's yes, with a point-of-generation check.

## Owner items

1. Question 78: this wording. A: as drafted; B: change a wording.
2. The release question, after the build.
