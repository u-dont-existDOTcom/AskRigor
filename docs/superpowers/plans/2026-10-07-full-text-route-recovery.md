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
| Phase 1: route semantics, candidates, identity, admission, states, provenance | Code implemented in this working tree; deterministic gate green; all three exact titles covered by synthetic DOI and title-plus-first-author/year cases (2026-10-07) |
| Phase 2: Bright Data unlocking | Needs owner decisions (privacy wording, who may use it) |
| Phase 3: HRP text | Exact text to the owner |
| Live acceptance on the three PMIDs | After Phase 1 |

## Phase 1 working-tree implementation contract (2026-10-07)

This is development with synthetic fixtures, not live acceptance or a release.
No protocol bytes, Git history, merge, deployment, or paid provider path changes.
The live Universal architecture bootstrap and lesson queue could not be retrieved
under this task's explicit no-network constraint.

The shared `admitFullText` check requires exact structural titles for methods,
results, and discussion/conclusions, at least 100 text characters under each,
and at least **6,000 characters in total under those body sections**. Abstract
and reference blocks/sections do not contribute. Numbered headings and case are
normalized. JATS retains its additional `<body>` check. PDF text retains line
boundaries; HTML/XHTML uses a small static extractor with block boundaries and
no script execution. The labels cover English, French, Spanish, Portuguese,
German, and Italian; unsupported or lost headings may conservatively prevent
admission. This proves structural readability only, not study quality or that
all scientific content/supplements were extracted.

One identity assembled from exact DOI-matched Europe PMC metadata and the
existing Unpaywall metadata response is frozen before supplied copies are
inspected. DOI matches count in the document's identity area (before abstract,
introduction/background, methods or references), so a review's body/reference
quotation is not identity evidence. A declared article title (citation-title
metadata or H1) conflicting with the known exact normalized title fails. The
alternative is exact normalized title plus the first author's surname or year.
The metadata carries PMID, journal and PII when available. No extra metadata
host or DOI redirect lookup was added. A publisher landing host reported by
Unpaywall is used when available; otherwise publisher classification relies on
listed exact hosts or the declared class, without inventing a resolved host.

Exact source host sets (optional `www` variants are individually enumerated):

- Researcher upload: `academia.edu`, `www.academia.edu`, `researchgate.net`, `www.researchgate.net`.
- Repository: `europepmc.org`, `www.europepmc.org`, `ncbi.nlm.nih.gov`, `www.ncbi.nlm.nih.gov`, `pmc.ncbi.nlm.nih.gov`, `arxiv.org`, `www.arxiv.org`, `biorxiv.org`, `www.biorxiv.org`, `medrxiv.org`, `www.medrxiv.org`, `zenodo.org`, `www.zenodo.org`, `figshare.com`, `www.figshare.com`, `hal.science`, `www.hal.science`, `core.ac.uk`, `www.core.ac.uk`.
- Publisher: `sciencedirect.com`, `www.sciencedirect.com`, `link.springer.com`, `nature.com`, `www.nature.com`, `onlinelibrary.wiley.com`, `academic.oup.com`, `journals.sagepub.com`, `tandfonline.com`, `www.tandfonline.com`, `journals.plos.org`, `mdpi.com`, `www.mdpi.com`, `frontiersin.org`, `www.frontiersin.org`, `bmj.com`, `www.bmj.com`, plus the metadata-bound publisher host above.

Known hosts override declared class. Unknown hosts use declared class, then
`other`; arbitrary subdomains and suffix lookalikes do not inherit a class.
Among full readable candidates, publisher and repository tie for first,
followed by author copy, researcher upload, then other; ties preserve input
order. A full readable lower-ranked copy beats a higher-ranked abstract.

