# Universal 20.5.14 research-before-reinvention plan

**Goal:** Apply the owner-supplied fail-closed Universal v20.5.13 → v20.5.14 Research-Before-Reinvention patch to the exact current canonical XML, preserving every unrelated byte and validating the resulting repository through the existing AskRigor gates.

**Baseline:** task branch was created from `main` `cfce806345fe65a13fd0330aa7e8f000c1587d01`; canonical `protocols/Universal_Instructions.xml` v20.5.13, revision 2026-08-17, SHA-256 `3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4`; owner-supplied `research-before-reinvention-patch-2026-08-18.zip`. During implementation `main` advanced to `d49cad9a5d3d9da2b2349b23945acb2d34b5dcf5`; the live Universal manifest was rechecked after that advance and remained the exact v20.5.13 source hash, while the concurrent main changes did not touch the files changed by this task.

## Research-before-reinvention gate

- **Applicability:** `required`
- **Independent conception snapshot:** the supplied patch specifies a domain-general gate that preserves independent conception when fixation risk matters; scans academic work, standards/specifications, mature implementations/tools, and adjacent disciplines; classifies solved/partial/incompatible/unresolved; requires explicit reuse/adapt/compose/invent/experiment; identifies a novel remainder and strong external baseline; and permits only bounded research debt.
- **Existing-work scan:** `u-dont-existDOTcom/universal-dev-architecture` already contains a complementary scholarly semantic-discovery specialization as of 2026-08-18. That live work is reused rather than independently reinvented; this AskRigor change implements the protocol-level orchestration supplied by the owner.
- **Existing-work map:** scholarly discovery is already solved/reusable at the architecture layer; protocol-level activation, output/specification requirements, research debt, and point-of-generation enforcement are the remaining implementation surface.
- **Disposition:** `adapt`
- **Novel remainder:** protocol-specific gate placement, revision record, task-specification bullet, and point-of-generation check.
- **External baseline:** current Universal v20.5.13 exact bytes plus the composed universal-development architecture; all non-target bytes and semantics must remain unchanged.
- **Research debt:** none.

**Acceptance criteria:**

- [x] Patch refuses any source whose SHA-256 is not the exact canonical v20.5.13 hash.
- [x] Result parses as XML and reports v20.5.14 / 2026-08-18.
- [x] Revision 20.5.14, the complete `research_before_reinvention_gate`, task-specification prior-work bullet, and reinvention point-of-generation check are present exactly once in the focused structural regression.
- [x] Existing protocol/package tests derive the manifest from the new exact bytes without hard-coded drift; the published digest contract is advanced to the generated v20.5.14 SHA-256.
- [ ] `npm run test:run` passes.
- [ ] `npm run verify` passes.
- [x] Final PR diff contains no temporary privileged automation used only to overcome the connector's lack of patch-in-place semantics.

**Generated Universal v20.5.14 SHA-256:** `8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221`.

**Non-goals:** No HRP changes; no research-route changes; no weakening or paraphrasing of the owner-supplied Universal gate text; no live-provider smoke test unless separately required.

## Implementation note

The GitHub connector can replace a complete file but cannot apply a small textual patch to a 98 KB file in place. To avoid manually reconstructing canonical protocol bytes, a branch-only temporary workflow ran the supplied fail-closed patcher against the repository checkout and committed the generated canonical XML to the task branch. A second branch-only temporary workflow recorded the resulting SHA-256. Both temporary write-capable workflows were deleted before pull-request creation; the durable SHA receipt remains at `docs/superpowers/plans/2026-08-18-universal-20-5-14-sha256.txt`.

## Tasks

1. Commit the exact fail-closed patcher for durable provenance. — complete
2. Apply it against the exact canonical v20.5.13 bytes on the task branch and capture the resulting SHA-256. — complete
3. Remove temporary branch-only bootstrap automation before opening the PR. — complete
4. Add focused protocol-contract regression and advance existing version/digest contracts. — complete
5. Run `npm run test:run` and `npm run verify` through normal PR CI. — pending
6. Review exact diff and merge only after required checks pass. — pending

## Completion

Final protocol SHA-256 is established above. Record PR, checks, merge commit, and residual limitations after protected-branch completion.
