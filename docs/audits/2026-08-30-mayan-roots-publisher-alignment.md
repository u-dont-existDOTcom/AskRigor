# Mayan Roots publisher alignment

Date: 2026-08-30

Status: owner identity decision implemented in the repository candidate;
OpenAI business verification remains incomplete

## Decision

The owner confirmed that the business is named **Mayan Roots** and selected it
as AskRigor's public business publisher/developer identity. The stable identity
split is:

- product and plugin display name: **AskRigor**;
- publisher, developer, author, and operator identity: **Mayan Roots**; and
- public relationship statement:
  `AskRigor is a product operated by Mayan Roots.`

No legal suffix, registration number, postal address, jurisdiction, or other
unverified business detail is asserted.

## Official product boundary

OpenAI's current
[plugin submission documentation](https://developers.openai.com/plugins/deploy/submission)
was rechecked before implementation. It treats the product/plugin name and the
verified Developer Identity as separate listing concepts, and requires the
website, support, privacy, and terms surfaces to match the publisher identity.
It also warns that an unverified or mismatched publisher identity can be
rejected.

The signed-in 2026-08-30 observation remains exactly as recorded in
`docs/audits/2026-08-30-openai-plugin-portal-readback.md`: Individual
verification was `Approved`, Business verification was `Start`, the
organization notice was `Organization could not be verified`, and no plugin
draft was created. Selecting Mayan Roots in repository metadata does not turn
that observation into approval.

## Candidate changes

- `.codex-plugin/plugin.json` keeps `AskRigor` as `displayName` and changes the
  manifest author and `developerName` to `Mayan Roots`.
- `docs/public-submission-packet-v0.1.0.json` makes the same listing change,
  records the owner selection, and leaves the developer-identity gate
  `in_progress` with no evidence or completion time.
- The home, privacy, terms, and support pages identify AskRigor as a product
  operated by Mayan Roots. Privacy and terms use an August 30, 2026 effective
  date and define the operator relationship without inventing legal details.
- Regression tests bind the product/publisher distinction, all four public
  disclosures, and the fail-closed verification state.

## Remaining external gates

OpenAI business verification for Mayan Roots, global data residency, the
askrigor.com domain challenge for that selected identity, Scan Tools, the demo
recording, final portal review, and submission remain incomplete. No portal
draft or submission action is authorized by this identity alignment.

## Verification and release evidence

Test-first execution produced the intended failures against the prior AskRigor-
as-publisher metadata and four undisclosed site pages. After implementation,
the focused plugin-package, public-submission-packet, and public-site suites
passed 36/36 tests. The four-page site validator and 28/28 site-deployment
policy tests passed. The official plugin validator passed, and the complete
pre-cachebuster eight-member source receipt has package SHA-256
`61d4b7882111ee32b379e0253c5b7348ceafa9bb976f20f2436ae8dc05cd371e`.
The complete deterministic gate then passed 109 test files with 1 declared
skip and 1,457 tests with 6 declared skips, plus typecheck and build.

The pre-release lesson checkpoint at `2026-08-30T01:41:08.971Z` reported 0
open candidates, 0 needing review, 0 accepted-not-incorporated, 4 incorporated
or closed, and 0 deletion eligible. Protected-branch, production-site, and
installed-package receipts are recorded in the release closeout for this task.
