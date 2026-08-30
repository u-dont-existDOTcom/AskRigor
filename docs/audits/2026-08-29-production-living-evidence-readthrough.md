# Production living-evidence read-through audit

Date: 2026-08-29

Task: askrigor-living-evidence-readthrough-v1

Status: PR #130 merged as
`d63ee0bfd2c179b1133721d67b0d8081cd0234de`; bootstrap hotfix PR #131 merged
as `30d079931ccd4b58f32a9600aae8f660283b9f03`; exact production deployment,
curated LEAP import, direct acceptance, installed-package receipt, and fresh
primary-account ChatGPT reuse acceptance complete; evidence closeout PR #132

## Outcome under review

The existing full-text study path can advertise one exact current repository
audit and accept its analysis-version ID through the existing
validate_study_method_audit operation. The current document still has to be
read to exhaustion. Validation reloads the exact advertised version, repeats
source/identifier/lineage/access/freshness/impact/protocol/rubric/receipt checks,
and reruns the unchanged deterministic 13-domain validator. Any miss,
ambiguity, drift, timeout, or malformed record returns a named
fresh_study_audit_required boundary; the same exhausted handle remains valid
for a newly performed audit.

The catalog remains exactly 21 read-only MCP tools. The generated compact
inventory SHA-256 is
e2ab407b92824d4094986aaf0e108917500546d892c85231772ff0b3c5c60f5e.
No canonical HRP or Universal XML byte changed.

## Persistence and deployment boundary

The public service receives only a SELECT-only PostgreSQL credential. It
performs one 1.5-second-bounded lookup at acquisition, no repository work on
continuation pages, and one bounded lookup when the advertised version is
requested. Misconfiguration disables reuse rather than preventing startup.

The proposed production service is a distinct digest-pinned PostgreSQL 17.6
container on the existing AskRigor VPS. It has no published port, joins an
internal Docker network, runs as UID/GID 70, uses a read-only root filesystem,
drops all capabilities, and has bounded CPU/memory. It does not reuse the
unrelated annas-postgres-1 service.

A separate one-shot administrator process can migrate or import an already
validated study audit from bounded stdin. It loads the canonical manifests and
reruns the validator itself, rejects prohibited keys, and persists no source
blocks. Automatic public-run write-through, private/user-derived storage,
review/external-audit reuse, and all durable YouTube/community data remain out
of scope.

## Verification receipts

- Focused implementation, MCP, registry, release-packet, persistence-config,
  and deployment tests passed.
- The real PostgreSQL acceptance passed 22/22 adversarial checks, including
  exact current lookup/revalidation, complete-analysis reconstruction,
  append-only behavior, impact blocking, lineage/cycle rejection, prohibited
  data rejection, dump, exact wipe, restore, and hash comparison.
- The current fixture set reproduced canonical repository SHA-256
  5cb8e53daf012dd8ac430fc3a3401578d8e326e9342bda83be318c1487edf2c0
  across repeated unchanged runs and after restore.
- The earlier pilot closeout recorded
  8b796f9b16540fcf5408165049f46953ed64cfb26bce6f98b00e615ca069909c.
  That historical value is not reproducible on the current baseline. No cause
  is inferred; the discrepancy is retained as historical receipt drift rather
  than silently rewriting either value.
- Complete npm run verify passed 109 test files with one declared skip, 1,455
  tests with six declared skips, typecheck, and production build.
- The public site validator passed all four pages and the deployment-policy
  suite passed 28/28.
- Release lesson status was available: 0 open, 0 needs review, 0 accepted but
  not incorporated, 4 incorporated/closed, and 0 deletion eligible.
- The closeout lesson checkpoint at `2026-08-30T00:32:53.087Z` reproduced those
  exact counts. The closeout disposable PostgreSQL wrapper then passed the
  task's 22/22 acceptance checks, recreated canonical repository SHA-256
  `5cb8e53daf012dd8ac430fc3a3401578d8e326e9342bda83be318c1487edf2c0`,
  dumped, wiped, and restored only its temporary schema, and verified restore
  receipt SHA-256
  `b8efdeee8495ffefa46225ce492e96368b6019f438f553b4511ae93944baa44c`.
  The disposable Compose container and network were removed automatically.
