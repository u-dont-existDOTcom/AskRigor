# AskRigor Custom GPT Action Bridge Design

Date: 2026-08-16
Status: approved by the owner
Branch: `codex/calibrated-discovery-v0.2-design-2026-08-16`

## Objective

Give the AskRigor Custom GPT the same research workflow available through the
public AskRigor MCP when the GPT editor exposes Actions but does not expose
Apps. The compatibility surface must preserve protocol-byte authority,
provider access states, pagination, community-corpus completion receipts, and
the existing separately consented lesson submission without changing the
frozen public MCP v0.1 contract.

The intended user-visible terminal state is one importable OpenAPI document,
one compact generated instruction artifact, no Knowledge files, and a short
acceptance checklist. The owner should not have to maintain several manually
copied instruction sources or infer which files belong in the GPT editor.

## Approved decisions

- Keep public MCP v0.1 frozen at its current 17 read-only tools. Do not add,
  remove, rename, or change the MCP schemas, tool descriptions, annotations, or
  inventory for this bridge.
- Add a separate REST compatibility adapter under `/actions/research/*` and
  retain the existing authenticated `submit_lesson_candidate` Action.
- Publish one generated OpenAPI document containing the 17 read-only research
  operations and the one consequential lesson operation.
- Keep the research operations public, like the existing public MCP. Apply the
  same trusted-client-IP, rate, concurrency, provider-budget, and request-size
  boundaries. The lesson operation remains Bearer-authenticated and retains its
  independent privacy, budget, consent, and GitHub App controls.
- Preserve operation IDs across MCP and Actions. Each research Action path is
  `POST /actions/research/<operation_id>`.
- Use bounded continuation when an MCP result cannot safely fit through a
  Custom GPT Action. Never silently truncate a protocol or source corpus and
  never label an incomplete result complete.
- Keep GPT Knowledge empty. Complete canonical protocols are loaded at runtime;
  a manually uploaded copy would create an uncontrolled stale authority.
- Generate a compact Custom GPT instruction artifact from reviewed repository
  sources. Editing the GPT remains a manual product step because no supported
  repository API for modifying a Custom GPT has been verified.
- Preserve the existing lesson confirmation. The 17 research operations are
  non-consequential; `submit_lesson_candidate` remains consequential and is the
  only write operation.

## Current baseline

This design starts from AskRigor `main` at
`33cb5d0004974caea82738c64faffa06d1d15ae4` plus the three documentation-only
calibrated-discovery commits already present on this task branch.

Current durable surfaces are:

- `apps/research-mcp/src/register-tools.ts`: the 17 MCP registrations, schemas,
  handlers, and read-only annotations;
- `docs/tool-inventory-v0.1.0.json`: the frozen public v0.1 inventory;
- `apps/research-mcp/src/actions/`: the Action router, OpenAPI generator, body
  bound, authentication, and path validation;
- `apps/research-mcp/src/lessons/action-route.ts`: the one existing
  consequential lesson operation;
- `docs/custom-gpt-action-openapi.json`: the current lesson-only generated
  schema;
- `skills/askrigor/SKILL.md`: the compact MCP-facing workflow; and
- `project/LESSON_CAPTURE_MODULE.md`: the current lesson-consent behavior.

The complete protocol sizes on this branch are 479,885 bytes for
`HRP_Full.xml` and 86,602 bytes for `Universal_Instructions.xml`. A direct
single-response Action mirror is therefore not a safe assumption. The exact
current product response ceiling remains an external acceptance fact; this
design uses an internal 60,000-byte serialized-response ceiling, limits
protocol text within one response to 48,000 UTF-8 bytes, and requires a live GPT
preview before release.

The required lesson-queue checkpoint on 2026-08-16 was available: zero open
candidates, zero needing review, zero accepted but not incorporated, one
incorporated or closed, and zero deletion eligible.

## Scope and non-goals

The bridge includes:

- shared canonical research-operation definitions consumed by MCP and Action
  adapters;
- 17 POST research routes with stable operation IDs;
- deterministic OpenAPI generation and drift tests;
- exact-byte protocol chunking for the Action form of `load_protocol`;
- bounded Action response handling with explicit continuation or failure;
- one generated Custom GPT instruction and setup packet;
- local HTTP, schema, parity, privacy, and regression tests;
- live bounded Custom GPT acceptance evidence; and
- production deployment and rollback documentation.

This work does not:

- change either canonical XML protocol;
- activate the private calibrated-discovery v0.2 runner;
- add Exa, Parallel Search, patient-review scraping, or another new provider;
- change the public MCP v0.1 submission packet or claim a new MCP review;
- make the lesson write public or remove its confirmation;
- automate editing or publishing the Custom GPT through an unverified browser
  or private API; or
