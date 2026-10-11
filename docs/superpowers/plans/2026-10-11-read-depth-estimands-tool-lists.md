# Read depth, cross-trial comparisons and outdated tool lists (owner reports, 2026-10-11)

## Authority and scope

- **Owner reports of 2026-10-11, filed through ChatGPT chats:**
  - UDA lane `2026-10-11-per-study-full-text-access-disclosure.md`. The owner's words: "i notice you aren't always
    telling me whether you read the full study or just the abstract. does askrigor not require that? it should, send
    report to askrigor".
  - AskRigor #310: a cross-trial responder-rate ratio ("about 3× rifaximin") inflated an herbal IBS-D ranking.
  - AskRigor #309: an outdated tool list in a chat, and an opaque full-text error. Part 2, the error, is fixed
    separately on `claude/europepmc-status-20261011`.
  - AskRigor #311: a comparison with older HRP-style guidance. It comes later, as its own evaluation.
- Protocol wording ships only as exact text the owner approves (owner question 71). The drafts are below.

## The cross-cutting finding: outdated tool lists

- #309's chat ran with the tool list it loaded at HRP 20.6.10 (build `27deb4a5`), while the server ran 20.6.15. #311
  says the same of its chat. #310's chat is unknown.
- A chat keeps the tool list it loaded at the start. So every final-check rule added since then (`full_text_search`,
  `scale_results`, `intervention_identity` and the rest) cannot be satisfied there, and the chat can't send the new
  fields. The server already adds a refresh hint to such next steps (#290), but only at the final check, after the
  research is done.
- The protocol text, by contrast, is fetched live by `load_protocol`. #309's outdated chat read HRP 20.6.15. A rule in
  the protocol therefore reaches outdated chats; a new tool field never does.
- So the earliest and widest fix is a protocol rule. At the start, compare the versions named at the top of the tool
  list with the live protocol's, and tell the user before researching when the tool list is older.

## Design

1. **Universal: `ToolListCurrency`** (new; draft wording below). It reaches outdated chats through `load_protocol`. No
   code change.
2. **HRP: `StudyReadDepthDisclosure`**, directly after `FullTextAccessStatusClassification` (draft below). It is built
   on the report's own exact text.
3. **The checked declaration: `read_depth` on each `key_sources` entry**, in `finalize_research`.
   - The values are:
     - `full_text_audited`: needs a study-audit receipt;
     - `full_text_read`: needs a full-text coverage receipt that is exhausted;
     - `partial_text`, `abstract_only`, `conference_abstract`, `secondary_only`, `metadata_only`, `inaccessible`,
       `route_error`.
   - Each claimed depth is checked against the receipts, so a study can never claim more than AskRigor fetched.
   - With `answer_draft`, the entry also gives its `answer_marker`, the visible label used in the answer (for example
     "[Abstract only]"). The marker must appear on the same line or table row as that study's link.
   - Both checks are exact and structural. The server never judges whether the answer's wording is honest.
4. **HRP: a stress case and a final check for #310** (drafts below), anchored in the existing
   `ComparisonEstimandAndDoseExposureIntegrityGate`. That gate already forbids the comparison, so the fix is
   activation, not a new rule. `scale_results` (owner question 51) already makes a severity change carry its scale's
   range, which would have shown −11 on a 0–500 scale for what it is.
5. **Tests:** every `read_depth` value against its receipts, and the marker on and off the study's line. Also
   placement and exact sentences for each protocol edit, and the chains.
6. **Acceptance in the live product:**
   - Run #310's fixture 1, the report's first regression case, and an outdated-chat check through the AskRigor
     connector in a Claude session, on the owner's plan, so there is no API spend.
   - Do the same in a fresh ChatGPT chat when the owner runs it.

## Draft wording (for the owner's exact-text approval)

- **Universal rule `ToolListCurrency`:**
  > At the start of research, compare the versions named at the top of the AskRigor tool list with the protocol
  > versions just loaded. If the tool list is older, tell the user before researching: this chat's AskRigor tools are
  > out of date, newer checks cannot run in it, and a new chat or a refreshed connector fixes that. Continue in this
  > chat only if the user chooses to, and then say which checks could not run.
- **HRP rule `StudyReadDepthDisclosure`:**
  > When a study supports a treatment claim or a ranking, say beside the claim, or in the same evidence table, what was
  > actually read: the full text with its methods and results, extracted or partial text, the abstract, a conference
  > abstract, or only a secondary description; and whether its method audit was validated. A full text that is
  > available has not therefore been read, and a full text read has not therefore been audited. A review read in
  > full does not make the studies it cites read. If the status is unknown, say so; never imply a fuller reading than
  > happened.
- **HRP case `CrossTrialResponderRatio`:**
  - Prompt: "One herbal trial reports a 29-point gain in responders but an 11-point severity change on a 0–500 scale;
    a different drug's trials report a 9-point responder gain. The user asks whether the herb is about three times as
    effective."
  - Expected: "Refuse the three-times claim across trials with different populations and endpoint definitions; show
    the responder difference and the severity change with its scale side by side; treat the herb as a weak or unclear
    effect, not a high-impact finding."
- **HRP check FS220:** "No ratio or 'times as effective' comparison was drawn across studies unless their estimands,
  endpoint definitions and populations are comparable, and a responder gain was shown together with any continuous
  severity change and its scale (ComparisonEstimandAndDoseExposureIntegrityGate)."

## Owner items

1. Question 71: the three wordings and this plan. A: all; B: choose among them; C: change a wording.
2. The release question, after the build.
3. Later: #311's controlled comparison of older guidance.
