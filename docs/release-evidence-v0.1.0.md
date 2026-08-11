
# AskRigor v0.1.0 release evidence

Release disposition at 2026-08-11: **PUBLIC SUBMISSION BLOCKED**. Developer
Mode connector retrieval is ready based on the recorded production Inspector and
ChatGPT evidence below, but public publication cannot proceed until the public
website, support, privacy, and terms URLs are live HTTPS pages matching the
verified publisher identity and accurately disclose the service's data handling.

## Artifact and endpoint identity

| Item | Evidence |
| --- | --- |
| Local packet base | `cd19514e8701af3a2e6294fa0c2ab74fad5af466` (`docs: add ChatGPT plugin connection workflow`). |
| Production connector revision | `8fface584200f6ab824e91e6e50f975019fbf741` (`fix: accept YouTube reply pages without totals`). |
| Production MCP endpoint | `https://mcp.askrigor.com/mcp` (public streamable HTTP). |
| Protocol evidence | Formal-source Inspector evidence: `/opt/askrigor/validation/https-20260811T045226Z`. |
| YouTube evidence | Keyed YouTube Inspector evidence: `/opt/askrigor/validation/youtube-20260811T152149Z`. |
| Fresh public YouTube Inspector | `/opt/askrigor/validation/youtube-20260811T172256Z`; validator image `askrigor-youtube-validator:2.1.0`. |
| Fresh live-provider suite | `/opt/askrigor/validation/live-suite-20260811T172130Z-71611`; source `9d1d751`. |
| Package version | `0.1.0`; manifest retains no unverified privacy/terms/support URL. |

The two Inspector locations are recorded production evidence supplied by the
successful deployment/validation work. The controller's validation runner
accessed the server-side runtime environment without exposing, reading back, or
logging provider keys; evidence was read only after a fail-closed server-side
secret scan. This worktree contains no provider secret and did not independently
run the VPS validation.

## Recorded production validation

| Check | Recorded outcome |
| --- | --- |
| MCP metadata | Inspector discovered all 14 advertised tools and confirmed `readOnlyHint:true`, `destructiveHint:false`, and `openWorldHint:false`. |
| Formal sources | Production Inspector passed protocol integrity, PubMed, Europe PMC, ClinicalTrials.gov, and Crossref/retraction cases with their expected access/failure semantics. |
| YouTube | Production Inspector passed YouTube discovery and complete comment-plus-reply retrieval for the bounded public target, including reply-page reconciliation. |
| Fresh public YouTube Inspector | Exit 0; all 15/15 expected outcomes matched: tools list plus valid, zero, empty, malformed discovery/video/comments, complete reply corpus, and targeted zero-result cases. |
| Fresh live providers | The provider test process exited 0 and 5/5 passed, including PubMed, Crossref, and YouTube; the fail-closed server-side secret scan found no match. The original wrapper exit 1 was a false-negative ANSI status-parser failure only, after the provider tests had passed. |
| ChatGPT Developer Mode | End-to-end smoke passed protocol integrity, PubMed, and complete YouTube 2+1 replies through the deployed connector. No AskRigor write tools were exposed or called. |
| ChatGPT release finding | A separate **routine-status presentation regression** occurred: ChatGPT narrated a stale update-check date/status despite Universal v20.5.11 and HRP v20.5.15 prohibiting routine update diagnostics. This is not a connector retrieval failure; it must be fixed or explicitly accepted before release-quality presentation is claimed. |

## Public URL gate — direct HTTPS evidence

Direct read-only HTTPS checks were run 2026-08-11 16:41 UTC with `curl` using
HTTPS-only initial and redirect protocols. Each of the following returned
`HTTP/2 302` with `Location: http://research.u-dont-exist.com`, which downgrades
to plain HTTP. Strict redirect following refused that location with `Protocol
"http" not supported or disabled`; effective target was
`http://research.u-dont-exist.com/`.

| Required listing URL | Direct HTTPS result | Gate |
| --- | --- | --- |
| `https://askrigor.com/` | HTTPS `302` → plain-HTTP unrelated target | Blocked. |
| `https://askrigor.com/privacy` | HTTPS `302` → plain-HTTP unrelated target | Blocked; no live disclosure of public YouTube identity/comment processing. |
| `https://askrigor.com/terms` | HTTPS `302` → plain-HTTP unrelated target | Blocked. |
| `https://askrigor.com/support` | HTTPS `302` → plain-HTTP unrelated target | Blocked. |

Do not add these unverified legal URLs to `.codex-plugin/plugin.json`. Developer
Mode testing may continue, but it does not satisfy the public listing
requirements.