- promise byte-for-byte single-call equivalence where the Action transport has
  a smaller response boundary.

## Surface contract

The generated OpenAPI document contains these research operations plus the
existing lesson operation:

| Operation ID | Action path | Transport note |
| --- | --- | --- |
| `get_protocol_manifest` | `/actions/research/get_protocol_manifest` | Same manifest fields and hashes. |
| `load_protocol` | `/actions/research/load_protocol` | Exact XML returned in ordered bounded chunks. |
| `verify_protocol_integrity` | `/actions/research/verify_protocol_integrity` | Server verifies canonical bytes and optional expected SHA-256. |
| `search_pubmed` | `/actions/research/search_pubmed` | Same access and pagination envelope. |
| `fetch_pubmed_record` | `/actions/research/fetch_pubmed_record` | Same metadata/full-text limitation. |
| `search_europe_pmc` | `/actions/research/search_europe_pmc` | Same provider identifiers and cursor. |
| `search_clinical_trials` | `/actions/research/search_clinical_trials` | Same provider page-token semantics. |
| `fetch_clinical_trial` | `/actions/research/fetch_clinical_trial` | Same study envelope. |
| `resolve_doi` | `/actions/research/resolve_doi` | Metadata resolution only. |
| `check_retraction_status` | `/actions/research/check_retraction_status` | Metadata markers only; no validity inference. |
| `search_youtube` | `/actions/research/search_youtube` | Same bounded search records. |
| `get_youtube_video` | `/actions/research/get_youtube_video` | Same API-visible video metadata. |
| `get_youtube_comments` | `/actions/research/get_youtube_comments` | Diagnostic/recovery route; an Action boundary must remain explicit. |
| `search_youtube_comments` | `/actions/research/search_youtube_comments` | Query-bounded partial discovery only. |
| `audit_youtube_community` | `/actions/research/audit_youtube_community` | Legacy bounded audit with blocking receipt. |
| `survey_youtube_community` | `/actions/research/survey_youtube_community` | Preferred first stage. |
| `audit_youtube_video_community` | `/actions/research/audit_youtube_video_community` | Preferred exact continuation stage. |
| `submit_lesson_candidate` | `/actions/lessons` | Existing private consequential write. |

Every research operation has `x-openai-isConsequential: false` and no OpenAPI
security requirement. The lesson operation has
`x-openai-isConsequential: true` and `bearerAuth`. Configuring the GPT editor
with the existing Bearer key may cause it to send the header to public research
routes; those routes ignore its value and must never log it.

All POST request objects remain strict. Unknown fields fail validation. The
router-owned invalid JSON, request-read failure, body-too-large, rate-limit,
concurrency, and internal-error shapes are declared in the schema and tested.

## Shared operation registry

Refactor the current registrations into a repository-owned immutable
`ResearchOperation` registry. Each record contains:

```text
name and stable operationId
description
Zod input schema
Zod structured-output schema
read-only annotations
handler returning summary text plus structured content
Action path
Action request/output adapter when transport continuation is required
```

The MCP registrar iterates this registry and passes the original schema,
description, annotations, and handler to `server.registerTool`. The Action
factory iterates the same registry and converts each strict Zod schema into
OpenAPI-compatible JSON Schema. No Action handler independently reimplements a
provider call or failure envelope.

An inventory regression test proves that the MCP names, order, descriptions,
input/output schemas, annotations, and generated inventory hash are unchanged
from frozen v0.1. A second test proves that the Action operation-ID set equals
that exact 17-name set and that all are public and non-consequential. The lesson
operation is tested separately and must not enter the MCP inventory.

If the current MCP SDK accepts a raw schema shape where the registry requires a
Zod object, the refactor wraps the same fields in a strict Zod object and proves
the generated MCP schema snapshot is unchanged. No behavior change is accepted
merely to simplify the registry.

## Protocol-byte authority over Actions

The Action form of `load_protocol` accepts the current `protocol` field and an
optional opaque `cursor`. Its response contains:

```text
ok
protocol
manifest
chunk_index
chunk_count
byte_start
byte_end_exclusive
total_bytes
chunk_sha256
text
next_cursor
complete
error
```

The first call omits `cursor`. The server reads the same canonical file used by
the MCP handler, computes the existing whole-file manifest, and returns no more
than 48,000 UTF-8 bytes of protocol text. Each cursor is authenticated,
versioned, and bound to the protocol name, exact whole-file SHA-256, next byte
offset, and expiry. Cursor authentication derives a protocol-specific key from
the existing server-only YouTube continuation secret with an explicit domain
label; it never reuses a token or unsigned payload across purposes. The next
call fails closed if the file changed, the cursor was altered, chunks are
requested out of sequence, or the cursor expired.

