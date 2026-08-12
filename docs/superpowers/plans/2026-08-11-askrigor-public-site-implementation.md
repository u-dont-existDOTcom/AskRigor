# AskRigor Public Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish and verify a static AskRigor home page plus privacy, terms, and support pages on the existing VPS without changing the MCP application or its secrets.

**Architecture:** Track dependency-free HTML/CSS and validation contracts in the AskRigor repository. Build an immutable checksummed site archive, install it under `/opt/askrigor/site/releases/<revision>`, and let the existing pinned Caddy container serve it through a separately auditable Compose overlay and combined Caddy configuration. Switch the site transactionally, recreate only Caddy when required, and roll back the site/Caddy selection automatically if any live check fails.

**Tech Stack:** Semantic HTML5, CSS, Node.js 24, TypeScript 7, Vitest 4, Bash, Caddy 2.11.4, Docker Compose, `curl`, `openssl`, and SHA-256 tooling already present in the project/VPS.

## Global Constraints

- Publisher identity is exactly `AskRigor`; public support, privacy, and security contact is exactly `joel@askrigor.com`.
- Publish exactly `https://askrigor.com/`, `/privacy`, `/terms`, and `/support`; the apex domain is canonical.
- Use static HTML/CSS only: no JavaScript, cookies, analytics, forms, remote fonts, external images, tracking pixels, or third-party scripts.
- The privacy notice must faithfully cover `docs/privacy-data-map.md`, especially public YouTube author/channel IDs, optional display names, comment/reply text, provider sharing, connected-client retention, operational metadata, and v0 non-persistence.
- Do not claim a company name, physical address, governing jurisdiction, certification, regulatory status, guaranteed response time, uptime, or deletion from providers/clients.
- Preserve `https://mcp.askrigor.com/mcp`, the current MCP container, runtime secrets, port 3000 loopback binding, rate-limit identity boundary, Caddy image digest, firewall, and TLS data.
- Never print, read, copy, archive, or modify provider keys. Do not recreate `research-mcp` for this site release.
- Root-owned production files must not be symlinks at trust boundaries or be group/world writable. The selected site release may be a root-owned symlink to an immutable root-owned directory.
- Validate Caddy configuration before reload/recreation. Arm rollback before changing the active site or Caddy configuration.
- If apex DNS/registrar forwarding cannot be changed with available authorized access, complete the verified VPS stage and report the exact DNS/forwarding action; do not publish at a substitute URL or weaken TLS.
- Do not add manifest legal/support fields unless current official plugin packaging supports their exact schema and the live HTTPS pages have passed verification.

---

### Task 1: Static site content and accessibility contract

**Files:**
- Create: `site/index.html`
- Create: `site/privacy/index.html`
- Create: `site/terms/index.html`
- Create: `site/support/index.html`
- Create: `site/assets/site.css`
- Create: `scripts/validate-public-site.mts`
- Create: `tests/public-site.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the exact publisher/contact values and content boundary in Global Constraints; `docs/privacy-data-map.md` as the source-of-truth data inventory.
- Produces: `validatePublicSite(root: URL): Promise<SiteValidationResult>` where `SiteValidationResult` is `{ pages: 4; internalLinks: number; errors: string[] }`; a `site/` directory safe to archive as a static document root; `npm run test:site`.

- [ ] **Step 1: Write the failing site contract**

Create `tests/public-site.test.ts` with imports from `node:fs/promises`, `node:path`, Vitest, and the not-yet-created validator. The tests must initially fail because `site/` and `scripts/validate-public-site.mts` do not exist. Use this table and required assertions:

```ts
const pages = [
  ["site/index.html", "AskRigor | Evidence-first research retrieval", "https://askrigor.com/"],
  ["site/privacy/index.html", "Privacy | AskRigor", "https://askrigor.com/privacy"],
  ["site/terms/index.html", "Terms | AskRigor", "https://askrigor.com/terms"],
  ["site/support/index.html", "Support | AskRigor", "https://askrigor.com/support"]
] as const;

it("ships exactly four complete public pages", async () => {
  const result = await validatePublicSite(rootFile("site"));
  expect(result.errors).toEqual([]);
  expect(result.pages).toBe(4);
  expect(result.internalLinks).toBeGreaterThanOrEqual(16);
});

