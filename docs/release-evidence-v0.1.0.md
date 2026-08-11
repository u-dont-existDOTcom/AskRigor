
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
| Package version | `0.1.0`; manifest retains no unverified privacy/terms/support URL. |

The two Inspector locations are recorded production evidence supplied by the
successful deployment/validation work. This task did not access the VPS,
providers, or credentials and does not represent them as a new local run.

## Recorded production validation

| Check | Recorded outcome |
| --- | --- |
| MCP metadata | Inspector discovered all 14 advertised tools and confirmed `readOnlyHint:true`, `destructiveHint:false`, and `openWorldHint:false`. |
| Formal sources | Production Inspector passed protocol integrity, PubMed, Europe PMC, ClinicalTrials.gov, and Crossref/retraction cases with their expected access/failure semantics. |
| YouTube | Production Inspector passed YouTube discovery and complete comment-plus-reply retrieval for the bounded public target, including reply-page reconciliation. |
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

## Local release verification record

These commands were run from the Task 16 worktree on 2026-08-11. Live provider
checks run only with safely available credentials; credentials are never printed.

| Command | Task 16 result |
| --- | --- |
| `npm ci` | Passed outside the restricted sandbox: 156 packages installed and 161 audited; npm reported 0 vulnerabilities. The sandboxed attempt was blocked by an `esbuild` postinstall `EPERM`. |
| `npm run verify` | Passed outside the restricted sandbox: typecheck and build passed; Vitest reported 15 passed files, 1 skipped file, 319 passed tests, and 5 guarded live tests skipped. The sandboxed attempt failed only where loopback-server tests hit `listen EPERM` on `127.0.0.1`. |
| `ASKRIGOR_LIVE_TESTS=1 npm run test:live` | Not run as a complete live matrix: `NCBI_EMAIL`, `CROSSREF_MAILTO`, `YOUTUBE_API_KEY`, and `ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID` were all absent (presence only was checked; no values were read or printed). This leaves PubMed, Crossref, and YouTube live coverage unrun; no provider credentials were accessed. |
| `npm audit --omit=dev` | Passed outside the restricted sandbox: 0 production-dependency vulnerabilities. The sandbox could not resolve `registry.npmjs.org`. |
| `npm outdated` | Exit 0 with no output; no outdated packages reported. No dependency upgrades were attempted. |
