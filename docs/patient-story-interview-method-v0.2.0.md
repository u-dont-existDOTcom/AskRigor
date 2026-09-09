# Patient-story interview and extraction method v0.2.0

Status: development method, approved for implementation after deterministic
validation. It does not reinterpret or migrate frozen v0.1 records.

This method applies to patient-history intake, symptom and adverse-effect
recurrence, behavioral and lifestyle history, survey follow-ups, public-source
extraction, and reviewer coding. The machine interchange contract is
`patient-story-evidence-extension-v0.2.0.json`. The underlying patient-story
record remains the frozen v0.1 contract and is linked by story ID and exact
payload SHA-256.

## Evidence collection flow

1. Preserve the respondent's or source's exact statement before coding it.
2. Select one primary evidence role:
   - direct recurrence self-report;
   - bounded episode;
   - exception or counterexample;
   - context or boundary statement;
   - sampled opportunity-level observation;
   - trait or interpretive label;
   - causal explanation;
   - analyst or coder inference.
3. For direct recurrence self-report, preserve the behavioral or symptom
   proposition, original quantifier, opportunity scope or denominator, relevant
   period or context, exceptions, exception frequency, and quantifier
   uncertainty. Unknown values remain explicit; do not infer them.
4. Calibrate ordinary-language strong quantifiers with exception-first prompts:
   - What situations or opportunities does the quantifier apply to?
   - Are there conditions where the behavior or outcome would not occur?
   - Within those situations, how often does it not happen?
   - Has the pattern changed across a relevant period?
   Accept natural precision such as never, almost never, sometimes,
   context-dependent, a rough fraction, or a bounded count.
5. Request a concrete incident only when it can clarify meaning, distinguish
   interpretations, resolve chronology, establish opportunity or non-action,
   explain a boundary or exception, clarify consequences or mechanism, or form
   part of a valid sampling design. Mark a confirming example requested after a
   recurrence claim as conditionally sampled detail.
6. Before a nonmandatory follow-up, record the uncertainty it targets, a
   plausible answer that would change the inference or workflow, and whether it
   could change the inference, differential, recommendation, evidence code, or
   next question. Skip it if no plausible answer would matter. Consent, acute
   safety, legal, provenance, owner-requested, and predetermined valid study
   fields remain mandatory when applicable.
7. If actual opportunity-level frequency is required, record a prospective
   diary/event frame, structured or random opportunity sample, bounded exhaustive
   enumeration, external log/observation, or repeated-measures frame. Volunteered
   examples and story counts are not such a frame.
   Record opportunities with and without the target event separately; their sum
   is the observed opportunity denominator. A sampling frame does not establish
   that repeated or clustered observations are statistically independent.

For a report such as “this happens every time I eat X,” first preserve the
recurrence report and probe eligible exposures, exceptions, conditions, dose or
form, timing, tolerated contrasts, and failure cases. Do not demand a confirming
meal as if it independently validates the frequency claim.

## Human interface contract

A human interviewer may use the conversational prompts above. A human reviewer
or annotator must receive an ordinary form or review surface before collection;
raw JSON, JSONL, or schema editing is prohibited as the judgment interface. The
surface must:

- present one evidence unit at a time with the exact source statement visible;
- use ordinary radio buttons, checkboxes, text fields, and “unknown” controls;
- reveal only the fields relevant to the selected evidence role;
- prevent a confirming example from being marked as an independent sampled
  opportunity;
- require a sampling-frame panel for sampled opportunity observations;
- capture whether framed observations are independent, dependent/clustered, or
  of unknown dependence rather than inferring independence from the frame;
- require exception details when the recurrence calibration says exceptions
  were reported;
- require the information-gain fields for a planned or asked nonmandatory
  follow-up;
- preserve uncertainty, provenance, notes, and required blinding;
- export exactly `patient-story-evidence-extension-v0.2.0.json` without changing
  the measurement semantics.

Machine validation is necessary after export but does not establish that a
human interface is usable. No human reviewer pass may start until the actual
surface is checked against these controls.

## Version boundary

Patient-story v0.1, previously collected data, and frozen study artifacts remain
unchanged. This v0.2 extension was created before an AskRigor collection pass
using it. If another load-bearing defect is found before collection, preserve
this version, record the defect, create a new theory- or target-blind method
version, regenerate its dependent schema and interface, then collect. Outcomes
or desired model fit must not determine the revision.

This correction is informed by the owner-supplied Life Patterns interview and
human-calibration methodology and the universal-dev-architecture PR #84 pattern
`patterns/interview-evidence-information-gain.md`. Those sources remain prior
method evidence; this document is the AskRigor-specific application.