- A secret-pattern scan found only the intentional local-pilot credential and
  one explicit dummy-key privacy fixture; neither is a production secret.
- The first production activation stopped before migration and before the
  public research service was recreated. PostgreSQL local peer authentication
  compared operating-system user `postgres` with bootstrap role
  `askrigor_migrator`, rejected the official entrypoint, and left no imported
  repository data. The original unauthenticated readiness probe also accepted
  the server socket before the database existed; the hotfix replaces it with
  an authenticated `SELECT 1` against the exact database and uses SCRAM for
  both local and host bootstrap connections. An isolated disposable container
  with the exact PostgreSQL
  digest, UID/GID 70, read-only root, current init script, and dummy credentials
  then created the database and reader role and returned reader
  `transaction_read_only=on`.

## Owner clarification: frontier, not cache

The study-audit hit is a first safe read-through slice, not the final
cumulative-intelligence model. The required next repository layer preserves
the research frontier: discovery passes, requested and observed coverage/date
windows, candidates found and their decisions, unresolved questions,
unattempted/blocked/exhausted trails, and delta searches for new evidence.
Future YouTube frontier fields include found/selected/deferred videos,
comment-window and count/completeness receipts, interesting leads, and
unsearched directions, but durable activation remains blocked on the separate
Google and owner field gate.

## Protected merges and reversible production activation

PR #130 passed deterministic verification, workflow policy, and all CodeQL
analyses before merge. The first activation exposed the local-peer bootstrap
defect described above without replacing the old healthy public service or
running the migration. Its empty failed state and diagnostics are preserved at
`/opt/askrigor/rollbacks/pre-30d079931ccd4b58f32a9600aae8f660283b9f03/failed-bootstrap-state`.
Hotfix PR #131 passed the same protected checks and merged as
`30d079931ccd4b58f32a9600aae8f660283b9f03`. Local rollback refs are
`rollback/main-pre-living-evidence-readthrough-20260829` and
`rollback/living-evidence-hotfix-pre-main-sync-20260829`; the prior public image
also remains tagged `askrigor-research:rollback-db21d994-pre-d63ee0b`.

Production now runs exact research image
`askrigor-research:30d079931ccd4b58f32a9600aae8f660283b9f03`, image ID
`sha256:7aa19ebbbddedaaad326e9de9be0a446a31bdffdb171fd3e8e941afab7692e6b`,
in healthy container `e1b912b7c37c`. It remains user `node`, read-only-root,
all-capabilities-dropped, and no-new-privileges, with only the pre-existing
actions and research-session state mounts writable.

The new private database is exact image
`postgres:17.6-alpine@sha256:747d5ed1fdeeb124b880fbe3d7c6557d2c4064ae41d6b6297d417882effce4be`,
healthy container `393070e563f1`, user
`70:70`, read-only-root, all-capabilities-dropped, no-new-privileges, no
published port, and reachable only through the internal
`askrigor_living_evidence_private` network. The research service additionally
retains its existing `askrigor_default` network for Caddy; unrelated Caddy and
`annas-postgres-1` services were not modified. Deployment artifacts include
overlay SHA-256
`af8c891561537897ae8894a43a6fe3faf7f8b711beec367f4a6a304e9a5ae45e`
and init SHA-256
`1fa052bf4baa868c74bb42818044f1316af60eac3ed4dad8a909c8e35aa3be7a`.
Runtime and writer environment files are root-owned mode `0600`; database
secret files are root:GID-70 mode `0440`; database state is mode `0700` owned
by UID/GID 70.