it.each(pages)("gives %s its exact identity", async (file, title, canonical) => {
  const html = await readFile(rootFile(file), "utf8");
  expect(html).toContain(`<title>${title}</title>`);
  expect(html).toContain(`<link rel="canonical" href="${canonical}">`);
  expect(html).toContain("joel@askrigor.com");
  expect(html).toContain('href="/privacy"');
  expect(html).toContain('href="/terms"');
  expect(html).toContain('href="/support"');
});
```

Add focused tests that require:

- one `<main>` and one `<h1>` per page, a skip link, shared header/footer navigation, viewport metadata, a nonempty description, and `lang="en"`;
- no `<script`, `<form`, `http://`, remote stylesheet/font/image URL, `TBD`, `TODO`, template braces, tracking/analytics string, or embedded credential pattern;
- the privacy page fragments `public YouTube author/channel IDs`, `display names`, `comment and reply text`, `NCBI/PubMed`, `Europe PMC`, `ClinicalTrials.gov`, `Crossref`, `YouTube Data API v3`, `active request`, `does not persist`, `connected client`, `operational metadata`, and `joel@askrigor.com`;
- the home disclaimer fragments `does not diagnose`, `does not treat or prescribe`, `not a substitute for professional advice`, and `provider data may be incomplete, delayed, or unavailable`;
- the terms fragments `read-only`, `lawful use`, `no medical, legal, or financial advice`, `rate limits`, `third-party`, `as available`, `applicable law`, and `joel@askrigor.com`;
- the support fragments `accessibility`, `security`, `Do not email API keys`, `emergency`, `local emergency services`, and `joel@askrigor.com`;
- the CSS fragments `:focus-visible`, `prefers-reduced-motion`, `prefers-color-scheme: dark`, `max-width`, and an `@media` rule at or below 48rem.

- [ ] **Step 2: Run the focused test and capture RED**

Run:

```bash
npm run test:run -- tests/public-site.test.ts
```

Expected: FAIL because `../scripts/validate-public-site.mts` or the `site/` files are missing. Record the failing assertion/module error in the task report.

- [ ] **Step 3: Implement the deterministic validator**

Create `scripts/validate-public-site.mts` using only Node built-ins. Export:

```ts
export interface SiteValidationResult {
  pages: 4;
  internalLinks: number;
  errors: string[];
}

export async function validatePublicSite(root: URL): Promise<SiteValidationResult>;
```

The validator must read only `index.html`, `privacy/index.html`,
`terms/index.html`, `support/index.html`, and `assets/site.css`; reject any other
regular file or symlink below `site/`; count same-origin navigation links; and
return stable, path-qualified error strings instead of throwing for content
violations. When invoked directly, print errors to stderr and exit 1, otherwise
print `Validated AskRigor public site: 4 pages` and exit 0.

- [ ] **Step 4: Implement the four semantic pages**

Create complete HTML documents. Each uses `/assets/site.css`, the exact title
and canonical URL in Step 1, a skip link to `#content`, shared navigation, and a
footer with `AskRigor`, `joel@askrigor.com`, and links to all three policy pages.

Home sections: hero; `What AskRigor retrieves`; `What it does not do`;
`Coverage stays explicit`; `Use AskRigor`; policy/support footer. Link the MCP
endpoint as plain developer information, not as a browser form.

Privacy sections, in this order: `Scope`; `Information processed`; `Public
YouTube data`; `Why and where data is processed`; `Storage and retention`;
`Operational metadata`; `Data sharing and connected clients`; `Security and
minimization`; `Your choices and requests`; `Changes`; `Contact`. Use effective
date `August 11, 2026`. State that infrastructure may process time, route,
status, latency, IP/network data, and security signals, but the application does
not log raw MCP request/response bodies or credentials. State that provider and
connected-client retention is controlled by their own terms.

Terms sections, in this order: `Acceptance`; `The service`; `Permitted use`;
`Prohibited use`; `Research and professional-advice boundary`; `Third-party
services and content`; `Availability and changes`; `Intellectual property`;
`Disclaimers`; `Limitation of liability`; `Severability`; `Changes`; `Contact`.
Use effective date `August 11, 2026`. Qualify warranty/liability statements with
`to the extent permitted by applicable law` and name no governing jurisdiction.

