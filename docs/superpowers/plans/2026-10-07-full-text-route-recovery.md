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
   an exact expanded-search declaration is valid and every applicable route, including supplied candidates, ended without a technical failure.
2. **Candidate copies (Phase 1).** `acquire_open_full_text` takes optional `candidate_urls`, at most 5: public copies
   the model found by exact search (title in quotes, DOI, PMID, PII, title plus first author and year). Examples are
   a repository or author copy, Academia.edu, ResearchGate or the publisher. The server fetches each through the
   SSRF-guarded fetcher, extended to HTML and text. Scholarly search hits are discovery, never evidence.
3. **Identity (Phase 1).** One frozen identity per call: DOI, PMID, deduplicated title variants, first author, year, journal and
   PII when known. A copy passes on the DOI or compact PII, or on a compact exact title plus the first author or year. Otherwise it is
   IDENTITY_MISMATCH.
4. **Full-text admission (Phase 1, PDFs and candidates; JATS retains body admission).**
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
   - source class (publisher | repository | author_copy | researcher_upload | other), taken from exact
     host lists or metadata-bound publisher host, with declared author/repository classes accepted on unknown hosts;
   - source-class basis (`known_host`, `metadata_publisher_host`, `declared`, `unrecognized_host`);
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
| Phase 3: HRP text | Sections A–E applied as the HRP 20.6.12 working-tree candidate; exact owner approval pending |
| Live acceptance on the three PMIDs | After Phase 1 |

## Phase 1 working-tree implementation contract (2026-10-07)

This is development with synthetic fixtures, not live acceptance or a release.
No protocol bytes, Git history, merge, deployment, or paid provider path changes.
The live Universal architecture bootstrap and lesson queue could not be retrieved
under this task's explicit no-network constraint.

The optional strict `public_copy_search: { queries: string[] }` declaration
contains 2–12 trimmed queries, 3–400 characters each. After metadata identity
assembly, at least one query must contain the DOI case-insensitively and at
least one must contain a known title variant after `normalizeIdentityText`.
Queries are checked only in memory and never echoed, logged, stored,
checkpointed, or signed. Only `status` (`declared`, `not_declared`, or
`missing_exact_identifiers`), missing identifier kinds, and `query_count`
are returned. Without candidates, a valid declaration produces
`NO_COPY_FOUND_AFTER_EXPANDED_SEARCH`; otherwise the OA routes remain exhausted
and the descriptive boundary names exact title/DOI/PMID/PII discovery,
`candidate_urls` for found copies, and `public_copy_search` even for no results.

PDFs and supplied copies require methods, results, and discussion/conclusions,
at least **1,000 characters per section**, and **6,000 distinct body characters**.
Combined results/discussion headings credit both kinds; case-report headings
credit methods and results. English, French, Spanish, Portuguese, German and
Italian labels are structural checks, not judgments of scientific meaning.
Abstracts/references do not inflate the body floor. Europe PMC JATS retains its
prior `full_text_with_body` admission without an IMRaD heading requirement.
PDFs preserve line boundaries; HTML/XHTML extraction is static. Full readable
identity-verified pages are admitted before embedded login, paywall, challenge
or JavaScript markers are used to explain a failed identity/admission check.
Only admitted full text opens a method-audit handle.

One identity is frozen before supplied copies: DOI, PMID, title variants from
Europe PMC search, Unpaywall/Crossref, and Europe PMC JATS, first author, year,
journal, and PII when available. Variants are deduplicated by normalized form.
Declared page titles conflict only if they match no variant. Title comparisons
use NFKC/lowercase letters and numbers only, with at least 24 compact characters;
first-author surname/year support remains word-bounded. Quote-consistent meta
parsing preserves apostrophes. HTML `citation_doi` establishes an exact DOI or
an identity mismatch. PII uses compact matching with at least 10 characters,
recorded as `pii_exact`. PDF identity uses pages one and two up to references,
including footers and cover pages; HTML/plain text keep the front area so a
review's body/reference quotation cannot establish identity. No additional
metadata lookup was added.

Exact source host sets (optional `www` variants are individually enumerated):