The migration receipt is complete for schema `living_evidence`. Reader
readback proves database connect and schema usage, `SELECT` on all 30
relations, no relation mutation privilege, and
`transaction_read_only=on`. Before import, the repository contained zero
source families. The public research container emitted no matching living-
evidence, database, PostgreSQL, or error log after activation.

## Curated source-linked LEAP seed

The initial production record is the LEAP randomized trial, DOI
`10.1136/bmj.k1662`, PMID `29720374`, PMCID `PMC5930290`. Its current Europe PMC
JATS source contained 58 blocks and exact source SHA-256
`395c3c3fe33ad3c2913be783301947ca5a92c2a0349ff141d168ff4024634f8c`.
A new structured audit covers all 13 required method domains with 32 unique
cited source blocks, retains 18 future-analysis items, and ends
`complete_with_unresolved_fields`. Audit SHA-256 is
`678a0720b775f9518c753cf6d785b8e9fe6580e537d3ea7a25a13b4d578b4ff6`.

A fresh Crossref integrity receipt dated `2026-08-29T23:37:24.688Z` reported
no retraction record and is next due at `2026-09-01T23:37:24.688Z`. The
bounded stdin-only administrative import reran the canonical validator and
created analysis ID
`a6102d08-1f01-4820-aefd-d3d8732b9b40` and version ID
`fa1f2594-c385-46d5-a7ce-bd471c3b1fe0`. Import payload SHA-256 is
`602ebf317e914ab7cb518d83cb0ae3f2662c629897fcd3306db2d7195817439b`;
the 15,777-byte audit envelope has SHA-256
`0b2af02ee4ee75c62a3086fa7cc87614f0eff5f3efdd754d0d5de838939e8f38`.
It contains one complete analysis section and explicitly records
`source_content_persisted: false`.

SELECT-only readback after import found exactly one source family, one source
version, one analysis version, 13 domain findings, 18 future-analysis items,
and one receipt. No raw source content is persisted. All temporary local source,
index, import, and acceptance artifacts were deleted after the summarized
receipts were captured; no raw source body was copied to the VPS.

An earlier candidate, PMID `40223676` / PMCID `PMC11995426`, remained described
by metadata as open full text while the live Europe PMC full-text route returned
404 from both local and VPS probes. It was not imported. This is preserved as
source-access drift and a successful fail-closed case, not as negative study
evidence. The LEAP route itself was briefly intermittent immediately after
import: two application calls withheld the stored audit as a possibly useful
lead, direct access recovered, and the next application call reused it. No
stale or inaccessible audit was advertised during the interruption.

## Direct production miss, drift, and reuse acceptance

Before import, the live catalog contained exactly 21 tools; Universal was
`20.5.15` with SHA-256
`69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`,
HRP was `20.5.23` with SHA-256
`bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299`,
and the PubMed read-only probe returned `api_visible_complete`. Acquisition
returned `fresh_audit_required / candidate_missing`, exact LEAP source hash,
and a two-page chain read to exhaustion. A newly constructed audit validated
with the exact audit hash above. Total direct wall time was 12,365 ms, including
9,410 ms acquisition, 269 ms continuation, and 192 ms validation.

After import, the same live checks passed. Acquisition advertised repository
version `fa1f2594-c385-46d5-a7ce-bd471c3b1fe0` and again required two pages to
exhaust the current source. A deliberately wrong version ID returned
`fresh_study_audit_required / candidate_missing`. The exact advertised version
returned `source_linked_study_audit_validated`, the exact audit SHA-256 above,
and `compatibility_revalidated: true` with complete impact and current
freshness. Total direct wall time was 5,154 ms, including 564 ms acquisition,
141 ms continuation, and two validator calls of 178 ms and 348 ms. This proves
that the current-source read and same-validator checks remain mandatory while
the expensive model-authored audit can be reused.

## Installed AskRigor package receipt

