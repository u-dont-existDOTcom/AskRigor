# Full-text acquisition: route failure is not inaccessibility (owner directive, 2026-10-07)

Branch `claude/full-text-route-recovery-20261007`. Status: Phase 1 in progress. Nothing merges or deploys
without the owner's approval on the owner questions page.

## Owner outcome

When Europe PMC or Unpaywall fails, AskRigor keeps looking for a legitimately public copy. That means an exact search
by title, DOI and PMID, author and repository copies, researcher-upload platforms and the publisher. It admits a copy
as full text only when it is verifiably the same paper and its methods, results and discussion are readable, and it
records each copy's provenance and a truthful terminal state. Acceptance cases:
- PMID 10734247, DOI 10.1016/s0887-8994(99)00152-6, Walters AS, Pediatr Neurol 2000;
- PMID 14529800, DOI 10.1016/s0166-4328(03)00097-4, Overtoom CC, Behav Brain Res 2003. Its "L-DOPA" condition was
  L-DOPA plus carbidopa;
- PMID 11374875, DOI 10.1006/bbrc.2001.4945, Bertoldi M, BBRC 2001. In vitro, purified pig-kidney DOPA
  decarboxylase.

None of the three has a PMC copy (PubMed esummary, 2026-10-07).

## What the code does today (survey of main 7cff23a)

- **Routes:** `acquireOpenFullText` (packages/sources/src/open-full-text.ts) tries Europe PMC JATS, then Unpaywall
  PDFs only.
- **Flattening:** every Unpaywall resolver failure (429, 5xx, request failure, invalid response) becomes
  `inaccessible`, with `open_full_text_not_auditable` (unpaywall-full-text.ts:69-80; `routeResult` 227-235). The MCP
  tool then signs a `full_text_lead` receipt, so an outage counts as proof that no open text exists. A lead is
  terminal in the session controller (`ingestOpenFullTextOutput`).
- **No admission check:** any identity-verified PDF is stamped `full_text_with_body`. No methods, results or
  discussion are detected, and there is no length floor.
- **Narrow fetcher:** `fetchDiscoveredDocument` (http.ts) is the open-host fetcher. It is SSRF-guarded, with DNS
  pinning and rechecked redirects, but accepts PDFs only and has no retries.
- **No providers:** no Bright Data code; no Exa, Parallel, SciSpace, OpenAlex or CORE client.
- **HRP:** UniversalFullTextAcquisitionProtocol, MandatoryProviderNeutralFullTextEscalation and AccessBoundary end
  at a lead after the supported routes, and never separate an outage from inaccessibility.
- **Pinned contract:** strict output schemas checked by the MCP SDK in clients; the byte-exact tool inventory; pinned
  descriptions; 33 tools. Clients holding an old tool list reject unknown fields, so output changes are additive and
  documented, and old chats need a refresh.
- **Storage policy:** no durable full-text store; handles live 1 h in process memory; raw article bodies are never
  kept, so test fixtures are synthetic, never copied papers.

## Design

Discovery runs where the model's own search tools are, as community searches already do. The server verifies.

1. **Route-failure semantics (Phase 1).** A provider error, rate limit or outage is a failed route (`error`), not
   `inaccessible`. When the open-access routes end without an admitted copy, the result says
   `primary_oa_routes_exhausted` and names what can still be tried. A `full_text_lead` receipt is signed only after
   every applicable route, including supplied candidates, ended without a technical failure.
2. **Candidate copies (Phase 1).** `acquire_open_full_text` takes optional `candidate_urls`, at most 5: public copies
   the model found by exact search (title in quotes, DOI, PMID, PII, title plus first author and year). Examples are
   a repository or author copy, Academia.edu, ResearchGate or the publisher. The server fetches each through the
   SSRF-guarded fetcher, extended to HTML and text. Scholarly search hits are discovery, never evidence.
3. **Identity (Phase 1).** One frozen identity per call: DOI, PMID, exact title, first author, year, journal and
   PII when known. A copy passes on the DOI, or on the exact title plus the first author or year. Otherwise it is
   IDENTITY_MISMATCH.
4. **Full-text admission (Phase 1, all routes).**
   - FULL_TEXT_READABLE needs headings or equivalent sections for methods or materials, results, and discussion or
     conclusions, plus body text well beyond an abstract.
   - Fewer sections give PARTIAL_TEXT_READABLE; an abstract or metadata alone gives ABSTRACT_ONLY.
   - Heading detection is an exact structural check, covering common English forms and the main other-language
     forms.
   - Only FULL_TEXT_READABLE opens a document handle for method audit.
5. **Per-candidate states.** FULL_TEXT_READABLE, PARTIAL_TEXT_READABLE, ABSTRACT_ONLY,
   CANDIDATE_FOUND_FETCH_BLOCKED (403, challenge or JavaScript-only), PAYWALL_OR_LOGIN_REQUIRED,
   NO_COPY_FOUND_AFTER_EXPANDED_SEARCH, PROVIDER_UNAVAILABLE and IDENTITY_MISMATCH.
6. **Provenance per copy.**
   - identity;
   - retrieved URL and retrieval provider (`direct`, later `bright_data`);
   - source class (publisher | repository | author_copy | researcher_upload | other), taken from the host by exact
     host lists, plus the model's declared class when the host cannot tell author copy from repository;
   - access status, completeness, sections observed, timestamp and identity verification.
   - The preference order is official open access or a repository manuscript, then an author copy, then a verified
     researcher upload, then another verified mirror. A verified lower-ranked full text beats a higher-ranked
     abstract.
7. **Unlocking escalation (Phase 2, owner-gated).** A candidate blocked by a challenge page, JavaScript rendering, a
   403 or a fetch failure, with no login or paywall, retries through Bright Data Web Unlocker. That route needs:
   - the configuration;
   - an entitled account: the owner, or paid users once credits exist (owner decisions 16 and 23);
   - the privacy wording naming Bright Data, approved by the owner.
   It never defeats a login or a paywall.
8. **Protocol (Phase 3, owner approval).** HRP's UniversalFullTextAcquisitionProtocol gets two changes: an
   open-access route failure is route failure; and exact discovery of public copies, passed to the acquisition tool,
   comes before a lead boundary. Exact text goes to the owner.

## Tests

- **Deterministic tests with synthetic fixtures:** Europe PMC and Unpaywall failure no longer ends acquisition when a
  supplied candidate yields full text. Each acceptance identity gets a synthetic full-text fixture with its sections.
- **Negatives:** an abstract-only researcher-upload page; a similar title that is a different paper; a review
  quoting the paper; a login or paywall page; a challenge page that is blocked, not inaccessible.
- **Unchanged:** the existing Europe PMC, Unpaywall and receipt tests still pass.
- **Live acceptance** on the three PMIDs before release: discovery through the client's search, fetch and admission
  through the server. It records which route succeeded and what the full text shows: L-DOPA plus carbidopa; in vitro
  pig-kidney enzyme.

## Status

| Phase | State |
| --- | --- |
| Survey and plan | Done (2026-10-07) |
| Phase 1: route semantics, candidates, identity, admission, states, provenance | Next, Codex from a brief, reviewed here |
| Phase 2: Bright Data unlocking | Needs owner decisions (privacy wording, who may use it) |
| Phase 3: HRP text | Exact text to the owner |
| Live acceptance on the three PMIDs | After Phase 1 |
