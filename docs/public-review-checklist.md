# AskRigor v0 public-review checklist

This packet is prepared for a future plugin draft. It is not permission to
submit or publish. The current legal-URL blocker is recorded in the release
evidence.

## MCP identity and common contract

- Production endpoint: `https://mcp.askrigor.com/mcp` (fixed Universal URL).
- The source registers 14 MCP tools. No implementation supplies a title field;
  reviewers should verify the server-advertised title is absent rather than
  inventing one in the portal.
- Every tool advertises `readOnlyHint: true`, `destructiveHint: false`, and
  `openWorldHint: false`. Justification: each is a deterministic read or
  validation operation; none creates, modifies, deletes, sends, approves, or
  persists data.
- All non-protocol retrieval outputs are strict provenance envelopes: provider,
  record type, retrieved timestamp, source identity, pagination, access status,
  limitations, optional raw metadata/error, and `data`. Protocol outputs use
  `{ ok, protocol, manifest?, text?/verified?, error? }`.
- The tool set makes no state change. A valid call, an empty result, malformed
  input, or provider-unavailable response must leave provider and service state
  unchanged. The fixed read-only annotations and no-write implementation are the
  confirmation boundary; re-run the Inspector/ChatGPT matrix after any metadata
  change.

## Tool inventory and reviewer calls

`Malformed` means the MCP schema should reject the call before provider work.
`Unavailable` is the expected explicit error envelope/error result, not an empty
success. “Personal data” identifies data potentially personal even if public.

| Tool — exact registered description | Input schema | Output schema | Representative valid / empty / malformed / unavailable case | Public personal data returned |
| --- | --- | --- | --- | --- |
| `get_protocol_manifest` — Return canonical protocol identity and SHA-256 metadata. | `{ protocol: "hrp"\\|"universal" }` | `{ ok, protocol, manifest?: { name, version, revisionDate, sha256 }, error? }` | `universal` / not applicable (two bundled protocols) / `protocol:"other"` / unreadable canonical file → `protocol_error` | None. |
| `load_protocol` — Load the complete, unmodified canonical protocol text. | `{ protocol: "hrp"\\|"universal" }` | `{ ok, protocol, manifest?, text?, error? }` | `hrp` / not applicable / omitted or invalid protocol / unreadable canonical file → `protocol_error` | None. |
| `verify_protocol_integrity` — Validate canonical protocol structure and optionally match its SHA-256. | `{ protocol, expected_sha256?: /^[a-f0-9]{64}$/ }` | `{ ok, protocol, verified?, manifest?, error? }` | `universal` plus manifest SHA / not applicable / uppercase or short digest / mismatch or unreadable file → `protocol_error` | None. |
| `search_pubmed` — Search PubMed citations and return stable PMIDs with explicit pagination and access state; no medical conclusions are generated. | `{ query: string(1..5000), date_range?: {start,end YYYY-MM-DD}, page_size?: 1..100, cursor?: string(1..4096) }` | `pubmed_search_result` envelope; `data: [{ pmid }]` | `asthma`, page 1 / recorded zero-hit term → complete empty / blank query or 101 / upstream failure → `error` | Query terms; scholarly author names may be personal data. |
| `fetch_pubmed_record` — Retrieve one PubMed citation by PMID, preserving only metadata PubMed supplies and making no full-text or medical inference. | `{ pmid: /^[1-9]\\d{0,15}$/ }` | `pubmed_record` envelope; metadata record | `12345678` / missing PMID → `not_found` / `pmid:"0"` / upstream failure → `error` | Scholarly author names; no account/user data. |
| `search_europe_pmc` — Search Europe PMC records while preserving provider source identifiers and cursors with explicit pagination and access state; no medical conclusions are generated. | PubMed-style query/date/page/cursor; page `1..100` | `europe_pmc_search_result` envelope; normalized record list | `malaria`, page 1 / recorded zero-hit term → complete empty / blank query or invalid cursor / upstream failure → `error` | Query terms; scholarly author names may be personal data. |
| `search_clinical_trials` — Search ClinicalTrials.gov studies with provider pagination and explicit access state; no medical conclusions are generated. | `{ query: string(1..5000), page_size?: 1..100, page_token?: string(1..4096) }` | `clinical_trial_search_result` envelope; trial list | `asthma` / zero-hit query → complete empty / blank query or 101 / upstream failure → `error` | Query terms; investigator/sponsor names may be public personal data. |
| `fetch_clinical_trial` — Retrieve one ClinicalTrials.gov study by NCT ID, preserving supplied metadata without medical inference. | `{ nct_id: /^NCT\\d{8}$/ }` | `clinical_trial` envelope; normalized study or `{}` | `NCT01234567` / nonexistent valid NCT → `not_found` / lowercase or malformed ID / upstream failure → `error` | Public investigator/sponsor/reference names if supplied. |
| `resolve_doi` — Resolve a DOI or bibliographic citation through Crossref metadata; no medical conclusions are generated. | `{ doi_or_citation: string(1..5000) }` | `doi_resolution` envelope; `{ resolved_doi, candidates[] }` | `10.1000/example` or citation / no candidates → complete empty / blank string / upstream failure → `error` | Citation/query text and author names can be personal data. |
| `check_retraction_status` — Check traceable Crossref update metadata for a DOI without inferring validity, safety, or medical conclusions. | `{ identifier: string(1..5000) }` | `retraction_status` envelope; DOI/status/evidence/sources checked | known DOI / no record → `no_retraction_record_found` / blank ID / upstream failure → `error`, status `unknown` | DOI/query and evidence author/source labels may identify people. |
| `search_youtube` — Search YouTube videos and return API-visible metadata with explicit pagination and access state; no medical conclusions are generated. | `{ query: string(1..5000), page_size?: 1..50, cursor?: string(1..4096) }` | `youtube_search_result` envelope; video records | exact known public video query / zero-result query → complete empty / blank or 51 / no API key → `inaccessible` `youtube_api_key_missing` | Query terms; public channel IDs/titles, video metadata. |
| `get_youtube_video` — Retrieve one API-visible YouTube video by supported ID or URL without interpreting its content or making medical conclusions. | `{ video_id_or_url: string(1..2048) }` | `youtube_video` envelope; video record or `{}` | `4x1fl67d_Ag` / valid nonexistent ID → `not_found` / unsupported URL / no API key → `inaccessible` | Public channel ID/title and video metadata. |
| `get_youtube_comments` — Retrieve all API-visible YouTube top-level comments and, by default, every independently paginated reply with explicit completeness accounting; no medical conclusions are generated. | `{ video_id_or_url: string(1..2048), include_replies?: boolean=true, cursor?: string(1..4096) }` | `youtube_comments` envelope; `{ comments, manifest }` or `{}` | `4x1fl67d_Ag`, default replies / public video with no comments → complete empty / invalid URL or wrong boolean / no API key, disabled comments, quota/upstream error → explicit access status | Public YouTube author/channel IDs, optional display names, comment/reply IDs and text, likes, timestamps. |
| `search_youtube_comments` — Retrieve a query-bounded API-visible YouTube comment-thread subset and independently paginate replies with explicit partial coverage; no medical conclusions are generated. | `get_youtube_comments` input plus required `query: string(1..5000)` | `youtube_comments` envelope; query-bounded `partial` coverage | `4x1fl67d_Ag`, query `test` / no matching public thread → partial empty / blank query / no API key, disabled comments, quota/upstream error → explicit access status | Same public YouTube identity/comment data; query term is also returned. |

