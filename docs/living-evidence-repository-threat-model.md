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
- emit a generated view containing prohibited or superseded content; and
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
