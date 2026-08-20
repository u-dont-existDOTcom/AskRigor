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

Result: **failed**. The owner reported Gemini's security scan rejected this
exact alternate. Probe 17 separates the evidence-first ordering hunk from the
added compact banned-scan sentence. The canonical v15 development skill was not
moved or changed.

## Probe 17: evidence-first ordering only

Local path:
`.artifacts/gemini-upload-bisect/17-evidence-first-only/SKILL.md`

SHA-256:
`7cb55b117cf85d3b48a3a57b1eed77a235ea5ff86f27d09611b9403d988be42f`

This starts from exact accepted v13 and replaces only the neutral-question line
with the evidence-first ordering rule. It instructs the scout to construct the
question evidence map first and then compose from its exact keys plus the
listed neutral generic vocabulary.

Probe 16's extra compact banned-scan sentence is absent. V13's original
evidence-mapping line and literal banned-phrase scan remain intact.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split evidence-map-first ordering from the `only exact keys`
  command and neutral-vocabulary list;
- **passes:** test the excluded compact banned-scan sentence alone from exact
  v13; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected this
exact alternate. The next probe keeps the ordering requirement but removes the
`using only those exact keys` command and its attached neutral-vocabulary list.
The canonical v15 development skill was not moved or changed.

## Probe 18: positive evidence-map-first ordering

Local path:
`.artifacts/gemini-upload-bisect/18-evidence-map-first-positive/SKILL.md`

SHA-256:
`7b7723af384289268224955c90f664dfa1082d2bf42ff6df94311e9943019648`

This is exact accepted v13 plus one added sentence:

`Build question_term_evidence or research_question_term_evidence before
drafting each question.`

It preserves evidence-map-first ordering while omitting `using only those exact
keys`, the explicit neutral-vocabulary command, and the compact banned-scan
sentence. No other word, instruction, marker, or line is changed.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** retain v13's existing evidence rule without an additional ordering
  sentence;
- **passes:** use this positive ordering sentence in the production repair and
  omit the rejected exact-keys command; then test the compact banned scan alone;
  and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted this exact alternate.
Use this positive ordering sentence in the production repair and omit the
rejected exact-keys command. Probe 19 now tests the remaining compact banned
scan alone. The canonical v15 development skill was not moved or changed.

## Probe 19: compact banned-phrase scan

Local path:
`.artifacts/gemini-upload-bisect/19-compact-banned-scan/SKILL.md`

SHA-256:
`45504fb8dee50f4620c6f16b793a12cdeb24988b7a2d8ea5459f08b7c4e89191`

This is exact accepted v13 plus Probe 16's compact banned-phrase scan sentence.
The list intentionally duplicates v13's existing question restriction so the
new sentence can be tested without any other post-v13 change.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** retain v13's existing banned-phrase wording and omit the redundant
  compact sentence from production;
- **passes:** the compact wording is accepted, though production may still
  avoid the redundant duplicate; assemble the repaired question group from the
  accepted positive clauses and test it with the accepted schema group; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted this exact alternate.
The compact scan is scanner-compatible, but it duplicates v13's existing
banned-phrase rule and is therefore omitted from the concise production
candidate. The canonical v15 development skill was not moved or changed.

## Probe 20: repaired schema and question group

Local path:
`.artifacts/gemini-upload-bisect/20-repaired-schema-question-group/SKILL.md`

SHA-256:
`77a74883c7855a138df3e7a173ae90566c2b156dc7af0d775173c21b3112aa80`

This starts from exact accepted v13 and combines only previously accepted,
production-worthy changes:

- Probe 08's exact `intervention_family` field contract and matching candidate
  output clause;
- Probe 18's positive evidence-map-first ordering sentence; and
- Probe 15's positive source-alignment sentence.

The accepted but redundant Probe 19 duplicate is absent. All rejected terse
mapping, exact-key, and neutral-vocabulary command forms are absent.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** one or more accepted changes interact when combined, so bisect
  schema from the two-sentence repaired question group;
- **passes:** retain this combined group and continue with the remaining
  exact-family shortcut and final-self-check changes; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected this
