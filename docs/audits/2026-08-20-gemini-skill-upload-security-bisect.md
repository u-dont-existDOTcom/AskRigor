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

Result: **failed**. The rejection is within this six-substitution group or an
interaction among its changes.

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

Result: **failed**. The rejected content is within the three substitutions in
this probe.

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

Result: **failed**. The rejected content is within this one replacement
paragraph.

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

Result: **failed**. The clause is sufficient only if the scanner accepts a
semantically unchanged mutation control. All modified probes have failed so
far, so a hash/cache or nondeterministic boundary must be excluded first.

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
