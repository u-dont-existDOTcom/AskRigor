# Atlas phase 3: the card fields the pages need (design)

Date: 22 October 2026. Status: design, built on the branch after phase 2. It goes out in the release after the one
that carries phases 1 and 2. The owner's choices in section 10 take their recommended defaults unless the owner says
otherwise; they are listed in the release question, where the owner can change any of them before release. Parent
plan: `2026-10-22-public-atlas-build.md`, "Phase 3: card fields the pages need". Owner decisions:
`docs/public-atlas/2026-10-22-atlas-organization-draft.md`, section 6 (1b, 2a, 3b, 4a, 5a, 6a and 7). Phase 2:
`2026-10-22-atlas-phase-2-design.md`, which this design changes only where section 6 says.

## Summary

- **New fields, filled by the research AI while the papers are open.** On each finding of a findings card: its kind,
  its subject and the subject's type, its direction, the numbers block, and, for a search that found nothing, the
  searches that found nothing. On the card: its topic.
- **Who judges what.** The kind, subject, direction and topic are the AI's declarations, which the final check takes
  as given except where it can show an exact contradiction. Code checks the exact parts: counts against group sizes,
  rates and numbers needed to treat or harm against what the card states, each search against the call's own search
  receipts, and that a kind that needs numbers or a search has them.
- **Required on new public cards.** A card declared public needs every new field the final check asks for (choice 1).
  Without them it is reported, not saved or offered, and the answer goes ahead, as a card without `public_value` is
  today. Every new field is optional in the schemas, so an app whose tool list predates them still parses.
- **Acceptance uses them.** The owner's `accept_finding` takes the card's topic, numbers, kind, subject and direction
  by default, and the owner can change each. For an older card without them, the AI declares them at acceptance, as it
  declares the topic and numbers in phase 2 (choice 2).
- **Storage.** The kind gives `claims.claim_type`; the subject goes to `claim_versions.program_or_exposure` and the
  direction to `claim_versions.direction`, columns the canonical claim model already has; the numbers block comes from
  the card. Migration `0018_atlas_card_fields` adds three nullable columns to `atlas_finding_versions` (kind, subject
  type, searches) and extends decision 7's wording erasure to the searches' queries. Every append-only and privacy
  guarantee of 0017 stays.
- **The community sentence (4a)** is designed in section 7 and switched off by being absent: no schema accepts it and
  nothing stores it.
- **Tools.** The connector stays at 33 tools. `finalize_research`, `save_research_findings` and
  `review_research_contribution` get new optional fields, so each app's tool list needs a refresh at release.

## 1. The fields

Per finding (inside `findings_card.findings[]`):