Support sections: `How to contact us`; `What to include`; `Privacy and
accessibility`; `Security reports`; `What not to send`; `Emergencies and urgent
medical concerns`. Ask for the affected route/tool, approximate UTC time,
expected/actual behavior, and sanitized error text. Explicitly say not to email
API keys, passwords, health records, or bulk comment corpora.

- [ ] **Step 5: Implement the shared accessible stylesheet**

Use CSS custom properties for an off-white/light palette and a dark palette,
system fonts, 1.6 body line height, a 72ch reading column, visible
`:focus-visible` outlines, a visually hidden skip link that becomes visible on
focus, responsive navigation/cards, and no animations except transitions
disabled under `prefers-reduced-motion: reduce`. Use a muted blue link/accent
whose normal and hover states remain distinguishable without relying on color
alone.

- [ ] **Step 6: Add and run the site command**

Add this exact package script:

```json
"test:site": "tsx scripts/validate-public-site.mts"
```

Run:

```bash
npm run test:site
npm run test:run -- tests/public-site.test.ts
git diff --check
```

Expected: validator prints `Validated AskRigor public site: 4 pages`; focused
tests pass; diff check exits 0.

- [ ] **Step 7: Commit**

```bash
git add site scripts/validate-public-site.mts tests/public-site.test.ts package.json
git commit -m "feat: add AskRigor public site"
```

---

### Task 2: Immutable deployment packet and rollback contract

**Files:**
- Create: `ops/public-site/Caddyfile.site`
- Create: `ops/public-site/compose.site.yaml`
- Create: `ops/public-site/install-public-site.sh`
- Create: `scripts/create-public-site-archive.sh`
- Create: `tests/public-site-deployment.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1's validated `site/` document root; the production base files `/opt/askrigor/active/compose.yaml`, `/opt/askrigor/active/compose.https.yaml`, and `/opt/askrigor/active/Caddyfile`; Docker Compose service `caddy` and `research-mcp`.
- Produces: `create-public-site-archive.sh <git-commit> <output.tar.gz>` plus sidecar `<output.tar.gz>.sha256`; an installer accepting exactly `<archive> <sha256> <revision>`; root-owned release `/opt/askrigor/site/releases/<revision>`; overlay `/opt/askrigor/site/state/compose.site.yaml`; combined Caddy configuration `/opt/askrigor/site/state/Caddyfile`; active link `/opt/askrigor/site/current`.

- [ ] **Step 1: Write failing deployment-contract tests**

Create `tests/public-site-deployment.test.ts` that reads the four new deployment
files and initially fails because they do not exist. Require these exact
properties:

```ts
expect(caddy).toContain("askrigor.com {");
expect(caddy).toContain("root * /srv/askrigor-site");
expect(caddy).toContain("Content-Security-Policy");
expect(caddy).toContain("default-src 'none'");
expect(caddy).toContain("style-src 'self'");
expect(caddy).toContain("X-Content-Type-Options nosniff");
expect(caddy).toContain("Referrer-Policy strict-origin-when-cross-origin");
expect(caddy).toContain('Strict-Transport-Security "max-age=31536000"');
expect(caddy).toContain("Permissions-Policy");
expect(caddy).toContain("-Server");
expect(caddy).not.toContain("mcp.askrigor.com");