UTF-8 chunk boundaries never split a code point. The final response has
`complete: true`, no `next_cursor`, a byte end equal to `total_bytes`, and the
same whole-file hash returned by the manifest and integrity operation.

The generated GPT instructions require manifest, integrity verification, and
all `load_protocol` chunks in sequence before substantive work. Seeing the
manifest, one chunk, a filename, or a successful server-side hash check is not
equivalent to loading the complete text. Missing, expired, repeated, skipped,
or inconsistent chunks block the relevant protocol claim.

The MCP form of `load_protocol` remains its existing one-call full-text result.

## Large research results and community evidence

The Action adapter enforces a 60,000-byte serialized-response ceiling before
writing a response. A result that would exceed the ceiling must use a
documented exact continuation path or return an explicit fail-closed boundary;
the router must never truncate JSON or drop records silently.

For ordinary provider search/fetch operations, existing page sizes and cursors
already provide bounded continuation. For YouTube:

- the generated GPT instructions prefer `survey_youtube_community` followed by
  `audit_youtube_video_community`;
- the per-video audit retains its authenticated stateless continuation and
  exact cumulative-versus-returned counts;
- the Action instructions select a bounded `analysis_limit` small enough for
  the response ceiling while the receipt still reports the full retrieved
  corpus state;
- `continuation_recommended: true` requires an immediate next call;
- `synthesis_lock: pass` is required for full community synthesis;
- `search_youtube_comments` remains a query-bounded `partial` subset and never
  becomes corpus completion; and
- `get_youtube_comments` remains diagnostic/recovery behavior. If its exact
  provider pagination cannot resume without losing reply state under the
  Action ceiling, it returns an explicit access boundary and directs the
  workflow to the exact per-video audit rather than claiming completion.

The live acceptance gate determines the maximum safe Action analysis sample.
That value becomes a named configuration constant with tests; it is not guessed
from the editor UI.

## Rate, concurrency, and privacy boundaries

Research Action requests pass through the same client-IP resolver used by MCP,
including the current allowlisted trusted proxy header. They consume the same
public token bucket and a shared public concurrency pool so the bridge cannot
double production capacity accidentally. The Action OpenAPI document itself is
read-only and may remain outside provider-call concurrency while still being
subject to a small bounded response.

The existing 8,192-byte Action request-body maximum remains. Route validation
continues to reject ambiguous encodings, noncanonical paths, duplicate
method/path pairs, reserved paths, and undeclared required response headers.

Research routes do not receive, persist, or forward the lesson candidate. They
must not log Authorization, protocol contents, raw provider bodies, private
health details, or continuation secrets. Current metadata-only operational
logging and privacy-map rules remain controlling. The privacy data map and
public privacy notice are reconciled to name the Action compatibility surface
and to confirm that it uses the same research-provider flow as MCP.

The lesson route keeps its dedicated attempt limiter, privacy-model gate,
monthly budget ledger, selected-repository GitHub App, duplicate behavior, and
consent contract. A research failure cannot fall through to lesson submission;
a lesson failure cannot disable MCP or convert a read into a write.

## Custom GPT synchronization packet

Add a deterministic generator that produces:

- `docs/custom-gpt-action-openapi.json` from the live route registry;
- `docs/custom-gpt-instructions.md`, a compact instruction artifact derived
  from the reviewed AskRigor skill plus the required lesson-consent behavior;
  and
- `docs/custom-gpt-sync.json`, containing the source paths and SHA-256 hashes,
  generated artifact hashes, operation IDs, generation date, and exact editor
  checklist.

The instruction artifact must fit the documented repository ceiling, name all
protocol and community completion gates, retain exact lesson consent choices,
and distinguish read-only research from the one write. A deterministic test
rejects missing clauses, unknown operation IDs, source-hash drift, an oversized
artifact, or hand-edited generated output.

The editor checklist is:

1. keep Knowledge empty;
2. replace the GPT Instructions field with the complete generated instruction
   artifact;
3. import `https://mcp.askrigor.com/actions/openapi.json`;
4. configure API Key → Bearer with the existing protected Action key;
5. set `https://askrigor.com/privacy` as the privacy-policy URL;
6. run the exact new-chat acceptance cases;
7. publish/update only after all required cases pass; and
8. copy the actual public `/g/...` GPT URL and repoint `gpt.askrigor.com` from
   the current shared-conversation redirect.

The packet prints exact copy/import targets. It never includes the Bearer value
or any provider credential.

## Test-first implementation

Behavioral work begins with failing tests in this order:

1. registry parity: exact frozen MCP inventory and 17 Action research IDs;
2. OpenAPI security and consequential markers;
3. strict request validation and Action response-envelope conversion;
4. protocol chunk ordering, hashes, expiry, tamper detection, protocol-change
   detection, UTF-8 boundaries, and exact final byte coverage;