- Researcher upload: `academia.edu`, `www.academia.edu`, `researchgate.net`, `www.researchgate.net`.
- Repository: `europepmc.org`, `www.europepmc.org`, `ncbi.nlm.nih.gov`, `www.ncbi.nlm.nih.gov`, `pmc.ncbi.nlm.nih.gov`, `arxiv.org`, `www.arxiv.org`, `biorxiv.org`, `www.biorxiv.org`, `medrxiv.org`, `www.medrxiv.org`, `zenodo.org`, `www.zenodo.org`, `figshare.com`, `www.figshare.com`, `hal.science`, `www.hal.science`, `core.ac.uk`, `www.core.ac.uk`.
- Publisher: `sciencedirect.com`, `www.sciencedirect.com`, `link.springer.com`, `nature.com`, `www.nature.com`, `onlinelibrary.wiley.com`, `academic.oup.com`, `journals.sagepub.com`, `tandfonline.com`, `www.tandfonline.com`, `journals.plos.org`, `mdpi.com`, `www.mdpi.com`, `frontiersin.org`, `www.frontiersin.org`, `bmj.com`, `www.bmj.com`, plus the metadata-bound publisher host above.

Known hosts override declarations (`known_host`); an Unpaywall-bound publisher
host uses `metadata_publisher_host`. Unknown hosts accept only declared
`author_copy` or `repository` (`declared`); all other declarations become
`other` (`unrecognized_host`). Arbitrary subdomains and suffix lookalikes do not
inherit a class. Candidate fetching is concurrent, with results and equal-rank
selection preserving input order.
Among full readable candidates, publisher and repository tie for first,
followed by author copy, researcher upload, then other; ties preserve input
order. A full readable lower-ranked copy beats a higher-ranked abstract.

| Acquisition state | Meaning |
| --- | --- |
| FULL_TEXT_READABLE | Identity and route-specific admission pass (JATS body; PDF/candidate structural/body floor); only this state issues a handle. |
| PARTIAL_TEXT_READABLE | Some body sections are readable but required sections or the length floor are missing. |
| ABSTRACT_ONLY | Only front matter, abstract or metadata is structurally readable. |
| CANDIDATE_FOUND_FETCH_BLOCKED | Candidate 403, non-public destination refusal, redirect/byte cap, unsupported/undecodable body, challenge or JavaScript-only page; a terminal boundary. |
| PAYWALL_OR_LOGIN_REQUIRED | Candidate 401/402 or a recognized login/paywall structure; no bypass. |
| NO_COPY_FOUND_AFTER_EXPANDED_SEARCH | A per-candidate 404/410, or no candidates and an exact expanded-search declaration; no copy was admitted. |
| PROVIDER_UNAVAILABLE | Provider failure, candidate 429/5xx, timeout, DNS, connection or TLS failure; typed transport failure, no lead receipt. |
| IDENTITY_MISMATCH | The retrieved copy did not establish the target's own identity. |
| PRIMARY_OA_ROUTES_EXHAUSTED | No OA copy or candidate and no valid exact-search declaration; also Unpaywall's internal no-open-location state. Exact public-copy discovery remains. |

When candidates are supplied but none is admitted, overall precedence is partial,
abstract, blocked, unavailable, paywall/login, mismatch, then no copy; each
candidate retains its state. Technical failure means any discovery attempt with
`result: error` or any candidate/overall `PROVIDER_UNAVAILABLE`, using one shared
predicate. Blocked copies and paywalls are terminal boundaries, not failures.
HTTP 401/402 maps to paywall/login, 403 to blocked, 404/410 to no copy, and
429/5xx to provider unavailable. Transport refusal codes distinguish blocking
limits from outages; text decoding uses replacement and unknown charsets fall
back to UTF-8.

A `possibly_useful_lead` receipt requires no technical failure and a `declared`
exact expanded search, and signs `state = acquisition_state`. The controller
uses that same predicate: ineligible results are `BLOCKED_RETRYABLE`; eligible
results are `LEAD_BOUNDARY`. Treatment follow-up preserves this rule. Finalization
uses the signed state for the exact public-copy, login/subscription, fetch-block,
abstract, partial-text or identity-mismatch limit; old receipts without state
retain their prior wording. Old top-level status values remain additive and
clients with cached strict schemas need a refreshed tool list.

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

Review-fix test-name list (synthetic, parameterized cases):

