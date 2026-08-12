# AskRigor Public Website and Legal Pages Design

**Date:** 2026-08-11  
**Status:** Approved for implementation planning  
**Publisher identity:** AskRigor  
**Public contact:** joel@askrigor.com

## Objective

Publish a small, accurate, publisher-matching website at `https://askrigor.com`
that satisfies the existing AskRigor v0 public-review gate without changing the
deployed MCP service at `https://mcp.askrigor.com/mcp`. The release must replace
the current unrelated redirect with four stable HTTPS pages:

- `/` — service overview;
- `/privacy` — public privacy notice;
- `/terms` — terms of use;
- `/support` — support and security contact.

The pages identify the publisher as **AskRigor** and use
`joel@askrigor.com` for support, privacy, and security contact. They do not
claim a legal company name, postal address, jurisdiction, certification, or
regulatory status that the user has not supplied.

## Chosen approach

Serve a static, dependency-free site from the existing VPS through Caddy. Keep
the site in its own root-owned release directory and Caddy site block. Do not
embed it in the Node MCP application, expose application port 3000, add a
database, or introduce a hosted-site-builder dependency.

This approach gives the public pages a small attack surface and lets the site
be deployed or rolled back independently of the research service. Static HTML
and CSS also remain usable when JavaScript is disabled.

## Information architecture and content

### Home

The home page explains that AskRigor is a read-only research retrieval service
for canonical protocols, scholarly metadata, clinical-trial records,
retraction/citation evidence, and API-visible public YouTube metadata and
comments. It links to the production MCP endpoint and the three public policy
pages. It states that AskRigor does not diagnose, treat, prescribe, replace
professional advice, or guarantee that provider data is complete or current.

### Privacy

The privacy notice is a public-facing rendering of the verified data boundary
in `docs/privacy-data-map.md`. It must disclose, in plain language:

- request inputs such as queries, record identifiers, date ranges, YouTube
  URLs/video IDs, and pagination cursors;
- scholarly, trial, provenance, protocol, retraction, and completeness data
  returned to the connected client;
- public YouTube video metadata and public comment/reply data, including public
  author/channel IDs, optional display names, comment text, timestamps, likes,
  and reply relationships;
- that public YouTube identity and comment data can still be personal data;
- that necessary requests are sent to NCBI/PubMed, Europe PMC,
  ClinicalTrials.gov, Crossref, and YouTube Data API v3 under those providers'
  own policies;
- that the response is returned to the invoking client, which may retain it
  under its own terms;
- that AskRigor v0 has no user accounts, profiles, research-history database,
  transcript store, raw-provider-payload store, or application-level content
  log;
- that request data is handled in memory for the active request and that the
  application does not persist queries, records, public YouTube identities, or
  comments;
- that infrastructure may process limited operational metadata such as time,
  route, status, latency, IP/network data, and security signals, without raw
  MCP request or response bodies or provider credentials;
- security, data-minimization, API-visible-only, and access-failure boundaries;
- how to make a privacy request through `joel@askrigor.com`, with identity or
  scope verification where reasonably necessary;
- an effective date and a commitment to update the notice when processing
  materially changes.

The notice must not promise deletion from upstream providers or connected
clients that AskRigor does not control. It must not claim a specific statutory
legal basis or jurisdiction without verified publisher details.

### Terms

The terms cover permitted lawful use of the read-only research service,
prohibited abuse and attempts to evade limits, no write actions, provider and
network dependencies, incomplete or unavailable evidence, no medical/legal/
financial advice, user responsibility for consequential decisions, public
third-party content, intellectual-property boundaries, service changes or
suspension, warranty and liability limitations to the extent permitted by
applicable law, severability, and contact by email.

The terms do not invent governing law, arbitration, age thresholds, paid
service commitments, uptime guarantees, or an incorporated entity.

### Support

The support page directs product, privacy, accessibility, and security reports
to `joel@askrigor.com`. It asks reporters not to email secrets, API keys, health
records, or large public-comment corpora. It explains what diagnostic details
are useful, gives no fixed response-time guarantee, and directs emergencies and
urgent medical concerns to appropriate local services rather than AskRigor.

