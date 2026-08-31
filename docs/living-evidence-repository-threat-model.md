# Living evidence repository pilot threat model

Date: 2026-08-29
Status: approved implementation gate for isolated pilot
Scope: public formal-evidence identifiers plus complete AskRigor-authored
study/review analyses; no raw source or community corpus

## Assets and trust boundaries

Protected assets:

- complete analysis sections and their lossless reconstruction hashes;
- structured method findings, claim capabilities, unresolved fields, and
  future-analysis items;
- source/version identities, locators, access states, and receipt hashes;
- append-only correction, clarification, supersession, invalidation, and
  freshness events;
- discovery passes with separate requested/confirmed windows, formal candidate
  decisions, research trails, coverage gaps, and executable delta state;
- database credentials, Railway project/resource identities, and logical
  exports; and
- current versus historical knowledge projections.

Trust boundaries:

1. untrusted public source/provider material to the existing AskRigor audit;
2. validated AskRigor contribution package to the private repository writer;
3. canonical PostgreSQL rows to generated search, Obsidian, Mermaid, and
   RO-Crate views;
4. local pilot to isolated Railway private networking; and
5. primary database to logical export, restore target, and final deletion.

## Threats and controls

| Threat | Preventive/detective control | Failure behavior |
| --- | --- | --- |
| Raw source, transcript, comment, private health text, prompt, provider body, or credential is smuggled into a contribution | Strict schemas and allowlisted fields; prohibited-key scanner; fixture/content review; no generic blob field | Reject the entire contribution; do not log the rejected value |
| “Full analysis” is silently truncated | Ordered section manifest, exact UTF-8 byte count, per-section SHA-256, whole-analysis reconstruction SHA-256 | Reject; never relabel partial bytes as complete |
| A summary is reconstructed as a prior full analysis | Explicit `partial_historical_capture`; source run/receipt linkage; missing sections/domains stored as unresolved | Preserve the partial record and future-analysis item; no invented completion |
| Source version or validator receipt is mismatched | Foreign keys plus exact source-content and receipt SHA-256 equality at import | Transaction rollback; no current projection |
| Earlier analysis is overwritten by later clarity or correction | Append-only tables and database triggers reject update/delete; version relationship required | New version only; mutation fails |
| A stale map, note, cache, or embedding re-promotes invalidated analysis | Generated views select canonical current leaves after invalidation/impact state; projections carry generation receipt | Projection build fails or shows stale boundary |
| A correction/retraction arrives but dependent claims remain current | Append event, set dependency set `stale_pending_impact`, traverse bindings, require impact receipt before new current generation | Affected current projection is blocked/qualified |
| Failure or inaccessible source is treated as negative evidence | Exact access state vocabulary and explicit query filters | `stale`/`inaccessible` limitation; no effect/safety inference |
| Study identity is conflated with a paper or review | Separate source family, study/work, manifestation/version, and typed ancestry edges | Ambiguous identity remains unresolved |
| Question-independent “quality score” hides domain limits | Domain findings are canonical; rankings are named derived queries with visible keys and rubric version | No canonical score accepted |
| Analysis text contains prompt injection or executable content | Store/render as inert text; escape HTML/Markdown as applicable; no evaluation or command interpolation | Display safely or reject malformed export |
| SQL injection or role escalation | Parameterized queries; safe schema-name validation; all `PUBLIC` schema/table/sequence/function privileges revoked | Query rejected; the isolated pilot credential remains private |
| Public exposure of database/API | Railway private networking only; no public domain or public database endpoint; fail provisioning if this cannot be enforced | Pilot remains local/unprovisioned |
| Cross-environment write reaches production | Separate Railway project/environment/database names and credentials; production variables absent | Startup/preflight fails |
| Secret or sensitive data reaches logs | Construct logs from allowlisted IDs, counts, timings, states, and error codes only | Sanitized error; no request/body dump |
| Backup prevents deletion | No automated pilot snapshot; explicit logical-export inventory and retention deadline; enumerate Railway backups before deletion | Deletion incomplete until every retained copy is accounted for |
| Cost/resource runaway | $5/month ceiling, 0.5 vCPU, 512 MiB memory, 1 GiB volume, no public services, stop if enforceable limits are unavailable | Do not provision or suspend pilot |
| Restore is accepted without equivalence | Compare schema version, stable IDs, counts, analysis/source/receipt hashes, event-chain head, and fixed query results | Restore rejected and target deleted |
| Concurrent writers create split current state | Serializable contribution transactions, one transaction-scoped repository-writer advisory lock, unique lineage constraints, and deterministic idempotency keys | One writer waits; no partial generation or sibling current leaf |
| Future schema cannot interpret old analysis | Versioned contribution and rubric schemas; forward migration; preserved raw structured analysis JSON within the allowed analysis class | Old version remains readable or migration fails before commit |
| Public request silently becomes durable repository data | The public MCP/Action validator has no writer and retains read-only annotations; only the one-shot admin profile can contribute a reviewed payload from stdin | Public work remains ephemeral; a later write-through design requires a new privacy/consent gate |
| Requested date range is misreported as searched coverage | Separate requested and confirmed half-open windows; complete requires exact equality and exhaustion; blocked work cannot carry confirmed coverage | Reject the contribution or expose partial/retryable state with a next capability |
| One lane mixes publication-date, index-date, or unscoped coverage and produces an incomparable delta | Contract and database trigger require one temporal coverage basis for every pass in a lane, including later contributions | Reject the entire contribution; use a separate lane for the other basis |
| Delta search jumps over an interval and advances the apparent frontier | Same-lane prior-pass relation is database-validated; a gapped delta requires a current nonterminal coverage-gap trail; lane projection resumes from the earliest open gap | Transaction rollback or visible actionable gap; never silently advance through it |
| Candidate or trail correction overwrites history or forks from a stale leaf | Separate stable entity and append-only version tables, one initial version, unique predecessor, scope/lineage triggers, serializable writer lock | Stale sibling transaction fails; current projection selects one leaf while history remains exportable |
| A candidate is linked to the wrong audited source family | Database trigger requires a compatible formal source class and at least one exact shared identifier before storing the link | Transaction rollback; the candidate remains unlinked control state |
| Community data is disguised as a generic formal candidate | Formal-only source-class enums, prohibited-key scan, explicit false community marker, community-provider/locator rejection in both contract and database | Entire contribution rejected without logging the payload |
| Repository outage stalls every full-text page | One 1.5-second bounded candidate lookup occurs at acquisition, no lookup occurs on continuation pages, and one bounded lookup repeats at requested reuse | The same exhausted handle remains usable for a fresh audit |
| Candidate changes after it is advertised | Validation reloads the requested analysis version and repeats source, lineage, freshness, impact, protocol, rubric, receipt, and payload checks | Return fresh_study_audit_required; never reuse the cached advertisement |
| Database reader can mutate evidence | Separate fixed reader role has CONNECT/USAGE/SELECT only plus default_transaction_read_only; the public container receives no migrator URL; catalog privileges are checked during deployment | Startup/release acceptance fails; reuse stays disabled |
| Database is exposed beyond AskRigor | Dedicated internal Docker network, no published PostgreSQL port, unrelated VPS databases excluded, root-owned secret files, and no connection string in receipts/logs | Deployment is rejected or rolled back before import |

