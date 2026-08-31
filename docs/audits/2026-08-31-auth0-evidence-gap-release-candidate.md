# Auth0 evidence-gap release candidate — local receipt

Implementation commit `acaab5e0f137bf22519a7569ed62899fb701e523`
prepares the public evidence-gap stack for production without changing its
authorization boundary. Twenty-two research tools and the contribution form
remain anonymous, a participant recovery key reaches only that case, and only
cross-user review requires OAuth `cases:review`. Participants do not need an
Auth0 account, raw cases have no public page, and incomplete cases remain
included and labeled partial.

The production overlay now mounts a third independent database secret and a
role provisioner for `askrigor_evidence_gap_intake`. A disposable PostgreSQL
17.6 execution applied migration `0008`, created that role, performed a real
insert/update transaction against only the intake table, and proved denial of
delete, truncate, another-table read, persistent-object creation, and temporary
object creation. The new public notice names OpenAI ChatGPT and Auth0, explains
the recovery key, distinguishes application-encrypted narrative from private
structured fields, states the basic-redaction limit, and accurately declares
no automatic case expiry or off-host database backup in this release.

Focused implementation/privacy/OAuth checks passed 5 files and 52 tests. The
static-site validator passed four pages; the site-deployment suite passed 28
tests. The complete deterministic gate passed typecheck, 121 test files plus
one declared skip, 1,580 tests plus six declared skips, and build. Production
dependency audit reports zero vulnerabilities. Fresh headless Brave acceptance
completed a partial pregnancy non-remission comparison case, showed its
participant-reported/unverified and noncausal private-review projection,
exposed no raw narrative publicly, and removed it from the review queue after
withdrawal.

This is a local release candidate, not a public-release claim. Operational
alignment passes locally. Scientific adequacy passes only for provenance,
missingness, comparison recruitment, participant-reported/unverified status,
and the explicit noncausal boundary. Release adequacy remains pending Auth0
tenant configuration, stacked-PR reconciliation and merge, immutable image
deployment with rollback, and fresh primary-account ChatGPT/plugin acceptance.
