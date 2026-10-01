The server enforces real gates in only two places. The public MCP tools (/mcp and /mcp/claude) gate the full-text chain, gate YouTube completeness through receipt fields, and gate research access and contributions. Synthesis and finalization are gated only by the controlled research session, which the MCP tools cannot reach. The MCP transport is stateless: every HTTP request gets a new McpServer with a sessionless transport (S/server.ts:606-619). No tool call ever blocks "synthesis".

Paths: S=/home/user/AskRigor/apps/research-mcp/src, P=/home/user/AskRigor/packages, T=/home/user/AskRigor/tests

**1. Full-text chain**
- **Acquire input:** a strict `{doi string, optional pmcid}` with no arrays (S/actions/open-full-text-route.ts:54-60). Malformed input is rejected. Test: T/open-full-text-action.test.ts:20.
- **Handle issuance:** a handle is issued only for complete, identity-verified `full_text_with_body`. Otherwise the tool returns `possibly_useful_lead` with `unseen_content_used_as_evidence:false` and no handle (:355-367). Tests: T/open-full-text-action.test.ts:114, T/open-full-text.test.ts:111.
- **Cursor:** the server owns it. `continue` returns the next contiguous page only. `exhausted` is true and `synthesis_lock` is pass only when the cursor reaches the end (:383-406, 639-689, 715-717). Test: T/open-full-text-action.test.ts:39.
- **Continue after exhaustion:** rejected with 422 `open_full_text_handle_invalid_or_expired` (:388-392, 804-806). No test found.
- **Bad handles:** unknown, expired or busy handles (busy = a continue is in flight) are rejected (S/actions/open-full-text-handle-store.ts:154-159).
  - Handles live in process memory with a 1h TTL that slides on each continue, a 64-entry / 128 MiB cap, and eviction of the oldest idle handle (:12-14, 98-100).
  - Only covered indirectly, by T/research-formal-evidence.test.ts:706.
- **Validators need a fully read document:** both validators and the reuse path require an exhausted cursor, else 422 `open_full_text_not_fully_read` (:412-413, 426-427, 478-479). Test: T/open-full-text-action.test.ts:39.
- **`validate_study_method_audit`, schema checks:**
  - All 13 domains, each exactly once.
  - "adequate" or "limitation_identified" findings must cite at least one block; "unclear" findings must list the unresolved fields.
  - At least 2 claim capabilities, including at least one `can_support` and one `cannot_support`; `can_support` must cite blocks.
  - Generic program names (e.g. "exercise", "usual care") need exact components or the literal "program not described".
  - Location: S/actions/study-method-audit.ts:61-97, 149-229, 527-541.
- **`validate_study_method_audit`, runtime checks (:284-299):**
  - The audit's `source_primary_identifier` and `source_content_sha256` must equal the handle's document.
  - The document must be `full_text_with_body`.
  - Every cited `block_id` must exist in the document.
  - Tests: T/study-method-audit.test.ts:283, 293, 305, 323. The identity/sha-mismatch branch has no test.
- **`validate_review_method_audit`:**
  - 12 domains, each exactly once, with the same finding and capability rules.
  - At least one program fingerprint and one included source family.
  - Same identity, sha, completeness and block checks.
  - Location: S/actions/review-method-audit.ts:29-119, 148-163. Tests: T/review-method-audit.test.ts:115, 125, 137.
- **Returned coverage_receipt:** echoes the server's own handle and document sha (open-full-text-route.ts:736-744). For the same handle the byte-for-byte match holds automatically; the comparison itself is left to the client.
- **Repository reuse:**
  - Exactly one of `audit` or `repository_analysis_version_id` (:195-206).
  - The id must equal the one advertised on this same handle at acquisition. Otherwise the result is `fresh_study_audit_required` with reason `candidate_missing` (:428-438).
  - The server then rechecks compatibility (S/actions/study-audit-reuse.ts:140-242):
    - source sha and identifiers
    - capture, access, freshness and impact all current/complete
    - protocol hashes equal the current manifests
    - stored receipt and rubric hashes
  - It then reruns the same validator (:456).
  - A fresh-audit result cannot carry an audit receipt (:242-266).
  - Reuse exists only when `ASKRIGOR_LIVING_EVIDENCE_REUSE_ENABLED` is set; a bad config silently disables it (S/config.ts:151-159).
  - Tests: T/study-audit-reuse.test.ts:99, 151, 181, 236, 297.
