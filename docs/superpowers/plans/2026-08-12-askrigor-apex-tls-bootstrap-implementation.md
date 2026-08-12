# AskRigor Apex TLS Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obtain valid TLS for `askrigor.com`, then activate the staged immutable public site while preserving the MCP service.

**Architecture:** A root-only bootstrap utility adds a temporary 204-only apex Caddy block to the validated MCP Caddyfile, obtains and verifies the apex certificate, and recreates only Caddy with rollback armed. The reviewed normal installer then performs the atomic static-site activation and its canonical route/MCP checks.

**Tech Stack:** Bash, Docker Compose v2, Caddy 2.11.4 pinned digest, curl, dig, openssl, Node.js, Vitest, SSH/SCP, SHA-256.

## Global Constraints

- Preserve `mcp.askrigor.com`, `research-mcp`, provider/runtime secrets, firewall, TLS volume, public ports, and port-3000 loopback binding; only Caddy may be recreated.
- Never read, print, copy, archive, or modify `runtime.env` or provider keys. Compose runs under `env -i`; only `ASKRIGOR_HOSTNAME=mcp.askrigor.com`, `ASKRIGOR_DIRECT_DNS_ONLY=true`, and the installer-selected Caddyfile path may be supplied.
- Accept only root-owned `/opt/askrigor/active-https` as the selection symlink. Its target must contain no additional symlink and all target-path components below root-owned `/opt/askrigor/releases/https/` must not be group/world writable.
- The bootstrap responds 204 for apex HTTPS and does not publish static content. It requires apex A=`191.215.38.123`, no AAAA, valid `askrigor.com` certificate SAN, and healthy loopback/public MCP before and after Caddy recreation.
- Preserve sanitized evidence only. Do not change `www`, perform portal work, or claim public plugin submission.

---

### Task 1: Bootstrap utility and local contract

**Files:**
- Create: `ops/public-site/bootstrap-apex-tls.sh`
- Modify: `scripts/create-public-site-archive.sh`
- Modify: `tests/public-site-deployment.test.ts`

**Interfaces:**
- Consumes: `bootstrap-apex-tls.sh <expected-apex-ipv4>`, `/opt/askrigor/compose.yaml`, `/opt/askrigor/active-https`, and `/opt/askrigor/releases/https/`.
- Produces: root-owned `/opt/askrigor/site/bootstrap/<revision>/` state/evidence, a valid apex certificate, a temporary HTTPS 204 response, and an unchanged `research-mcp` ID.

- [ ] **Step 1: Write failing tests**

Extend the deployment test to load the new script. Require a usage string for one expected IPv4 argument, an `askrigor.com` block with `respond "" 204`, clean `env -i` Compose execution, Caddy-only force recreation, and no `runtime.env`, `YOUTUBE_API_KEY`, or `NCBI_API_KEY` string. Source the helpers to prove only A `191.215.38.123` plus no AAAA passes; wrong or duplicate A and any AAAA fail; a certificate without `DNS:askrigor.com` fails; HTTPS 204, HTTP 308-to-HTTPS, no HTTPS Server header, unchanged MCP ID, and both 200 MCP health probes are required; a failed post-recreation probe rolls back only Caddy. Require bootstrap script membership in new archives.

- [ ] **Step 2: Capture RED**

Run `npm run test:run -- tests/public-site-deployment.test.ts`. Expect failure because the script and helper functions do not exist. Record exact output.

- [ ] **Step 3: Implement bootstrap utility**

Create a self-contained root-only Bash script using `set -Eeuo pipefail`. Require Docker, Compose v2, curl, dig, openssl, realpath, and sha256sum. Reuse the normal installer’s raw selector-chain validation, pin `base_compose=/opt/askrigor/compose.yaml`, `https_compose=$resolved_https_compose`, and `production_caddyfile=$resolved_production_caddyfile`, and reject any non-root/writable/intermediate link condition. Discover exactly one Caddy container matching the two validated Compose config-file labels. Extract only the two named public Caddy environment variables, reject zero/duplicate/unexpected/malformed values, and require hostname `mcp.askrigor.com` and direct-DNS mode `true`. Build all Compose execution with `env -i`, fixed PATH/HOME, those two in-memory public values, and the selected Caddyfile path.