| Field | Values | Judged by |
|---|---|---|
| `kind` | `effect`, `harm`, `overlooked_option`, `correction`, `nothing_found`, `tested_vs_sold` (the 156 test's six) | AI |
| `subject` | Text, at most 120 characters: what the finding is about, as people know it, such as zentarine | AI |
| `subject_type` | `condition`, `symptom`, `test`, `treatment`, `supplement`, `product`, `food`, `practice` (the 156 test's list) | AI |
| `direction` | `benefit`, `harm`, `no_effect`, `mixed`, `descriptive` | AI |
| `numbers` | The numbers block: a list of two-group yes-or-no figures, each in `binary_results`' flat shape without its quotes, at most 20 | AI declares; code checks |
| `searches` | For `nothing_found` only: each search that found nothing, as `database` (`pubmed`, `europepmc` or `ctgov`) and its exact `query`, at most 10 | AI declares; code binds |

Per card: `topic`, as `key` (the Atlas's topic key format: lower case letters, digits and `. _ -`, such as
`velmor-syndrome`) and `label` (at most 200 characters, such as Velmor syndrome).

**The numbers block** is phase 2's `atlasNumbersSchema` entry, as the card carries it: `outcome`, `better` (`fewer` or
`more`), `option`, `option_events`, `option_total`, `comparator`, `comparator_events`, `comparator_total`,
`follow_up`, and optional `nnt`, `nnh` and `harms_none_found`. It lists each two-group yes-or-no figure the claim
gives. Code works out each group's rate and the number needed to treat or harm from the counts, by the 153b rule: the
reciprocal of the difference in rates, rounded up, with the harms over the same follow-up beside a number needed to
treat. A continuous result (a mean difference, say) is not such a figure, so an effect finding may carry an empty list.

**The searches** name only searches a receipt of the call verifies: PubMed, Europe PMC and ClinicalTrials.gov, the
three tools that sign `literature_search` receipts. The receipt signs the database and the query's digest, so the
binding is exact up to case and spacing. The date the Atlas shows is the research day (the card stamp's
`research.finalized_at`): every receipt a final check accepts is at most 24 hours old, so "searched by" that day is
exact. Record counts are not carried (choice 6).

**ChatGPT's app.** It shows a finding's fields only as "unknown", because they sit below the second level. So the
`findings` field's own description, which it shows, names every new field and its values, and the tool description's
JSON examples give one effect finding with its numbers and one search that found nothing, as for the fields before.

## 2. The final check: what it verifies

`findingsCardCheck` in `research-finalization-gate.ts` gains these checks. Each problem rejects the card, which is
then neither saved nor offered and never holds back the answer, as today.

**Present, on a card declared public** (choice 1):

1. The card has `topic`.
2. Each finding has `kind`, `subject`, `subject_type` and `direction`.
3. A finding of kind `effect`, `harm` or `overlooked_option` gives `numbers`, an empty list when it gives no two-group
   yes-or-no figure. This is "a kind that needs numbers has them": the declaration is required, as `binary_results` is
   with an answer.
4. A finding of kind `nothing_found` gives at least one search.

**Exact, on any card that gives the field:**

5. **Counts are at most their sizes**, and each figure's arithmetic holds: an `nnt` or `nnh` is 1 divided by the
   difference in rates, rounded up, and the one its counts support (an `nnt` when the option did better); not both;
   none when the rates are equal (`atlasNumbersProblems`, the function phase 2's acceptance runs).
6. **The computed figures match what the card states**, in digits of any script (`numberReadings` in
   `unicode-numbers.ts`): the claim shows each group's events and total, or its rate rounded to a whole number or one
   decimal; it shows each `nnt` or `nnh` with its follow-up; and beside an `nnt` the numbers hold a harm over the same
   follow-up, or `harms_none_found` (153b). This is phase 2's acceptance check run on the claim, so a card the final
   check passes also passes acceptance (choice 3).
7. **Each figure is one the answer reported:** its four counts and its `better` are those of a `binary_results` entry
   of the same call, which the gate has already checked against the answer (choice 4).
8. **Each search is bound to the call's receipts:** a `literature_search` receipt verified in this call has the same
   database and the digest of the same query.
9. **Searches go only with `nothing_found`.**
10. **A search that found nothing states no direction:** a `nothing_found` finding's direction is `descriptive`
    (choice 5). A study that found no difference is an effect or harm finding with direction `no_effect`; HRP keeps the
    two apart ("Not shown to work" never becomes "nothing published"), and so does this.
11. **A search that found nothing is declared as one in the answer:** a `nothing_found` finding's sentence
    (`answer_quote`) is the quote of an `absence_claims` entry of state `support_not_located`, compared as the gate
    compares quotes. That sentence then gets the `bounded_absence` basis, and the answer carries the caveat that bounds
    it to the searches made.
12. **Privacy:** the subject, the topic label, each figure's outcome, option, comparator and follow-up, and each
    search's query pass the card's privacy screen (`screenFindingsCard`), and are stored without YouTube links, like
    every other card text.

**Taken as given:** whether the kind, subject, subject type, direction and topic are right, whether a figure's
outcome means what it says, and whether a search was the right one. Checks 10 and 11 are the exact contradictions
the check can show; the owner reviews the rest at acceptance.

No word list judges meaning anywhere: every check compares closed vocabularies, integers, receipt digests or quotes
normalized as the gate already normalizes them, the same in any language.

## 3. What the receipt signs and the library stores

Nothing new is signed: the card's digest, which the finalization receipt already signs, covers every new field, and
the library saves only the card whose digest the receipt signed. The stored record keeps the new fields as the card
gave them, without YouTube links, and its readable copy in the private inbox shows them under each finding (Kind,
Subject, Direction, Numbers, Searches) and the topic at the top. The stored record's strict schema
(`github-findings-review.ts`) takes them as optional, so older cards read as before; a card stored whole still reads
only if its digest matches, so its new fields are the ones the final check checked.

## 4. Compatibility

- **An app whose tool list predates the fields** sends a card without them. It parses (every field is optional), the
  final check reports what is missing, and the answer goes ahead without the card saved or offered, as for
  `public_value` (156a). Once the app's tool list is refreshed, its cards carry the fields. Today only the owner's
  account is a free contributor, and the release refreshes each app's tool list. The step that asks for a missing
  card names the new fields, as it names `public_value`, so a first card has them; a rejected card's problems are in
  the result's text, so the AI can send the card again.
- **A card checked by the previous build**, whose receipt is still within its 24 hours, is saved by
  `save_research_findings` as an older card: the receipt signed it as it was.
- **A card declared `personal_only`** is never saved, so the new fields are not required on it; any it gives are
  still checked.
- **Older cards in the inbox** (saved before this release) have none of the fields. Section 5 says how acceptance
  treats them.
- **Intents queued before this release** have no new content fields. The new fields are optional in the intent schema,
  with no default, so a queued payload parses to itself and keeps its SHA-256.
- **Rollback.** An image from before this release reads no new column and writes none; its strict intent schema
  refuses an intent with the new fields, which then stays pending, as an older image leaves every Atlas intent
  pending, and the Atlas queue waits behind it until this release serves again. Its migrate re-runs 0017's function
  bodies, so an erasure made while it serves leaves a nothing-found finding's queries in place: the runbook says not to
  erase such a finding during a rollback.

## 5. Acceptance (phase 2) with the new fields

`accept_finding` and `edit_finding` before acceptance:

- **Topic.** The card's topic is used by default: its key, and its label when the key is new to the Atlas. The owner
  changes it by sending `topicKey` (and `topicLabel` for a new topic), as in phase 2. With no topic on the card and
  none sent, the check names it (`topic_missing`). The reply says the topic came from the card.
- **Numbers.** On a card that declares its kinds, the card's numbers block is used by default (an empty list when the
  finding gives none), and the owner changes it by sending `numbers`. On an older card, `numbers` is required, as in
  phase 2. Either way phase 2's numbers check runs against the accepted wording.
- **Kind, subject, subject type and direction.** New flat fields on `review_research_contribution`: `kind`,
  `subject`, `subjectType` and `direction`. The card's are used by default, and the owner changes any of them by
  sending it. On an older card the AI declares all four at acceptance and the reply names them (choice 2); without
  them the check names what is missing (`card_fields_missing`). Check 10 runs on the result
  (`card_fields_contradict`).
- **Searches.** They come from the card only, bound at the final check, and are kept only while the kind stays
  `nothing_found`. An older card's nothing-found finding is stored without its searches, and the pages say the
  searches were not recorded with it (phase 4).

`edit_finding` after acceptance takes the same four fields, and a correction can change them; the version's searches
carry over while its kind stays `nothing_found`. A re-check (`recheck`) changes none of them, as in phase 2: the owner
adds them with `edit_finding`.

`inspect_finding` shows each card item's kind, subject, subject type, direction and the size of its numbers block and
searches, and the card's topic; `list_findings` adds the kind to each item; `inspect_finding` on an F number shows the
stored kind, subject, subject type and direction.

## 6. Storage

**Where each field goes.**

| Field | Stored in | Notes |
|---|---|---|
| kind | `atlas_finding_versions.kind` (new) and `claims.claim_type` | claim_type, fixed at acceptance: effect and overlooked option give `effect`, harm `harm`, tested against sold `applicability`, correction and nothing found `other`; no kind gives `other`, as in phase 2 |
| subject | `claim_versions.program_or_exposure` | The canonical claim model's slot for what a claim is about; NULL when not declared |
| subject type | `atlas_finding_versions.subject_type` (new) | |
| direction | `claim_versions.direction` | Its values are the column's own, without `unclear`, which stays the value for a version without one |
| numbers | `atlas_finding_versions.numbers` | Phase 2's column, now filled from the card |
| searches | `atlas_finding_versions.search_scope` (new) | A list of `{database, query}`; only with kind `nothing_found` |
| topic | `topics` via the question | As in phase 2 |

The intent payload's version content gains the same five optional fields (`kind`, `subject`, `subjectType`,
`direction`, `searchScope`), with the same values. A version written before this release, or from a decision that
did not declare them, has none of them.