combined alternate even though each component had passed independently. Probe
21 removes the schema changes and tests the two accepted positive question
sentences together. The canonical v15 development skill was not moved or
changed.

## Probe 21: repaired question pair

Local path:
`.artifacts/gemini-upload-bisect/21-repaired-question-pair/SKILL.md`

SHA-256:
`299da8d50802b20ff84586619f65c844ea98a9664b2f5b74d768245ae7706a42`

This starts from exact accepted v13 and adds only the two individually accepted
positive question safeguards:

- `Build question_term_evidence or research_question_term_evidence before
  drafting each question.`; and
- `Use a cited source field for each concrete question detail.`

Probe 08's schema changes and Probe 19's redundant compact scan are absent. All
rejected command forms are absent.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** the two individually accepted question sentences interact when
  combined, so retain one and rely on v13's existing mapping rule for the other;
- **passes:** the interaction is between the repaired question group and the
  accepted schema group, so keep them separate while testing the remaining
  shortcut and self-check changes; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted the two positive
question safeguards together. This localizes Probe 20's failure to an
interaction between the accepted schema group and at least one question
sentence. Probe 22 tests the schema group with evidence ordering alone. The
canonical v15 development skill was not moved or changed.

## Probe 22: schema plus evidence ordering

Local path:
`.artifacts/gemini-upload-bisect/22-schema-plus-ordering/SKILL.md`

SHA-256:
`d06ca3a93f8dfbd4493c1718c9d8079e877e267a03d3e34f762b387a2b8492b7`

This starts from exact accepted v13 and combines only:

- Probe 08's accepted exact `intervention_family` field contract and matching
  candidate-output clause; and
- Probe 18's accepted positive evidence-map-first sentence.

Probe 15's source-alignment sentence is absent, as are Probe 19's redundant
compact scan and every rejected command form.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** the schema group interacts with the evidence-ordering sentence;
- **passes:** the remaining interaction is between the schema group and the
  source-alignment sentence, either alone or only when both question sentences
  are present; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected the
accepted schema group when combined with the accepted evidence-ordering
sentence. Probe 23 splits the schema group by retaining only its primary field
contract and restoring the candidate-output clause to v13. The canonical v15
development skill was not moved or changed.

## Probe 23: primary schema contract plus evidence ordering

Local path:
`.artifacts/gemini-upload-bisect/23-primary-schema-plus-ordering/SKILL.md`

SHA-256:
`a8825d17b1911df8300518041c1fd8369d33aadf0da1ef0ee82e7fca7f77e1a4`

This starts from Probe 18's accepted evidence-ordering artifact and changes
only the primary candidate/seed schema paragraph to Probe 08's accepted exact
`intervention_family` wording. The candidate-output clause is exact v13.
Probe 15's source-alignment sentence and all rejected forms are absent.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** the primary schema paragraph interacts with evidence ordering;
- **passes:** Probe 22's failure is caused by the candidate-output clause when
  combined with evidence ordering, so test that clause alone next; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected the
primary schema paragraph when combined with evidence ordering. That paragraph
is excluded from the production candidate in favor of v13's already functional
family rule. Probe 24 tests the other schema hunk—the exact candidate-output
field clause—with ordering. The canonical v15 development skill was not moved
or changed.

## Probe 24: candidate-output schema plus evidence ordering

Local path:
`.artifacts/gemini-upload-bisect/24-output-schema-plus-ordering/SKILL.md`

SHA-256:
`7a79ee9938d70f2079997c2e3840fbecb7dcaa1cc9f4caba06a026d5a92a25e6`

This starts from Probe 18's accepted evidence-ordering artifact and changes
only the candidate-title output clause to Probe 08's accepted wording requiring
the field named exactly `intervention_family`. The primary schema paragraph is
exact v13. Probe 15's source-alignment sentence and all rejected forms are
absent.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** both schema rewrites interact with evidence ordering, so retain
  the v13 schema wording or choose the output correction over the redundant
  ordering addition;
