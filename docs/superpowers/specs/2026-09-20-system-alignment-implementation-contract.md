# AskRigor system alignment — implementation contract v1

Date: 2026-09-20
Status: Chat-authored design for isolated implementation and review; NOT deployed or behaviorally validated.
Design ID: ASKRIGOR-SYSTEM-ALIGNMENT-20260920-V1
Source baseline: 59dcc0acdf207ba71a870e50ca4ef66036da3342
Owner outcome: reliable AskRigor discovery and faithful policy execution across consumer surfaces, with implementation-only Work and controller-mediated supervision rather than owner message relaying.

## 1. Scope and authority

Implement this contract on a new isolated task branch. Keep the existing prompt-led research product, deterministic retrieval services, controlled research controller, and Mission Control. Do not revive the separately deprioritized executable epistemic-verifier campaign. This is a repair of composition, delivery, discovery execution, evidence reporting, and operational continuity, not a new clinical methodology or an independent evaluation of treatment efficacy.

Preserve canonical XML bytes during this implementation: HRP 20.5.29 SHA-256 254759df38934c28b06709dace9fcb266fc9967913be1296de99a461be596816; Universal 20.5.26 SHA-256 c869d770ecc13280a40567ba382324e1d9a6b0af7c35165008781f186317d9b2. A proposed change to scientific policy must return to the reasoning supervisor as an exact delta, not be invented by Work.

Preserve YouTube as the primary community-discovery lane when relevant. Complementary forums address material coverage gaps, independent replication, contrary reports, or new candidates; no fixed platform quota or automatic Reddit-first substitution. Do not hardcode particular remedies or treat previous unverified anecdote rankings as evidence.

No paid model API calls, purchased credits, new infrastructure, production deployment, database migration, credential rotation, authentication weakening, speculative account changes, or modification/use of frozen MAST/validation material. Existing parallel branches and dirty workspaces must remain intact. Do not merge a branch whose merge triggers deployment. Source changes and a reviewed implementation candidate do not imply installation or release.

## 2. Findings and non-findings

The public skill contains a manually maintained compressed workflow, while canonical HRP and the Forum module contain fuller triggers and obligations. This is a source-alignment risk; the omitted-remedy incident did not establish an AskRigor discovery failure because its connector had not executed. A shorter phrase alone does not prove changed behavior when the complete canonical protocol is loaded and applied.

The standard public registry contains 27 operations. Transcripts, scouting and landscape assessment also exist behind controlled/internal routes. A tool absent from public MCP is not necessarily absent from the product. Fix surface bindings, not by automatically publishing every internal operation.

The public load_protocol handler separately reads text and manifest with Promise.all even though loadProtocolSnapshot already provides a single-read pair. This creates an avoidable inconsistent-read opportunity. The Action chunker checks body/hash consistency; reuse its useful controls rather than claiming it silently accepts mismatches.

Controlled semantic work already loads four policy documents through research-semantic-policy-input.ts. Session binding currently checks expected protocol manifests while operational policy documents are loaded for work packages. Add an explicit whole-bundle session binding so module-only drift is tested and cannot silently change an ongoing run.

The developer-MCP FORBIDDEN message identifies a denied conversation capability, not its unique cause. Fresh-conversation lifecycle, host mode, installed snapshot, account entitlement, and server authorization are separate hypotheses. Do not label a Pro-plan/read-write catalogue hypothesis proven. Published OpenAI documentation was inconsistent about Pro write capability at review time; actual controlled tests decide compatibility.

## 3. One policy source per rule, not one giant duplicate prompt

Keep scientific semantics in the complete canonical protocols. Keep public operational tactics in their existing authoritative Project router and Forum module. Keep transport bindings in a small public adapter. Internal development governance remains internal.

