# Atlas phase 2: the owner accepts findings into the evidence database (design)

Date: 22 October 2026. Status: design, reviewed by the Claude session. Built in four parts (section 9). The owner's
choices in section 8 take their recommended defaults unless the owner says otherwise. They are listed in the release
question, where the owner can change any of them before release. Parent plan: `2026-10-22-public-atlas-build.md`. Owner
decisions: `docs/public-atlas/2026-10-22-atlas-organization-draft.md`, section 6. Phase 1, the consent wording and
notice v3 with migration 0016, is on the branch (`4e90274d`, `bc5db685`).

## Summary

- **Owner actions.** There are eight new `action` values on `review_research_contribution`, so the connector stays at
  33 tools. Each decision is bound to the card record the owner inspected, by its SHA-256, the way proposal decisions
  are bound by `expectedPayloadSha256`.
- **Exact checks and judgment.** Code runs the exact checks. The AI declares meaning (topic, numbers, links), and the
  owner accepts or rejects.
- **Writing.** The proposal pattern is reused. The owner's call records a decision and a hash-bound intent. The
  existing timer job `living-evidence-admin promote-accepted` writes the canonical rows. The public runtime never
  writes canonical evidence.
- **Storage.**
  - A finding is a claim with versions in the existing claim model, tied to its studies through `evidence_bindings`.
  - Migration `0017_atlas_findings` adds eight append-only Atlas tables and two private review tables that can be
    deleted.
  - Public numbers are `F-1001` onward, from a database sequence, never derived from ARF numbers.
  - Canonical rows never hold an ARF number, a thread key, a receipt hash, the account, the answer quote, or any
    YouTube or community data.
- **Card deletion.** Deleting a card removes its decision rows and strips the GitHub card automatically. The owner then
  deletes the issue in GitHub. Accepted findings stay while they are valid (decision 7).

## 1. Owner actions

**The tool.** `review_research_contribution` (`apps/research-mcp/src/research-contribution-review-tool.ts`) is already
owner-only: it needs OAuth `cases:review` and the allowlisted owner subject (`authorizeOwnerReview`). Its four proposal
actions stay unchanged. The new actions:

| action | What it does | Required fields |
|---|---|---|
| `list_findings` | Lists what waits, compactly enough for a phone | optional `cursor` |
| `inspect_finding` | Shows one card or card item with every exact check run as a dry run, or one stored finding with its versions, label, links and write status | `card` (+`finding` or `lead`), or `atlasNumber` |
| `accept_finding` | Accepts a card finding or open lead as it stands | `card`, `finding`/`lead`, `cardSha256`, `topicKey` (+`topicLabel` if new), `numbers` |
| `edit_finding` | Before acceptance: accepts with the owner's wording. After acceptance: a new version, either a correction with a dated note or a wording fix | Before: as accept, plus the new texts. After: `atlasNumber` or `card`+`finding`, `version`, new texts, `note` |
| `reject_finding` | Declines a card item; nothing is written to the Atlas | `card`, `finding`/`lead`, `reason` |
| `withdraw_finding` | Takes an accepted finding down | `atlasNumber` or `card`+`finding`, `version`, `note` |
| `link_findings` | Records a link the AI declared and the owner agreed to; `relation: unlink` withdraws one | `atlasNumber`, `relation`, `to`, `rationale` (+`disagreement` for contradicts) |
| `forget_card` | Decision 7: removes a card and what ties it to its contributor | `card` |

**Input fields.** All fields are flat so that ChatGPT's app shows them. The schema is strict, with per-action rules in
`superRefine`.

- **Identifying the item.** `card` is `ARF-0142`, in any case. `finding` is 1 to 5; `lead` is 1 to 6. `atlasNumber`
  is `F-1007`.
- **Binding.** `cardSha256` is the hash `inspect_finding` returned. `version` is the version the AI last saw.
- **Filing.** `topicKey` (the existing key format) and `topicLabel`.
- **Texts the owner can edit.**
  - `wording` (≤500 characters), `appliesTo` (≤300), `whyNotUsual` (≤300) and `whatWouldChangeIt` (≤300).
  - `question` (≤300), before acceptance only.
  - `sources`: only a subset of the card finding's own identifiers.
- **`numbers`.**
  - A list of flat entries in `binary_results`' shape without `quote`: `outcome`, `better`, `option`,
    `option_events`, `option_total`, `comparator`, `comparator_events`, `comparator_total`, `follow_up`, optional
    `nnt`/`nnh`, and `harms_none_found`.
  - It is an empty list when the wording gives no two-group figure.
  - The same schema becomes phase 3's card numbers block.