## Full-analysis privacy boundary

Analysis may reproduce sensitive facts if the input research question contains
personal health information. The pilot therefore accepts only reviewed public,
population-level fixture contributions. A future production contribution must
classify whether analysis contains user-derived or private details before
storage and must support consent, access control, export, deletion, and backup
propagation. The pilot schema's ability to store text is not authorization to
store every future analysis automatically.

## Synthetic Community Forum extension

The Community Forum migration and services are development fixtures only. The
Discourse runtime is pinned, disposable, and loopback-bound. Exact source
checkout, image digest, Compose port bindings, synthetic-only labels, noindex
site setting, disabled outbound email, and runtime teardown are acceptance evidence;
none is a production deployment control.

| Threat | Fixture control | Failure behavior |
| --- | --- | --- |
| Real identity or health content enters the lab | Runtime contracts require `synthetic: true`, `.invalid` verified email, synthetic IDs, synthetic fixture labels, and explicit operator preflight | Reject before account, event, lead, or projection creation |
| DiscourseConnect takeover or unsafe merge | HMAC-SHA256 verification, canonical payload encoding, one-use nonce, exact loopback origin and `/session/sso_login` endpoint, stable external ID, verified email, collision checks, session invalidation, and explicit administrative recovery | Reject the request; invalid requests create no account side effect |
| Webhook spoofing, replay, or reordering | Verify the signature over exact raw bytes before parsing; bind payload hash; idempotency key; source version; transactional advisory lock | Reject/collapse replay; ignore stale state changes; never resurrect deleted content |
| Failed webhook leaks a forum body | Dead letter stores only an allowlisted/fixed error code, syntactically valid event ID, raw-body SHA-256, and `raw_forum_body_persisted=false`; rejected-body exception text is never stored | Original error remains primary; no raw body is written |
| Lead cites an invented secondary source | Every source reference contains an exact signed event ID and must match the stored forum instance, topic, post, version, author, visibility, time, and content hash | Lead creation fails if any source reference is absent or mismatched |
| Public projection upgrades evidence | Exact lead/version and immutable version-record binding plus equality of verification, evidence capability, and formal-evidence relationship; exact allowlisted projection hash | Projection fails; no public-version row is inserted |
| Secondhand-lead correction is narrowed back to a narrative-only rule | Separate `PUBLIC_RESEARCH_LEAD` and `PUBLIC_NARRATIVE` gates plus hostile tests | Contract/database reject the wrong gate or unsafe projection |
| Duplicate virality inflates source independence | Duplicate-link graph and same-reporter grouping produce component-level independence keys; cluster counts cannot display effectiveness percentages | Cluster creation fails on mismatched independence count |
| Ordinary discussion is silently converted into a lead | Forum-post drafts begin as `ORDINARY_CONVERSATION`; conversion must be offered and accepted, while direct structured intake has a distinct entry point; publication separately requires `PUBLIC_LEAD=YES` and acknowledgement of the exact preview | Service transition or database publication gate rejects the request; the post remains conversation |
| A partial composer invents missing clinical detail | Progressive fields remain nullable or explicitly missing; early stop preserves the exact missing-field list; preview preparation never fills timing, persistence, co-interventions, harms, or unknowns from inference | Missingness remains visible and no publication request is created without the reporter-controlled path |
| A popular positive report dominates the default frontier or upgrades certainty | Deterministic direction-balanced ordering starts with no-effect and harm buckets before benefit, uses duplicate-aware independence keys, exposes the self-selection boundary, and marks discussion activity as non-evidentiary | View validation or snapshot constraints fail; no effectiveness percentage is representable |
| Withdrawal leaves a visible projection | Append-only withdrawal tombstone excludes the exact version from the synthetic projection view | Projection lookup returns absent while audit history remains |
| Forum role implies scientific/privacy authority | Separate role enums, explicit append-only actor-role assignments, active-role declarations, capability mappings, and a database foreign key bind every action to an assigned role | Unassigned or cross-capability input fails service/schema/database checks; no self-upgrade is inferred |
| Moderator or reviewer silently changes the member's scientific meaning | Operational actions carry exact before/after source-meaning hashes that must remain equal; scientific context remains a separate annotation | Service and database reject the rewrite; a correction must create a separate versioned member-controlled record |
| An originator performs a nominally independent review | Queue items retain originator and independent-review requirement; actions denormalize and constrain both values | The same actor is rejected by service and database constraint |
| Serious-harm fixture triggers autonomous reporting | Safety candidate requires `automated_regulatory_reporting=false`; research proposal requires `recruitment_active=false` | Database/contract rejects the state |
| Commercial coordination, sockpuppets, or vote brigading manufacture scientific certainty | Typed integrity signals bind the exact target and source-meaning hash to separate capability queues; before/after verification, evidence capability, formal relationship, and independence count stay equal regardless of engagement | Contract/service/database reject an evidence upgrade, missing queue, self-review, or automated reporting state |
| Moderator disposition silently resolves a scientific disagreement | Append-only disagreement records reference one moderation event and one scientific annotation for the same target; conduct and scientific dispositions remain separate, and unresolved science blocks overall resolution | Contract/service/database reject target mismatch, meaning rewrite, or false resolution |
| Approval is confused with actual public visibility | Append-only lifecycle records use separate state and visibility fields; `APPROVED` remains `NOT_VISIBLE`, projection establishes initial lab visibility, and an explicit challenge may preserve the visible dispute or place it on hold | Contract/service/database reject invalid transitions, stale continuity, silent exposure, withdrawal visibility, or evidence mutation |
| Withdrawal removes one page but leaves stale clusters or research work | Exact-version withdrawal receipts require the projection already absent, record contiguous cluster recomputation or retirement, and mark affected question/proposal dependencies `REVIEW_REQUIRED` without retaining public content | Receipt fails before withdrawal/removal or when public content remains; provenance stays append-only |
| A popular proposal launches despite an answered question | Questions bind exact cluster versions; proposals bind the exact question version and evidence check, reject `ANSWERED_FOR_SCOPE`, and require `recruitment_active=false` | Service/database reject missing/stale dependencies, answered-scope proposals, or recruitment |

