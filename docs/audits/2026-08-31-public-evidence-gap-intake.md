# Public evidence-gap intake receipt

The first real evidence-gap form is implemented locally on branch
`task/public-evidence-gap-intake-20260831`, implementation commit
`ed71b5e64d8a99ed83cc05bd300cf5d415a70e68`.

The product is intentionally simple. A visitor states provenance, gives an
unprompted account before seeing candidate transitions, adds whatever optional
details they know, consents to private AskRigor/GPT analysis, and receives a
pseudonymous case ID and recovery key. Incomplete cases are accepted and
labeled `PARTIAL`. Non-remission comparison cases are recruited and counted as
valuable cases rather than discarded.

Raw case content has no public projection. Narratives are AES-256-GCM
application-encrypted, recovery keys are stored only as SHA-256, participant
inspect/withdrawal requires the recovery key, and the private review feed has a
separate bearer secret. Review items remain
`PARTICIPANT_REPORTED_UNVERIFIED`; basic contact-pattern removal is explicitly
not claimed as full de-identification. The active content is erased on
withdrawal and the machine response prohibits causal analysis.

This is not an invite-only pilot, institutional research program, staffing or
jurisdiction plan, or generic forum. The prior veer was an authority-tracing
failure: an assistant-authored directive invented those constraints and the
worker treated the derived contract as owner policy. Mission Control PR #46,
commit `21369668f5eeb8c30b471f07ef3a0a97ff01b9d8`, now classifies this as
`UNSUPPORTED_CONSTRAINT_ADDITION`; feedback packet
`SDF-20260831-UNSOURCED-GOVERNANCE-001` preserves the evidence.

Verification passed:

- 8/8 focused tests;
- 39/39 real PostgreSQL checks against a disposable PostgreSQL 16 instance;
- exact headless Brave flow from partial non-remission contribution through
  authenticated private review and withdrawal;
- complete gate: 120 passing files plus one declared skip, 1,574 passing tests
  plus six declared skips, typecheck, and build;
- whitespace/final-diff and high-confidence secret checks;
- lesson queue: 0 open, 0 needing review, 0 accepted-but-unincorporated, 4
  incorporated/closed, 0 deletion-eligible.

Operational alignment passes. Scientific adequacy passes only for the bounded
intake semantics: provenance-first ordering, missingness, comparison retention,
unverified status, and noncausal review. Release adequacy is not applicable
because this slice was not externally deployed.

The remaining product work is concrete: wire the existing authenticated review
projection to the smallest private GPT tool, then separately prepare accurate
privacy/provider/retention/key/routing/rollback evidence before any external
deployment. No institutional workflow is needed.