- **Notes.** `note` (≤600) is public, and the server adds the date. `reason`, the existing field, stays private.
- **Flags.** `correction` (default true), `eraseWording` and `confirm`.
- **Links.**
  - `relation` is `same_as`, `narrows`, `contradicts`, `replaces` or `unlink`. `to` is the other F number.
  - `disagreement` is `dose`, `population`, `outcome`, `follow_up`, `study_quality` or `analysis`.
  - `rationale` (≤500).
- **Paging.** `cursor`.

**On a phone.** The owner says "accept ARF-0142 finding 1".

1. The AI calls `inspect_finding {card, finding}`, unless it just did.
2. The AI calls `accept_finding {card, finding, cardSha256, topicKey, topicLabel, numbers: []}`. It fills in the hash
   and declares the topic and the numbers itself.
3. The reply names the F number and the topic.
4. If a source is flagged and the owner says "accept anyway", the AI resends with `confirm: true`.

**Output.**

- **Schema.** The existing output schema, extended and strict. `canonicalEvidenceChangedByThisCall` stays `false` on
  every call.
- **Outcomes.** `findings_listed`, `finding_inspected`, `finding_queued`, `finding_written`, `finding_write_failed`,
  `finding_rejected`, `needs_confirmation`, `checks_not_passed`, `try_again_later`, `card_forgotten` and
  `card_forget_waiting_for_owner`.
- **Error codes.** `card_not_found`, `card_changed` (hash mismatch), `item_not_found`, `decision_conflict` and
  `atlas_review_closed`.
- **Objects.**
  - `findings`: the list view.
  - `card`: texts, and each item with its would-be label, re-check match and decision.
  - `atlas`: the number, entry kind, label and version, and the intent's id, kind, status and failure code.
  - `checks`: per source, its record, title, year, retraction status and notices. Also the bases, problems with
    numbers, community state, privacy fields, and anything that needs confirmation.
  - `forget`: what was removed, and the steps left for the owner.
- **Example reply lines.**
  - "Accepted ARF-0142 finding 1 as F-1007, a checked finding, filed under Velmor syndrome (new topic). The Atlas
    writer stores it within about 5 minutes; nothing is public until the Atlas pages exist."
  - "Accepted ARF-0142 finding 2 as a lead, F-1008: it has no verified basis."

**What waits, in two views.**

- **The GitHub inbox** stays where the owner reads cards in full.
  - A card keeps `pending-review` until every finding has a decision.
  - Each decision is posted as a comment, such as "Finding 1: accepted as F-1007, checked, 4 Nov 2026", with a hidden
    marker `askrigor-findings-decision`.
  - A fully decided card gets `reviewed` and is closed as completed.
  - The existing queue already keeps a card with comments open when it replaces it.
- **`list_findings`** is the phone view.
  - It shows up to 10 open cards with undecided items, `beyond-quick-answer` first, then the oldest.
  - For each card: the question (≤120 characters) and the save date.
  - For each item: the claim (≤160 characters), certainty, and what it would become: checked, lead only, a re-check of
    F-…, or community only (held).
  - It flags a missing public-value declaration.
  - It first lists any Atlas intent the writer refused, with its code.

## 2. Checks before acceptance (all exact)

`inspect_finding` runs every check. `accept_finding` and `edit_finding` run them again and bind the results into the
intent.

**Which save counts.** A finding's wording, sources and bases come from one save of the card: the card's own record if
it has a non-community basis, else the newest later save (occurrence comment) with the same normalized claim that has
one. `cardSha256` is the SHA-256 of the card record plus its occurrence records, so a new save between inspect and
accept forces a fresh inspect.

