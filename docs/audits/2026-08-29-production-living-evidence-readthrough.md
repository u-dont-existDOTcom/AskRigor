# Production living-evidence read-through audit

Date: 2026-08-29

Task: askrigor-living-evidence-readthrough-v1

Status: PR #130 merged as
`d63ee0bfd2c179b1133721d67b0d8081cd0234de`; production bootstrap hotfix,
deployment, seed import, and product acceptance pending

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

## Remaining release gates

1. Protect and merge the SCRAM bootstrap hotfix.
2. Resume the reversible exact-merge VPS deployment after removing only the
   failed empty bootstrap state, with privilege and network readback.
3. Import the reviewed LEAP source-linked study audit without source
   persistence.
4. Direct production repository miss, hit, forced-fresh drift, 21-tool,
   protocol-manifest, health, and read-only connector checks.
5. Exact installed AskRigor plugin-package receipt and a fresh ordinary
   ChatGPT product case on the owner's primary plugin-enabled account.