5. shared public rate and concurrency limits across `/mcp` and research
   Actions;
6. response-ceiling enforcement without silent truncation;
7. YouTube continuation, counts, synthesis locks, and diagnostic fallback;
8. isolation between read-only research and lesson writes;
9. deterministic instruction/OpenAPI/sync generation and stale-artifact
   detection; and
10. privacy, setup, rollback, and current-state documentation checks.

Focused tests run during implementation. The final candidate must pass
`npm run generate:action-openapi` with a clean diff and the complete
`npm run verify` gate. Because the public site/privacy route and deployment
documentation are affected, it also runs `npm run test:site` and
`npm run test:site-deploy`.

## Live acceptance and release gate

Use a new unpublished Custom GPT chat and synthetic/non-personal prompts. The
release is blocked until the editor imports exactly 18 operations and these
cases pass:

1. Universal manifest → integrity verification → every load chunk;
2. HRP manifest → integrity verification → every load chunk before a bounded
   health-research task;
3. PubMed search/fetch with literal access state and pagination;
4. ClinicalTrials.gov search/fetch with no inferred clinical conclusion;
5. DOI resolution/retraction metadata with its metadata-only limitation;
6. YouTube survey and per-video continuation through a terminal receipt;
7. a malformed request and an oversized request fail with declared errors;
8. rate/concurrency pressure fails closed without private detail;
9. one synthetic lesson submission requires explicit consent and returns a
   private review receipt;
10. the duplicate synthetic lesson returns the same candidate ID with an
    incremented anonymous occurrence count; and
11. an induced lesson failure does not affect research routes or `/mcp`.

After live Action checks, enumerate `/mcp` directly and prove the same exact 17
tools and frozen inventory hash. Record commit, image digest, protocol hashes,
schema hash, instruction hash, case outcomes, privacy URL, rollback image, and
the final GPT URL in release evidence. No real health detail or credential is
captured in screenshots or logs.

## Deployment and rollback

Build and deploy through the existing reviewed candidate-versus-production
path. Before traffic mutation, record the current image and Compose rollback
point. The new research routes are gated by a separate exact literal
`ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true`; the existing
`ASKRIGOR_ACTIONS_ENABLED` continues to control the lesson Action. This permits
research compatibility to be disabled without removing lesson capture or MCP.

Rollback sets `ASKRIGOR_RESEARCH_ACTIONS_ENABLED` to a value other than `true`
or restores the recorded image, then recreates only the research service. It
must prove:

- `/mcp` remains healthy with the exact 17 frozen tools;
- `/healthz` remains healthy;
- `/actions/research/*` returns unavailable/not found;
- `/actions/lessons` retains its prior enabled state; and
- the OpenAPI document no longer advertises disabled research routes.

No rollback deletes lesson candidates, aggregate ledgers, protocol files, or
provider state.

## Accepted tradeoffs and residual limits

- A Custom GPT Action cannot be assumed to carry the MCP's largest one-call
  results. Multiple protocol/community calls are the cost of preserving exact
  content and truthful completion under a smaller transport.
- Custom GPT configuration does not auto-update from Git. The generated packet
  reduces drift, but the owner must still paste/import and publish through the
  GPT editor.
- The public research adapter adds a second production request surface and
  therefore additional maintenance and abuse exposure. Shared limits, one
  registry, parity tests, and independent disablement bound that risk.
- Custom GPT product availability and editor behavior are hosted controls. A
  repository test cannot prove import success, operation visibility,
  confirmation UX, or current response ceilings; live preview evidence is
  required.
- MCP remains the higher-fidelity transport for unusually large raw diagnostic
  results. The Action bridge targets research-semantic parity and fail-closed
  completion, not identical transport mechanics.

No further owner decision is required for these accepted tradeoffs. A new
decision is required only if implementation would weaken protocol completeness,
make a write public, add a paid provider, expose private data, alter public MCP
v0.1, or require publishing a materially different GPT behavior.

## Completion criteria

The bridge is complete only when:

- the frozen MCP inventory is unchanged and its final tests pass;
- the generated OpenAPI document exposes exactly 17 non-consequential research
  operations plus one authenticated consequential lesson operation;
- full canonical protocol bytes are loaded through verified ordered chunks in
  the live GPT;
- large results preserve continuation/access boundaries without silent loss;
- shared public limits and lesson isolation are proven;
- generated instructions and sync metadata are current and credential-free;
- privacy, setup, rollback, current state, and release evidence are reconciled;
- deterministic, site, deployment, and bounded live gates pass on the final
  commit; and
- the owner receives the exact instruction file, schema URL, test prompts, and
  final direct GPT link step rather than a manual file-collection exercise.