| Check | Rule | Exists as code | To build |
|---|---|---|---|
| Verified basis (139c) | Counts `full_text_audit`, `bounded_absence` and `research_correction`. A finding with none of them is a lead (3b), and the result says so | `VERIFIED_BASES` and the stamped `verified_bases` per stored finding (`findings/card.ts`, `findings/service.ts`) | `atlasBasesOf()`, and the rule for which save counts |
| Community (4a) | `comment_audit`, `community_checked` and `youtube_videos` are never stored. A finding with no DOI, PMID, PMCID or NCT source is refused (`community_only`). One that also rested on audited comments needs `confirm` | `withoutYouTubeData` (stored cards hold no video ids) | `communityState()` |
| Group sizes (149a) | For every declared two-group figure: both totals are present, events ≤ total, and `nnt`/`nnh` equals 1 ÷ the difference in rates, rounded up, in the right direction. The wording shows each group's figure (events and total, or the rate), in digits of any script. An NNT appears with its follow-up and has a harm entry over the same follow-up, or `harms_none_found` (153b). Undeclared figures are invisible, as in the final check, until phase 3's card block | `binaryGroups` and `binaryContrast` (private in `research-finalization-gate.ts`); `numberReadings` and `includesAbsoluteNumber` (`unicode-numbers.ts`) | Move both helpers to `apps/research-mcp/src/binary-results.ts`; add `atlasNumbersSchema` and `atlasNumbersProblems()` |
| Public record | DOI: a Crossref work exists (title, and year from `resolveDoi`). PMID: `fetchPubmedRecord` (title, year, DOI, PMCID, publication types). PMCID: `searchEuropePmc` with `PMCID:` gives the PMID and DOI. NCT: `fetchClinicalTrial`. Not found is refused; a provider that can't be reached gives try-again-later, with nothing recorded | All of these provider functions (`packages/sources`); `crossrefConfig()` and `ncbiConfig()` in `register-tools.ts` | `checkAtlasSources()` |
| Retraction | `checkRetractionStatus` (the `check_retraction_status` tool's own call) for every DOI, including a PMID's or PMCID's DOI from its record. A retracted source needs `confirm`, then is bound as context only, never as support. An expression of concern or a correction needs `confirm`, and the owner's clearing is recorded. A PMID without a DOI uses PubMed's own "Retracted Publication" type (choice 3) | `checkRetractionStatus` | The mapping, and a 10-minute in-process reuse between inspect and accept |
| Privacy | Edited texts pass the lesson screen, with study forms set aside first. No text may contain `ARF-` followed by digits. Strict schemas plus `assertNoProhibitedPersistentKeys`; there is no `answer_quote` field | `screenPrivateText`, `withoutStudyForms` (private in `card.ts`), `assertNoProhibitedPersistentKeys` | `screenAtlasTexts()`, and the ARF guard |
| Exact re-check | A later card whose normalized question and claim match a current finding is recorded as a re-check, not a new finding | The normalization in `findingsCardFingerprint` | `atlasWordingKey()` |
| Links | Both findings exist and differ, and neither is withdrawn. A lead takes no part in `same_as`, `narrows` or `contradicts`, and may only be the older side of `replaces`. No pair carries two relations. `replaces` makes no cycle (`claim_edge_cycle_guard` exists) | the `topicLinkFindings` pattern | `atlasLinkProblems()` |

## 3. Storage

**Why an intent and the timer, not a direct write.**

- **The review role's boundary.** The review role (`askrigor_research_review`) can only execute SECURITY DEFINER
  functions and holds no canonical privileges. The runbook proves that canonical reads and writes fail for it, and a
  direct write would reverse that production-verified boundary.
- **Where the checks live.** The canonical writer's identity, lineage and label checks stay in TypeScript, under the
  writer lock and SERIALIZABLE isolation, rather than being copied into PL/pgSQL.
- **What the outbox gives.** Idempotent replay after a crash, a FAILED state with a fixed code instead of a blocked
  queue, and a rollback that deletes nothing.
- **The cost.** Up to 5 minutes before the claim is stored. That's fine in phase 2, which has no pages.
- **Network checks run in the owner's call.** The admin container reaches only the database, so it can't call Crossref
  or PubMed. Their results go into the hashed payload.

**What happens, step by step.**

1. **The owner's call** runs the checks and builds a strict payload (`atlasFindingIntentSchema`).
2. **In one transaction**, it calls `decide_atlas_card_item(...)` or `record_atlas_finding_intent(...)`. That inserts
   the decision and a PENDING intent; an accept takes `nextval(atlas_public_number_seq)`.
3. **Then it posts the GitHub comment.** A failed GitHub write is redone on the next inspect or list, matched by its
   marker.
4. **The timer run.** `promote-accepted` keeps its contribution runner as it is, then runs
   `AtlasFindingPromotionRunner`.
   - It takes the oldest PENDING Atlas intent `FOR UPDATE NOWAIT`. The order is strict first in, first out, because
     later intents depend on earlier ones.
   - It re-validates the payload hash, calls `contributeAtlasFinding()`, and stores a receipt that holds only ids and
     hashes.
   - Each run promotes at most one Atlas intent (choice 7), and fails at most 20.
   - An older image never selects Atlas intents, so they stay PENDING and are never lost or failed.

The systemd units are unchanged, so `tests/research-promotion-scheduler.test.ts` holds.

**The release (AGENTS.md promotion-timer rule).**

1. Run the one-shot `migrate`, which applies 0016 and 0017, before the new image serves.
2. Re-run `provision-research-review-role` with its new grants.
3. Bind `/opt/askrigor/living-evidence-image.env` to the deployed image, and run the oneshot service by hand. Expect
   `no_pending_promotion` for both queues. Then verify the next timer trigger.
4. Check the 33-tool catalog. The owner refreshes each connector's tool list.

The switch `ASKRIGOR_ATLAS_REVIEW=enabled` keeps the new actions closed until all of that is verified. Phase 1's
notice v3 needs its own hold and restore step for rollback, like v2's (`bec187bf`): an image that reads only v1 and v2
refuses accounts that accepted v3.

**What an accept writes into existing canonical tables.**

- **`research_runs`.** The id is derived from the intent. `run_kind` is `live_research`, or `correction` for
  revisions, withdrawals and erasures. It lists the card stamp's protocol SHA-256s, with a fixed provenance note that
  names no card.
- **`topics`.** Joined by key, or a new one is created.
- **`questions`.** An exact match on topic, text and null dimensions, or a new one.
- **`claims`.** `claim_type` is `other` until phase 3 adds the kind.
- **`claim_versions`.**
  - `normalized_assertion` is the accepted wording, and `population` is `applies_to`.
  - `direction` is `unclear`, and `inference_type` is `unknown`.
  - `capability_state` is `can_support` for a finding and `uncertain` for a lead.
  - `status` is `current`.
- **Sources.** Each source joins the `source_families` row its identifiers name, provided no identifier conflicts, as
  `resolveCanonicalSource` does. Otherwise a new family is made with the same formulas as `analysisSourceIdentity`,
  plus a new `source_versions` row, `metadata_only`, with `retrieved_at` set to the check time.
- **`evidence_bindings`.** `authored_synthesis` with polarity `supports`, or `context_only` for a retracted source.
- **`repository_events`.** An event whose details carry the F number and the label, never text.

**Version chains** use `supersedes_claim_version_id`, whose unique constraint keeps each history a single line. A stale
`version` fails with `ATLAS_VERSION_STALE`.

**Labels.** One pure function, `atlasLabelOf()`, is shared by the PostgreSQL and in-memory writers. The first rule that
applies wins:

1. **withdrawn:** the latest version is invalidated;
2. **superseded:** an unwithdrawn `replaces` link points at it;
3. **lead:** no verified basis;
4. **contested:** an unwithdrawn `contradicts` link joins it to a finding that is not withdrawn, superseded or a lead;
5. **checked:** otherwise.

The writer recomputes the labels of the findings an intent touches and of their link neighbours, and writes a
`relabeled` change wherever a label differs. A superseded finding gets a status-only version marked `superseded`, and a
withdrawn one a version marked `invalidated`.

Links also write `claim_edges`, all with confidence `verified`:

- `contradicts` becomes `contradicts`;
- `replaces` becomes `supersedes`;
- `same_as` becomes `duplicates`;
- `narrows` becomes `qualifies`.

**Change records** are never overwritten:

- `accepted`, with a flag when edited at acceptance;
- `edited`, a wording fix;
- `corrected` and `withdrawn`, both requiring a public dated note (5a);
- `rechecked`, a new research date. It makes a new version only if it brings sources or a basis, which relabels a lead
  to checked;
- `relabeled`;
- `wording_removed`.

**Migration `packages/evidence-repository/migrations/0017_atlas_findings.sql`**, added to
`PostgresEvidenceRepository.migrate()` after 0016:

```
-- Private review state (the review role reaches it only through functions; nothing canonical)
SEQUENCE atlas_public_number_seq START 1001
atlas_card_decisions (card_number int, item_kind 'finding'|'open_lead', item_number smallint,
  decision 'accepted'|'accepted_as_lead'|'rechecked'|'rejected', public_number text NULL, card_sha256 char(64),
  owner_reason text NULL, intent_id uuid NULL, decided_at; PK (card_number, item_kind, item_number))
atlas_finding_intents (intent_id PK, intent_kind 'accept'|'recheck'|'revise'|'withdraw'|'link'|'unlink'|'erase',
  public_number, payload_json, payload_sha256, owner_reason NULL, status PENDING|COMPLETED|FAILED, created_at,
  completed_at, receipt_json, receipt_sha256, failure_code (closed list), failed_at, retry_of_intent_id NULL,
  texts_erased_at NULL; state check as 0012's v2 check)
-- Canonical, append-only (append_only_guard), written only by the admin writer
atlas_findings (finding_id PK, public_number UNIQUE '^F-[1-9][0-9]{3,}$', claim_id UNIQUE -> claims,
  entry_kind 'finding'|'lead', lead_origin NULL|'unverified_finding'|'open_lead', created_by_run_id, inserted_at)
atlas_finding_versions (claim_version_id PK -> claim_versions, finding_id, version_number, UNIQUE(finding_id, version_number),
  certainty NULL, usual_answer, why_not_usual, what_would_change_it, who_else, what_it_changes, tags jsonb,
  verified_bases jsonb, numbers jsonb, research_checked_on date, made_with jsonb (AskRigor version, build, protocols,
  depth, status), card_wording_key char(64) NULL, accepted_wording_key char(64) NULL, edited_at_acceptance boolean)
atlas_finding_changes (change_id PK, finding_id, intent_id, change_kind, claim_version_id NULL, label_before NULL,
  label_after, public_note NULL, link_id NULL, research_checked_on NULL, decided_at, run_id;
  UNIQUE (intent_id, finding_id, change_kind); corrected/withdrawn need public_note)
atlas_finding_links (link_id PK, from_finding_id, relation, to_finding_id, disagreement NULL, rationale, claim_edge_id,
  decided_at, run_id; from <> to; disagreement required exactly for contradicts; UNIQUE (from, to, relation))
atlas_finding_link_withdrawals (link_id PK -> atlas_finding_links, public_note, decided_at, run_id)
atlas_source_checks (check_id PK, source_family_id, provider, title NULL, published_year NULL, retraction_status
  'none_found'|'corrected_or_updated'|'expression_of_concern'|'retracted'|'not_applicable'|'unknown',
  notices jsonb ({type, date, doi}), owner_confirmed boolean, envelope_sha256, checked_at, run_id)
atlas_redactions (redaction_id PK, finding_id, claim_version_id, reason_code 'could_identify_a_person', decided_at, run_id)
atlas_intent_applications (intent_id PK, intent_kind, payload_sha256, run_id, applied_at)   -- idempotent replay
VIEW atlas_finding_current (number, entry kind, latest version, current label, topic, question, dates)
FUNCTIONS for askrigor_research_review (SECURITY DEFINER, REVOKE FROM PUBLIC): inspect_atlas_cards(int[]),
  decide_atlas_card_item(...), record_atlas_finding_intent(...), inspect_atlas_finding_intents(text[]),
  forget_atlas_cards(int[], timestamptz)
WRITER ONLY: erase_atlas_wording(uuid), atlas_redaction_permits(text, jsonb, jsonb), and a new body for
  reject_living_evidence_mutation() whose one exception is erase_atlas_wording's update of the exact text columns a
  redaction row names (the way 0014 replaced 0009's guard body; 0017 runs after 0001 on every migrate)
```

The review runtime reads canonical Atlas state through the existing SELECT-only reader, with a new
`PostgresAtlasReader.readAtlasState()`. It reads findings by number or wording key, by exact question and by shared
source family, and topics by key.

## 4. Deletion (decision 7)

**`forget_card ARF-n`**, on the contributor's request (usually by email), with no reason needed. The automatic steps:

1. Read the card's research-thread key from its marker, and find the person's other saves by exact marker match:
   earlier replaced cards, and occurrence comments on other cards with the same thread key.
2. Call `forget_atlas_cards(...)`. It deletes those cards' `atlas_card_decisions` rows, including the owner's private
   reasons. No other database row names a card.
3. Report which F numbers came only from these cards. They stay while they are valid.
4. Strip GitHub, within the App's existing `issues: write`:
   - re-file each other person's occurrence as its own card;
   - delete every comment;
   - replace the body with a tombstone;
   - remove the labels, close the issue as not planned, and lock it;
   - delete the person's occurrence comments on other cards.

The owner then deletes the stripped issues in GitHub, because editing a body leaves its edit history; the result links
each one. Calling `forget_card` again checks that each one returns 404 or 410, then reports `card_forgotten`.

**A valid finding that rests on the card** stays as it is. Canonical rows hold only the finding, its versions, the
version stamp and the research day.

**Takedown by correction.**

- Someone explains why a finding is wrong, and the owner judges it.
- The owner uses `edit_finding` (corrected, with a dated note) or `withdraw_finding` (withdrawn, with a dated note).
- New versions, change records and relabels follow automatically. For example, withdrawing one side of a
  contradiction returns the other to checked.
- A deletion request that also says the finding is wrong gets both: the forget runs automatically, and the reason is
  reviewed as a correction.

**A finding that could identify someone.** The owner judges whether it could. Then:

- `edit_finding` with `eraseWording: true` makes a new general version and erases the earlier versions' text;
- `withdraw_finding` with `eraseWording: true` erases all versions' text, leaving "withdrawn, wording removed" with its
  date.

The writer, automatically:

- inserts `atlas_redactions` rows and calls `erase_atlas_wording()`;
- puts a fixed marker in the text columns of `claim_versions` and `atlas_finding_versions`, in the notes, and in the
  wording keys;
- clears those texts from the finding's earlier intent payloads, and writes a `wording_removed` change;
- names any card still holding the original wording, and suggests `forget_card`.

## 5. Leads (3b)

**A lead is either:**

- a finding with no verified basis (`lead_origin: unverified_finding`), which keeps its source bindings; or
- a card's open lead accepted with `lead: n` (`open_lead`), which has no sources.

**How leads are stored.** As findings are (a claim, a version and a change record), with entry kind `lead`, capability
`uncertain`, and the label `lead`.

**The rules.**

- Nothing from a card reaches the database without the owner's accept.
- Leads take no part in links, except as the older side of `replaces`.
- An exact-wording re-check that brings a verified basis relabels a lead to checked, and a checked finding that
  replaces it marks it superseded.

**In phase 4,** `atlas_finding_current` rows labeled `lead` appear under "Not yet checked", next to the open trails of
accepted research maps. They never appear in lanes or search.

## 6. Privacy data map and tool inventory

`docs/privacy-data-map.md` gets a new section, "Atlas findings: owner review", with these rows:

- **Decisions** (`atlas_card_decisions`):
  - they hold the ARF issue number, the item number, the decision, the F number, the card SHA-256, the owner's
    private reason and the time;
  - they are kept until the card is forgotten;
  - the reader role can read them, as every table is readable today.
- **Intents:**
  - they hold the accepted texts, source identifiers and check results, the topic, question and numbers, the version
    stamp and the research day;
  - they never hold a card reference;
  - their texts are erased with the finding.
- **Canonical Atlas records:**
  - general knowledge written without the person, append-only;
  - kept while valid, corrected by new versions, and withdrawn by an invalidated version;
  - their wording is erased only on the path for findings that could identify someone.
- **GitHub additions:** decision comments, the `reviewed` label, closing, and the forget path.
- **Never stored in the Atlas:**
  - the account, the thread key, the receipt or its hash, and the fingerprint;
  - the ARF number outside the decisions table;
  - save times, the reported model, the surface, and the catalog hash;
  - the answer quote, YouTube ids or counts, the comment-audit basis, and community text.
- **A stated limit:** a person must name each ARF id, because their other cards can't be found from the account alone.

The deletion text in the "Findings library" section is updated to decision 7.

**Tool inventory.** Regenerate `docs/tool-inventory-v0.1.0.json`; it stays at 33 tools. `review_research_contribution`
gets:

- a new description: the findings actions, nothing public until accepted, and no canonical write from the call;
- new input and output schemas;
- `destructiveHint: true` (choice 6).

The skill doesn't change, so the plugin needs no reinstall.

## 7. Tests

**Unit**

- `tests/atlas-labels.test.ts`: label precedence; a withdrawn or superseded partner stops the other being contested; a
  lead replaced by a finding.
- `tests/atlas-acceptance-checks.test.ts`:
  - bases: community-only refused, mixed needing confirmation;
  - numbers: events above the total; an NNT of 30/120 against 18/120 is exactly 10; a non-integer NNT rounds up; the
    wrong direction; Arabic-Indic and Devanagari digits; follow-up and the harm entry;
  - the privacy screen on edits, the ARF guard, and wording-key normalization (NFKC, case, spacing, invisible
    characters).
- `tests/atlas-source-checks.test.ts`:
  - Crossref fixtures `work-no-marker.json`, `work-retracted.json`, `work-integrity-history.json` and
    `work-mixed-markers.json`;
  - PubMed with and without a DOI, and a PMCID through Europe PMC;
  - a 5xx gives try-again-later with nothing recorded, and not found is refused.
- `tests/github-findings-review.test.ts`:
  - card and occurrence parsing, with a tampered record refused;
  - decision markers idempotent and reconciled, and the card closed when every item is decided;
  - forget: thread discovery, re-filing, deleting, the tombstone, and the 410 check.
- The existing `finalize-*-binary-results` tests pass unchanged after the helpers move.

**Contract**

- `tests/atlas-intent-contract.test.ts`:
  - each intent kind parses;
  - unknown keys, `answer_quote`, ARF strings, video ids and prohibited keys are refused;
  - the `stableJson` hash is stable;
  - `prepareAtlasFindingIntent` refuses a mismatch.
- `tests/atlas-review-tool.test.ts`:
  - the short call shapes;
  - a missing `cardSha256`, `topicKey` or `numbers` gives `invalid_request`;
  - owner authorization on every action;
  - a strict output, always with `canonicalEvidenceChangedByThisCall: false`.
- `tests/mcp-tools.test.ts` and `tests/release-packet.test.ts`: 33 tools, the annotations, and a current inventory.

**Migration**

- `tests/living-evidence-production-deployment.test.ts` pins:
  - 0017 after 0016 in `migrate()`;
  - `append_only_guard` on the 8 canonical tables;
  - `REVOKE ... FROM PUBLIC` on the review functions, and exactly those 5 granted in the role script;
  - the final guard body keeping the redaction branch.
- The PostgreSQL acceptance, `scripts/research-contributor-access-postgres-acceptance.mts` (Docker):
  - migrate a fresh database, migrate twice, and upgrade from 0016 with data;
  - the review role can call only the 5 functions;
  - every canonical Atlas table refuses UPDATE and DELETE;
  - a `claim_versions` text update is refused without a redaction row, and allowed only for the named columns with one;
  - the runner: accept, lead, contested, replaces, a correction chain, withdraw;
  - failure codes (stale version, missing finding, identifier conflict), with the next intent still promoted;
  - a crash after the writer commits is completed by replay, and an old runner ignores Atlas intents.

  Where Docker is missing, the build checks the migration against PGlite (PostgreSQL in WebAssembly) outside the
  repository, as phase 1 did, and says so.

**End-to-end, hermetic.** `tests/atlas-acceptance-end-to-end.test.ts` runs inside `npm run verify`, in process, with:

- the real `FindingsSaveService` and real signed receipts;
- `tests/helpers/fake-github-findings.ts`, extracted from `findings-save.test.ts`;
- a `fetch` stub that routes by URL to the Crossref, PubMed and Europe PMC fixtures;
- in-memory review, intent and canonical stores sharing the pure planner `planAtlasWrite()`;
- a fixed clock and test secrets.

The scenario uses the draft's invented Velmor and zentarine example, with `10.0000/synthetic-*` identifiers:

1. Save a card.
2. List, inspect, accept and promote finding 1, which is stored as checked with its study bound by DOI.
3. Accept finding 2 as a lead.
4. A second card contradicts F-1001 at a lower dose; link the two, and both turn contested.
5. Correct F-1001 to version 2, with a dated note.
6. Forget the first card; F-1001 remains.
7. Scan every stored canonical and intent row for an ARF number, thread key, fingerprint, receipt hash, card SHA-256,
   answer quote or video id, and find none.

The same scenario module, `tests/helpers/atlas-scenario.ts`, also runs against PostgreSQL in the Docker acceptance.

## 8. The owner's choices (defaults applied; listed in the release question)

1. **Topic before phase 3.** a) The AI declares the topic at acceptance, and the reply names it (default). b) No
   acceptance until cards carry a topic.
