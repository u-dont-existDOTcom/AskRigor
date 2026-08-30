# Living evidence source and analysis storage policy

Date: 2026-08-29
Status: approved for isolated pilot, curated production study-audit
read-through, and curated formal research-frontier contributions
Owner decision: store the complete analysis actually performed for each study
or review, including later clarifying analysis as new versions

## Governing distinction

AskRigor-authored **analysis** and third-party **source content** are different
data classes.

The repository stores the complete analysis AskRigor performed: ordered
sections, method-domain findings, claim capabilities, reasons, uncertainty,
limitations, disagreements, unresolved fields, future-analysis items, and exact
provenance. It does not need to copy the source body in order to preserve that
analysis. Source identity, version hash, access state, and precise locators bind
the analysis back to the inspected source.

When an older run survives only as a summary or receipt, preserve exactly that
captured extent as `partial_historical_capture`. Do not manufacture the missing
analysis from a later summary or model memory.

When an authored historical report mixes formal-evidence analysis with a data
class excluded from the pilot, import only exact allowlisted formal-evidence
sections and label the import partial. Do not call the excerpt complete, and do
not weaken the excluded-data rule merely because AskRigor authored the mixed
report.

## Pilot data classes

| Class | Pilot persistence | Requirements |
| --- | --- | --- |
| Public bibliographic and registry identifiers | Allowed | Stable identifier, provider/source, retrieval time, access state, and version provenance |
| Source-version identity | Allowed | Content SHA-256 or provider version when available; completeness and access boundary remain explicit |
| Complete AskRigor-authored analysis | Allowed and required when performed | Ordered lossless sections plus reconstruction SHA-256; no silent truncation |
| Structured study/review audit | Allowed and required when performed | Exact rubric version, every domain finding, evidence locators, unresolved fields, claim capabilities, validator/receipt provenance |
| Future-analysis items | Allowed and required when identified | Question, reason it matters, priority, state, creating analysis version, and resolving analysis version when completed |
| Formal discovery pass | Allowed | De-identified query/hash, formal source class/provider, requested and confirmed half-open windows, access/exhaustion/count receipt, limitations, and exact run/protocol provenance |
| Formal candidate decision | Allowed | Public formal identifiers/title/date, relevance summary, selected/excluded/deferred/unresolved decision and reason, observed pass, and append-only correction lineage |
| Research trail | Allowed and required when work remains | Unresolved/unattempted/blocked/discriminator/coverage-gap/delta kind, priority, state, target lane/window, and either an executable next capability or terminal reason |
| Later clarification/correction/reassessment | Allowed | Append a new version linked as `clarifies`, `corrects`, `supersedes`, or `invalidates`; retain the earlier version |
| Short source quotation | Conditional | Only when necessary to audit the exact claim and permitted by license/law; identify source and locator; otherwise paraphrase |
| Raw article, book, guideline, or database body | Prohibited by default | Requires a separate source-specific license, privacy, retention, deletion, and owner approval |
| Raw transcript, video description, comment, reply, creator/commenter identity, or person-linked episode | Prohibited | Zero durable YouTube/community records in this pilot |
| Raw chat, prompt, private research material, or personal health narrative | Prohibited | The pilot accepts public formal-evidence fixtures only |
| Raw model/provider response, credential, authorization header, secret, or private session handle | Prohibited | Reject before storage and exclude from logs, exports, and backups |

## Curated production read-through

The first production integration may retain a complete validated
AskRigor-authored study-method audit only through the one-shot administrator
import. The importer receives the exact full-text document index transiently
over stdin, reruns the existing source-linked validator, loads the current
canonical protocol manifests itself, and persists only the structured audit,
source identifiers/hashes/locators, freshness and impact state, and receipts.
It does not persist the source blocks or any public user's request, chat, tool
call, or health narrative.

The public MCP and Action paths remain read-only and perform no automatic
write-through. Curated production records are retained as append-only analysis
history until a reviewed deletion or retention action explicitly targets them;
source, protocol, freshness, and impact changes can block their current
projection without erasing history. This authorization does not extend to
private/user-derived analysis, review-audit reuse, external-evidence audit
reuse, or YouTube/community data.

The curated formal research-frontier importer is a separate contract from the
analysis importer. It stores no final-answer cache and cannot turn a candidate
or search receipt into evidence. It loads only exact current protocol manifests,
requires explicit false markers for raw source/provider, personal, and
community persistence, and uses one hashed serializable append-only transaction.
Requested work and confirmed coverage are separate. Complete passes confirm the
exact requested interval; partial/retryable work names its next capability;
terminal blocks cannot claim coverage; and a gapped delta requires an open trail
for the skipped interval. Every lane keeps one temporal coverage basis.
Candidate and trail corrections append versions, and a candidate-to-audited-
source link requires a compatible source class plus one exact shared formal
identifier.

## Analysis completeness and losslessness

One analysis version records:

- `complete_performed_analysis` when every section and structured finding
  produced by that run is present;
- `partial_historical_capture` when only a durable subset of a prior analysis
  survives;
- `clarification` when later work adds detail without displacing the earlier
  analysis;
- `correction` when later work identifies an error; or
- `invalidation` when the analysis version cannot remain current.

Analysis text may be divided into bounded ordered sections. The importer must
reconstruct the exact UTF-8 text, compare its byte count and SHA-256, and reject
the entire contribution if any section is absent, reordered, duplicated, or
changed. It cannot accept a clipped prefix as “complete.”

Structured domains and claims supplement the full analysis; they do not replace
it. Conversely, a narrative cannot replace missing required audit domains.

## Quotations and licensing

The default is nonverbatim analysis with exact source locators. For a
non-public-domain source without a separately verified reuse license:

