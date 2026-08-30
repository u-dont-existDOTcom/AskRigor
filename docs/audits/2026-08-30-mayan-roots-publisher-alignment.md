# Mayan Roots LLC publisher alignment

Date: 2026-08-30

Status: owner identity decision implemented in the repository candidate;
OpenAI business verification remains incomplete

## Decision

The owner confirmed that the legal business name is **Mayan Roots LLC** and
selected it as AskRigor's public business publisher/developer identity. The
stable identity split is:

- product and plugin display name: **AskRigor**;
- publisher, developer, author, and operator identity: **Mayan Roots LLC**; and
- public relationship statement:
  `AskRigor is a product operated by Mayan Roots LLC.`

The owner also supplied a tax identifier plus distinct company and mailing
addresses for private verification. Those values are intentionally not copied
into the repository, submission packet, audit, or public site because the
public identity-match surface does not require them. They may be entered only
into the private OpenAI business-verification form if the portal requests the
corresponding fields.

PR #134 merged the initial `Mayan Roots` candidate as
`aea17f1500247e65fd83ddd34207d635b778a987`. Before any production upload or
activation, the owner clarified the exact legal suffix. A local archive of the
superseded commit was created, but the first read-only VPS preflight stopped on
temporary hostname-resolution failure; no remote state was reached or changed.
That stale local archive was moved to trash. The follow-up candidate therefore
uses the exact legal name **Mayan Roots LLC** everywhere before release.

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
draft was created. Selecting Mayan Roots LLC in repository metadata does not
turn that observation into approval.

## Candidate changes

- `.codex-plugin/plugin.json` keeps `AskRigor` as `displayName` and changes the
  manifest author and `developerName` to `Mayan Roots LLC`.
- `docs/public-submission-packet-v0.1.0.json` makes the same listing change,
  records the owner selection, and leaves the developer-identity gate
  `in_progress` with no evidence or completion time.
- The home, privacy, terms, and support pages identify AskRigor as a product
  operated by Mayan Roots LLC. Privacy and terms use an August 30, 2026 effective
  date and define the operator relationship without inventing legal details.
- Regression tests bind the product/publisher distinction, all four public
  disclosures, and the fail-closed verification state.

## Remaining external gates

OpenAI business verification for Mayan Roots LLC, global data residency, the
askrigor.com domain challenge for that selected identity, Scan Tools, the demo
recording, final portal review, and submission remain incomplete. No portal
draft or submission action is authorized by this identity alignment.

## Verification and release evidence

Test-first execution produced the intended failures against the prior AskRigor-
as-publisher metadata and four undisclosed site pages. The initial no-suffix
candidate passed 36/36 focused tests. The exact-legal-name correction then
failed the expected 8 assertions against the no-suffix candidate and passed
48/48 current focused tests. The four-page site validator and 28/28 site-
deployment policy tests passed. The official plugin validator passed, and the complete
pre-cachebuster eight-member source receipt has package SHA-256
`398aa93d489ffcf80be61b5e8b3be21e0a2ec90ca932d4abc966797c04479bca`.
The complete deterministic gate then passed 109 test files with 1 declared
skip and 1,457 tests with 6 declared skips, plus typecheck and build.

The corrected pre-release lesson checkpoint at `2026-08-30T01:53:25.860Z` reported 0
open candidates, 0 needing review, 0 accepted-not-incorporated, 4 incorporated
or closed, and 0 deletion eligible. Protected-branch, production-site, and
installed-package receipts are recorded in the release closeout for this task.