- **MCP error detail:** any 422 reaches the client as isError text "<op> could not complete." with no error code (S/register-tools.ts:1162-1170). All document text is only in structuredContent.

**2. YouTube/community**
- **`survey_youtube_community`:**
  - At most 6 searches and 10 results each (S/youtube-community-survey.ts:24-32).
  - Returns access_status, per-search pagination and candidates. It issues no receipt and no lock (:80-90).
  - Tests: T/youtube-community-survey.test.ts:166, 183; T/mcp-tools.test.ts:399.
- **`audit_youtube_video_community`:**
  - **Input:** exactly one of video or continuation token (S/youtube-video-community-audit.ts:54-61).
  - **Continuation token:**
    - HMAC-signed and bound to the video, with a fixed `analysis_limit` and an absolute 1h expiry.
    - Tampering, expiry or a legacy token forces a restart (:185-187; S/youtube-audit-continuation.ts:246-307).
    - A segment from a different video throws (:240-245).
  - **Receipt:** `completion_state` is `api_visible_complete`, `completed_with_access_boundary` or `incomplete`, with `synthesis_lock` block if and only if incomplete (:378-388, 515-525).
  - **Continuation flag:** `continuation_recommended` is true only when the next page is safe to fetch automatically (:305-312, 512).
  - **Failures:** a missing secret or any failure returns a structured incomplete/block result (S/register-tools.ts:969-988, 1630-1717).
  - **Tests:**
    - T/youtube-video-community-audit.test.ts:307, 471, 585, 885, 970
    - T/youtube-audit-continuation.test.ts:233
    - T/mcp-tools.test.ts:446, 545, 584
- **`audit_youtube_community` (single-call, up to 3 videos):** the lock is block if any search, metadata or comment chain is incomplete (S/youtube-community-audit.ts:158-316). Tests: T/youtube-community-audit.test.ts; T/mcp-tools.test.ts:342.
- **`get_youtube_comments` and `search_youtube_comments`:**
  - `get_youtube_comments` reports `api_visible_complete` only from the first page, with replies included and all reply counts reconciled.
  - `search_youtube_comments` is always "partial", labelled as a query-bounded subset (P/sources/src/youtube.ts:1485-1487, 1599-1615).
  - Tests: T/mcp-tools.test.ts:1152, 1191.
- **Downstream use:** no later MCP tool reads any YouTube receipt. `query_bounded_comments_used_as_corpus` is a hard-coded `false`, not a check.

**3. Access and contributions**
- **Access guard:**
  - Active only when OAuth is configured (S/server.ts:382). It wraps 23 tools: all except the 2 review tools and the 2 access tools (S/register-tools.ts:1227-1234).
  - Requires an unexpired bearer token with scope `research:use` and a subject (S/research-contributor-access-tool.ts:189-274).
  - Then requires an active account (P/evidence-repository/src/research-contributor-access.ts:259-285):
    - unenrolled → `RESEARCH_ACCESS_REQUIRED`
    - revoked → `RESEARCH_ACCESS_REVOKED`
    - paid without entitlement → `PAID_PRIVATE_ENTITLEMENT_REQUIRED`
  - Tests: T/public-gap-oauth-review.test.ts:155, 221, 247.
- **`manage_research_access`:**
  - An agreement is required if and only if accepting free mode (tool :107-115).
  - The agreement must carry the exact notice version and four literal `true` acknowledgements (access.ts:34-40).
  - Paid-private activation needs an existing active entitlement (:217-226).
  - Revoking withdraws pending proposals. `inspect` changes nothing.
  - Tests: T/research-contributor-access.test.ts:54, 79, 177, 210.