2. **Audited comments under 4a.** a) They are not a verified basis, and community-only findings wait for the 4a rule
   (default). b) They count as a basis.
3. **A PMID with no DOI.** a) PubMed's own "Retracted Publication" type serves as its retraction status (default). b)
   It is unknown and needs confirming each time.
4. **Identifying wording.** a) Erased in place, through the narrow guard exception (default). b) Hidden from the pages
   but kept privately.
5. **Removing the GitHub issue.** a) The tool strips the card and the owner deletes the issue, which keeps the App at
   exactly `issues: write`, as `hasExactPermissions` enforces (default). b) The App is given permission to delete
   issues.
6. **Tool annotation.** a) The tool is marked destructive, because `forget_card` deletes (default). b) It is kept
   non-destructive, with possibly fewer confirmation prompts.
7. **Throughput.** a) One Atlas intent per timer run (default). b) A bounded batch.

**Risks**

- **Wrong topic.** It's permanent, because the tables are append-only. It's fixed with a 138b topic link, or by
  withdrawing the finding and accepting it again.
- **Source family kind.** A family created as `study` and later audited as a review cannot be joined, because
  `resolveCanonicalSource` requires the same kind. The later audit would then fail with `SOURCE_IDENTIFIER_CONFLICT`.
  The mitigation: create the family as `review` when PubMed's types say so, and test it.
