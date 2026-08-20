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

Result: **failed**. The owner reported Gemini's security scan rejected this
exact alternate. The next split separates the exact-family schema clauses from
the evidence-first question clauses. The canonical v15 development skill was
not moved or changed.

## Probe 08: exact intervention-family schema

Local path:
`.artifacts/gemini-upload-bisect/08-intervention-family-schema/SKILL.md`

SHA-256:
`1493e548dab9659b6386110b21a6ba61bcc637bccdd977b537977c0086c16b1b`

This starts from exact v13, retains the v13 contract marker, and changes only
two schema-alignment hunks:

- require the candidate and seed field name to be exactly
  `intervention_family`; and
- align the candidate-ledger output requirement with that exact field name.

The evidence-first question rewrite is restored byte-for-byte to v13. This
probe also excludes all Probe 01 execution-body changes and Probe 06's
shortcut/final-self-check changes.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split the core exact-field clause from the candidate-ledger wording;
- **passes:** the failure is in the excluded evidence-first question rewrite,
  so test that rewrite alone from exact v13; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted this exact alternate.
The exact `intervention_family` schema wording is therefore accepted by itself.
The next test isolates Probe 07's excluded evidence-first question rewrite.
The canonical v15 development skill was not moved or changed.

## Probe 09: evidence-first question construction

Local path:
`.artifacts/gemini-upload-bisect/09-evidence-first-questions/SKILL.md`

SHA-256:
`0feaa036326bd24e1300ffe433d2bd17a706847e208eb0a3065ca29c89d0a3b8`

This starts from exact v13, retains the v13 contract marker, and changes one
question-construction hunk only:

- build `question_term_evidence` before composing a question;
- limit unmapped wording to the listed neutral vocabulary;
- require every other concrete detail to map exactly; and
- retain the banned-question scan in compact wording.

Both intervention-family schema clauses are restored byte-for-byte to v13.
This probe also excludes all Probe 01 execution-body changes and Probe 06's
shortcut/final-self-check changes.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split evidence-first construction from the expanded concrete-term
  mapping rule;
- **passes:** Probe 07's failure is an interaction between the individually
  accepted schema and question changes, so replace their combined wording
  rather than attributing it to either clause alone; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected this
exact alternate. The next split tests the expanded concrete-term mapping line
separately from the evidence-first ordering and compact banned-scan wording.
The canonical v15 development skill was not moved or changed.

## Probe 10: concrete question-term mapping

Local path:
`.artifacts/gemini-upload-bisect/10-concrete-question-mapping/SKILL.md`

SHA-256:
`013c5029ab0de3a5f862ae947c9ee27169e6381b3065633b7b76a68d2d42af77`

This starts from exact v13, retains the v13 contract marker, and replaces one
line only. The replacement requires every concrete intervention, brand, diet,
adverse effect, symptom, manifestation, synonym, or example in a question to
map exactly; it prohibits invented concrete details and tightens the
`unmapped_question_terms: none` construction check.

The evidence-first ordering sentence and compact banned-scan sentence are
absent. Every other byte is exact v13.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** the single replacement line, or its interaction with v13, is
  sufficient to trigger the scanner; split that line semantically before
  rewriting the production rule;
- **passes:** test the excluded evidence-first ordering and compact banned-scan
  wording from exact v13; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected this
exact one-line replacement. Probe 11 isolates its distinct prohibition on
inventing absent concrete details. The canonical v15 development skill was not
moved or changed.

## Probe 11: no-invent detail guard

Local path:
`.artifacts/gemini-upload-bisect/11-no-invent-detail-guard/SKILL.md`

SHA-256:
`616b9776e564cdf13679b58f77bfe650e8f4e00385677fcb537e5982a06bb953`

This is exact accepted v13 plus one added sentence:

`Never invent a plausible concrete detail absent from the map.`

No other word, instruction, marker, or line is changed.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** this sentence, or its interaction with v13, is sufficient to
  trigger the scanner; replace the production guard with scanner-compatible
  positive wording rather than retaining it;
- **passes:** test Probe 10's excluded expanded concrete-term coverage and
  construction-audit clauses without this sentence; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted this exact alternate.
The standalone no-invent guard is accepted by itself. Probe 12 tests the rest
of Probe 10's replacement line without this sentence. The canonical v15
development skill was not moved or changed.

## Probe 12: concrete coverage and construction audit

Local path:
`.artifacts/gemini-upload-bisect/12-concrete-coverage-construction/SKILL.md`

SHA-256:
`3120466fd7c1485dd7fd121097896355e4b46e661f53bc03f9250a60bb6a67b9`