- **`submit_research_contribution`:**
  - Active free mode only; paid mode gets `PAID_PRIVATE_DOES_NOT_CONTRIBUTE` (:287-303).
  - Eight privacy flags must all be literal `false` (:42-51).
  - Prohibited keys are rejected (P/evidence-repository/src/contracts.ts:615-668), as are email/phone/credential/address patterns (:715-733).
  - A SOURCE_ANALYSIS must be a study or review method audit on a study or review source, with no YouTube/Reddit/forum URL (:665-705).
  - Frontier payloads must be internally consistent and contain no community lanes (contracts.ts:454-576); declared hashes must match (prepare.ts:24-29, 58-62).
  - Resubmitting the same payload is idempotent. Stored as `PENDING_REVIEW`.
  - Tests: T/research-contributor-access.test.ts:89, 118, 154, 177.
- **`review_research_contribution`:**
  - Needs scope `cases:review` and an allowlisted owner subject (S/research-contribution-review-tool.ts:181-218).
  - Accept or reject requires the payload hash and a reason (:11-44). Mismatches give `PAYLOAD_MISMATCH` or `REVIEW_CONFLICT`.
  - Accepting only queues a pending promotion (P/evidence-repository/src/research-contribution-review.ts:147-211).
  - Tests: T/research-contribution-review.test.ts:69, 98, 122.
- **No automatic submission in free mode:** the tool handler is the only caller of `submitProposal` (:163).
- **Without OAuth:** there is no guard, and `manage_research_access`/`submit_research_contribution` always return `authorization_required`.

**4. Protocol tools**
- **Manifest and load:** every call re-reads and validates UTF-8, XML and root attributes, then hashes the bytes (P/protocol/src/index.ts:33-120).
- **`verify_protocol_integrity`:** compares hashes only if `expected_sha256` is supplied. Otherwise it returns `verified:true` straight from the manifest (S/register-tools.ts:1268-1275). Tests: T/protocol.test.ts:406, 509-535; T/mcp-tools.test.ts:1931, 2007.
- **Downstream:** no MCP tool requires a prior load or verify. Protocol identity is checked only in study-audit reuse and inside the controlled session (bound at start, rechecked each step → `PROTOCOL_DRIFT`). The controlled session injects the protocols itself with hash checks (S/research-semantic-policy-input.ts:160-243).
- **MCP `load_protocol`:** returns the whole text unchunked (HRP ≈593 KB, Universal ≈167 KB).

**5. Session/controller**
- **Controlled session operations:** 16 operations (S/actions/research-session-controller.ts:158-175) run in a fixed dependency order (:1921-2033).
- **Output boundaries:** `CONTINUE_RESEARCH`, `BOUNDED_NONRANKING_ONLY` or `FINALIZATION_ALLOWED` (:2035-2060).
- **Finalization denied** (:2191-2266) when any of these apply, or when there is no current report:
  - `PROTOCOL_DRIFT`
  - `MODULE_APPLICABILITY_UNRESOLVED`
  - `REQUIRED_MODULE_INCOMPLETE`
  - `REQUIRED_OPERATION_INCOMPLETE`
  - `RETRYABLE_WORK_REMAINS`
  - `TERMINAL_BOUNDARY_LIMITS_OUTPUT`
  - `FINALIZATION_SIGNING_NOT_CONFIGURED`
- **`FINALIZATION_ALLOWED`:** only after the final completion audit passes and is tied to a digest of the evidence state (:4016-4090). Its 8 checks include the treatment locks, the return search in both directions, a current report, and audited decision-changing linked work.
- **Signed permit:** issued at :2267-2272, verified at :2438.
- **Transport** (S/actions/controlled-research-route.ts):
  - A stale state digest gets 409 (:539-542).
  - Semantic results need the signed worker receipt (:563-576).
  - Protocol drift is rechecked on every step (:543-556).
  - In this path the server binds full-text receipts itself (S/actions/research-formal-evidence.ts:1028-1035, 1196-1208).
- **Controlled-session tests:**
  - T/controlled-research-route.test.ts:72, 104, 359, 960
  - T/research-session-controller.test.ts:703, 1136, 1446, 1481
  - T/research-formal-evidence.test.ts:758
- **n8n states** (S/n8n-control-plane-pilot.ts:21-29):
  - `COMPLETE` and `BOUNDED_COMPLETE` come only from a signed server decision (:120-150, 436-475).
  - `STUCK` after 3 no-progress steps or 3 retryable failures (:350-365, 409-424).
  - `BLOCKED` on a non-retryable failure, protocol drift or no work (:396-408, 499-524).
  - `OWNER_GATE` is declared but never assigned.
  - Tests: T/n8n-control-plane-pilot.test.ts:71, 115, 152, 184.
