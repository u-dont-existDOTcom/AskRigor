# AskRigor Public Submission Packet Repair Design

Date: 2026-08-16  
Status: approved by the owner as Approach A

## Objective

Make the repository the durable, machine-checked source for AskRigor's OpenAI
public-directory submission packet without weakening the existing production
MCP contract, deleting extended regression evidence, or claiming that
account-scoped portal steps are complete before they are observed.

## Current verified baseline

- Baseline: `origin/main` at
  `57340f4ee2d9165fc7d680fe01cae9c8ca0f251a`.
- Production MCP endpoint: `https://mcp.askrigor.com/mcp`.
- The local plugin manifest references ignored `.app.json`; the current plugin
  validator therefore fails on a clean repository checkout.
- The manifest's short description exceeds the public-directory 30-character
  limit and it has no required logo or composer-icon assets.
- The internal review suite contains six positive and three negative cases.
  Current OpenAI final submission requires exactly five positive and three
  negative cases.
- The public site already provides publisher-matching HTTPS website, privacy,
  terms, and support pages.
- Developer identity verification is pending outside the repository. A demo
  recording, domain challenge, and portal Scan Tools output also remain
  external gates.

## Current primary sources

Reviewed 2026-08-16:

- `https://developers.openai.com/plugins/build/plugins`
- `https://developers.openai.com/plugins/deploy/submission-errors`
- `https://developers.openai.com/plugins/deploy/app-review`

The submission-error reference is controlling for the repository repair. It
requires, among other items, a display name and short description of at most 30
characters, square logo and composer-icon images, HTTPS website/support/privacy/
terms URLs for MCP-backed submissions, exactly five positive and three negative
test cases, release notes, and a demo-recording URL. It also states that public
MCP submissions use **With MCP** and submit the MCP server directly; they do not
publish an `.app.json` reference to an existing ChatGPT app.

These product rules are time-sensitive. Recheck the same primary sources at the
actual portal-submission boundary.

## Approved architecture

Use two explicit artifacts with different responsibilities.

### 1. Distributable plugin package

`.codex-plugin/plugin.json` remains the package manifest for the AskRigor skill
and directory listing metadata. It will:

- remove the `apps: "./.app.json"` reference;
- retain the skill package;
- use `Auditable research retrieval` as the short description;
- declare the existing AskRigor blue `#145A8D` as its brand color;
- reference a square logo and square composer icon inside the archive; and
- remain valid under the current local plugin validator.

Do not add `supportURL` to `plugin.json`: that field is required by the portal
but is not accepted by the current plugin-manifest schema.

### 2. Portal submission packet

Add `docs/public-submission-packet-v0.1.0.json` as the machine-readable handoff
for values entered or verified in the OpenAI portal. It will contain:

- listing identity and descriptions;
- production MCP endpoint;
- website, support, privacy, and terms URLs;
- packaged logo and composer-icon paths;
- the exact five positive and three negative case IDs selected for submission;
- release notes;
- official-source review date and URLs;
- explicit external-gate states for identity, domain verification, Scan Tools,
  demo recording, and final submission; and
- a truthful demo-recording URL state without a fabricated URL.

The packet is a handoff/checkpoint, not proof of portal state. Portal-only facts
remain `pending` until directly observed.

## Test-case decision

Preserve `docs/public-review-cases-v0.1.0.json` unchanged as the extended
internal suite of six positive and three negative regression cases.

Select these public-directory cases in the portal packet:

- positive: `positive-1` through `positive-5`;
- negative: `negative-1` through `negative-3`.

Keep `positive-6` as an extended internal compound YouTube survey/audit
regression. It remains valuable evidence but is not one of the five final
portal cases because it is the longest and least deterministic model-layer
workflow and its Responses receipt remains opaque. No historical execution
evidence is deleted or relabeled.

## Branding decision

Add two 512-by-512 SVG assets under `assets/`:

- `askrigor-logo.svg`: a restrained `AR` monogram using the existing site blue
  and cream palette;
- `askrigor-composer-icon.svg`: a simplified matching mark legible at small
  composer sizes.

Both assets must be valid UTF-8 SVG, square, self-contained, free of remote
resources, scripts, embedded metadata, and fonts, and below the documented
5-MiB limit. They are listing identity only; they do not imply medical approval
or clinical authority.

## Demo-recording boundary

Add a deterministic recording script/checklist covering installation/selection,
protocol integrity, representative scholarly retrieval, representative public
community retrieval, explicit read-only boundaries, and the privacy/support
pages. The repository must not fabricate a hosted recording URL. Until a real
recording is uploaded and directly verified, the packet records the demo gate
as `pending` with a null URL.

## Verification design

Use test-driven development for machine-readable behavior:

1. Add failing tests that exercise the real package and packet files.
2. Verify the package no longer requires `.app.json`.
3. Verify listing limits, exact URLs, asset paths, SVG safety/dimensions, exact
   5+3 portal selection, referential integrity to the extended suite, and
   explicit pending external gates.
4. Run the current plugin validator against the clean repository root.
5. Run the focused tests, `npm run lessons:status`, and the complete canonical
   repository gate `npm run verify` on the final commit.
6. Review the final diff and tracked files for secrets, accidental evidence
   deletion, protocol drift, generated output, and unrelated churn.

## Documentation and recovery updates

Reconcile README, `docs/INDEX.md`, `docs/public-review-checklist.md`, relevant
release evidence, and `project/CODEX-CURRENT-STATE.md` so they distinguish:

- the distributable package;
- the portal packet;
- the extended 6+3 regression suite;
- the final 5+3 portal selection; and
- repository-complete versus portal-pending work.

The current-state checkpoint must identify this task branch, the actual current
main boundary, PR #11, exact verification evidence, external blockers, and the
single next safe action.

## Non-goals

- No protocol, source-adapter, MCP-tool, deployment, privacy-policy, or health-
  research-policy behavior change.
- No new provider calls, production deployment, credential handling, or paid
  model evaluation.
- No deletion or rewriting of the sixth positive regression case or its prior
  evidence.
- No fabricated identity, domain, Scan Tools, demo, or submission success.
- No manual portal submission before the protected repository candidate is
  merged and the external prerequisites are directly verified.

## Success criteria

- The clean plugin package passes the current official local validator.
- Repository tests enforce the current public-directory package and packet
  requirements described above.
- The internal 6+3 suite and historical receipts remain intact.
- The portal packet selects exactly 5+3 cases and truthfully exposes every
  unresolved external gate.
- The complete deterministic repository gate passes on the final candidate.
- A focused protected pull request is green and merged according to repository
  policy.
- The final checkpoint gives the owner one exact portal action and no routine
  repository repair remains.