expect(compose).toContain("/opt/askrigor/site/current:/srv/askrigor-site:ro");
expect(compose).toContain("/opt/askrigor/site/state/Caddyfile:/etc/caddy/Caddyfile:ro");
expect(compose).not.toMatch(/research-mcp:/);
```

Assert that the installer contains `set -Eeuo pipefail`, validates all three
arguments, checks archive hash before extraction, rejects symlink/non-root/
group-or-world-writable production paths, stages before switching, records the
previous current target, runs `caddy validate`, changes `current` only after
validation, uses Compose with all three production files, targets only
`caddy`, verifies all four public routes and MCP health, and defines an ERR trap
that restores the prior Caddyfile/current link and recreates only Caddy.

Assert that no deployment file contains `YOUTUBE_API_KEY`, `NCBI_API_KEY`,
`runtime.env`, `docker compose down`, `research-mcp --force-recreate`, `chmod
777`, `StrictHostKeyChecking=no`, or a private-key marker.

- [ ] **Step 2: Run the focused test and capture RED**

```bash
npm run test:run -- tests/public-site-deployment.test.ts
```

Expected: FAIL with missing `ops/public-site/Caddyfile.site`.

- [ ] **Step 3: Implement the isolated Caddy site block**

Create `ops/public-site/Caddyfile.site` with a single `askrigor.com` block. Add
global headers, `encode zstd gzip`, and route handling that returns direct 200s
for `/`, `/privacy`, `/terms`, and `/support` by rewriting them to their exact
`index.html` files. Serve only `/assets/*` outside those routes and return 404
otherwise. Use this CSP:

```text
default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self';
base-uri 'none'; form-action 'none'; frame-ancestors 'none';
object-src 'none'; connect-src 'none'; upgrade-insecure-requests
```

Set `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`,
`Referrer-Policy strict-origin-when-cross-origin`, and a Permissions Policy that
disables camera, microphone, geolocation, payment, USB, browsing-topics, and
interest-cohort. Remove `Server`. Set `Strict-Transport-Security` to
`max-age=31536000` without `includeSubDomains` or `preload`; the pre-deployment
audit must first confirm that the intended apex host already completes HTTPS,
and the installer must refuse activation if that prerequisite is false.

- [ ] **Step 4: Implement the Compose overlay**

Create `ops/public-site/compose.site.yaml` containing only the `caddy` service
with the two read-only mounts asserted in Step 1. It must not declare ports,
networks, images, commands, environment values, volumes with write access, or a
`research-mcp` service; those remain inherited unchanged from the production
base and HTTPS Compose files.

- [ ] **Step 5: Implement deterministic archive creation**

Create `scripts/create-public-site-archive.sh`. It accepts a commit and a new
archive path, verifies `${commit}^{commit}`, refuses an existing archive, uses
`git archive --format=tar "$commit" site ops/public-site | gzip -n`, and writes
a same-directory SHA-256 sidecar using only the archive basename. After
creation, inspect the archive and fail if it includes a symlink, `.env`,
`.app.json`, `.git`, private-key-like filename, or anything outside `site/` and
`ops/public-site/`.

- [ ] **Step 6: Implement the transactional root installer**

Create `ops/public-site/install-public-site.sh` with exact required arguments:

```text
install-public-site.sh <archive.tar.gz> <archive.sha256> <revision>
```

It must require root; use fixed roots `/opt/askrigor/site/releases`,
`/opt/askrigor/site/state`, and `/opt/askrigor/site/current`; verify exact
production prerequisites under `/opt/askrigor/active`; copy the input archive
to a root-owned mode-0400 staged path before hash verification/extraction;
extract into a new root-owned mode-0755 immutable release; require the release
packet creator to have run the site validator before upload; and validate
archive membership again on the VPS before accepting the extracted release.

Build the combined Caddyfile by byte-copying the current production Caddyfile,
adding a newline and the reviewed `Caddyfile.site`, then run the pinned Caddy
image's `caddy validate` through the three-file Compose model. Render `docker
compose config` and assert that `research-mcp` image, mounts, environment-file
references, networks, security options, and port binding match the two-file
production render exactly; only the Caddy configuration and site content mounts
may differ.

Arm rollback before atomically changing `current` and the state Caddyfile. Run:

```bash
docker compose \
  -f /opt/askrigor/active/compose.yaml \
  -f /opt/askrigor/active/compose.https.yaml \
  -f /opt/askrigor/site/state/compose.site.yaml \
  up -d --no-deps --force-recreate caddy
```

Then verify loopback/public MCP health and the four public routes. The rollback
trap restores the former symlink/Caddyfile/overlay, recreates only Caddy, and
rechecks MCP health. It preserves failed release artifacts for diagnosis and
prints their exact paths.

- [ ] **Step 7: Add deployment command and run local verification**

Add:

```json
"test:site-deploy": "vitest run tests/public-site-deployment.test.ts"
```

Run:

```bash
bash -n scripts/create-public-site-archive.sh
bash -n ops/public-site/install-public-site.sh
npm run test:site-deploy
npm run test:site
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add ops/public-site scripts/create-public-site-archive.sh tests/public-site-deployment.test.ts package.json
git commit -m "ops: add transactional public site deployment"
```

---

### Task 3: Audited VPS deployment and live verification

**Files:**
- Modify: `docs/release-evidence-v0.1.0.md`
- Create (ignored SDD report only): deployment evidence references in this plan's report

**Interfaces:**
- Consumes: Task 2's clean Git commit, archive/sidecar, installer, authorized VPS `191.215.38.123`, pinned SSH host key, and a newly authorized deployment key if the prior private key is unavailable.
- Produces: live HTTPS pages at all four canonical routes; root-owned release and rollback state; sanitized evidence directory `/opt/askrigor/site/evidence/<UTC timestamp>`; unchanged healthy MCP service.

- [ ] **Step 1: Restore a pinned SSH trust path**

Check whether `/tmp/askrigor_hostinger_deploy_key` and
`/tmp/askrigor_hostinger_known_hosts` still exist and match the previously
installed deployment public key/fingerprint. If the private key is unavailable,
generate a new dedicated Ed25519 key at a new `mktemp -d` path with comment
`askrigor-site-deploy-2026-08-11`, print only its public key and SHA-256
fingerprint, and have the user add that public key in Hostinger. Never print the
private key. Retrieve the VPS Ed25519 host key with `ssh-keyscan`, compare it to
the host fingerprint recorded during the existing Task 15 deployment or obtain
explicit user confirmation if no trustworthy prior record exists, then pin the
exact key in a task-local known-hosts file. Do not use
`StrictHostKeyChecking=no`.

- [ ] **Step 2: Audit production and DNS read-only**

Over pinned-key SSH, record sanitized output for: `/opt/askrigor/active` target;
hash/mode/owner of `compose.yaml`, `compose.https.yaml`, and `Caddyfile`;
three-file-capable Compose service names; current container names/images/status;
listeners; UFW summary; Caddy image digest; and public MCP health. Do not print
environment values.

Resolve A and AAAA for `askrigor.com`, `www.askrigor.com`, and
`mcp.askrigor.com`, and inspect HTTP/HTTPS redirects. Confirm whether registrar
forwarding or DNS still points the apex away from `191.215.38.123`. If the apex
cannot reach the VPS, install and validate the dormant site release but do not
claim public completion; report the exact record/forwarding change required.

- [ ] **Step 3: Build and review an immutable release packet**

From a clean checkout at Task 2 HEAD, run `npm run test:site`, create a new
archive with `scripts/create-public-site-archive.sh`, verify its sidecar in a
different directory, list its exact members, and scan the decompressed content
for private-key markers, credential names, `.env`, `.app.json`, internal IPs,
and provider keys. Record archive size, SHA-256, source commit, installer
SHA-256, site validator result, and member list.

- [ ] **Step 4: Upload without activating**

Upload the archive, sidecar, and exact installer to a new root-owned staging
directory under `/opt/askrigor/site/staging/<revision>`. Verify ownership,
modes, hashes, and non-symlink status remotely. Do not overwrite active release
files and do not touch `/opt/askrigor/active`.

- [ ] **Step 5: Execute the transactional deployment once**

Run the staged installer exactly once with the staged archive, sidecar, and
revision. Capture sanitized stdout/stderr and exit status in the evidence
directory. Confirm the installer selected the new release, validated Caddy,
recreated only Caddy, and left the `research-mcp` container ID/revision/runtime
hardening unchanged.

- [ ] **Step 6: Run independent live acceptance checks**

From outside the VPS and from the VPS, verify:

```text
https://askrigor.com/          -> 200, AskRigor home canonical
https://askrigor.com/privacy   -> 200, privacy canonical + YouTube disclosure
https://askrigor.com/terms     -> 200, terms canonical
https://askrigor.com/support   -> 200, support canonical + contact
http://askrigor.com/<path>     -> equivalent HTTPS route
https://mcp.askrigor.com/healthz -> 200
https://mcp.askrigor.com/mcp     -> expected MCP transport response
```

Check certificate subject/SAN and dates, same-origin assets, no mixed content,
security headers, no `Server` header on HTTPS, no unrelated redirect, no
provider-secret/key-like content, public listeners, and loopback-only port 3000.
Fetch each route with a fresh connection and retain SHA-256 hashes of sanitized
headers/body in the evidence directory.

- [ ] **Step 7: Record live evidence without prematurely clearing other gates**

Update only the legal-URL table and site-deployment evidence in
`docs/release-evidence-v0.1.0.md`. Mark the four URL findings resolved only if
all live checks passed. Preserve the separate ChatGPT routine-status
presentation finding and unperformed portal/submission actions. Do not add
manifest fields or claim plugin publication.

- [ ] **Step 8: Commit**

```bash
git add docs/release-evidence-v0.1.0.md
git commit -m "docs: record public site deployment evidence"
```

---

### Task 4: Repository release-gate closeout

**Files:**
- Modify: `docs/privacy-data-map.md`
- Modify: `docs/public-review-checklist.md`
- Modify: `docs/release-evidence-v0.1.0.md`
- Modify: `README.md`
- Modify only if authoritative schema supports exact verified fields: `.codex-plugin/plugin.json`
- Modify: `tests/release-packet.test.ts`

**Interfaces:**
- Consumes: Task 3's live page evidence and source commit; current official OpenAI plugin packaging/submission documentation; installed plugin-creator validator.
- Produces: repository documents that distinguish the resolved website/legal-page gate from the still-open ChatGPT presentation and portal/publication gates; an ingestion-valid plugin manifest.

- [ ] **Step 1: Refresh authoritative plugin URL-field requirements**

Use the `openai-docs` and `plugin-creator` skills. Search and open current
official OpenAI plugin packaging/submission documentation, then run the
installed plugin validator against the unchanged manifest. Determine the exact
supported manifest keys for website, privacy, terms, and support URLs. Do not
infer field names. If current packaging has no such keys, keep the manifest
unchanged and record the live URLs only in submission/release documentation.

- [ ] **Step 2: Write failing closeout assertions**

Modify `tests/release-packet.test.ts` so the legal URL test requires all four
live URLs, their successful verification date/revision/evidence reference, and
the removal of obsolete `plain-HTTP unrelated target`/legal-page blocker text.
It must still require `routine-status presentation regression`, portal identity,
domain challenge, Scan Tools, and public submission to remain open. If official
schema supports exact legal/support fields, add exact manifest assertions only
after documenting those keys in the task report.

- [ ] **Step 3: Run closeout test and capture RED**

```bash
npm run test:run -- tests/release-packet.test.ts
```

Expected: FAIL because the repository documents still describe the four legal
URLs as blocked.

- [ ] **Step 4: Update public documentation accurately**

Update the privacy data map status to link to the live public privacy notice
while retaining the internal map as the detailed engineering inventory. Update
the public-review checklist, release evidence, and README to say the public
site/privacy/terms/support gate passed on the verified date and source
revision. Preserve every unrelated release limitation. Add manifest URLs only
if Step 1 established exact supported keys and the official validator accepts
them.

- [ ] **Step 5: Run full repository and package verification**

```bash
npm run test:site
npm run test:site-deploy
npm run verify
python3 /home/joel/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
git diff --check
git status --short
```

Expected: all tests, typecheck, build, plugin ingestion validation, and diff
check pass. Status contains only the intended Task 4 files before commit.

- [ ] **Step 6: Commit**

```bash
git add docs README.md tests/release-packet.test.ts .codex-plugin/plugin.json
git commit -m "docs: close public site release gate"
```

- [ ] **Step 7: Task and whole-feature review**

Run the required task-scoped spec/code-quality review. After it is clean, run a
whole-feature review from the parent of the design commit through Task 4 HEAD,
explicitly asking the reviewer to verify content accuracy, privacy coverage,
deployment rollback, secret isolation, Caddy/MCP noninterference, evidence
claims, and retained external gates. Fix and re-review any Critical or Important
finding under the SDD loop before claiming completion.

---

## Completion boundary

This plan is complete only when the four pages are live over direct HTTPS on
the intended domain, the MCP service remains healthy and unchanged, the
repository and plugin validators pass, and independent review is clean. This
plan does not submit or publish the plugin listing and does not close the
separate ChatGPT routine-status presentation gate.