Add project/PUBLIC_PLUGIN_ADAPTER.md for only consumer bootstrap, transport selection, public capability mappings, and output provenance. Add project/public-runtime-bindings.json declaring each public surface, available binding, canonical gate reference, generated resource and explicit unsupported behavior. It must not contain another freehand clinical activation taxonomy.

Add scripts/generate-public-plugin-runtime.mts. Generate skills/askrigor/SKILL.md, exact packaged public operational references, a source/dependency manifest, and the MCP initialization-instruction module from those sources and the actual operation registry. Include PROJECT_INSTRUCTIONS.md and FORUM_SIGNAL_MODULE.md as exact, hash-bound public references under the declared skill tree. Do not copy AGENTS.md, development inheritance, private Mission Control configuration, or owner preferences into the public package.

The generated skill references canonical gate identifiers and loads their authority; it does not independently narrow their predicates. A necessary point-of-use reminder may be generated verbatim from a stable canonical anchor. This is not a blanket ban on useful repeated reminders. Every normative projection has one source and every generated artifact has a reproducible source map. Removing an anchor, changing its text, modifying a generated output, or omitting a declared reference must fail the consistency check.

Generation is deterministic code, not an LLM paraphrase. A length limit may cause a build error or a deliberate split into required references, never silent truncation. Keep Project/Custom-GPT editor artifacts within their actual 8,000-character limits. Do not impose that editor limit on the complete research corpus.

## 4. Lossless public runtime delivery

Fix load_protocol immediately to use one loadProtocolSnapshot result. Keep existing protocol-only calls and return fields backward compatible.

Add one read-only standard-v2 operation, load_research_runtime, to deliver a complete public research bundle. This is the selected compatibility repair: a bare MCP app cannot be assumed to possess files from a separately installed Codex skill. Reuse the existing four-document policy loader and validation logic; do not create a competing policy store or orchestrator. The public bundle includes the exact canonical documents, exact public operational references, generated adapter/bindings, and source manifests. It exposes only an allowlisted public document set, never arbitrary paths or internal configuration.

Use the existing opaque-continuation approach for bounded UTF-8 chunks. The initial request selects an advertised public profile; subsequent requests carry only the bound continuation handle. Bind profile, immutable bundle digest, document order, chunk index/offset, expiry and format version. Return total bytes, per-document hashes, chunk hash, next handle and terminal status. Concatenation must reproduce the exact bundle bytes. Do not interpret the last chunk alone as complete loading.

Set a conservative default serialized-response ceiling of 32 KiB, including JSON escaping and any duplicated text representation; calculate actual bytes, do not only cap raw text. Chunk size may be lower for a measured host limit, but is fixed for a chain. Unicode boundaries, empty content, duplicate/reordered/skipped pages, tampering, expiry and changed sources require explicit tests. Expired or drifted chains restart from an explicitly selected bundle; never combine old and new bytes.

Bind bundles to a release manifest before serving them. All source files must match that manifest; a mixture from concurrent deployment fails instead of producing an apparently valid mixed bundle. Reuse content-addressed immutable public snapshots/cache with bounded retention. This adds no private research persistence.

A delivery receipt proves delivered byte continuity, not attention, comprehension, scientific correctness, or general model compliance. If the consumer cannot actually accommodate the complete corpus, report that capability boundary. Do not silently summarize the protocol or claim complete activation from its checksum.

Standard-v2 has the existing 27 operations plus load_research_runtime. Preserve the legacy catalogue and existing Gemini projection during rollout, with explicit profile/version fixtures; do not silently make every profile 28 tools. New metadata/schema requires refresh and fresh-client acceptance before deployment is declared complete.

## 5. Consumer and capability contracts

Test four different consumers: bare developer MCP app, installed skill package, Project, and controlled Custom GPT. Sharing a repository or endpoint does not prove that they loaded the same instructions.

Generate short MCP initialization guidance, placing essential sequence and provenance rules first. Explicit diagnostic requests execute only the requested diagnostic operation: no enrollment mutation, research, ancillary search, or protocol-compliance claim. Ordinary research retains the existing consent/access gate and loads its exact runtime bundle. Render the server-returned access notice without inventing agreement or checkout options.