**Migration `packages/evidence-repository/migrations/0018_atlas_card_fields.sql`**, added to
`PostgresEvidenceRepository.migrate()` after 0017. Safe to run again, like the others:

```
ALTER TABLE atlas_finding_versions ADD COLUMN IF NOT EXISTS kind text, subject_type text, search_scope jsonb
CONSTRAINT atlas_finding_versions_card_fields_check (dropped and added again on each run):
  kind NULL or one of the six; subject_type NULL or one of the eight;
  search_scope NULL, or a list of 1 to 10 entries on a version of kind nothing_found
FUNCTION atlas_search_scope_without_queries(jsonb)   -- each query set to the fixed marker; writer only
FUNCTION atlas_redaction_permits(...)                -- 0017's, with search_scope's queries as erasable
FUNCTION erase_atlas_wording(uuid)                   -- 0017's, also erasing search_scope's queries
```

**Every guarantee of 0017 stays.** The new columns are on a table `append_only_guard` already covers, so they are
never updated or deleted, except by `erase_atlas_wording()` under a redaction row, and only to the fixed marker. They
hold no card reference, account, thread key, receipt, answer quote, or YouTube or community data. The review role's
five functions and its grants are unchanged: they check only an intent's top-level fields. No sequence, table or role
is added.

**Decision 7's erasure** now also sets each search's query to `[wording removed]` (its database stays), and the
subject with the version's other claim texts (0017 already erases `program_or_exposure`). The in-memory writer and the
intents' erasure (`atlasErasedContent`) do the same, so the intents keep no erased query. The guard's permitted
columns stay equal, table by table, to what `erase_atlas_wording()` sets, and the test that pins it reads the latest
migration that defines each function.

