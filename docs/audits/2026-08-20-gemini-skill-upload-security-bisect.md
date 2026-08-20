# Gemini skill upload security bisect

## Observed boundary

- v13 uploaded successfully and still uploads successfully. Its SHA-256 is
  `e9c6ee9f5a3ce336f55c0b0edd2c3c4184f597624bd56b599a53e31ae7e41352`.
- v14 and the smaller v15 both failed Gemini Spark's security scan.
- Therefore total bytes are not the deciding variable. The failure is within a
  post-v13 content delta or interaction. Do not change the known-good control.

The canonical development skill remains v15 at
`integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md`. v13 is
available from commit `001a47b`. Upload probes are local ignored artifacts so
failed experimental prompts cannot become a supported skill accidentally.

## Probe 01: execution and anchors

Local path:
`.artifacts/gemini-upload-bisect/01-execution-anchor/SKILL.md`

SHA-256:
`99d1e3d26bde76a01eb47a90e7ced09ced68cbf48225f79dda7d57ea942174bd`

This starts from exact v13 and changes only:

- passing batch coverage for overlooked and conventional counts;
- one remedy per `single_intervention` probe;
- nonempty anchors for every probe and per-probe batch anchor evidence;
- three separately anchored firsthand probes; and
- the corresponding query-ledger output fields.

It excludes the post-v13 candidate-family field rewrite, question-construction
rewrite, shortcut expansion, and final self-check rewrite.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** bisect the execution/anchor group;
- **passes:** retain these changes and bisect the excluded schema/question group;
- **inconsistent result:** repeat exact v13 and this exact probe hash before
  attributing the failure to content.

Record only the literal pass/fail receipt and artifact hash. Do not infer which
word triggered an opaque scanner.

Corrected result: **passed**. The owner confirmed the intended Probe 01 file was
accepted. The earlier failure report came from uploading a different file.

## Probe 02: counting and granularity

Local path:
`.artifacts/gemini-upload-bisect/02-counting-granularity/SKILL.md`

SHA-256:
`a97bf7073bdb391901db4109990fa230f17eaf9dcb4d79aa96c08856b15e1298`

This starts from exact v13 and applies three substitutions only:

- count overlooked families only after passing batch coverage and prevent a
  `single_intervention` probe from joining separate remedies;
- count conventional directions only after passing batch coverage; and
- emit and enforce three separately anchored firsthand directions.

It contains none of Probe 01's new all-probe anchor-evidence paragraph, radical
anchor relocation, or query-ledger output rewrite.

Interpretation:

- **fails:** split the three counting/granularity substitutions;
- **passes:** the rejected change is in Probe 01's anchor-evidence half, so test
  that half directly before splitting it.

Result: **not tested**. The earlier failure report is invalid because a
different file was uploaded.

## Probe 03: family counting and probe granularity

Local path:
`.artifacts/gemini-upload-bisect/03-family-granularity/SKILL.md`

SHA-256:
`8807a426f843ff8b2729891486bff0559c29ed4576dfa9f90f6b47d3886539b2`

This starts from exact v13 and replaces one paragraph only. It adds passing
batch coverage to overlooked-family counts and states that a
`single_intervention` probe names one remedy while `OR` joins only synonyms or
outcome wording. It contains neither conventional-count nor firsthand-count
changes.

Interpretation:

- **fails:** split this one paragraph into its family-count and granularity
  clauses;
- **passes:** test the conventional-count and firsthand-count substitutions as
  the remaining half of Probe 02.

Result: **not tested**. The earlier failure report is invalid because a
different file was uploaded.

## Probe 04: overlooked-family count coverage

Local path:
`.artifacts/gemini-upload-bisect/04-family-count-coverage/SKILL.md`

SHA-256:
`81a79526e554c3fa4c40845bcc97f8309f48e4b50858380e992efddb093d2c34`