- **Exposure:** none of this is reachable from /mcp or /mcp/claude.
  - **Custom GPT routes:** `/actions/research/{start_research_session, continue_research_session, get_research_session_status, finalize_research_report}` need an API-key bearer (S/actions/router.ts:117-120) and `ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true`. They are removed entirely whenever OAuth is configured (S/server.ts:382-387; no test found).
  - **Private orchestration:** `/internal/research/v1/*` (API key, no Origin header; S/private-research-orchestration.ts:72-73, 225-235).
  - **n8n:** `/internal/n8n/v1/*` is enabled only through a constructor option, never from env (S/server.ts:317).
  - **Epistemic modules:** `epistemic-verifier.ts` and `epistemic-representation-review.ts` are not used by any route or tool; only scripts and tests import them.

**6. Tool catalogs and Custom GPT actions**
- **/mcp vs /mcp/claude:** both build the same "standard" server, so the 27 tools and handlers are identical (S/server.ts:397-416). The differences:
  - /mcp/claude exists only with OAuth plus `ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID` (:391-396).
  - /mcp/claude requires a valid bearer on every request and answers with a 401 challenge otherwise (:598-604).
  - /mcp/claude has its own resource metadata and reviewer subjects.
  - /mcp accepts a bearer optionally (:609).
- **/mcp/gemini:** lists 22 tools but all 27 remain callable (S/gemini-tool-catalog.ts:23-40).
- **Catalog tests:** T/claude-connector-oauth.test.ts:118-186; T/mcp-tools.test.ts:93, 2086.
- **Custom GPT actions:** the OpenAPI is the 4 controlled routes plus 2 lesson writes (/home/user/AskRigor/scripts/generate-custom-gpt-packet.mts:73-91; T/research-action-http.test.ts:108; T/custom-gpt-packet.test.ts). `load_protocol` is not among them.
- **Chunked `load_protocol`:** 48,000-byte chunks with a signed cursor, 1h expiry, and a `protocol_changed` error on hash change (S/actions/protocol-continuation.ts:99-181). It lives only in `createResearchActionRoutes` (S/actions/research-routes.ts:104-167), which the default server does not mount (S/server.ts:251-263). Tests: T/protocol-action-continuation.test.ts; T/research-action-route.test.ts:564.

**7. Per-session log of tool calls**
- There is none for MCP tool calls.
- **Handshake diagnostics:** the only log, off unless `ASKRIGOR_MCP_HANDSHAKE_DIAGNOSTICS` is set. It records the coarse method ("tools/call") but no tool name, arguments or identity (S/server.ts:685-747, 890-894; T/mcp-tools.test.ts:2194, 2214).
- **Server-held state:**
  - Full-text handles are in memory and cannot be listed; YouTube tokens are stateless.
  - Postgres stores only access accounts, proposals and review decisions.
  - Controlled sessions keep their state in memory or in one encrypted checkpoint that is overwritten each time (S/actions/file-research-session-store.ts:675-685).
- **Transition trace:** recorded only for the fixed product-acceptance challenge session (S/actions/controlled-research-route.ts:492-493, 742-763).
- **Consequence:** measuring which receipts a run obtained before synthesis needs client transcripts or new server logging.

**Required by the server instructions and tool descriptions (S/config.ts:341-342) but not enforced**
- Calling `manage_research_access` inspect first. It is only enforced indirectly by the guard, and only when OAuth is on.
- Submitting the frontier and analyses at the end of a free-mode run.
- Checking that a submitted analysis carries a receipt actually issued by `validate_*`.
- Running survey, then a per-video audit of each material video, before synthesis.
- Auto-continuing while `continuation_recommended` is true, and widening the search.
- Keeping `search_youtube_comments` out of the corpus (it is only labelled).
- Calling acquire once per chain (each call mints a new handle).
- Using the matching validator. Either validator accepts any exhausted handle, repeatedly; kind-matching exists only in the controlled path.
- Byte-for-byte receipt matching, and treating `fresh_study_audit_required` as blocking synthesis (MCP has no synthesis step).
- Never combining chains; handles are bearer strings not bound to a caller.
- Loading or verifying protocols before research.