| Acquisition state | Meaning |
| --- | --- |
| FULL_TEXT_READABLE | Identity passes and the structural/body threshold passes; only this state issues a handle. |
| PARTIAL_TEXT_READABLE | Some body sections are readable but required sections or the length floor are missing. |
| ABSTRACT_ONLY | Only front matter, abstract or metadata is structurally readable. |
| CANDIDATE_FOUND_FETCH_BLOCKED | Candidate 403/429, structural challenge/JavaScript-only page, unsupported response or network/retrieval failure; no lead receipt. |
| PAYWALL_OR_LOGIN_REQUIRED | Candidate 401/402 or a recognized login/paywall structure; no bypass. |
| NO_COPY_FOUND_AFTER_EXPANDED_SEARCH | Supplied URLs answered 404/410 and no better candidate was readable; this is limited to attempted URLs. |
| PROVIDER_UNAVAILABLE | Provider failure or candidate 5xx; failed route, no lead receipt. |
| IDENTITY_MISMATCH | The retrieved copy did not establish the target's own identity. |
| PRIMARY_OA_ROUTES_EXHAUSTED | No OA copy was admitted and no candidate URLs were supplied; exact public-copy discovery remains, even when attempts record provider errors. |

When candidates are supplied but none is admitted, overall precedence is partial,
abstract, blocked, unavailable, paywall/login, mismatch, then no copy; every
candidate's individual state remains visible. A technical failure in *any*
attempt or candidate suppresses a lead receipt even if another partial candidate
sets the overall state. OA-only exhaustion and technical failures stay pending
in the session controller; one call never spins on repeated immediate retries.
The existing final checks consume that controller status, and cannot treat a
`BLOCKED_RETRYABLE` source as a completed lead. Old output `status` values remain
`full_text_available` and `possibly_useful_lead`; the new fields are additive.
Clients with cached strict schemas need a refreshed tool list.

The privacy data-map draft describes direct model-supplied URL fetching,
request-local bodies, handle retention, compact checkpoint provenance, and the
fact that public-address validation does not screen sensitive URL paths/queries.
It does not claim that the public notice was updated or deployed.


## Phase 1 deterministic validation and exact-title coverage

Initial Phase 1 `npm run verify` on Node 24.18.0 exited **0**: typecheck, the complete
hermetic test suite, and build passed. Exact result lines:

```text
Test Files  205 passed | 1 skipped (206)
Tests  2345 passed | 6 skipped (2351)
```

The initial full-text recovery suite contained 52 deterministic synthetic cases. The
existing source, Europe PMC, Unpaywall, Action, receipt, controller and catalog
checks pass. No live/provider smoke was run. `git diff --check` passes; the
branch remains `claude/full-text-route-recovery-20261007`, and `protocols/` has
no working-tree diff. No commit, staging, history mutation, merge or deployment
was performed.

Claude supplied the exact PubMed metadata (esummary, checked 2026-10-07) for PMIDs
10734247, 14529800 and 11374875. PubMed's title for 10734247 ends with the collective
author "Dopaminergic Therapy Study Group."; the fixture uses the article title without it. Their fixtures now include exact titles, DOI, first
author, year, journal and PII in
`tests/helpers/full-text-acceptance-identities.ts`. Synthetic front matter uses
each exact title. Each paper exercises DOI identity and both exact-title
alternatives separately: title plus first author, and title plus year, without
a DOI in the document text. These six additional cases require `title_match`,
full-text admission and a document handle, bringing the recovery suite to 58
cases. No actual paper body, abstract, or claimed live acceptance enters a
fixture. This follow-up runs offline and makes no commits.

Exact-title follow-up `npm run verify` on Node 24.18.0 exited **0**:
typecheck, the complete hermetic suite and build passed. Live provider tests
were disabled. The initial sandbox attempt could not bind loopback test
servers (`EPERM`); the successful rerun allowed local test servers, with no
external network work. Exact result lines:

```text
Test Files  205 passed | 1 skipped (206)
Tests  2351 passed | 6 skipped (2357)
```

