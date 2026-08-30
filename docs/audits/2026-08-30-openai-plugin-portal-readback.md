# OpenAI plugin portal readback

Date: 2026-08-30

Status: non-secret signed-in portal receipt; no draft or submission action

Subsequent owner decision: later on 2026-08-30, the owner selected **Mayan
Roots LLC** as the business developer identity while keeping **AskRigor** as the
product name. That later decision and the still-incomplete business-
verification gate are recorded in
`docs/audits/2026-08-30-mayan-roots-publisher-alignment.md`; they do not alter
the signed-in observations below.

## Purpose

Resolve the scope of the owner-reported OpenAI organization approval, refresh
the public-submission packet against current official documentation, and record
only the portal state directly visible without exposing account identifiers or
credentials.

## Current official requirements

The current OpenAI
[MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review)
and
[plugin submission flow](https://developers.openai.com/plugins/deploy/submission)
were rechecked on 2026-08-30. They establish these relevant boundaries:

- publishing under an individual's name requires approved individual
  verification;
- publishing under a business name requires approved business verification;
- an unverified or mismatched publisher identity may be rejected;
- organization owners have the required plugin-draft read/write permissions;
- **Scan Tools** imports the live MCP metadata snapshot used for review; and
- MCP review cannot currently use an EU-data-residency project; the submission
  project must use global data residency.

These product rules are time-sensitive and must be rechecked at submission.

## Signed-in observations

The existing authenticated primary Brave session showed the following labels
in OpenAI Platform organization settings:

- Individual verification: `Approved`
- Business verification: `Start`
- Organization notice: `Organization could not be verified`

The plugin submission portal loaded without an access-denied or verification-
required block. It displayed **Create plugin** and no existing draft rows.

The readback did not select a developer identity, create a plugin draft, scan
the MCP endpoint, complete a domain challenge, inspect project data residency,
submit for review, or publish anything.

## Interpretation and limits

The approval permits a submission under the verified individual identity if
the listing is changed to match that publisher. It does not establish approval
to publish under the AskRigor business name: business verification remains
available to start, not approved. The organization-level warning is preserved
rather than reconciled by inference.

The publisher path is therefore an owner decision:

1. publish under the verified individual identity now and make every publisher-
   matching listing field consistent; or
2. complete business verification before publishing under the AskRigor name.

No portal draft should be created until that choice is made and the packet's
publisher fields are reconciled. Global data residency, domain verification,
Scan Tools, the demo recording, final response/privacy review, submission, and
publication all remain separate gates.

## Packet correction

The prior packet still described the historical 17-tool surface. The committed
production inventory contains 21 ordered read-only tools. The packet now has a
machine-readable `mcp.expectedToolCount` bound by test to
`docs/tool-inventory-v0.1.0.json`; its release and Scan Tools text also say 21.
Historical evidence that correctly describes an earlier 17-tool release is not
rewritten.

## Repository verification

Worktree branch: `agent/public-submission-readback-20260830`

Baseline: `2edc5dde168f344234cdefc432d99820840132e0`

- The test-first packet regression initially failed four assertions against the
  stale packet, then passed all 8 focused tests after the correction.
- `npm run verify` passed through the required host boundary: 109 test files
  passed with 1 declared skip; 1,457 tests passed with 6 declared skips;
  typecheck and build passed.
- The lesson-queue checkpoint at `2026-08-30T00:53:57.971Z` reported 0 open,
  0 needing review, 0 accepted-not-incorporated, 4 incorporated or closed, and
  0 deletion eligible.
- No protocol, runtime, source-adapter, provider, privacy-collection, deployment,
  or installed-plugin byte changed.

The first complete-gate attempt was intentionally stopped after local HTTP
tests failed to bind in the filesystem/network sandbox. The host-boundary rerun
is the valid complete-gate receipt; no product defect is inferred from the
sandbox denial.