- `records exact expanded search without candidates, returning no query text`
- `reports a declaration missing the exact %s without echoing queries`
- `validates trimmed, bounded queries in a strict public-copy search object`
- `admits a public full-text page with an embedded password input`
- `preserves apostrophes in quote-consistent citation metadata %s`
- `matches the Crossref title variant when MEDLINE appends a collective author for PMID 10734247`
- `matches a PDF title hyphenated across a line break`
- `verifies a PDF DOI in the %s after the abstract`
- `excludes references from the PDF identity area`
- `excludes a DOI appearing only on a later PDF page from identity verification`
- `checks HTML citation_doi %s as the page identity`
- `verifies compact PII identity in %s`
- `rejects structured abstract labels followed by unrelated related-paper text`
- `decodes %s text with replacement rather than rejecting its body`
- `fetches candidates concurrently, preserves result order and breaks equal ranks by input order`
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
- `preserves network failure as unavailable and continues subsequent candidates`
- `accepts the exact normalized title plus %s without a DOI`
- `rejects the exact title without an author or year`
- `prefers full repository text over full researcher upload, but full upload over a repository abstract`
- `bounds the number of candidate blocks before issuing a handle`
- `budgets first-page candidate provenance and long URLs within client limits`
- `classifies exact hosts before declared class and refuses suffix lookalikes`
- `requires 6,000 body characters without inflating them with an abstract`
- `keeps title length, surname and year support exact`
- `credits both kinds in %s without counting the body twice`
- `credits methods and results for %s`
- `credits methods for %s with the per-section minimum`
- `preserves %s failure as provider unavailable using the transport code`
- `preserves typed %s refusal as blocked rather than unavailable`
- `recognizes exact structural headings %s / %s / %s`
- `rejects %s before a request`
- `rechecks redirect DNS and rejects a rebound destination`
- `enforces the byte cap on candidate HTML`
- `signs no receipt for incomplete expanded search %j`
- `signs the state of an exact expanded search finding no copy without retaining queries`
- `signs a lead for a declared search after every source answered without failure`
- `signs no lead when a source failed, and asks for a retry`
- `signs a declared terminal boundary only without a technical failure for %s`
- `signs no lead after actual Unpaywall acquisition receives HTTP %i`

Additional controller/finalization regressions:

- `binds expanded-search completion %j to controller status %s`
- `checkpoints only the public-copy search summary after checking queries in memory`
- `prints the signed lead boundary for %s`
- `keeps a declared blocked-copy boundary terminal in treatment follow-up`
- `uses an exact Europe PMC full text before Unpaywall` (original JATS fixture)

Lesson closeout: the reviewed failure class was primary-route exhaustion being
mistaken for completed expanded discovery. The shared receipt/controller predicate
now requires an exact declaration and separates technical failures from terminal
access boundaries. No lesson-queue operation or scope expansion was made; live
queue status remains unavailable under the owner’s no-network constraint.


## Phase 1 review-fix validation (2026-10-07)

The final `npm run verify` on Node 24.18.0 exited **0**: typecheck, the
complete deterministic suite, and build passed. Exact final result lines:

```text
Test Files  205 passed | 1 skipped (206)
Tests  2423 passed | 6 skipped (2429)
```

The sandbox denied loopback/IPC sockets in the initial full-suite attempt.
The passing final run allowed local test sockets with a temporary Node guard
blocking external connections and DNS; live/provider tests remained disabled.
A new checkpoint fixture initially reached the default JATS fetcher through
its synthetic PMCID; that route was replaced with a synthetic no-copy response.
All added article bodies and abstracts are synthetic. Tool inventory generation
followed `npm run typecheck` and used Node's `tsx` loader to avoid the CLI's
sandbox-denied IPC socket. `git diff --check` passes; `protocols/` has no diff,
the branch and HEAD remain unchanged, and no commit or release was made.

## Live acceptance, phase 1 (2026-10-07, about 13:33 UTC)

Run by Claude against the live services: the real `acquire_open_full_text` tool, in process, on this branch
(b65a7002 plus the wording fixes). Public copies were found with web search by exact title, DOI and author. Each call
took 0.4 to 1.7 seconds.

| Call | End state | Receipt |
| --- | --- | --- |
| 10734247, primary routes only | PRIMARY_OA_ROUTES_EXHAUSTED; Europe PMC and Unpaywall found nothing; the boundary lists both title forms, DOI and PMID | none |
| 10734247, four possible copies (PMC page of the 2011 double-blind trial, two Academia.edu uploads, Verona IRIS record) | CANDIDATE_FOUND_FETCH_BLOCKED: every host answered with a challenge | lead, state CANDIDATE_FOUND_FETCH_BLOCKED |
| 14529800, three possible copies (UvA DARE, UMC Utrecht, ResearchGate) | ABSTRACT_ONLY: DARE matched by DOI and UMC Utrecht by title, both abstract-only records with no file; ResearchGate blocked | lead, state ABSTRACT_ONLY |
| 11374875, three possible copies (Verona IRIS record, ResearchGate, Semantic Scholar) | CANDIDATE_FOUND_FETCH_BLOCKED | lead, state CANDIDATE_FOUND_FETCH_BLOCKED |
| 11374875, searches without the exact title | PRIMARY_OA_ROUTES_EXHAUSTED, public_copy_search missing_exact_identifiers ["title"] | none |

What blocked plain fetching:

- Academia.edu and iris.univr.it: Cloudflare "Just a moment..." challenges (HTTP 403).
- ResearchGate: HTTP 403, "Temporarily Unavailable".
- Semantic Scholar: HTTP 202 with an empty body.
- pmc.ncbi.nlm.nih.gov: a reCAPTCHA "Checking your browser" page with HTTP 200, recognized by its structure. PMC copies
  still come through Europe PMC's API by PMCID.

Unpaywall lists all three papers as closed. With direct fetching alone, none of their full texts can be read. So the
scientific checks the directive names (L-DOPA given with carbidopa; purified pig-kidney enzyme in vitro) could not be
confirmed live. They need phase 2 (Bright Data unlocking), owner question 45.

Two wording fixes came from this run:

- A blocked copy's limit now reads "a possible public copy was found, but AskRigor could not fetch it to check it". The
  copy's identity is unverified.
- The discovery hint lists every known title form. PubMed's title for 10734247 adds "Dopaminergic Therapy Study Group.".

## Full-text protocol and public-notice candidates (2026-10-07)

At the owner's direction, sections A–E of the full-text draft are applied as
HRP 20.6.12, revision date 2026-10-07, pending owner approval. The recorded edit
fixture `tests/fixtures/protocol-edits/2026-10-07-full-text-candidate.json`
reverses to the exact HRP 20.6.11 bytes; the historical chain undoes it first.
Placement and sentence tests cover the three existing rules, four stress cases,
and FS213. Universal bytes and the PTI candidate's files are unchanged.

The public-copy sentence is drafted in `site/privacy/index.html`, pending owner
approval. Its effective date remains October 4, 2026; release sets the date.
The privacy data map records the draft's pending status. This work uses no
external network and makes no commits or releases. Live architecture retrieval
and lesson-queue status remain unavailable under the owner's network constraint.
Lesson closeout: candidate text now names exact public-copy discovery and the
route-failure versus access-boundary distinction enforced by Phase 1; this is
proposed protocol wording, not owner approval or production acceptance.

Candidate validation on Node 24.18.0: final `npm run verify` exited **0**
(typecheck, complete hermetic suite, build). `npm run test:site` and
`npm run test:site-deploy` each exited **0**. Exact final result lines:

```text
Test Files  206 passed | 1 skipped (207)
Tests  2428 passed | 6 skipped (2434)
Validated AskRigor public site: 4 pages
Test Files  1 passed (1)
Tests  28 passed (28)
```

The final HRP SHA-256 is
`362c558eca8f8de908838702bd9487a898296e4ae0ef39b9067d00f122b6f801`.
The exact draft audit passed for A–E after XML whitespace normalization; the
recorded edits reverse to the original committed HRP bytes, and the privacy
page differs only by the requested sentence. `git diff --check` passed.
Tests ran with a temporary Node guard blocking external connections and DNS,
with loopback/IPC test sockets permitted; live/provider tests were disabled.

## Owner decisions (2026-10-07)

- Question 46: B. The HRP 20.6.12 wording and the privacy-page sentence are approved; phase 1 is released together with
  phase 2. The revision entry now reads "Owner-approved, question 46".
- Question 45: before phase 2, reconcile with GPT, which reported finding all three papers: how and where it found them.

## Reconciliation with GPT (owner question 45, 2026-10-07)

The owner reported that GPT had found all three papers. A fresh GPT run asked to find and read their full texts finished
at 15:35 UTC. It was Codex on the owner's ChatGPT plan, with live web search and a browser. It could not read any of the
three:

- 10734247: an Academia.edu upload attributed to coauthor Steven Kugler (academia.edu/23529165), a five-page PDF. "See
  full PDF" required sign-in, so only the abstract and references were visible. The publisher pages (pedneur.com) gave
  the abstract and a login or purchase page.
- 14529800: ScienceDirect showed a CAPTCHA; Ovid wanted a subscriber login; the UvA DARE record has no file.
- 11374875: an Academia.edu upload attributed to C. Voltattorni (academia.edu/128459378), a four-page PDF, also behind
  sign-in. ResearchGate states that no full text is available.

Neither detail the directive cites appears in the PubMed abstracts (efetch, 15:36 UTC): "carbidopa" for 14529800 and
"pig kidney" for 11374875. So the original chat either read copies that neither GPT nor Claude found, or inferred the
details. Both are plausible inferences: L-DOPA is routinely given with carbidopa, and the Verona group habitually
purifies DOPA decarboxylase from pig kidney. Only the original chat can say which. The owner was given the question to
paste there.

Consequence for phase 2: Bright Data would get past challenge pages such as the Verona IRIS records. It would not get
past the Academia.edu sign-in, because phase 2 never defeats a login or a paywall. For these three papers, the copies
found so far are login-gated, records without a file, paywalled, or behind a challenge with unknown content.