## Required submission work remaining

- Publish real public HTTPS website, support, privacy, and terms pages that match
  the verified AskRigor publisher identity. The privacy page must cover the
  fields and retention boundaries in `docs/privacy-data-map.md`, specifically
  public YouTube author/channel IDs, display names, and comment/reply text.
- Complete/confirm verified developer or business identity, listing URLs,
  country availability, and the portal's HTTPS domain-verification challenge.
- Submit the fixed production URL, select **Scan Tools**, and compare discovered
  tool metadata with `docs/public-review-checklist.md`. Any metadata change
  requires deploy → rescan → review.
- Enter the five positive and three negative reviewer cases in the public-review
  checklist, including expected result shapes and reproducible public fixtures.
- Resolve the routine-status presentation regression, or document a deliberate
  product decision with fresh ChatGPT evidence before asserting presentation
  readiness.
- Rerun the external live-suite wrapper with the ANSI-safe assertion after that
  wrapper is updated. The provider evidence is green, but a fresh wrapper exit
  0 is still required to close its separate orchestration status.

## Local release verification record

These commands were run from the Task 16 worktree on 2026-08-11. Live provider
checks run only with safely available credentials; credentials are never printed.

| Command | Task 16 result |
| --- | --- |
| `npm ci` | Passed outside the restricted sandbox: 156 packages installed and 161 audited; npm reported 0 vulnerabilities. The sandboxed attempt was blocked by an `esbuild` postinstall `EPERM`. |
| `npm run verify` | Passed outside the restricted sandbox after the runner repair: typecheck and build passed; Vitest reported 16 passed files, 1 skipped file, 325 passed tests, and 5 guarded live tests skipped. The sandboxed attempt failed only where loopback-server tests hit `listen EPERM` on `127.0.0.1`. |
| Credential-bound live suite | Recorded production evidence at `/opt/askrigor/validation/live-suite-20260811T172130Z-71611`: provider process exit 0 and 5/5 passed, including PubMed, Crossref, and YouTube; the controller's runner accessed the server-side runtime environment without exposing, reading back, or logging provider keys, and evidence was read only after a fail-closed server-side secret scan found no match. The wrapper exit 1 was solely an ANSI-grep false negative. This worktree contains no secret and did not independently rerun the remote suite. |
| `npm audit --omit=dev` | Passed outside the restricted sandbox: 0 production-dependency vulnerabilities. The sandbox could not resolve `registry.npmjs.org`. |
| `npm outdated` | Exit 0 with no output; no outdated packages reported. No dependency upgrades were attempted. |

## Live-runner status-parser repair

`npm run test:live` now sets `NO_COLOR=1`, and
`scripts/assert-live-suite-output.mts` independently strips ANSI escape
sequences before requiring process exit 0, exactly one passing test file,
exactly five passing tests, and zero skipped tests. Its CLI emits only a fixed
success statement rather than the provider log. Unit coverage proves that an
ANSI-split successful Vitest summary is accepted and that nonzero exits,
skipped tests, failed test files, and a color-enabled package command are
rejected. The repair does not turn the historical wrapper exit into a fresh
wrapper run.

## v3 Docker preflight finding and v4 replacement

The v3 isolated runner failed during its Docker image build, before a provider
request: `npm run build` reported `TS2307` workspace-resolution errors for
`@askrigor/contracts`, `@askrigor/protocol`, and `@askrigor/sources`. No provider request occurred. Root cause was Docker running `npm ci` after only copying the
root package metadata, so npm could not create workspace links. The v4
Dockerfile copies `apps` and `packages` before `npm ci`; a clean tracked v4
archive then completed `npm ci`, `npm run build`, and the non-root final image
locally. Do not reuse the failed v3 archive or remote stage; v4 requires a new
root-owned stage and a fresh remote validation run.

## v4 scanner failure and v5 replacement

The v4 provider container started, but the server-side scanner failed closed
before evidence publication with `Live-suite output contains configured sensitive
value`. No raw log was exposed; the `--rm` container destroyed it, and no evidence was published. Synthetic TDD reproduced the likely false positive without reading runtime values: `NCBI_TOOL=askrigor` matched the normal npm banner `askrigor@0.1.0`. v5 exact-scans only actual configured API keys (`YOUTUBE_API_KEY` and optional `NCBI_API_KEY`), retains generic `AIza[0-9A-Za-z_-]{35}` and API-key-assignment checks, and does not exact-scan the nonsecret tool label, emails, or public video ID. Do not reuse the failed v4 archive or remote stage.