- **passes:** retain the exact output-field correction with ordering and omit
  the incompatible primary schema rewrite; then test the source-alignment
  sentence with this reduced production group; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted the exact candidate-
output field correction with evidence ordering. Retain this reduced schema
group and omit the incompatible primary schema rewrite. Probe 25 adds the
accepted source-alignment sentence to form the reduced production question
group. The canonical v15 development skill was not moved or changed.

## Probe 25: reduced production schema and question group

Local path:
`.artifacts/gemini-upload-bisect/25-reduced-production-question-group/SKILL.md`

SHA-256:
`00ab20508923d073caf49717205a6bf7a2362d200c3a90b372c33a9a7fd1b480`

This starts from accepted Probe 24 and adds only Probe 15's accepted positive
source-alignment sentence. It therefore contains:

- v13's primary intervention-family classification paragraph;
- the accepted exact candidate-output field correction;
- the accepted evidence-map-first ordering sentence; and
- the accepted positive source-alignment sentence.

The incompatible primary schema rewrite, redundant compact scan, and all
rejected command forms are absent.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** source alignment interacts with the reduced schema plus ordering,
  so retain ordering and rely on v13's existing exact mapping rule;
- **passes:** retain this reduced combined group and continue with the remaining
  exact-family shortcut and final-self-check changes; and
- **inconsistent result:** repeat exact v13 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected the
source-alignment sentence when added to the reduced schema-plus-ordering group.
Because v13 already requires exact evidence mappings, omit the redundant
source-alignment addition and retain accepted Probe 24 as the safe cumulative
base. Probe 26 adds only the exact-family shortcut rewrite. The canonical v15
development skill was not moved or changed.

## Probe 26: exact-family rabbit-hole shortcuts

Local path:
`.artifacts/gemini-upload-bisect/26-exact-family-shortcuts/SKILL.md`

SHA-256:
`398995c5362d63177f6c68d793a7343836d08914336a9e3d23d50c8df110639f`

This starts from accepted Probe 24 and replaces only v13's broad shortcut
paragraph with the v15 exact-family mapping. It adds dedicated topical, device,
regenerative, and behavioral shortcuts; restricts firsthand outcomes to an
outcome-led direction; and moves `dig into all high-yield signals` outside the
per-direction shortcut field. No source-alignment addition or incompatible
primary schema rewrite is present.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** the exact-family shortcut paragraph is incompatible with the safe
  cumulative group, so test it from exact v13 before deciding whether to rewrite
  or retain v13's broader shortcuts;
- **passes:** retain the shortcut rewrite and test the remaining final-self-
  check changes on this cumulative base; and
- **inconsistent result:** repeat accepted Probe 24 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted the exact-family
shortcut rewrite on the safe cumulative base. Probe 27 replaces only the final
self-check with the compact nine-item v15 form while retaining the v13 contract
marker for isolation. The canonical v15 development skill was not moved or
changed.

## Probe 27: compact final self-check

Local path:
`.artifacts/gemini-upload-bisect/27-compact-final-self-check/SKILL.md`

SHA-256:
`30bcce770938c569b60a7227efd017fb658425a5486a77fe8ee7180fda3cfb48`

This starts from accepted Probe 26 and replaces only v13's thirteen-item final
self-check with the compact nine-item v15 self-check. Its first item retains
the v13 contract marker so this probe does not test a version-marker change.
No source-alignment addition or incompatible primary schema rewrite is present.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split the compact final self-check into smaller item groups;
- **passes:** retain the compact self-check and combine the accepted execution/
  anchor body from Probe 01 with this cumulative production base; and
- **inconsistent result:** repeat accepted Probe 26 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected the full
compact self-check on the accepted cumulative base. Probe 28 tests compact
items 1–5 while retaining the substantive v13 lower-half checks. The canonical
v15 development skill was not moved or changed.

## Probe 28: compact final self-check top half

Local path:
`.artifacts/gemini-upload-bisect/28-compact-self-check-top-half/SKILL.md`

SHA-256:
`a3da1ee279517b4a208c5bac90b755fa1a07d316db0ff6401833909ba0394ecb`