## Presentation

Use a restrained editorial design suitable for a research product: a warm
off-white background, dark high-contrast text, a muted blue accent, generous
line spacing, and a readable system-font stack. The home page may use a compact
hero and capability cards; legal pages prioritize a narrow reading column,
semantic headings, lists, and visible effective dates.

Every page includes the same header navigation and footer. The layout must work
at 320-pixel width, preserve visible keyboard focus, respect reduced-motion and
dark-mode preferences, meet WCAG AA color contrast, and remain fully functional
without JavaScript. No tracking, analytics, cookies, remote fonts, third-party
scripts, forms, images, or generated personal data are needed for v0.

## Deployment architecture

The repository will contain the source pages, shared stylesheet, validation
tests, and an audited deployment script or runbook. A release archive is built
from tracked site files, checksummed locally, copied to the VPS, and installed
under a root-owned immutable directory such as
`/opt/askrigor/site/releases/<revision>`. A stable symlink selects the active
release.

Caddy receives an isolated site block for `askrigor.com` and, if its DNS is
configured, `www.askrigor.com`. The apex domain is canonical; `www` redirects to
the equivalent apex HTTPS URL without dropping the path or query. Caddy serves
only the static release and continues to proxy `mcp.askrigor.com` exactly as it
does before the deployment.

Required response policy includes HTTPS, an HTML/CSS-only Content Security
Policy, `X-Content-Type-Options: nosniff`, a conservative referrer policy,
clickjacking protection, and a permissions policy that disables unused browser
capabilities. HSTS is enabled only after HTTPS succeeds for the intended host;
the design does not preload or include subdomains because that would broaden
the commitment to unrelated DNS names.

## Transaction and rollback

Before mutation, capture the active Caddy configuration, currently selected
site release, current DNS answers, and live MCP health. Validate the new Caddy
configuration before reloading it. The deployment must stage and verify the new
release before changing the active symlink, then reload Caddy and run health
checks.

If any content, TLS, redirect, header, or MCP check fails, restore the previous
site selection and Caddy configuration, reload, and verify MCP health again.
Never read, print, copy, or modify the YouTube or provider keys. Never recreate
the MCP container for a static-site deployment.

If apex DNS or registrar forwarding still points away from the VPS and cannot
be changed with the available authorized access, finish the verified VPS stage
and stop with the exact required DNS/forwarding change rather than weakening
TLS or publishing at a substitute URL.

## Verification and acceptance

Local checks must validate:

- exactly the four required routes and shared local assets;
- valid semantic HTML, unique titles/descriptions, navigation, email contact,
  effective dates, canonical URLs, and no placeholders;
- required privacy disclosures, especially public YouTube identity/comment
  processing, provider sharing, retention, and connected-client boundaries;
- no remote scripts, trackers, cookies, forms, secrets, repository internals,
  or misleading legal/company claims;
- shell/Caddy syntax and a dry-run or fixture deployment contract;
- responsive and accessibility-related markup/style invariants.

Live acceptance requires:

1. `https://askrigor.com/`, `/privacy`, `/terms`, and `/support` each return
   direct HTTPS 200 responses with the intended AskRigor content and no
   unrelated redirect.
2. HTTP redirects to the equivalent HTTPS route.
3. TLS identity, security headers, canonical links, cross-page navigation, and
   email links are correct.
4. `https://mcp.askrigor.com/healthz` remains healthy and `/mcp` retains its
   expected transport behavior.
5. No provider secret or internal deployment path appears in page source or
   headers.
6. The release evidence and public-review documents are updated only after the
   live checks pass; manifest legal/support URLs are added only after their
   content and HTTPS identity are verified.

## Scope exclusions

This release does not submit or publish the plugin listing, alter billing,
create a legal entity, provide legal advice, add a CMS, collect support-form
submissions, add authentication, change MCP tool behavior, expose secrets, or
redesign the protocol documents. ChatGPT end-to-end connector presentation is
a separate remaining Task 15 gate.
