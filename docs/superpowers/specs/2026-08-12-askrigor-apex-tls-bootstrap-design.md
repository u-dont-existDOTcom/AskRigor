# AskRigor apex TLS bootstrap design

**Date:** 2026-08-12

## Purpose

Establish a valid public TLS certificate for `askrigor.com` after the authorized
Porkbun DNS cutover, without exposing the staged public site or changing the
existing AskRigor MCP service. The normal public-site installer then performs
the immutable release activation and four-route acceptance checks.

## Verified starting state

- `askrigor.com` now has one A record, `191.215.38.123`, and no AAAA record.
- HTTP for the apex reaches that VPS and redirects to HTTPS.
- Apex HTTPS currently fails because the live Caddy configuration only serves
  `mcp.askrigor.com`.
- The MCP is healthy at `https://mcp.askrigor.com/healthz`; the application is
  loopback-bound on port 3000 and Caddy is the only public proxy.
- The immutable public-site release for source commit `b83448d71fbc` is staged
  root-owned and hash-verified under
  `/opt/askrigor/site/staging/site-b83448d71fbc-20260812T020000Z`.

## Chosen approach

Add a narrowly scoped, one-time `bootstrap-apex-tls.sh` deployment utility.
It builds a temporary combined Caddyfile from the validated current MCP
Caddyfile plus one `askrigor.com` block that returns HTTP 204. This gives Caddy
an apex host from which to obtain and serve the certificate while revealing no
site content. HTTP continues to redirect to HTTPS through Caddy's automatic
behavior.

The 204 response is deliberate: it proves a successful direct HTTPS request
and satisfies the normal installer’s existing HTTPS prerequisite, without
presenting the site before its transactional release activation.

## Trust and deployment model

The bootstrap utility will use the same verified live topology as the normal
installer:

```text
base Compose:             /opt/askrigor/compose.yaml
HTTPS selector:           /opt/askrigor/active-https
HTTPS release root:       /opt/askrigor/releases/https/
validated HTTPS Compose:  resolved selector target/compose.https.yaml
validated MCP Caddyfile:  resolved selector target/Caddyfile
```

Only the root-owned `active-https` selection symlink is permitted. Its raw
target path must contain no further symlink and every directory through its
resolved HTTPS release must be root-owned and not group/world writable. The
script pins all later source Caddyfile and Compose paths to these validated
resolved paths.

It identifies exactly one running Caddy container matching the validated Compose
files, reads only the allow-listed public Caddy variables from that container,
requires `ASKRIGOR_HOSTNAME=mcp.askrigor.com` and
`ASKRIGOR_DIRECT_DNS_ONLY=true`, and uses an `env -i` Compose environment with
those values plus a bootstrap-selected Caddyfile path. It never opens,
imports, prints, copies, or archives `runtime.env` or any provider credential.

## Transaction and rollback

Before any state change, the utility verifies the apex A/AAAA boundary, the
existing MCP health, root-owned secure production inputs, and the absence of an
existing bootstrap state. It writes the temporary Caddyfile at a new root-owned
state path, validates it through the pinned Caddy image, and arms an ERR trap
before recreating only the `caddy` Compose service.

After recreation it requires fresh external HTTPS connections to show a valid
certificate whose Subject Alternative Name includes `askrigor.com`, a 204 apex
response, the expected HTTP-to-HTTPS redirect, no `Server` header on the HTTPS
response, and unchanged healthy MCP loopback/public health. It also proves
that the `research-mcp` container ID is unchanged.

Any failure restores Caddy to the previously validated resolved MCP Caddyfile,
recreates only Caddy, rechecks MCP health, and preserves the root-owned
bootstrap evidence/state for diagnosis. It does not remove issued certificate
material from Caddy's existing managed volume.

## Boundaries and handoff

The bootstrap does not activate the staged site, create `/opt/askrigor/site/current`,
modify `research-mcp`, alter firewall/DNS/provider configuration, or change
`www`. A successful bootstrap is immediately followed by the existing reviewed
installer, which activates the immutable site release transactionally and
performs the canonical page and MCP checks.

Testing must include DNS/certificate probe helpers, secure selector validation,
strict public-variable extraction, Caddy-only Compose invocation, successful
204 acceptance, and rollback when each post-recreation check fails. The source
packet must remain static-site-only and contain no secrets.