- [ ] **Step 4: Implement transaction and acceptance**

Require DNS and pre-change MCP health, save the MCP container ID, create a root-0700 unique bootstrap directory, and create a root-0400 combined Caddyfile from the pinned MCP Caddyfile plus a bodyless `askrigor.com` 204 block that removes Server. Validate it with the pinned Caddy image. Arm an ERR trap before recreating only Caddy. On error restore the original resolved Caddyfile via the same clean Compose runner, recreate only Caddy, and recheck MCP health. On success, fresh external checks must require HTTPS 204, HTTP 308 to apex HTTPS, no HTTPS Server header, certificate SAN with `DNS:askrigor.com`, unchanged MCP ID, and both MCP health URLs 200. Store only DNS answers, status codes, certificate SAN/dates/fingerprint, header/body hashes, and container IDs under root-owned evidence.

- [ ] **Step 5: Verify and commit**

Run `bash -n ops/public-site/bootstrap-apex-tls.sh`, `bash -n ops/public-site/install-public-site.sh`, `npm run test:site-deploy`, `npm run test:site`, and `git diff --check`. Commit only bootstrap, archive creator, and test changes as `ops: add reversible apex TLS bootstrap`.

---

### Task 2: Audited live bootstrap, activation, and evidence

**Files:**
- Modify: `docs/release-evidence-v0.1.0.md`
- Create (ignored report): sanitized archive/bootstrap/activation evidence references

**Interfaces:**
- Consumes: Task 1 commit, verified SSH, DNS A `191.215.38.123`, and `/opt/askrigor/site/staging/`.
- Produces: a valid apex certificate, active root-owned site release, four canonical page routes returning 200, and unchanged MCP.

- [ ] **Step 1: Rebuild and inspect packet**

Run the site validator and deterministic archive creator from Task 1 HEAD. Verify its sidecar from a different temporary directory, list all members, and reject decompressed private-key markers, provider-key names, `.env`, `.app.json`, runtime environment names, or `191.215.38.123`. Record commit, size, archive hash, installer hash, and bootstrap hash.

- [ ] **Step 2: Stage without activation**

Upload only archive, sidecar, installer, and bootstrap utility to a new root-owned mode-0700 path under `/opt/askrigor/site/staging/`; archive/sidecar become 0400 and executables 0700. Verify root ownership, regular non-symlink type, hashes, unchanged site-current state, active HTTPS selector, and MCP health.

- [ ] **Step 3: Bootstrap exactly once**

Capture sanitized preflight (DNS, HTTP/TLS state, Caddy/MCP IDs, listeners, MCP health), execute the staged bootstrap with `191.215.38.123`, and capture sanitized result/evidence. On nonzero exit verify rollback and stop. On success require valid certificate, 204, expected redirect, unchanged MCP ID, and both MCP health probes.

- [ ] **Step 4: Activate site exactly once**

Only after bootstrap success, run the staged normal installer with staged archive, sidecar, and unique revision. On failure record rollback and stop. On success require immutable root-owned release/current link, Caddy-only recreation, unchanged MCP ID, and normal installer health/route checks.

- [ ] **Step 5: Independently accept and document**

From VPS and external fresh connections require four canonical `https://askrigor.com` routes 200 with exact title/canonical/privacy/support fragments; every HTTP counterpart redirects to its same HTTPS route; same-origin stylesheet, security headers, no HTTPS Server header, no mixed content/unrelated redirect/key-like output, public 22/80/443 only, loopback-only 3000, valid apex certificate, MCP health 200, and MCP endpoint transport response. Update only legal-URL/site-deployment evidence in `docs/release-evidence-v0.1.0.md`; preserve routine-status, portal, Scan Tools, and public-submission gates as open. Commit as `docs: record apex site activation evidence`.
