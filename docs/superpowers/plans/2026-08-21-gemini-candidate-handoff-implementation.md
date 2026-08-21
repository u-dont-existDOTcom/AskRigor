# Gemini candidate-only handoff implementation plan

**Goal:** Replace the repeatedly expanded Gemini Spark scouting contract with a
small candidate-only handoff and make AskRigor independently validate its
structure, YouTube identities, provider metadata, and mechanical comment-audit
eligibility.

**Baseline:** branch `agent/gemini-youtube-scout-skill-20260819` at
`b67468d`. The owner-confirmed v15 upload passed Gemini's conversation scanner,
but v15 and v16 behavioral runs both produced useful real candidates alongside
internally inconsistent ledgers and unsupported classifications. The stopping
decision is already recorded: no incremental v17 prose repair and no further
owner-operated bisect loop.

## Research-before-reinvention gate

- **Applicability:** `required`; repeated bespoke refinement of a structured
  inter-agent handoff triggered the gate.
- **Independent conception snapshot:** move discovery recall to Gemini, reduce
  its output to candidate identifiers and explicitly provisional annotations,
  and move exact checks into deterministic AskRigor code.
- **Existing-work scan:** the repository already uses strict Zod 4.4.3 schemas
  for untrusted boundaries, exact JSON receipts for deterministic evaluation,
  and `packages/sources/src/youtube.ts` for normalized provider identities,
  access states, canonical URLs, and statistics. The YouTube community survey
  already demonstrates bounded parallel metadata retrieval and preservation of
  provider limitations. JSON is the repository's established machine-readable
  interchange format; no new parser, workflow framework, or public protocol is
  needed.
- **Existing-work map:** syntax and field bounds are solved by strict Zod
  schemas; provider truth is solved by the current YouTube adapter; deterministic
  receipt conventions are solved by current survey/audit modules. The unsolved
  remainder is the domain-specific Spark packet schema, bounded raw response
  parsing, identity comparisons, and mechanical seed-eligibility receipt.
- **Disposition:** `compose`.
- **Novel remainder:** one compact packet/receipt pair and its strict raw JSON
  parser, with exact legacy framing retained for compatibility. Creator claims,
  intervention labels, and semantic seed choice remain explicitly provisional
  and outside deterministic validation.
- **External baseline:** current AskRigor source schemas and YouTube provider
  envelope; the public 17-tool MCP catalog remains unchanged.
- **Research debt:** none. A server-side mailbox or bidirectional Spark API is
  outside the authorized scope and is not simulated.

## Acceptance criteria

- [x] The Spark skill is candidate-only, materially smaller than v16, and emits
  one raw strict JSON packet identified by `packet_name` and `packet_version`.
- [x] Gemini does not claim AskRigor metadata status, statistics, comment
  inspection, efficacy, safety, causality, or protocol completion.
- [x] The packet contains bounded discovery queries, 3–12 unique YouTube
  candidates, provisional annotations, 1–4 suggested seed IDs, gaps, and fixed
  disclosures.
- [x] AskRigor rejects malformed framing, invalid or duplicate IDs, unexpected
  fields, noncanonical links, and seed IDs outside the candidate set before any
  provider calls.
- [x] AskRigor retrieves metadata independently and rejects identity mismatches
  or non-complete provider states while preserving access boundaries.
- [x] Comment-audit eligibility is mechanical only: API-visible identity,
  public status when reported, and a positive provider comment count. Semantic
  materiality and protocol selection remain unresolved.
- [x] Suggested seeds from the same provider channel are flagged so the receipt
  does not manufacture creator diversity.
- [x] A reusable package function and operator CLI are covered hermetically; no
  live credential is required by the deterministic gate.
- [x] Setup documentation replaces the iterative upload instructions with the
  complete compact workflow and records the old contract as retired.
- [x] `npm run test:run` and `npm run verify` pass; the final diff is reviewed
  and committed locally without push or deployment.

## Implementation sequence

1. Define the strict packet and validation-receipt schemas in
   `@askrigor/sources`, reusing the existing YouTube ID, data, and envelope
   contracts.
2. Implement exact response parsing and metadata validation with an injectable
   `get_video` dependency for hermetic tests.
3. Add a small CLI that reads a complete Spark response from a file or standard
   input, uses `YOUTUBE_API_KEY`, and prints only the structured validation
   receipt.
4. Replace the Spark `SKILL.md` and setup guide; pin their compact contract in
   focused tests.
5. Run focused tests, the complete deterministic gate, final diff review, and
   lesson closeout.

## Implementation and verification receipts

- Replacement skill: 6,577 UTF-8 bytes, 457-character maximum line, SHA-256
  `1ecd387b95af48050590f8f5d8a6ea900b7cfb79b18a9dd8562057929560b02b`.
  The retired v16 artifact was 35,987 bytes.
- The skill-creator `quick_validate.py` check passed.
- Focused contract and validator suite: 2 files, 16 tests passed.
- The CLI negative smoke ran at the host boundary and returned the expected
  structured `invalid_framing` rejection without provider work.
- A sandboxed complete test attempt recorded 67 listener/IPC `EPERM` failures;
  its remaining 911 tests passed with five declared skips. The required host-
  boundary `npm run verify` then passed typecheck, 59 test files with one
  credential-gated skip, 979 tests with five skips, and build.
- `YOUTUBE_API_KEY` was unavailable in the local shell, so no new live provider
  request was fabricated. The prior v16 evaluation already records independent
  `api_visible_complete` title matches for all 10 supplied IDs and exact
  provider metadata for its three seeds. The new validator's provider boundary
  is covered hermetically through injected literal envelopes.
- The owner's first candidate-only forward packet exposed a redundant-framing
  defect in the repository contract: Spark returned the complete strict object
  without the requested marker and fence. The strict `packet_name` and
  `packet_version` already identify it unambiguously, so raw JSON is now the
  canonical form and the previous exact framing remains accepted only for
  backward compatibility. No owner rerun was required.
- That raw packet passed the strict schema with 10 unique queries, 7 unique
  candidates, and 3 suggested seeds. Independent AskRigor metadata retrieval
  validated all seven IDs, canonical URLs, exact titles, channels, public
  privacy states, and `api_visible_complete` access. The three suggested seeds
  used distinct provider channels and reported 343, 545, and 32 comments, so
  the validation status was `accepted`. No comments or transcripts were
  retrieved, and semantic labels and creator claims remain provisional.
- The public MCP/Action inventory, protocols, production service, and Gemini
  account state were unchanged.
- Lesson closeout at `2026-08-21T03:26:23.139Z` was available: 1 open
  candidate, 1 needs review, 0 accepted not incorporated, 2 incorporated or
  closed, and 0 deletion eligible. No unreviewed lesson expanded this task and
  no new cross-project lesson was submitted; the reusable compose-before-invent
  control was already supplied by the current universal architecture.
- A later required checkpoint at `2026-08-21T04:01:24.073Z` was also available
  with the same counts: 1 open candidate, 1 needs review, 0 accepted not
  incorporated, 2 incorporated or closed, and 0 deletion eligible.

## Owner-decision boundaries

- Do not add, remove, or deploy a public MCP/Action operation as part of this
  change.
- Do not validate creator claims or infer a diagnosis from a symptom-level
  research target.
- Do not call a mechanically eligible candidate materially useful without the
  later protocol-governed AskRigor selection and audit.
- Do not push, publish, deploy, or alter Gemini account state.