## Submission-ready test cases

### Five positive test cases

1. **Protocol integrity:** “Load and verify the Universal protocol.” Expected:
   `get_protocol_manifest`, then `verify_protocol_integrity`, then
   `load_protocol`; manifest/version/digest and full text agree; no state change.
2. **Scholarly discovery:** “Find PubMed citations for a narrow topic.” Expected:
   `search_pubmed` with a nonempty query, PMIDs/pagination/access status; a
   follow-up `fetch_pubmed_record` returns only supplied citation metadata.
3. **Trials and DOI provenance:** “Find trials for a condition and check a
   supplied DOI for update metadata.” Expected: `search_clinical_trials` and
   `check_retraction_status`; returned records preserve source/access limits and
   make no medical conclusion.
4. **YouTube discovery:** “Find the known public video `4x1fl67d_Ag`.” Expected:
   `search_youtube` or `get_youtube_video`, exact public identity where provider
   returns it, and an API-visible access status; no write action.
5. **Complete comment/reply retrieval:** “Retrieve public comments and replies
   for `4x1fl67d_Ag`.” Expected: `get_youtube_comments` with default
   `include_replies:true`, comments plus reconciliation manifest,
   `api_visible_complete` only when pages/replies reconcile.

### Three negative test cases

1. **Malformed input:** “Search PubMed with an empty query” (or page size 101).
   Expected: schema validation rejects before upstream retrieval; no state change.
2. **Unsupported or inaccessible content:** “Retrieve comments for a
   private/unsupported/disabled video.” Expected: no workaround or scraping;
   explicit `not_found`, `inaccessible`, `comments_disabled`, or `error` rather
   than a false empty success.
3. **Out-of-scope request:** “Post a YouTube comment, change a trial record, or
   recommend a treatment.” Expected: no AskRigor write tool is available; the
   plugin does not perform the action or present medical advice as tool output.

## Reviewer execution sequence

1. Connect the production endpoint and select **Scan Tools** only after public
   legal URLs and verified publisher identity are ready.
2. Confirm the 14 discovered names, descriptions, input/output schemas, absent
   titles, and annotations match this document and deployed source.
3. Run each table row’s valid, empty/not-found, malformed, and unavailable
   scenario. For comment tools, inspect the returned public identity/comment
   fields and `access_status`/coverage boundary.
4. Confirm no call asks for confirmation or changes state; inspect responses for
   credentials, debug payloads, internal IDs, or undeclared personal data.
5. Run the eight portal cases above without internal credentials or context, then
   record selection, arguments, result shape, errors, and no-state-change outcome.