This starts from accepted Probe 26. It replaces v13 self-check items 1–8 with
compact v15 items 1–5, covering the output marker/mode, metadata and claim
attribution, text-only links, probe coverage, and scope/family integrity. It
retains v13's evidence mapping, remedy scan, rabbit-hole, radical-claim, and
rediscovery checks as renumbered items 6–10. The v13 contract marker remains.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split compact items 1–5 again;
- **passes:** the rejected wording is in compact items 6–9, so test that lower
  half separately on the accepted cumulative base; and
- **inconsistent result:** repeat accepted Probe 26 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner reported Gemini's security scan rejected compact
self-check items 1–5 on the cumulative base. Probe 29 narrows this to compact
items 1–3 while restoring coverage, scope, family, and all later checks to v13.
The canonical v15 development skill was not moved or changed.

## Probe 29: compact final self-check items 1–3

Local path:
`.artifacts/gemini-upload-bisect/29-compact-self-check-items-1-3/SKILL.md`

SHA-256:
`cb1d3006654248c57c1666537aecc7aa4e847a18e5baec30ff6382b124e60b7b`

This starts from accepted Probe 26. It replaces only v13 self-check items 1–5
with compact items 1–3: mode/packet framing, metadata and attribution, and
text-only link hygiene. Every coverage, scope, intervention-family, evidence,
remedy-scan, rabbit-hole, radical-claim, and rediscovery check remains v13 and
is renumbered 4–11. The v13 contract marker remains.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split compact items 1–3 again;
- **passes:** the rejected wording is in compact items 4–5, so test those two
  separately on the accepted cumulative base; and
- **inconsistent result:** repeat accepted Probe 26 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted compact self-check items
1–3 on the cumulative base. Probe 30 adds only compact item 4, the probe and
coverage check, while preserving v13 scope/family and all later checks. The
canonical v15 development skill was not moved or changed.

## Probe 30: compact final self-check item 4

Local path:
`.artifacts/gemini-upload-bisect/30-compact-self-check-item-4/SKILL.md`

SHA-256:
`17151ab0f727d3f5ded0221e70265f508a4c3c6684b6c383963f64be70c567a7`

This starts from accepted Probe 29 and changes only self-check item 4 to the
compact v15 probe-coverage wording. It adds `batch_anchor_evidence`, three
firsthand rows, passing-only coverage, and the one-treatment-per-batch check.
Every scope/family and later research check remains v13.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** compact item 4 contains the rejected top-half wording, so split or
  positively rewrite that one line;
- **passes:** compact item 5 is the rejected top-half wording, so retain item 4
  and omit or rewrite item 5; and
- **inconsistent result:** repeat accepted Probe 29 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted compact self-check item
4. Compact item 5 is therefore the top-half failure and is omitted in favor of
v13's detailed scope/family checks. Probe 31 tests compact lower items 6–9 on
this safe cumulative self-check. The canonical v15 development skill was not
moved or changed.

## Probe 31: compact final self-check lower half

Local path:
`.artifacts/gemini-upload-bisect/31-compact-self-check-lower-half/SKILL.md`

SHA-256:
`434c87ebdfe76e12e57ce13b21d05dea189d8b5aa05720e0322e0b1e9ada8056`

This starts from accepted Probe 30, retains compact items 1–4 and v13's two
detailed scope/family checks, and replaces only the remaining evidence,
remedy/rabbit-hole, radical-claim, and rediscovery checks with compact v15 items
6–9. The incompatible compact item 5 is absent.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split compact lower items 6–9, beginning with the evidence-map
  sentence in item 6;
- **passes:** retain this hybrid self-check and combine the accepted execution/
  anchor body from Probe 01 with the cumulative production candidate; and
- **inconsistent result:** repeat accepted Probe 30 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted compact lower items 6–9
when compact item 5 remained excluded. This establishes the hybrid self-check:
compact items 1–4 and 6–9 plus v13's detailed scope/family checks. Probe 32
combines the already accepted execution/anchor body from Probe 01 with this
cumulative candidate. The canonical v15 development skill was not moved or
changed.