## 7. The community sentence (4a), switched off

**Its design.** One sentence per finding, `community_report` (at most 300 characters): what the communities read in
the research report about the finding, as reports and not rates, written without any person, with no quotation, name,
link or video ID. It is kept apart from the claim and is never a verified basis. The counts beside it come from the
server, not the model: how many videos' comments were audited and how many threads were read. The finding page's
section 9 shows it under "What communities report", only after the owner accepts it, separately from the finding.

**Switched off means absent.** No schema has the field: the card, the stored record and the intent are strict, so a
card that sends it does not parse, and nothing community-written is collected without a use. There is no flag to
flip, because the owner's field-by-field rule, not yet made, decides the field's shape. Tests pin that each schema
refuses it.

**How it would be switched on**, in one release, after the YouTube compliance review ends and the owner approves the
field-by-field rule:

1. The rule names exactly what is kept: the sentence, the counts, the platforms, and for how long.
2. The card schema gains the field, its description taken from the rule, with the privacy screen and the YouTube
   stripping every card text has, and the stored record schema takes it.
3. A migration adds its column, which decision 7's erasure covers, and the intent payload a field for it.
4. Acceptance shows it and takes a separate yes for it (a new flag on `accept_finding`), and the reply names it.
5. The privacy data map, the notice and the privacy page say what is kept, if the rule asks for new wording, and the
   release question names the change.

## 8. Privacy data map

The "Findings library" section lists the new card fields, what the final check verifies, and that they are stored
with the card, without YouTube links. The "Atlas findings: owner review" section adds the new intent fields, the new
columns, and the erasure of the searches' queries, and says that the community sentence is not collected.

## 9. Tests

- `tests/findings-card-atlas-fields.test.ts`: the schema (each field optional, the published shapes, the community
  sentence refused); every check in section 2, each with a passing and a failing card, in another script's digits too;
  a public card without the fields rejected and a personal-only one not; YouTube links stripped from every new text;
  the stored record schema reading old and new cards.
- `tests/atlas-acceptance-checks.test.ts` and `tests/finalize-binary-results.test.ts`: unchanged messages for phase 2.
- `tests/atlas-card-fields-storage.test.ts`: the intent schema (optional, no default, the same hash for a phase 2
  payload), the claim type mapping, the searches only with nothing found, the in-memory writer and its erasure.
- `tests/atlas-review-tool.test.ts`: acceptance with the card's defaults, the owner's changes, an older card's
  required declarations, and the contradiction check.
- `tests/living-evidence-production-deployment.test.ts`: 0018 after 0017; its columns and checks; the guard's
  permitted columns equal what the latest `erase_atlas_wording()` sets.
