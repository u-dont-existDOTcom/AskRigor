
# AskRigor v0.1.0 release evidence

Release disposition at 2026-08-12: **PUBLIC SUBMISSION BLOCKED**. Developer
Mode connector retrieval is ready based on the recorded production Inspector and
ChatGPT evidence below, and the public website/support/privacy/terms URL gate is
now resolved. Public publication still cannot proceed until the separate
routine-status presentation finding and portal identity, domain-verification,
Scan Tools, and submission actions are resolved.

## Artifact and endpoint identity

| Item | Evidence |
| --- | --- |
| Local packet base | `cd19514e8701af3a2e6294fa0c2ab74fad5af466` (`docs: add ChatGPT plugin connection workflow`). |
| Production connector revision | `8fface584200f6ab824e91e6e50f975019fbf741` (`fix: accept YouTube reply pages without totals`). |
| Production MCP endpoint | `https://mcp.askrigor.com/mcp` (public streamable HTTP). |
| Protocol evidence | Formal-source Inspector evidence: `/opt/askrigor/validation/https-20260811T045226Z`. |
| YouTube evidence | Keyed YouTube Inspector evidence: `/opt/askrigor/validation/youtube-20260811T152149Z`. |
| Fresh public YouTube Inspector | `/opt/askrigor/validation/youtube-20260811T172256Z`; validator image `askrigor-youtube-validator:2.1.0`. |
| Historical live-provider suite | `/opt/askrigor/validation/live-suite-20260811T172130Z-71611`; source `9d1d751`; retained as the initial provider-green run whose wrapper had an ANSI false negative. |
| Current fresh live-provider suite | Controller remote validation at `/root/askrigor-validation-stage/live-suite-v6-6a9d536b7845`; clean archive/image build, scanner, ANSI-safe parser, and evidence checksum all passed. |
| Public site source | `9becea82eb84` (`fix: remove target Node dependency`); immutable VPS release `/opt/askrigor/site/releases/9becea82eb84`. |
| Public site packet | SHA-256 `71e8e7a97522b6baeec6749292c577c4fa62ef86697eac6fe59aceab756ce670`; bootstrap evidence `/opt/askrigor/site/bootstrap/20260812T043156Z-3nU8HLDE/evidence`. |
| Package version | `0.1.0`; the ingestion-valid manifest includes the verified website, privacy-policy, and terms URLs. The support URL remains release/submission documentation because the schema exposes no support-URL field. |

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
| Historical live providers | The provider test process at `/opt/askrigor/validation/live-suite-20260811T172130Z-71611` exited 0 and 5/5 passed, including PubMed, Crossref, and YouTube; the fail-closed server-side secret scan found no match. Its original wrapper exit 1 was an ANSI status-parser false negative only. |
| Current fresh live providers | Controller-run v6 validation at `/root/askrigor-validation-stage/live-suite-v6-6a9d536b7845` passed the clean image build, server-side scanner, ANSI-safe parser (exit 0, exactly one passing file and five passing tests, zero skips), and evidence-side relative checksum. `status.txt` reported `Live suite v6 accepted`. |
| ChatGPT Developer Mode | End-to-end smoke passed protocol integrity, PubMed, and complete YouTube 2+1 replies through the deployed connector. No AskRigor write tools were exposed or called. |
| ChatGPT release finding | A separate **routine-status presentation regression** occurred: ChatGPT narrated a stale update-check date/status despite Universal v20.5.11 and HRP v20.5.15 prohibiting routine update diagnostics. This is not a connector retrieval failure; it must be fixed or explicitly accepted before release-quality presentation is claimed. |

## Public URL gate — direct HTTPS evidence

Fresh direct checks were run 2026-08-12 after activating immutable release
`9becea82eb84`. Apex DNS returned only A `191.215.38.123` and no AAAA. The leaf
certificate contains `DNS:askrigor.com`, is valid from 2026-08-12 through
2026-11-10, and has SHA-256 fingerprint
`70:68:BF:28:C8:6A:CC:6A:5B:2C:2E:86:9D:9D:6B:9C:E6:02:1E:73:64:CB:A9:43:24:01:23:77:F0:67:AF:92`.