Long unsectioned text stays partial; it cannot issue a handle. Supplied-copy
extraction is capped at 100,000 blocks with bounded block text, and scans lines
without first allocating a giant line array. First-page pagination also budgets
candidate provenance and source metadata; attempt identifiers refer to the
candidate ordinal instead of duplicating potentially long URLs.

The recurring compact-catalog failure was a mismatch between a fixed
per-description cap and a total transport budget. The corrected mechanism
measures the entire Gemini catalog and reduces descriptions only as necessary,
preserving every tool/input and the existing strict 25 KB gate.

Changed files (30):

- `apps/research-mcp/src/actions/open-full-text-route.ts`
- `apps/research-mcp/src/actions/research-bounded-evidence.ts`
- `apps/research-mcp/src/actions/research-formal-evidence.ts`
- `apps/research-mcp/src/actions/research-treatment-finalization.ts`
- `apps/research-mcp/src/actions/review-method-audit.ts`
- `apps/research-mcp/src/actions/study-method-audit.ts`
- `apps/research-mcp/src/gemini-tool-catalog.ts`
- `apps/research-mcp/src/register-tools.ts`
- `docs/privacy-data-map.md`
- `docs/superpowers/plans/2026-10-07-full-text-route-recovery.md`
- `docs/tool-inventory-v0.1.0.json`
- `packages/sources/src/auditable-document-index.ts`
- `packages/sources/src/candidate-full-text.ts`
- `packages/sources/src/europe-pmc.ts`
- `packages/sources/src/full-text-admission.ts`
- `packages/sources/src/http.ts`
- `packages/sources/src/index.ts`
- `packages/sources/src/open-full-text.ts`
- `packages/sources/src/unpaywall-full-text.ts`
- `packages/sources/src/unpaywall.ts`
- `tests/full-text-route-recovery.test.ts`
- `tests/helpers/full-text-acceptance-identities.ts`
- `tests/helpers/synthetic-full-text.ts`
- `tests/mcp-full-text-lead-receipt.test.ts`
- `tests/mcp-tools.test.ts`
- `tests/open-full-text-action.test.ts`
- `tests/open-full-text.test.ts`
- `tests/research-formal-evidence.test.ts`
- `tests/research-treatment-finalization.test.ts`
- `tests/unpaywall-full-text.test.ts`

Full-text recovery test names (parameterized templates expand to the 58 cases):

- `\n`
- `keeps Unpaywall %s as a failed route, never inaccessible`
- `recovers Europe PMC not_found plus Unpaywall failure with an Academia HTML copy and a handle`
- `recovers the plan's DOI identity for PMID $pmid ($first_author)`
- `recovers PMID $pmid by exact title plus $basis without a DOI in the text`
- `rejects admission for %s`
- `rejects a PDF containing only front matter`
- `admits a candidate PDF using the same identity and completeness rule`
- `admits bounded %s documents`
- `preserves entity-encoded French headings and exact article identity`
- `decodes a declared public-text charset without executing HTML`
- `classifies candidate HTTP %i without calling the paper inaccessible`
- `preserves network failure as blocked and continues subsequent candidates`
- `accepts the exact normalized title plus %s without a DOI`
- `rejects the exact title without an author or year`
- `prefers full repository text over full researcher upload, but full upload over a repository abstract`
- `bounds the number of candidate blocks before issuing a handle`
- `budgets first-page candidate provenance and long URLs within client limits`
- `classifies exact hosts before declared class and refuses suffix lookalikes`
- `requires 6,000 body characters without inflating them with an abstract`
- `recognizes exact structural headings %s / %s / %s`
- `rejects %s before a request`
- `rechecks redirect DNS and rejects a rebound destination`
- `enforces the byte cap on candidate HTML`

Receipt/controller/finalization regression names also include:

- `signs no lead for %s even when an older producer omits attempt errors`
- `signs no lead after actual Unpaywall acquisition receives HTTP %i`
- `keeps %s pending after one acquisition rather than a terminal lead`
- `keeps a blocked candidate incomplete even when legacy audit fields look terminal`