- **GitHub and the database.** GitHub comments are not atomic with the database. They are reconciled by marker on the
  next inspect or list.
- **Undeclared numbers.** They stay invisible until phase 3.
- **The privacy screen** reads English for some patterns, as it does today.
- **The reader role** can SELECT the decisions table, as with every table today.
- **Later saves of a decided item** on an open card don't update its research date in phase 2.
- **The guard function.** A later migration that redefines `reject_living_evidence_mutation()` must keep the
  redaction branch, and a test pins it.

## 9. Build order (each part keeps `npm run verify` green)

**A. Storage: migration 0017, intents, writer and runner.** It can be built alongside B.

- New: `packages/evidence-repository/migrations/0017_atlas_findings.sql`;
  `packages/evidence-repository/src/atlas-findings.ts` (schemas, labels, planner, a review store in PostgreSQL and in
  memory, and the runner); `packages/evidence-repository/src/atlas-postgres.ts` (writer and reader).
- Edited: `packages/evidence-repository/src/postgres.ts` (the migrate list); `packages/evidence-repository/src/index.ts`;
  `apps/research-mcp/src/living-evidence-admin.ts`; `infra/living-evidence-production/provision-research-review-role.sh`;
  `infra/living-evidence-production/README.md`; `docs/research-contribution-promotion-scheduler.md`;
  `scripts/research-contributor-access-postgres-acceptance.mts`; `tests/living-evidence-production-deployment.test.ts`.