The source and installed plugin receipts each cover the exact same eight-member
inventory: `.codex-plugin/plugin.json`, both packaged SVG assets,
`skills/askrigor/SKILL.md`, and all four files under
`skills/browser-archive-downloading/`. Source version `0.1.0` has package
SHA-256
`afe2c48b8fbab020e82f2cd884de7bbcb5abaa66d0ec1cfaaa88dcdd15ddeb6c`;
installed version `0.1.0+codex.20260825134144` has package SHA-256
`d383648b27a7cf4e50ce0858f2443c3d8e73f536a471befa321595593e39ed24`.
All seven non-manifest members are byte-identical, including AskRigor skill
SHA-256
`5fb0f9c62de8163c93939de0e5bf382fe9da0dc60b6db481f252afad1546fed5`.
The manifest differs only in cache-buster version formatting; its semantic
content is identical. Because installed bytes were readable and no packaged
skill or asset changed, no reinstall was needed. The unchanged installed app
became current through the exact backend deployment, and the direct read-only
probe above returned the live manifests.

## Fresh primary-account ChatGPT acceptance

Brave's explicit headless mode stopped at ChatGPT's Cloudflare challenge. The
test therefore used the normal `Default` (`Personnel`) Brave profile minimized
and positioned off-screen, with no second-account profile and no Custom GPT.
The primary account exposed personal **AskRigor** app
`plugin_asdk_app_6a7cd2a0156881918ce7dedecb715250`. Before submission the
new-chat controls showed Chat checked, Work unchecked, and Extra High selected.
The resulting turn exposes model slug `gpt-5-6-thinking` and is preserved at
`https://chatgpt.com/c/6a937742-be10-83ea-ae26-977af1e8c15c`.

The prompt requested a concise LEAP methods audit, current full-text exhaustion,
reuse of a compatible advertised repository audit, exact protocol/source/
analysis/audit identities, and no fresh audit when reuse revalidated. The run
terminated after `Worked for 1m 44s`. Its final answer is 7,042 characters with
three sections and one three-column audit table covering eight grouped methods
domains. It reports:

- Universal `20.5.15` and HRP `20.5.23` with both exact live SHA-256 values;
- all 58/58 current full-text blocks read to exhaustion;
- exact source SHA-256
  `395c3c3fe33ad3c2913be783301947ca5a92c2a0349ff141d168ff4024634f8c`;
- repository analysis version
  `fa1f2594-c385-46d5-a7ce-bd471c3b1fe0` and exact audit SHA-256
  `678a0720b775f9518c753cf6d785b8e9fe6580e537d3ea7a25a13b4d578b4ff6`;
- compatibility, freshness, and impact revalidation; and
- the terminal conclusion that repository reuse remained compatible, current,
  and non-impacting after current-body revalidation and no fresh audit was
  rerun.

The final section retains unresolved limitations and a Crossref fail-closed
boundary rather than claiming that absence from one integrity source proves no
correction or retraction. This is the first product-interface evidence that the
new repository read-through avoids the long model-authored-audit reconstruction:
1m44s here versus the earlier 8-minute no-validator boundary and 37m24s
completed primary-account review audit. Direct MCP timings remain the proper
backend comparison; the product runtimes include model composition.

The minimized off-screen renderer initially exposed only the terminal activity
summary and four collapsed tool-call controls. Opening the relevant call-list
control materialized the already terminal answer in the exact same saved turn;
there was no retry, reload, duplicate prompt, or second conversation. This is
recorded as a renderer/virtualization observation, not a backend or reuse
failure. The final audit has current-source block locators but zero HTML anchor
links. Repository reuse acceptance therefore passes, while clickable
source-citation rendering remains a declared presentation defect for later
correction.

## Closeout disposition

No production, import, direct-acceptance, installed-package, or fresh product
gate remains. PR #132 carries this evidence and passed deterministic
verification, workflow policy, the CodeQL aggregate, and the Actions,
JavaScript/TypeScript, and Python analyses before protected merge. The exclusive
task is complete when this record is on `main`. OpenAI organization approval
remains an independent public-submission scope/receipt check and does not block
this release closeout.