- The PostgreSQL acceptance (`scripts/research-contributor-access-postgres-acceptance.mts`): 0018 applied and
  idempotent, an upgrade from 0017 with data, the new columns written and read back, refused updates, and an erasure
  of a nothing-found finding's queries.
- Each exact check is shown to fail its test when its code is removed (recorded in the commit message).

## 10. The owner's choices (defaults applied; listed in the release question)

1. **New fields on a new public card.** a) Required by the final check; a card without them is not saved or offered,
   and the answer goes ahead (default): the research AI is the one with the papers open, and the pages need the
   fields. b) Optional; the AI declares any missing one at acceptance.
2. **Older cards at acceptance.** a) The AI declares the kind, subject, subject type and direction at acceptance, and
   the reply names them (default): every accepted finding then has them. b) They stay empty, and such findings are
   listed apart until a correction adds them.
3. **The claim and its numbers.** a) The claim shows each group's figure and any number needed to treat or harm with
   its follow-up, as HRP's NNTAndNNH asks of an answer and as phase 2's acceptance checks the wording (default). b) The
   claim may give only the number needed to treat or harm, since the finding page shows the numbers block beside it;
   acceptance would then check the wording the same way.
4. **Figures the answer did not report.** a) Each figure on the card is one the answer reported (`binary_results`),
   so what is published matches what the person was told (default). b) The card may carry figures the answer left
   out.
5. **A search that found nothing.** a) It states no direction (`descriptive`), and its sentence is declared in the
   answer as not found (default). b) Either may differ.
6. **What a search records.** a) Its database and exact query, bound to the receipt, with the research day as its date
   (default). b) Also the number of records it found and its own date, which the finalization receipt would sign per
   finding and the library would stamp.
7. **Searches without a receipt** (another database, a web search). a) Not carried; the claim may name them in its
   words (default). b) Carried, marked as not verified.
8. **A finding with nothing to cite.** a) A nothing-found finding still cites at least one source verified in the
   call, as every finding does today, such as the studies whose populations show the gap (default). b) It may cite
   none, its searches being its basis; this would change the card's schema and phase 2's community-only check.

**No protocol sentence is needed.** The tool descriptions carry the instructions, as for `public_value`. HRP's
`NNTAndNNH` (both groups' rates and the follow-up beside an NNT or NNH, rounded up, harms beside a benefit) and its
rules on absence (`NoHumanEvidenceAbsenceClaimBeforeSweep`; "Not shown to work never becomes nothing published") are
the method the checks apply.

**Risks**

- **A wrong kind or subject** is permanent in `claims.claim_type`, which has no versions; the version's own kind,
  which the pages read, is corrected by `edit_finding`.
- **Friction.** A free contributor's card from an app with an old tool list is not saved until the list is refreshed.
- **The privacy screen** reads English for some patterns, as it does for every card text; a search query that trips
  it cannot be reworded, since it must match its receipt, so that search is left out or run again.
- **The research day** is a day late for a search made just before midnight and finalized just after; "searched by"
  stays true.
- **Rollback** (section 4): the Atlas queue waits on a phase 3 intent, and an erasure during a rollback leaves a
  nothing-found finding's queries.

## 11. Build order (each part keeps `npm run verify` green)

**A. The card fields and the final check.** `apps/research-mcp/src/findings/card.ts` (fields, privacy screen, YouTube
stripping), `binary-results.ts` (the text's name in messages), `research-finalization-gate.ts` (checks 1 to 12, the
descriptions and the JSON examples), `github-findings-review.ts` and `github-findings.ts` (stored record and readable
copy). Tests: `tests/findings-card-atlas-fields.test.ts`, and the card fixtures of the existing tests.

**B. Storage.** `packages/evidence-repository/src/atlas-findings.ts` (vocabulary, content fields, claim type,
erasure), `atlas-postgres.ts` (writer and reader), `postgres.ts` (the migrate list), migration 0018, the deployment
test and the PostgreSQL acceptance. Tests: `tests/atlas-card-fields-storage.test.ts`.

**C. Acceptance.** `apps/research-mcp/src/findings/atlas-review.ts` and the review tool's description; the scenario
and `tests/atlas-review-tool.test.ts`.

**D. Documents.** The privacy data map, the README, the infra runbook, the tool inventory and the parent plan.
