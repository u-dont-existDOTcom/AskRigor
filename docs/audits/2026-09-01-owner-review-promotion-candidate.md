# Owner review and promotion candidate receipt

- Date: 2026-09-01
- Task: `askrigor-owner-review-promotion-v1`
- Branch: `task/owner-review-promotion-20260901`
- Baseline: `ef8b713e9b5320d3ebe8e47ec2cea98095431e90`
- Implementation commit: `7697bcf6d6689533314b5e2a218bd6e602016d50`
- Implementation tree: `fef404b7fef560fe7c979e7d2a5e3d36ce01e6c1`
- CI acceptance-harness repair: `b0279aca55907751c979491899bf9a74fc17af04`
- Code-candidate tree after repair: `658a856c0509febe2a869484f250ea268b8f344a`

## Outcome

The bounded local slice is complete. An Auth0-authenticated, allowlisted owner
can inspect one deidentified research proposal, bind an explicit accept/reject
decision to its exact SHA-256 and a reason, and inspect its later promotion
state. Acceptance atomically creates a pending outbox intent; it does not write
canonical evidence. A separate one-shot administrator revalidates the stored
payload, routes it through the existing idempotent canonical writer, and stores
an exact receipt. The public runtime receives no writer credential.

This remains an ordinary reciprocal product workflow. It adds no institutional
study, pilot, IRB, recruitment, automatic scientific decision, causal claim,
payment system, public forum, real participant collection, or scheduler.

## Exact implementation identity

- Migration 0010 SHA-256:
  `7729583c6c33479ecec4dfb6e64ee9f94899d109a0df39e10616fa8b16b4ef9a`
- Review/promotion repository service SHA-256:
  `05e8786b1425df3047d477ddc04b32bdc8b2b660f75a46d27ea436a23e1c264f`
- Owner MCP tool SHA-256:
  `9a1e5377302d859bb3563d3da11d05a0f9813904725abad842c58cf7be9c2535`
- Function-only role provisioner SHA-256:
  `064d916d8e7ed6d75b9cb64bdf3b454b1216d29ca85b45ec2cb196717e1f2a91`
- AskRigor skill SHA-256:
  `c8e970bc8378791cc93b518cc63c673ffda8bec8ffe6c5b8e7d77c167ac80a72`
- Standard 27-tool inventory SHA-256:
  `5dd514a9e865da0b312a3f9f6a106a4a3d0bd9872e7bfec0e95db6bbe9c7dab0`
- Synchronization ledger SHA-256:
  `6d6e86e1b999cc13f5d431281858caf3a489769861351dbb65d0eb0538f17df3`
- HRP SHA-256:
  `dd494d5665331e42b91232245dbba0392ecc9918d63b2638ef35c6e7528604d1`
- Universal SHA-256:
  `69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`

The commit changes 50 files: 2,693 insertions and 118 deletions. The compact
Gemini catalog remains exactly 22 tools.

## Verification

| Gate | Result |
| --- | --- |
| `npm ci` on Node 24.18.0 | PASS; 0 reported vulnerabilities |
| `npm run owner-review:preflight` | PASS; independently verified 385-byte source-file and 384-byte canonical owner-outcome identities, catalog 27, merge/deploy false |
| `npm run owner-review:acceptance` | PASS; 7 focused files / 63 tests and real PostgreSQL acceptance |
| Real PostgreSQL acceptance | PASS; 12 checks including function-only review role, accept+intent atomicity, reject/no intent, concurrent single claim, withdrawal race, both writer routes, and crash recovery by idempotent replay |
| `npm run living-evidence:local` | PASS after the CI harness repair; 42 migration/database assertions, fixture pilot, canonical dump, destructive disposable-schema wipe, restore verification, and cleanup |
| `npm run verify` | PASS; typecheck, 125 test files passed / 1 declared skip, 1,610 tests passed / 6 declared skips, build |
| `npm run test:site` | PASS; 4 pages |
| `npm run test:site-deploy` | PASS; 28/28 tests |
| `git diff --check` | PASS |

No credential-bound provider test was required: this slice changes local
review/persistence topology and no provider adapter behavior.

## Protected-check recovery

PR #161's first deterministic run (`33467704229`, job `99730893389`) failed
because the legacy living-evidence acceptance harness still asserted an exact
nine-migration chain after migration 0010 was added. The product migration and
the owner-review PostgreSQL acceptance were already passing. Repair commit
`b0279aca55907751c979491899bf9a74fc17af04` adds migration 0010 to that exact
chain expectation and renames the emitted check accordingly. The repaired
acceptance script SHA-256 is
`07de1e246c31ea899f370cc6c78eff4feffdf1b40c263fefc7d6ee6761b8258f`.
The exact local command used by the failed CI path now passes end to end.

## Supervision closeout

The final Extra High review is retained in
`2026-09-01-owner-review-promotion-final-review.txt`. Its exact response before
the receipt file's final LF is 1,913 bytes with SHA-256
`091cc5545ba213024bd7623704843d90a97aa5246e17b18f26fa498951e560bc`;
the normal LF-terminated file is 1,914 bytes with SHA-256
`480b1ea74a19aef1860255f64337cfd47941e1ad266f408cf7c98880a8441642`.
Verdict: `PASS`; Critical 0, Important 0, Minor 0.

- Operational alignment: `GREEN`
- Scientific adequacy: `PRESERVED_NOT_EXPANDED`
- Release adequacy: `NOT_AUTHORIZED`
- `SUPERVISION_DESIGN_FEEDBACK`: none warranted
- Typed completion claim: `SUBTASK_COMPLETE_PARENT_OPEN`

## Lesson closeout and remaining boundary

The final lesson checkpoint at `2026-09-01T03:47:00.479Z` reported 0 open,
0 needing review, 0 accepted but not incorporated, 4 incorporated or closed,
and 0 deletion eligible. The provenance double-identity gap was corrected in
this task preflight and does not establish a new recurring universal lesson.

No production migration, production role, scheduler, deployment, connector
refresh, plugin reinstall, or live product acceptance is claimed. PR #161 is
the protected release-readiness surface. Merge, deployment, production
provisioning, and scheduler activation remain outside this candidate's
authority.