Residual boundary: synthetic hostile fixtures do not establish production SSO,
privacy, abuse, legal/regulatory, moderation-staffing, backup, deletion/cache, or
real-user safety adequacy. Every real-data and release boundary remains closed.

## Railway boundary

Provisioning is allowed only when all of these can be read back before import:

- exact isolated project and environment identity;
- private-only PostgreSQL connectivity;
- enforceable resource/spend limits from `tasks/ACTIVE-TASK.json`;
- non-production credentials and database name;
- no public domain/database endpoint;
- logical export and restore capability; and
- exact deletion target and backup inventory.

Railway remains an optional later host. The current production read-through
uses the existing AskRigor VPS because its private Docker topology and bounded
resources are already verifiable; it never reuses another application's
PostgreSQL service.

## Acceptance attacks

The task-specific acceptance suite must include deliberate attempts to:

- import a prohibited raw field;
- omit/reorder/change an analysis section;
- claim complete capture with a mismatched byte count/hash;
- replay the same idempotency key with different bytes;
- update/delete an immutable analysis version;
- bind analysis to a different source hash or receipt;
- create a clarification without a prior version;
- resolve an unknown future-analysis item;
- use invalidated/stale analysis in the current projection;
- create a topic/source cycle where the edge class is acyclic;
- emit a generated view containing prohibited or superseded content;
- claim complete search coverage for only part of a requested window;
- create a gapped external delta without an open coverage-gap trail;
- relabel an external delta relation or bind a pass/candidate/trail across frontiers;
- fork a candidate/trail correction from a stale predecessor; and
- restore a dump whose event-chain or analysis hash differs.

## Residual limits

- Hash equality proves byte identity, not scientific correctness.
- Complete storage of an analysis does not make the analysis complete,
  correct, current, or independently validated.
- A private network reduces exposure but does not replace least privilege,
  credential rotation, backups, monitoring, or provider account security.
- The curated read-through phase does not settle production multi-user writes,
  private-data privacy, copyright, jurisdiction, off-host disaster recovery,
  or long-term operating cost.
- Production read-through separates a fixed SELECT-only reader from the
  one-shot migrator/importer credential. Dedicated refresh, backup, and
  multi-writer roles remain future gates before scheduled or multi-user writes.