The capability map distinguishes PUBLIC_DIRECT, CONTROLLER_INTERNAL, HOST_PROVIDED and UNAVAILABLE. Only advertised callable tools may be invoked directly. Controlled GPT continues to use start/continue/status/finalize and server-directed work; it must not independently orchestrate the internal retrieval tools. A missing transcript path limits creator-content claims, not the existence of separately retrieved comments. A missing provider is not a zero-result search.

Do not split the product into read-only and administrator apps merely because the earlier conversation suggested it. First compare the unchanged manifest call in an existing chat, a fresh correctly configured chat, and the supported current consumer mode. Only a reproduced catalogue-specific incompatibility authorizes a separate compatibility projection. Keep accurate annotations and genuine confirmation boundaries; never relabel writes as reads or change permission modes to evade approval.

A connector failure may produce a truthful diagnostic or an explicitly authorized bounded fallback. A fallback preserves the question, source-scope restrictions, unseeded discovery and uncertainty labels. It is never presented as AskRigor-executed or full-HRP research without the corresponding evidence.

## 6. Whole-bundle session consistency

Extend session creation, semantic package construction, continuation, persistence and finalization to bind a runtime bundle digest covering protocols AND operational modules/bindings. Reuse existing ResearchSemanticPolicyContext and state-digest machinery.

On source changes, existing sessions either finish against the retained exact bundle or enter a specific policy-drift state. They never silently inherit new operational semantics while retaining an old protocol-only identity. New sessions use the new reviewed bundle. Migration of an existing session requires a supervisor-directed compatibility decision; Work may implement the mechanics but not decide semantic equivalence.

Distinguish policy/source drift, missing dependency, authentication, unsupported consumer, provider quota, malformed response, and empty successful retrieval. Preserve source error codes in technical evidence without exposing secrets. Do not collapse all exceptions into one generic unavailable state where the precise category is known.

## 7. Discovery behavior and scoped evidence

Do not add another copy of the already-existing what-finally-worked rule. Test that the canonical broad-real-world-effectiveness trigger survives the actual adapter-plus-runtime composition.

For a broad question, the observable sequence is: resolve the target and important diagnosis/exposure ambiguity; build a provisional intervention-space inventory; run unseeded YouTube discovery; extract source-grounded specific candidates; broaden around newly discovered candidates and uncovered classes; then select nonredundant deep audits. Discovery remains iterative: later comments can reopen it. Do not require an exhaustive imaginary catalogue before learning anything from a source.

Search benefit, no effect/failure, harm and discontinuation. Keep creator statements separate from firsthand commenter episodes; deduplicate source/person/episode where defensible and preserve unknown identity. Preserve exact formulation, co-interventions, population, endpoint and horizon. Do not transfer venous pooling reports into proof about lymphatic injury or general recurrence without an explicit applicability limit.

Preserve the canonical availability-conditioned breadth/depth rules; do not invent a new video quota or remove an existing floor to make a run finish. Counts of views, comments or positive posts are not efficacy or population-response denominators.

Represent user source restrictions explicitly. A community-only request must not silently initiate studies. Its output may describe the observed community evidence and missing layers, but cannot claim full-HRP completion or a clinical comparative verdict that requires excluded work. Reuse the existing bounded-evidence path and keep full completion blocked where appropriate. A source restriction cannot erase urgent safety information, but does not authorize unrelated medical research.

## 8. Liveness and final reporting

Every nonfinal controller state exposes an executable next action, a retry condition with a bounded resumption path, or a specific terminal/access boundary. No next item must never imply permission to finalize.

Preserve useful partial evidence after later failures. Continue independent authorized lanes. Do not busy-loop unchanged missing configuration, repeatedly regenerate the same frontier, or label retryable failure terminal to unlock a verdict. Existing provider/backoff/continuation semantics control; record the first failing boundary.

