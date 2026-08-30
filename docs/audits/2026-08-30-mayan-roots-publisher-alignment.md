# Mayan Roots LLC publisher alignment

Date: 2026-08-30

Status: source, public-site, and installed-plugin release complete; OpenAI
business verification remains incomplete

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

The initial signed-in 2026-08-30 observation remains exactly as recorded in
`docs/audits/2026-08-30-openai-plugin-portal-readback.md`: Individual
verification was `Approved`, Business verification was `Start`, the
organization notice was `Organization could not be verified`, and no plugin
draft was created. Selecting Mayan Roots LLC in repository metadata did not
turn that historical observation into approval.

After the release, the owner explicitly approved aligning the private OpenAI
account label as well. The signed-in organization name changed from
`AskRigor.com` to `Mayan Roots LLC`, the portal reported `Organization updated
successfully`, and direct field/sidebar readback confirmed the saved name.
Verification then showed Individual `Approved`, Business `Identity rejected`,
and `Start`. Retrying `Start` returned `Unable to verify organization` and
`verification is not available to your organization at this time` before any
business-information form appeared. No tax identifier, address, document, or
other private verification value was entered or transmitted, and no plugin
draft was created. The developer-identity gate therefore remains fail-closed.

## Released changes

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

OpenAI business verification for Mayan Roots LLC is currently unavailable in
the signed-in flow after the rejected prior attempt. Global data residency, the
askrigor.com domain challenge for that selected identity, Scan Tools, the demo
recording, final portal review, and submission remain incomplete. No portal
draft or submission action is authorized by this identity alignment.

## Verification and release evidence

Test-first execution produced the intended failures against the prior AskRigor-
as-publisher metadata and four undisclosed site pages. The initial no-suffix
candidate passed 36/36 focused tests. The exact-legal-name correction then
failed the expected 8 assertions against the no-suffix candidate and passed
48/48 current focused tests. The four-page site validator and 28/28 site-
deployment policy tests passed. The official plugin validator passed, and the
complete pre-cachebuster eight-member source receipt has package SHA-256
`398aa93d489ffcf80be61b5e8b3be21e0a2ec90ca932d4abc966797c04479bca`.
The complete deterministic gate then passed 109 test files with 1 declared
skip and 1,457 tests with 6 declared skips, plus typecheck and build.

The corrected pre-release lesson checkpoint at `2026-08-30T01:53:25.860Z`
reported 0 open candidates, 0 needing review, 0 accepted-not-incorporated, 4
incorporated or closed, and 0 deletion eligible. Protected-branch, production-
site, and installed-package receipts are recorded in the release closeout for
this task.

## Release closeout

PR #135 passed deterministic verification, workflow policy, and every CodeQL
analysis, then merged the exact legal-name correction as
`4d4bd43303045223394480b13153e7ae3b9149bd`. The immutable static-site archive
has SHA-256
`552a88481b558f92e79a8c1b5e7157fa57fc174746ffe8ca4ffb4042d6e460c1`
and activated as `/opt/askrigor/site/releases/4d4bd4330304/site`. The prior site
release `/opt/askrigor/site/releases/4cf17ae-20260827-youtube-api-disclosures/site`
remains available for rollback.

All four HTML pages and the stylesheet are byte-identical between the merge and
public HTTPS. The home, privacy, terms, and support body SHA-256 values are,
respectively,
`845f35f42e4969ce972f9cfb12dd36e1d475227674b3e44625009b403079acf8`,
`d24c822fde6d666e652f3259e95dc9497d6ee3d9c8c6c94406954095f6796052`,
`e7cbaf417445c2fa30d04acc30cf40dc1b6f8c1c88f337c4dc6098c51ea7fc94`,
and `f83b7b463b43058cd85ce7626d140cfe5f6b975abfb53386243f47e8b4d321ba`.
The stylesheet SHA-256 is
`1142ed6b8cf59d823bdab1060061b586d5e25cd6456a76430829702f1e4dfe7c`.
Required CSP, HSTS, frame, content-type, referrer, and permissions headers pass.
Only Caddy was recreated, from `cb061473089c` to `297c59cfb620`; it retains the
same `caddy:2.11.4-alpine` image. Research remained exact container
`e1b912b7c37c`, and loopback/public health passed.

The reviewed package was copied to the active personal-marketplace source and
received one cachebuster, `0.1.0+codex.20260830020029`. Its complete eight-
member source and installed receipts are identical at package SHA-256
`0e4db5e82818bf321a5c9dce50b73357faeaf5c6333183cf99a679fef267329a`.
The prior eight-member source is preserved at
`/home/joel/plugins/askrigor.rollback-20260830T020000Z`, version
`0.1.0+codex.20260825134144`, package SHA-256
`d383648b27a7cf4e50ce0858f2443c3d8e73f536a471befa321595593e39ed24`.

Direct production MCP initialization and `tools/list` match the exact committed
21-tool ordered inventory. Universal remains 20.5.15 with SHA-256
`69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`;
HRP remains 20.5.23 with SHA-256
`bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299`.
A read-only installed connector call retrieved PMID `40223676` with
`api_visible_complete` access. This already-open thread retains its 17-tool
pre-refresh client snapshot; a fresh thread is required to observe the newly
installed package and current 21-tool connector view.

The final lesson checkpoint at `2026-08-30T02:05:30.550Z` again reported 0
open candidates, 0 needing review, 0 accepted-not-incorporated, 4 incorporated
or closed, and 0 deletion eligible.