This is exact v13 except for one inserted clause: an overlooked family counts
only when a probe in that family has passing batch coverage. Every other word,
line break, and instruction remains the accepted v13 content.

Interpretation:

- **fails:** the inserted coverage clause itself, or its interaction with v13,
  is sufficient to trigger the scanner;
- **passes:** the trigger is in Probe 03's separate-treatment/granularity
  rewrite rather than its family-count clause.

Result: **not tested**. The earlier failure report is invalid because a
different file was uploaded. This probe and the mutation control are no longer
the active branch: Probe 01 passed, so the next valid test is the excluded
schema/question half of the original split.

## Probe 05: blank-line mutation control

Local path:
`.artifacts/gemini-upload-bisect/05-blank-line-control/SKILL.md`

SHA-256:
`36af81951bcede7ac83955d7995e9c7ef417ea18f9fd127be1b8b782097f89f2`

This is byte-identical to accepted v13 through byte 36,422 and appends one LF
byte. It changes no instruction, marker, metadata, word, or punctuation.

Interpretation:

- **fails:** stop textual bisecting; Gemini is accepting the exact old artifact
  but rejecting any mutation, or the scanner result is unstable;
- **passes:** return to Probe 04 and treat its inserted coverage clause as a
  sufficient content trigger.

Result: **not tested**. The earlier failure report is invalid because a
different file was uploaded. This mutation-control branch is no longer active
after the corrected Probe 01 pass.

## Probe 06: schema, questions, shortcuts, and final self-check

Local path:
`.artifacts/gemini-upload-bisect/06-schema-question-selfcheck/SKILL.md`

SHA-256:
`da09e2276c9dcdff93b042db1d90a02938558286215c9ae637a61cd5593a539a`

This starts from exact v13, retains the v13 contract marker, and applies only
the complementary post-v13 textual changes excluded from Probe 01:

- standardize the candidate and seed field name as exactly
  `intervention_family`;
- construct question evidence maps before composing questions;
- compact the candidate-ledger field wording;
- map rabbit-hole shortcuts to exact intervention families and keep
  `all high-yield` at map level; and
- replace the final self-check with the compact v15 version.

It does not apply Probe 01's execution-body changes to family/count coverage,
single-intervention batching, all-probe anchor evidence, separately anchored
firsthand probes, or the query-ledger schema. The compact final self-check does
refer to those controls because this probe preserves that remaining v15 text;
the governing execution paragraphs themselves remain exact v13.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split this complementary group, starting with the
  schema/question clauses versus shortcut/final-self-check clauses;
- **passes:** both halves are individually accepted, so test their combined
  content while retaining the v13 marker to distinguish a content interaction
  from the v15 marker; and
- **inconsistent result:** repeat exact v13, Probe 01, and this exact hash
  before attributing a failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected this
exact alternate after Probe 01 passed. This localizes the next split to the
complementary group but does not identify a particular word or clause. The
canonical v15 development skill was not moved or changed.

## Probe 07: candidate schema and evidence-first questions

Local path:
`.artifacts/gemini-upload-bisect/07-schema-question/SKILL.md`

SHA-256:
`939d47bb5467a0ffb523a47b66e75cafd81eba12db79de1b7dca102b7af6b257`

This starts from exact v13, retains the v13 contract marker, and changes only
three related hunks:

- require the candidate and seed field name to be exactly
  `intervention_family`;
- build question evidence maps before composing questions and limit unmapped
  wording to the stated neutral vocabulary; and
- align the candidate-ledger output wording with that exact field name.

It excludes Probe 06's exact-family shortcut expansion and compact final
self-check, as well as every Probe 01 execution-body change.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split the exact-family schema clauses from the evidence-first
  question clauses;
- **passes:** retain these three hunks and test Probe 06's excluded
  shortcut/final-self-check half from exact v13; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **awaiting owner upload receipt**. The artifact passed the local skill
validator at 358 lines and 36,209 bytes. The canonical v15 development skill
was not moved or changed.