## Probe 32: cumulative execution and anchor contract

Local path:
`.artifacts/gemini-upload-bisect/32-cumulative-execution-anchor/SKILL.md`

SHA-256:
`e2925b60ab394740bcf0d536e7270497d6eb89d2356aad8cdb903ff6457c9ca4`

This starts from accepted Probe 31 and applies only the already accepted Probe
01 execution/anchor changes:

- passing-batch-only overlooked and conventional counts;
- one remedy or synonym class per single-intervention probe;
- nonempty anchors for every probe and `batch_anchor_evidence` per batch;
- three separately anchored firsthand-outcome rows and their count; and
- the matching query/search ledger output clause.

It retains the safe reduced candidate-output schema, evidence ordering, exact-
family shortcuts, and hybrid self-check. Rejected primary schema, source-
alignment, compact item 5, and terse mapping commands are absent.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** the accepted execution group interacts with the cumulative base,
  so split its counting/granularity and anchor/firsthand halves;
- **passes:** use this as the scanner-compatible cumulative production
  candidate, then test the contract marker/version change separately; and
- **inconsistent result:** repeat accepted Probe 31 and this exact hash before
  attributing the failure to content.

Result: **failed**. The owner confirmed Gemini rejected this cumulative
combination. Because Probe 01 accepted the same execution/anchor body against
exact v13, the failure is an interaction with the accepted cumulative Probe 31
base, not evidence that every execution clause is independently rejected. The
canonical v15 development skill was not moved or changed.

## Probe 33: counting and granularity interaction split

Local path:
`.artifacts/gemini-upload-bisect/33-counting-granularity/SKILL.md`

SHA-256:
`1ac680edc39e5c12c3e1e2914b558a95cf5283d4261b1630b89e1d2c9e83810c`

This starts from accepted Probe 31 and applies only two parts of Probe 32:

- overlooked-family and conventional-probe counts use passing batch coverage;
  and
- `single_intervention` names one remedy, with `OR` limited to synonyms or
  outcome wording.

It leaves the radical-probe wording, per-probe and per-batch anchor contract,
three-row independent-firsthand quota, and output-ledger additions at their v13
forms. This isolates counting/granularity from the anchor/firsthand half of the
failed cumulative interaction.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split passing-coverage counting from single-remedy granularity;
- **passes:** retain this half and test the anchor/firsthand half separately on
  accepted Probe 31; and
- **inconsistent result:** repeat accepted Probe 31 and this exact hash before
  attributing the failure to content.

Result: **passed**. The owner confirmed Gemini accepted passing-coverage
counting and one-remedy granularity on the cumulative Probe 31 base. Probe 34
therefore tests the complementary anchor/firsthand half against Probe 31 before
the two accepted halves are recombined. The canonical v15 development skill
was not moved or changed.

## Probe 34: anchor and firsthand interaction split

Local path:
`.artifacts/gemini-upload-bisect/34-anchor-firsthand/SKILL.md`

SHA-256:
`f2985645907eef06914c84a690bb28ee7cb1b8b66dcd9d6933821a5ea61c55c9`

This starts from accepted Probe 31 and applies only the complementary parts of
Probe 32:

- nonempty anchors for every probe and `batch_anchor_evidence` per batch;
- three separately anchored firsthand-outcome rows and their count; and
- the matching query/search ledger output clause.

It does not include Probe 33's passing-coverage counting or one-remedy
granularity paragraphs. Its radical-probe sentence removes the now-redundant
radical-only anchor clause because the universal per-probe anchor clause covers
it.

Interpret the upload only; do not run the probe as a production skill:

- **fails:** split the per-probe/batch anchor clause from the firsthand/output
  clauses;
- **passes:** both halves are independently compatible with Probe 31, so test
  their recombination to confirm or reproduce the Probe 32 interaction; and
- **inconsistent result:** repeat accepted Probe 31 and this exact hash before
  attributing the failure to content.

Result: **awaiting owner upload receipt**. The artifact passed the local skill
validator at 350 lines and 35,984 bytes. The canonical v15 development skill
was not moved or changed.