Use the existing report and bounded-evidence machinery for claim-local provenance. Enforce arithmetic and denominator reconciliation for structured counts; preserve uncertainty, contrary reports, missing strata, source dates and inspected-versus-uninspected distinctions. Do not invent a universal algorithm that certifies natural-language citation entailment. Structural checks and human/Chat semantic review are separate assurance levels.

Generate final completion labels from actual state, and recheck the rendered answer after transformations. A source hash, passing package test, successful retrieval, queued task and installed package are different facts. Preserve useful bounded answers without claiming unobserved prevalence, broad ranking or treatment success.

## 9. Privacy, reuse and release

Retain existing enrollment/consent boundaries, private incident-vault separation and zero durable raw YouTube/community storage. Never publish the originating medical conversation, private chat locators, user identity, credentials, or frozen study data in fixtures, design records, logs or GitHub. Use synthetic public examples and private runtime lineage.

Keep formal source-analysis reuse exact-source/protocol/rubric/freshness bound. Instruction updates must not silently promote prior analyses as newly valid. No new database, embeddings service, analytics pipeline or background model judge is authorized.

Extend the existing package receipt and generation checks, rather than adding a parallel installation system. Bind canonical source tuple, generated skill/resources, tool profile, backend artifact, installed package and actual consumer acceptance separately. Support rollback to the prior complete compatible tuple. Backend update does not prove installed-skill freshness; package refresh does not prove live research behavior.

## 10. Required acceptance cases

A01: Changing a canonical referenced gate invalidates/regenerates every affected projection; a manually shortened predicate cannot pass as aligned.
A02: Missing packaged operational reference or accidental private development dependency fails package closure.
A03: Actual registry and public binding mismatch is rejected; an internal-only capability is not misreported as a public tool.
A04: Protocol replacement between legacy reads cannot yield a mismatched successful body/manifest pair after the fix.
A05: Runtime chunks reconstruct exact bytes across Unicode, escaping, skip/reorder, expiry, tampering and source changes.
A06: Existing protocol-only and all legacy-profile calls retain compatibility.
A07: Module-only policy change cannot silently change an existing session; retained old-bundle continuation remains possible.
A08: Diagnostic-only invocation makes exactly the requested operation and no research/access mutation.
A09: Connector admission denial, OAuth denial, consent-required and provider failure remain distinct and do not claim research execution.
A10: Unseeded broad prompts trigger source-grounded specific-candidate discovery before narrowed deep auditing; unrelated prompt families test transfer.
A11: A synthetic candidate appearing only in comments reopens discovery; absent candidates are not hallucinated.
A12: Positive, negative and mixed episodes, duplicate posters, combination regimens and uncertain diagnosis are retained correctly.
A13: User community-only scope suppresses formal retrieval and full-HRP/clinical-verdict labels, not bounded observed evidence.
A14: Missing creator transcript does not erase separately accessible comments or authorize creator claims.
A15: A blocked optional/provider lane cannot starve independent ready work; a retry token does not become fake completion.
A16: Structured counts reconcile; incomplete corpus cannot support representative prevalence or an invented strength label.
A17: Generated output/installed package/backend mismatch is visible; an old working retrieval probe is not current end-to-end acceptance.
A18: No raw private incident/community material or secrets enter generated packages, public fixtures, telemetry or review artifacts.
A19: Mission Control dispatch, receipt ingestion, supervisor review and one same-task resume complete without owner relaying; duplicate/ambiguous delivery never launches another task.
A20: Native Work identity, real approval gates, stale-lease fencing, context rollover and scope restrictions remain intact.

These are behavioral and integration cases, not merely string-presence tests. Synthetic test success is not a clinical result or proof of broad real-world discovery quality. Use one small authorized fresh consumer replay after the controlled fixtures; preserve access failures as access failures.