- Tests: `tests/atlas-labels.test.ts` and `tests/atlas-intent-contract.test.ts`.

**B. Exact checks.**

- New: `apps/research-mcp/src/binary-results.ts`; `apps/research-mcp/src/findings/acceptance-checks.ts`;
  `apps/research-mcp/src/findings/source-checks.ts`.
- Edited: `apps/research-mcp/src/research-finalization-gate.ts` (imports only); `apps/research-mcp/src/findings/card.ts`
  (exports).
- Tests: `tests/atlas-acceptance-checks.test.ts` and `tests/atlas-source-checks.test.ts`.

**C. The owner's findings actions:** `list_findings`, `inspect_finding`, `accept_finding`, `edit_finding`,
`reject_finding`, `withdraw_finding` and `link_findings`. It needs A and B.

- New: `apps/research-mcp/src/findings/github-findings-review.ts`; `apps/research-mcp/src/findings/atlas-review.ts`.
- Edited: `apps/research-mcp/src/findings/github-findings.ts` (marker exports);
  `apps/research-mcp/src/research-contribution-review-tool.ts`; `register-tools.ts`; `server.ts`; `config.ts`; the
  tool inventory; `docs/privacy-data-map.md` (Atlas rows); `docs/research-contributor-access.md`;
  `tests/findings-save.test.ts` (helper extraction); `tests/mcp-tools.test.ts`.