- keep any quoted passage short and necessary for auditability;
- do not assemble distributed quotations into a substitute copy of the source;
- preserve the author/publisher/source identity and exact locator;
- record the quotation policy/license class; and
- remove or restrict the quotation if the source license/access state later
  requires it, while preserving the analysis and a tombstone explaining the
  access change.

Open access means accessible, not automatically unrestricted reuse. A DOI,
PMID, PMCID, NCT identifier, hash, page/table/section locator, and original
AskRigor analysis may usually be stored without retaining the source body, but
provider and source terms must still be checked before production activation.

## Rubric and disagreement policy

The AskRigor-native study and review audit profiles are the initial rubrics:

- the 13 domains exported by
  `apps/research-mcp/src/actions/study-method-audit.ts`; and
- the 12 domains exported by
  `apps/research-mcp/src/actions/review-method-audit.ts`.

Every finding stores `adequate`, `limitation_identified`, `unclear`, or
`not_applicable`, its full explanation, exact evidence locators, and unresolved
fields. Internal validity and applicability remain separate.

A second assessment never overwrites the first. Store both, their assessor and
rubric versions, the exact disagreement, and any adjudication as a later
analysis version. A quality ordering is a named question-specific query whose
visible dimensions and ties are reproducible; no unexplained global score is
canonical.

## Freshness ownership

| Record class | Pilot/production check | Owner | Failure state |
| --- | --- | --- | --- |
| Protocol and rubric identity | Every contributing/reusing run | AskRigor runner | `stale` and contribution blocked |
| Retraction/correction metadata | Daily where configured; before decision-important reuse if older than 72 hours | Refresh worker; maintainer on repeated failure | `due`, `checking`, then `stale` or `inaccessible` |
| Source content/version and access | Before reuse if older than 30 days or when a change signal arrives | Refresh worker | `stale` or `inaccessible`; never negative evidence |
| Active trial registry | Every 7 days | Refresh worker | `stale`; last known state remains historical |
| Completed/static registry | Every 30 days | Refresh worker | `stale` |
| Living-topic literature discovery | Every 30 days for high-priority topics; otherwise 90 days | Repository maintainer and scheduler | Topic visibly `due`/`stale` |
| Formal research-frontier lane | Resume from the earliest open gap; otherwise from the latest confirmed end at the topic cadence | Repository maintainer and scheduler | Gap, retryable block, or due delta remains actionable; no false continuous coverage |
| Analysis reassessment | On source, rubric, protocol, correction, retraction, or material contradictory-evidence event | Impact worker | `stale_pending_impact` blocks a new current projection |

No successful scheduler start is a freshness receipt. The repository records
the actual check completion, result, exact source/version, and impact status.

## Retention, export, and deletion

- The isolated pilot database and its Railway resources are retained for at
  most 30 days unless the owner explicitly promotes or extends the pilot.
- The pilot has no automated snapshot backup. A bounded logical export is made
  before restore testing and final deletion; it inherits the same data class
  and retention deadline.
- Restore testing uses a separately named disposable database or schema and
  deletes that exact target after hash/count comparison.
- Deleting a source body is not applicable because the pilot stores none.
  Removing a conditional quotation leaves a provenance tombstone and marks
  dependent analysis for review.
- Private/user-derived production retention, multi-user write access, user
  export/deletion, and automatic backup schedules require a separate approved
  production design. The curated source-free study-audit phase has no automatic
  off-host backup and declares host loss as a durability limitation.

## Synthetic Community Forum fixture class

This class is limited to the isolated development laboratory. Every account,
discussion, event, lead, and projection is invented for testing and carries an
enforced synthetic marker. Allowed AskRigor-side fields are synthetic IDs; the
SHA-256 of a synthetic `.invalid` email; pseudonymous synthetic display name;
signed event/version/visibility metadata; source and body hashes; typed
synthetic lead, consent, privacy, moderation, scientific-annotation, safety,
question, proposal, cluster, correction, and withdrawal records; and the exact
allowlisted synthetic projection. The same synthetic-only class may also hold
append-only progressive-composer versions, reporter-reviewed preview hashes,
explicit missingness and permissions, balanced frontier snapshots,
duplicate-aware independence keys, operational queue records, active-role
assignments, and operational actions whose before/after source-meaning hashes
are identical. The same class may store content-free hostile-integrity signals
bound to exact human-review queues; separate moderation/scientific
disagreement references; append-only publication state and visibility events;
exact cluster-version dependencies for questions; exact evidence-check links
for nonrecruiting proposals; and withdrawal-propagation receipts containing
only typed record/version/disposition references, review-required markers, and
hashes. Evidence, source meaning, and independence fields remain invariant
across manipulation and publication-lifecycle records.

Prohibited fields are real email or identity, real health narrative, raw forum
body, private subject reference, direct private quotation, document/media body,
provider credential, public search-index record, active recruitment/contact,
regulatory submission, hostile instruction text, or withdrawn public content.
Dead letters store no payload body. PostgreSQL rows
are append-only; a withdrawal removes the synthetic projection while retaining
a content-free audit tombstone and content-free downstream invalidation
receipt. The Compose-owned volume and disposable source
checkout are local runtime artifacts, receive no backup, and are destroyed
after acceptance.

This class is not an exception to the zero-storage rule for real YouTube or
community-derived data. Activating a real forum or importing any real community
source requires a new field-by-field storage, consent, retention, deletion,
provider-terms, security, and release review.

## Provider-specific boundary

The active YouTube API compliance review is unresolved. Apart from the
synthetic-only fixture class above, the pilot persists no YouTube or
community-derived record, including minimized findings. Source
identifiers, comments, transcripts, creator/channel identity, rediscovery
leads, corpus hashes, and derived community assertions remain outside the
durable pilot until an exact field-by-field policy and owner approval replaces
this zero-storage rule.