## 11. Implementation phases and review ownership

P0: establish isolated baseline, current governance, relevant lesson-queue status and source/consumer inventory; write reproducing tests without touching protected studies.
P1: atomic protocol read, immutable bundle/continuation primitive and module-level session binding.
P2: deterministic public adapter/reference generation, load_research_runtime, explicit catalogue profiles and capability closure.
P3: discovery/scope/error/report composition repairs, only where the reproducing tests identify missing behavior; retain already-correct implementations.
P4: package/installed-consumer acceptance and rollback preparation. No production release is authorized by this phase.
P5: final source review, full repository review-boundary verification and implementation receipt. Release remains a separate decision.

Use focused tests in the inner loop and the repository's complete verification at its actual review boundary. Record test-cost telemetry through the existing approved observer. Do not run full suites or multi-model tournaments after every edit. Engineering failures are repaired by the executor/controller. A real policy conflict or necessary scope change returns to the reasoning supervisor with exact evidence, while independent work continues.

## 12. Mission Control execution contract

Use the existing single-writer daemon, worker channel, source-bound directives, native Work dispatcher and fleet supervisor. No second scheduler or new orchestration platform. Create an isolated AskRigor task; do not replace the ongoing Mission Control worker's owner outcome or frozen research queues.

The current personal research conversation is a source backlink, not an automation target. Use a dedicated MISSION_CONTROL_ONLY AskRigor reasoning supervisor, or a verified configured project-manager route pending its registration. Keep exact source and destination locators in private runtime state only.

Required loop: admitted implementation directive -> verified native ChatGPT Work task -> factual execution receipt -> Mission Control -> registered reasoning supervisor -> source-bound reviewed continuation -> the same Work task. A worker cannot approve its own semantic result. A GitHub artifact or queued message is not delivery; delivery is not Work startup.

Respect the app's actual native Work controls. Do not pass Codex-only model/thinking overrides to chatgptWorkCloud, and do not relabel a Codex CLI task as Work. On execution surfaces that expose model/effort, use Sol Medium for bounded source/generator work and the current owner-policy difficult-task baseline for genuinely coupled integration work. Record unavailable settings honestly; permission defects are not reasoning-effort failures.

Persist task/phase, directive revision and digest, source binding, destination IDs, approval state, lease/epoch, last factual receipt, next supervisor obligation and next permitted execution. Reuse the native fleet watch; worker review boundaries remain nonterminal. Use bounded same-chat recovery and hand over to a fresh registered reasoning context around 10-15 substantial turns or earlier on material context/authority drift. Preserve the exact source contract through rollover.

Before claiming self-running implementation, require an observed dispatch, first execution receipt, supervisor response and same-task continuation, plus a scheduled native watch. Stale authority, offline relay, missing configured bridge, missing actual source identity, or an unavoidable product approval blocks the affected send. Finish independent preparation, retain a recoverable queued task, and report the exact state; never fabricate admission, a binding nonce, provider identity or a success receipt.

## 13. Existing work and evidence boundary

Disposition: compose and adapt existing AskRigor snapshot loading, policy context, Action continuation, controlled research state, bounded reporting, custom-GPT generation and package receipts, plus existing Mission Control worker/fleet/Work adapters. No new semantic-verifier framework.

Primary external checks: OpenAI developer-mode documentation; OpenAI plugin MCP server guidance (initialization instructions, static imported skill snapshots, backward-compatible tool changes); MCP 2025-11-25 tools specification. Platform facts are dated observations, not permanent entitlement assumptions. The emerging skills extension may be supported as an optional distribution adapter, but must not be the only way a bare MCP consumer obtains the public runtime bundle.

This contract establishes the selected implementation design. It does not certify every clinical rule in the full protocols, the safety/effectiveness of a remedy, current installed-state alignment, or a functioning autonomous loop before those endpoints are actually tested.