- Tests: `tests/helpers/fake-github-findings.ts`, `tests/atlas-review-tool.test.ts`,
  `tests/github-findings-review.test.ts` and `tests/atlas-acceptance-end-to-end.test.ts`.

**D. Decision 7: `forget_card` and wording erasure.** It needs C. There are no SQL changes, because A ships them.

- Edited: `github-findings-review.ts`; `github-findings.ts` (a re-file method); `atlas-review.ts`; the review tool;
  `atlas-findings.ts` and `atlas-postgres.ts` (the erase and forget paths); `docs/privacy-data-map.md` (the deletion
  paths); the tool inventory; and the PostgreSQL acceptance (erase and forget).
- Tests: `tests/atlas-forget-and-erase.test.ts`.
- As built (2026-10-22): the erase scope is wider than section 4's, so 0017 changed in place (it is unreleased): the
  numbers' text labels, the rationale of links touching the finding, their withdrawals' notes, and the question when
  no other finding or research frontier uses it (`atlas_question_erasable()`, `atlas_numbers_without_labels()`); the
  guard's permitted columns stay equal, table by table, to what `erase_atlas_wording()` sets, and a test pins it. A
  new failure code, `ATLAS_ERASE_NOT_WITHDRAWN`, refuses erasing every version of a finding that is not withdrawn.
  The forget steps live in a new `apps/research-mcp/src/findings/atlas-forget.ts`; a revision or withdrawal and its
  erasure are recorded in one transaction (`recordIntents`); `forget_card` asks for `confirm` when the named card
  holds another person's later save, since that saver was told its id too; and the tool, not the runner, names the
  cards that still hold erased wording, at the call and on `inspect_finding`.

**Critical files:** `apps/research-mcp/src/research-contribution-review-tool.ts`;
`packages/evidence-repository/src/research-contribution-review.ts` (the runner and failure-code pattern to mirror);
`packages/evidence-repository/migrations/0012_research_contribution_merging.sql` (the precedent for 0017);
`apps/research-mcp/src/findings/github-findings.ts`; `apps/research-mcp/src/research-finalization-gate.ts`
(`binaryContrast`, `findingsCardCheck`).