This starts from exact v13, retains the v13 contract marker, and replaces one
line only. It requires every concrete intervention, brand, diet, adverse
effect, symptom, manifestation, synonym, or example to map exactly; requires
examples introduced by `e.g.` or `such as` to map; and emits
`unmapped_question_terms: none` only after the construction audit.

The accepted no-invent sentence is absent. The evidence-first ordering and
compact banned-scan sentences are also absent. Every other byte is exact v13.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split concrete-term coverage from the example/construction-audit
  clauses;
- **passes:** Probe 10's failure is an interaction between two individually
  accepted pieces, so replace their combined production wording; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected this
exact alternate. Probe 13 isolates the concrete-term coverage sentence from the
mapped-example and construction-audit clauses. The canonical v15 development
skill was not moved or changed.

## Probe 13: concrete-term coverage sentence

Local path:
`.artifacts/gemini-upload-bisect/13-concrete-term-coverage/SKILL.md`

SHA-256:
`f4dfeceaa0ad6d1e821931ecac51ce57cd52997d5e140710d1ea02a6ee283a31`

This is exact accepted v13 plus one added sentence:

`Every other concrete intervention, brand, diet, adverse effect, symptom,
manifestation, synonym, or example must map exactly.`

The mapped-example and construction-audit changes are absent. No other word,
instruction, marker, or line is changed.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** this sentence, or its interaction with v13, is sufficient to
  trigger the scanner; split its coverage vocabulary from the exact-mapping
  command before rewriting production wording;
- **passes:** test Probe 12's excluded mapped-example and construction-audit
  clauses without this sentence; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected this
exact one-sentence addition. Probe 14 preserves the command form while removing
the medical/intervention vocabulary list. The canonical v15 development skill
was not moved or changed.

## Probe 14: exact-mapping command form

Local path:
`.artifacts/gemini-upload-bisect/14-exact-mapping-command/SKILL.md`

SHA-256:
`590cd9344246dce4a9688d35c4eb9c8b12a72674491576a13225dd8dbc8c4a95`

This is exact accepted v13 plus one added sentence:

`Every other concrete example must map exactly.`

It preserves Probe 13's command form while removing the intervention, brand,
diet, adverse-effect, symptom, manifestation, and synonym list. No other word,
instruction, marker, or line is changed.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** the command form, or its interaction with v13, is sufficient to
  trigger the scanner; replace it with positive source-alignment wording;
- **passes:** the rejected content is in Probe 13's expanded vocabulary list or
  its interaction with the command, so test the vocabulary separately; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected this
exact one-sentence addition. Because the medical/intervention vocabulary was
absent, the terse `Every other ... must map exactly` command form is the useful
boundary. Probe 15 tests a positive source-alignment replacement. The canonical
v15 development skill was not moved or changed.

## Probe 15: positive source alignment

Local path:
`.artifacts/gemini-upload-bisect/15-positive-source-alignment/SKILL.md`

SHA-256:
`cc4d45fbed10b34688ebdc173832607c84de9e66143471c57732e1320b400495`

This is exact accepted v13 plus one added sentence:

`Use a cited source field for each concrete question detail.`

It preserves the source-alignment requirement while avoiding `Every other`,
`must`, and `map exactly`. No other word, instruction, marker, or line is
changed.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** the broader concrete-detail/source-field formulation is also
  rejected, so retain v13's existing evidence rule and drop the redundant new
  sentence;
- **passes:** use this positive wording in the production repair and continue
  testing the remaining post-v13 changes; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted this exact alternate.
Use this positive source-alignment sentence when repairing the production
question rule. Probe 16 continues with the remaining evidence-order and
banned-scan changes. The canonical v15 development skill was not moved or
changed.

## Probe 16: evidence ordering and banned scan

Local path:
`.artifacts/gemini-upload-bisect/16-evidence-order-banned-scan/SKILL.md`

SHA-256:
`f725a9e983b6e8fcefbef69d31292a4f5203d88ccc97f9f60ce78861392eeb8d`

This starts from exact accepted v13 and changes only the remaining two parts of
Probe 09's question hunk:

- build the question evidence map before composing the question, then use its
  exact keys plus the listed neutral generic vocabulary; and
- retain the banned-phrase list in a separate compact scan sentence.

The rejected `Every other ... must map exactly` command and the accepted
positive replacement are both absent. V13's original evidence-mapping line
remains intact.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split evidence-first ordering from the compact banned-scan
  sentence;
- **passes:** combine these accepted clauses with Probe 15's positive wording
  in the production repair, then test the repaired question group with the
  accepted schema group; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **awaiting owner upload receipt**. The artifact passed the local skill
validator at 358 lines and 36,653 bytes. The canonical v15 development skill
was not moved or changed.