| Required listing URL | Fresh direct result | Gate |
| --- | --- | --- |
| `https://askrigor.com/` | HTTPS `200`; title `AskRigor \| Evidence-first research retrieval`; exact apex canonical. | Resolved. |
| `https://askrigor.com/privacy` | HTTPS `200`; title/canonical exact; discloses public YouTube author/channel IDs, display names, and comment/reply text. | Resolved. |
| `https://askrigor.com/terms` | HTTPS `200`; title/canonical exact. | Resolved. |
| `https://askrigor.com/support` | HTTPS `200`; title/canonical exact; live `joel@askrigor.com` support contact. | Resolved. |

Each HTTP counterpart returned `308` to the same HTTPS route. The same-origin
stylesheet returned `200`; every HTTPS page included the reviewed CSP and HSTS
headers and omitted `Server`; no mixed-HTTP reference or unrelated redirect
remained. Public TCP listeners were only 22, 80, and 443, while MCP port 3000
remained loopback-only. `https://mcp.askrigor.com/healthz` returned `200` and a
plain GET to `/mcp` returned the expected transport response `406`. The MCP
container ID remained `5e57f8481aac` before bootstrap, after bootstrap, and
after site activation.

## Required submission work remaining

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

## Local release verification record

These commands were run from the Task 16 worktree on 2026-08-11. Live provider
checks run only with safely available credentials; credentials are never printed.

| Command | Task 16 result |
| --- | --- |
| `npm ci` | Passed outside the restricted sandbox: 156 packages installed and 161 audited; npm reported 0 vulnerabilities. The sandboxed attempt was blocked by an `esbuild` postinstall `EPERM`. |
| `npm run verify` | Passed outside the restricted sandbox after the runner repair: typecheck and build passed; Vitest reported 17 passed files, 1 skipped file, 337 passed tests, and 5 guarded live tests skipped. The sandboxed attempt failed only where loopback-server tests hit `listen EPERM` on `127.0.0.1`. |
| Historical credential-bound live suite | Recorded production evidence at `/opt/askrigor/validation/live-suite-20260811T172130Z-71611`: provider process exit 0 and 5/5 passed, including PubMed, Crossref, and YouTube. The old wrapper exit 1 was solely an ANSI-grep false negative. This run is historical, superseded by v6 below. |
| Current credential-bound live suite | Controller-run v6 evidence at `/root/askrigor-validation-stage/live-suite-v6-6a9d536b7845`: clean archive/image build, server-side scan, ANSI-safe parser exit 0 with exactly `Test Files 1 passed (1)` and `Tests 5 passed (5)` and zero skips, relative evidence checksum, and `Live suite v6 accepted` status all passed. The controller's runner accessed server-side runtime environment without exposing, reading back, or logging provider keys; evidence was read only after the fail-closed scan. This worktree contains no secret and did not independently rerun the remote suite. |
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

## v5 startup failure and v6 replacement

The v5 scanner accepted and published a sanitized log, but Vitest exited before providers with `ENOENT` while creating `/app/node_modules/.vite-temp` under the read-only root filesystem. No provider request occurred. V6 adds a writable noexec/nosuid tmpfs at that exact Vite path. The v5 evidence checksum also used absolute `/evidence/provider-test.log`; v6 writes the checksum relative to its evidence directory so the host-side `sha256sum -c` command succeeds. Do not reuse the failed v5 archive or remote stage.

## v6 remote integration evidence

Controller-run remote validation at `/root/askrigor-validation-stage/live-suite-v6-6a9d536b7845` is green. The archive checksum and clean image build passed; the server-side scanner accepted the log; and the ANSI-safe parser accepted process exit 0, exactly `Test Files 1 passed (1)`, exactly `Tests 5 passed (5)`, and zero skipped tests. The evidence-side relative checksum verified with `(cd evidence && sha256sum -c provider-test.log.sha256)`, and `status.txt` reported `Live suite v6 accepted`. This is recorded remote evidence; this worktree did not rerun providers or access runtime secrets.
