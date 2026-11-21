# Gemini's sign-in: AskRigor's own authorization server for Google's Gemini app

Status: design v1, 21 Nov 2026, for red team (Codex, read-only) before the build. Owner decision: question 386,
answer **386b** (20 Nov 2026, 23:25 UTC): "Build Gemini's sign-in now: AskRigor's server checks Google's signed key
itself and uses Auth0 only for the person's own login." Nothing reaches production before the owner's typed release.

## 1. The problem, with what was verified

- On 20 Nov 2026 a person added `https://mcp.askrigor.com/mcp` as a custom connector in the Gemini app (Android).
  Auth0 refused every try: `Unknown client: https://accountlinking.google.com/clientidmetadata/user_bound_provider/user_bound_custom-mcp-<id>`.
- Fetched 21 Nov 01:46 UTC, Google's Client ID Metadata Document (CIMD) for that connector has: `client_id` equal to its
  URL; `client_name` "Google"; six `redirect_uris`, `https://oauth-redirect{,-sandbox,-test}.googleusercontent.com/{r,a}/user_bound_custom-mcp-<id>`;
  `token_endpoint_auth_method` `private_key_jwt`; `token_endpoint_auth_signing_alg` `RS256`;
  `jwks_uri` `https://www.gstatic.com/account-linking/.well-known/client-assertion-signature-verification-key.json`;
  `grant_types` `authorization_code`, `refresh_token`; `response_types` `code`; `scope` copied from our metadata
  (`research:use cases:review`). Served `no-store`.
- The JWKS at that `jwks_uri` holds five RSA `sig` keys, `alg` RS256, `kid`s set, `cache-control: max-age=3000`.
- Auth0 cannot accept it on any plan: `private_key_jwt` for CIMD clients is Enterprise-only, and Auth0 requires the
  `jwks_uri` on the CIMD URL's own origin (Google's is on www.gstatic.com).
- What Gemini saw from Auth0 (its RFC 8414 metadata, read 21 Nov): `client_id_metadata_document_supported: true` and
  **no** `registration_endpoint`. Gemini still went ahead with its CIMD client id. Google's own guide
  ([OAuth 2.1 implementation guide](https://developers.google.com/connected-apps/mcp/oauth)) says a
  `registration_endpoint` is required "even if your server supports Client ID Metadata Documents"; the Auth0 evidence
  shows the Gemini app does not need it. Decision: copy the configuration Gemini is proven to use (CIMD on, no
  registration endpoint). Fallback if the first live test shows Gemini asking for registration: section 11.
- Google's guide also says: PKCE is mandatory; allowlist the six redirect patterns; revocation is optional and Google
  "will make a POST request to the /revoke endpoint containing the Access or Refresh token" on unlink; and for
  refresh: "you must avoid rotating the Refresh Token ... return the exact same Refresh Token in the JSON response".
  Its discovery note: Gemini stops at the first metadata URL that answers, an error included, and a 404 or 500 ends
  discovery.

## 2. Library: panva's `oidc-provider`, with `oauth4webapi` for the Auth0 login

Chosen: **`oidc-provider` 9.15.0** (exact pin) as the authorization server, and **`oauth4webapi` 3.8.8** (exact pin)
for AskRigor's own login to Auth0. `jose` (already a dependency, same author) stays for everything else.

Why `oidc-provider`:
- It is an OpenID Certified authorization server by the author of `jose`, maintained weekly; its 2026 changelog is
  dense with security hardening of exactly the parts this needs (CIMD URL rules, exact redirect comparison, strict JWT
  decoding, audience members, client-auth replay expiry, atomic consumption guidance).
- It already implements every hard part of this flow: CIMD resolution (draft-03) with `allowFetch` and `allowClient`
  hooks, a 5,120-byte document limit, SSRF-safe fetching (an undici agent that refuses private and loopback addresses,
  2.5 s timeout), a bounded cache and coalesced fetches; `private_key_jwt` per RFC 7523 (alg pinned to the client's
  `token_endpoint_auth_signing_alg`, `exp`, `jti`, `iss` = client id, client looked up by `sub`, `aud` checked, signature
  against the client's `jwks_uri`, `jti` single use through its ReplayDetection model); PKCE; exact `redirect_uri`
  matching; single-use codes; refresh tokens; RFC 7009 revocation; RFC 8707 resource indicators; RFC 9207 `iss` in
  the authorization response.
- `jose` + `oauth4webapi` alone would leave the authorization server itself (codes, PKCE, token endpoint, assertion
  checks, CIMD rules, revocation) as hand-built protocol code, which the brief rules out. `oauth4webapi` is a client
  library; it fits AskRigor's own login to Auth0 (state, nonce, PKCE, `iss` response parameter, ID token checks),
  replacing hand-written fetch code there.
- `@modelcontextprotocol/sdk`'s auth router (already a dependency) has no `private_key_jwt` client authentication.

Costs, accepted: `oidc-provider` brings `koa` 3 and `debug`; it has features we must switch off (section 4.6); its
CIMD support is marked experimental (an `ack` of `draft-03`); its adapter is ours to write (section 6).
Version choice: 9.15.0 (13 Nov, 8 days old) rather than 9.15.1 (20 Nov, 1 day old): a week of exposure guards against
a compromised release; 9.15.1's fixes do not touch this configuration (implicit-flow scopes, CIBA, rotation of refresh
tokens, deleted clients in introspection) except one, keeping a client's keys when a JWKS refresh fails, which only
affects availability. Re-check at release. `oauth4webapi` 3.8.8 (5 Sep) rather than 3.8.9 (20 Nov), same reason.

## 3. Addresses

- **Gemini users add `https://mcp.askrigor.com/mcp/gemini`.** That endpoint already serves Gemini's compact tool
  catalog. Its resource metadata, new at `/.well-known/oauth-protected-resource/mcp/gemini`, names AskRigor's own
  server: `{"resource":"https://mcp.askrigor.com/mcp/gemini","authorization_servers":["https://mcp.askrigor.com/oauth/gemini"],"scopes_supported":["research:use"],"bearer_methods_supported":["header"]}`.
- `/mcp` and `/mcp/claude` keep Auth0, unchanged. `/mcp` cannot tell Gemini from ChatGPT before sign-in, so a Gemini
  user who adds `/mcp` still meets Auth0's error page; the "Add AskRigor" page tells Gemini users the right address.
- **Issuer `https://mcp.askrigor.com/oauth/gemini`** (a path, so the origin's root metadata URLs stay 404 as today and
  no existing client can meet the new server by accident). Its metadata answers 200 at all four discovery forms:
  `/.well-known/oauth-authorization-server/oauth/gemini` (RFC 8414), `/.well-known/openid-configuration/oauth/gemini`
  (MCP's path-insertion form), `/oauth/gemini/.well-known/openid-configuration` (OIDC Discovery) and
  `/oauth/gemini/.well-known/oauth-authorization-server` (the form Google's guide describes).
- Endpoints under the issuer: `/oauth/gemini/auth` (authorization), `/oauth/gemini/token`,
  `/oauth/gemini/token/revocation`, `/oauth/gemini/jwks` (empty of use; the library serves it), and AskRigor's own
  `/oauth/gemini/interaction/<uid>` (login and consent steps) and `/oauth/gemini/callback` (Auth0's return).

## 4. The flow

1. Gemini reads `/.well-known/oauth-protected-resource/mcp/gemini`, then the issuer's metadata, then sends the person's
   browser to `/oauth/gemini/auth?response_type=code&client_id=<CIMD URL>&redirect_uri=<Google>&code_challenge=…&code_challenge_method=S256&state=…&scope=…[&resource=https://mcp.askrigor.com/mcp/gemini]`.
2. The library resolves the client from its CIMD URL (4.1), checks the redirect against the document exactly, requires
   PKCE S256, and sends the browser to `/oauth/gemini/interaction/<uid>`.
3. **Login.** AskRigor sends the browser to Auth0 `/authorize` with its own regular web application (4.4):
   `response_type=code`, `scope=openid`, the Auth0 `userinfo` audience (so no AskRigor API token is ever issued by
   Auth0 here), `state`, `nonce`, PKCE S256, `redirect_uri=https://mcp.askrigor.com/oauth/gemini/callback`. The login
   state (state, nonce, verifier, interaction uid, expiry 10 min) travels in a sealed, HttpOnly, Secure,
   SameSite=Lax cookie scoped to `/oauth/gemini/callback`.
4. **Callback.** `oauth4webapi` checks `state` and the `iss` parameter, exchanges the code with the client secret and
   the verifier, and validates the ID token (issuer = the tenant AskRigor already trusts, audience = that application,
   `nonce`, `exp`, RS256 against the tenant's JWKS). Only `sub` is kept. The interaction finishes with the login.
5. **Consent page** (AskRigor's own HTML, no script, `frame-ancestors 'none'`): "Google Gemini wants to run AskRigor
   research as you", what it allows (research with your AskRigor account and its limits; not your owner review tools),
   the client host `accountlinking.google.com`, Allow and Cancel. The form POSTs to the same interaction URL with a
   hidden token bound to the interaction uid (HMAC), and the server also requires the request's `Origin` to be
   `https://mcp.askrigor.com`. Allow creates a Grant for exactly resource `https://mcp.askrigor.com/mcp/gemini` and
   scope `research:use`; Cancel ends with `access_denied`.
6. The library redirects to Google's `redirect_uri` with `code`, `state`, `iss`. Codes live 60 s and are single use.
7. **Token.** Google's backend POSTs `/oauth/gemini/token` with the code, `redirect_uri`, `code_verifier` and its client
   assertion. The library authenticates the client (4.2), checks the code, PKCE and redirect, and returns an opaque
   access token (1 hour, bound to the resource, the connector's client id and the person) and a refresh token.
8. **Calls.** Gemini calls `/mcp/gemini` with the access token. AskRigor looks it up in its store (4.5) and hands the
   tools the same identity shape as an Auth0 token on `/mcp`.
9. **Refresh**: same token endpoint, a new client assertion each time; a new access token; the refresh token is
   returned unchanged (4.3). **Revocation**: RFC 7009 at `/oauth/gemini/token/revocation`.

### 4.1 Which clients are accepted (CIMD)

- `allowFetch(clientId)`: only an exact match of
  `^https://accountlinking\.google\.com/clientidmetadata/user_bound_provider/user_bound_custom-mcp-[A-Za-z0-9_-]{8,64}$`.
  Anything else is refused before any fetch (no SSRF surface: one fixed Google host). The library adds its own URL
  rules (https, a path, no dot segments, no fragment, no credentials, no raw spaces).
- The library fetches with redirects off, a 2.5 s timeout and the 5,120-byte limit, requires `client_id` to equal the
  URL, refuses shared-secret methods and any `client_secret`, and caches within `cacheDuration` 30 s to 1 hour.
- `allowClient(client)` (run on every use, cached or not), all must hold:
  - `token_endpoint_auth_method` is `private_key_jwt` and `token_endpoint_auth_signing_alg` is `RS256`;
  - `jwks_uri` is exactly the gstatic URL above, and the document carries no inline `jwks`;
  - every redirect URI is exactly `https://oauth-redirect{,-sandbox,-test}.googleusercontent.com/{r,a}/<the same
    user_bound_custom-mcp-<id> as the client id>`; at least one;
  - `response_types` is `code` only and `grant_types` is within `authorization_code` and `refresh_token`.
- The document's `logo_uri` and `client_name` are never shown; the consent page names Google from the verified host.

### 4.2 Google's client assertion (RFC 7523), at the token and revocation endpoints

The library: `client_assertion_type` must be `urn:ietf:params:oauth:client-assertion-type:jwt-bearer`; the client is
found by the assertion's `sub`; header `alg` must equal the client's `RS256`; `exp`, `jti`, `iss` required; `iss` must
equal the client id; `aud` must be the endpoint URL, the issuer identifier or the token endpoint URL; the signature is
verified against the keys at the client's `jwks_uri` (fetched and cached by the library, refreshed on an unknown
`kid`); clock tolerance 30 s; then `jti` is recorded until `exp` and a second use is refused.
AskRigor's extra check (`assertJwtClientAuthClaimsAndHeader`):
- `sub` must equal `iss`;
- `aud` must be a single string or an array whose **every** member is one of AskRigor's accepted values (the library
  accepts an array where any one member matches; requiring all closes the audience-injection shape where an assertion
  minted for several servers is replayed at one of them);
- `exp` no more than 1 hour (+30 s) after the server's clock, so a stolen assertion and the replay record are bounded;
  `iat`, when present, not more than 30 s in the future; `nbf`, when present, honored by the library's verify.
- The ReplayDetection store's insert is atomic (insert if absent, refuse an unexpired duplicate), as the library's
  documentation requires against concurrent replay.

### 4.3 Tokens

- Access tokens: opaque (library-generated random, 256 bits), 1 hour, audience
  `https://mcp.askrigor.com/mcp/gemini`, scope `research:use` only (a `cases:review` request is dropped: Gemini gets
  research, not the owner's review tools). Bearer, Authorization header only (`acceptQueryParamAccessTokens` off).
- Refresh tokens: issued to every accepted Gemini client (it holds the `refresh_token` grant type; `offline_access` is
  not required, as Google never asks for it). **Not rotated** (`rotateRefreshToken: false`), absolute lifetime 180 days,
  bound to the client id and the grant. This departs from "rotating refresh tokens" in the brief on purpose:
  Google's guide asks servers not to rotate, rotation's protection (RFC 9700 4.14) is for public clients, and every
  refresh here needs a fresh single-use assertion signed by Google's private key, so a stolen refresh token alone is
  useless. `expiresWithSession` returns false, so tokens never die with the short login session.
- Revocation: revoking a refresh token or access token revokes the whole grant (`revokeGrantPolicy` true), which
  removes every token of that link. Google's revoke call must authenticate like the token call (library default); if
  Google sends it without an assertion, it fails and the tokens lapse at expiry (stated as a limit).
- Codes: 60 s, single use; a second use revokes the grant's tokens (library default).

### 4.4 AskRigor's own login through Auth0

- A regular web application in the existing tenant, `openid` only, `userinfo` audience, client secret and PKCE.
  Default: **reuse the Atlas's application** (`ASKRIGOR_ATLAS_AUTH0_CLIENT_ID`/`_SECRET`, already on the server) and
  add one allowed callback, `https://mcp.askrigor.com/oauth/gemini/callback`, in Auth0. Alternative: a separate
  application through `ASKRIGOR_GEMINI_LOGIN_CLIENT_ID`/`_SECRET` (then those win). The owner chooses at release.
- The ID token's `sub` is the same `sub` the person's ChatGPT or Claude sign-in carries, so the research account,
  its notice, its limits and the owner's own account are the same ones.

### 4.5 What `/mcp/gemini` accepts

- With the Gemini server on: a bearer token is looked up in the Gemini token store first. A token found there must be
  an AccessToken, unexpired, for audience `https://mcp.askrigor.com/mcp/gemini`, of a client that passes `allowFetch`,
  with `research:use`. The tools then receive `{ token, clientId: <CIMD URL>, scopes: ["research:use"], expiresAt,
  resource: <gemini URL>, extra: { subject: <Auth0 sub> } }`, the same shape `/mcp` gives them, so every research-access
  rule (notice, account mode, limits, owner subject, call record) applies unchanged.
- A token that is not in the store but is a JWT goes to the existing Auth0 check, exactly as `/mcp/gemini` accepts
  today (so nothing that works there now stops working). Gemini tokens are never accepted on `/mcp` or `/mcp/claude`.
- Tool challenges on `/mcp/gemini` point at the new resource metadata instead of `/mcp`'s.
- Refusals keep the existing fixed classes (`expired`, `invalid_claims`, `unverifiable` for a store failure).

### 4.6 Library configuration (production)

`clients: []`; `clientAuthMethods: ['private_key_jwt']`; `enabledJWA.clientAuthSigningAlgValues: ['RS256']`;
`responseTypes: ['code']`; `pkce.required: () => true` (S256 only); `scopes: ['openid','offline_access']` (statics,
never granted here); `features`: `clientIdMetadataDocument` on (ack `draft-03`), `resourceIndicators` on (one resource,
default and only), `revocation` on; **off**: `devInteractions`, `userinfo`, `rpInitiatedLogout`, `introspection`,
`registration`, `deviceFlow`, `clientCredentials`, `ciba`, `pushedAuthorizationRequests`, `requestObjects`, `dPoP`,
`claimsParameter`, `jwtResponseModes`, `jwtUserinfo`, `encryption`, `webMessageResponseMode`, `backchannelLogout`,
`richAuthorizationRequests`, `openid4vci`, `attestClientAuth`, `mTLS`, `rpMetadataChoices`, `externalSigningSupport`.
`ttl`: Session and Interaction 10 min, AuthorizationCode 60 s, AccessToken 1 h, RefreshToken and Grant 180 days.
`cookies.keys` from the server secret; `proxy = true` (Caddy terminates TLS); `renderError` a fixed AskRigor page that
never reflects request text. An ephemeral ES256 key satisfies the library's keystore (nothing it signs is used: no ID
tokens, JWT access tokens or signed responses are issued).

## 5. Which requests reach the library

`server.ts` sends a request to the library only when its exact path is one of the routes above or the four metadata
forms (rewritten to the library's discovery route), after the existing per-IP rate limit. All other paths behave as
today. The library parses its own bodies (the MCP body reader never runs on these paths).

## 6. What is stored, and how

One new table, `living_evidence.gemini_oauth_store` (migration `0034_gemini_oauth_store`), for every library model
(Session, Interaction, AuthorizationCode, AccessToken, RefreshToken, Grant, ReplayDetection):
- `key`: HMAC-SHA-256 of `model:id` under a key derived from `ASKRIGOR_GEMINI_OAUTH_SECRET`; the token value itself
  (which is the library's id for opaque tokens and codes) is never stored.
- `payload`: AES-256-GCM of the library's JSON, with `model` and `key` as associated data (a row cannot be moved to
  another row). The Auth0 `sub` (the payload's `accountId`) is therefore stored only encrypted.
- `grant_key`, `uid_key`: HMACs for the library's revoke-by-grant and session-by-uid lookups.
- `expires_at`, `consumed_at`. `consume` is one `UPDATE … WHERE consumed_at IS NULL` that must change a row;
  ReplayDetection's insert is `INSERT … ON CONFLICT DO UPDATE … WHERE expires_at < now()` that must change a row.
- An hourly sweep deletes expired rows. A Grant lives at most 180 days; every row of a link goes when it is revoked.
- Grants: `askrigor_research_access` gets SELECT, INSERT, UPDATE, DELETE on this table only; the canonical reader and
  PUBLIC get nothing. A leaked database alone yields no usable token and no subject; the secret alone yields nothing.

## 7. Configuration and rollback

- On only when `ASKRIGOR_GEMINI_OAUTH=enabled`, OAuth is on, the research-access database is configured, and
  `ASKRIGOR_GEMINI_OAUTH_SECRET` (at least 32 random bytes, base64url) is set; otherwise every new path is 404 as today.
- Rollback: unset `ASKRIGOR_GEMINI_OAUTH` and recreate the service. Links stop working at once; the table stays for a
  later re-enable or is dropped by a written step.

## 8. Threat model

| Threat | Mitigation |
|---|---|
| Forged client assertion | RS256 signature against Google's JWKS only (the client's `jwks_uri`, pinned by `allowClient`); `alg` pinned; library rejects `none`/HS*. Test: an assertion signed by another key. |
| Replayed assertion | `jti` single use until `exp` (atomic insert); `exp` at most 1 h ahead. Test: same assertion twice. |
| Assertion for another server, or minted for several | `aud` must be ours, every member. Test: foreign `aud`, mixed array. |
| A client id on another host, or a lookalike path | `allowFetch` exact regex on one Google host; no fetch otherwise. Test. |
| Document altered to add a redirect or a key URL | `allowClient`: redirects must be Google's six forms with the same connector id; `jwks_uri` exact; no inline `jwks`. Tests. |
| Wrong redirect | Exact match against the document's list (library); an unregistered redirect gets an error page, never a redirect. Test. |
| Missing PKCE, or `plain` | `pkce.required` true; only S256. Tests. |
| Stolen code | 60 s, single use, PKCE verifier and client assertion both required; reuse revokes the grant. Test. |
| Someone else's connector linked to a victim's account (a link sent to a victim) | Consent page naming Google Gemini and what it grants; the victim must click Allow; Google's redirect handler is bound to its own session. Limit stated: a person who clicks Allow on a link someone sent them links that person's connector. |
| CSRF on the consent POST | SameSite=Lax interaction cookie (a cross-site POST carries none), HMAC form token bound to the uid, `Origin` check. Test. |
| Login CSRF on the Auth0 callback | `state` and `nonce` from a sealed cookie scoped to the callback, PKCE to Auth0, `iss` checked. Test. |
| Clickjacking of the consent page | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| Open redirect through errors | CIMD failures never redirect (library); our error page is fixed text. |
| Token theft from the database | Only HMACs of tokens stored; payloads encrypted; subjects encrypted. |
| Tokens in logs | No request logs (existing promise); the library's events are not attached; an opt-in diagnostic flag logs only fixed stage and error codes. |
| Gemini token used on `/mcp` or `/mcp/claude`, or an Auth0 token treated as Gemini's | Separate resource; `/mcp` and `/mcp/claude` never consult the Gemini store; the store only answers for tokens it issued. Test. |
| Refresh token stolen | Useless without Google's private key (assertion every refresh); revocable; 180 days at most. |
| DoS through CIMD and JWKS fetches | Fetches only to Google's two hosts, cached, coalesced, size and time bounded; per-IP rate limit on every new path. |
| Spoofed `X-Forwarded-*` | `proxy = true` only behind Caddy; the service port is not published (checked at release). |
| Google's signing key compromised, or Google's CIMD service | Out of AskRigor's control; revocation by unsetting the flag. |
| A person's research data reaching Google | Unchanged: Gemini already receives what the tools return to it; the token carries no subject (opaque). |

## 9. Privacy

New stored data: the encrypted Gemini link (Auth0 `sub`, connector client id, grant, scopes, times), HMACs of codes and
tokens, the assertion replay record (an HMAC of issuer and `jti`, until `exp`), and 10-minute login sessions. Not
stored: email or profile (not requested), raw tokens, the assertion itself, Google's document (memory cache only).
Both `docs/privacy-data-map.md` and the public privacy page gain this, with retention (codes 60 s, access tokens 1 h,
links 180 days or until revoked, sessions 10 min) and that Google's documents and keys are fetched from Google.

## 10. Tests (all hermetic: an in-memory store with the same atomic semantics, a fake Google signing key and fake
document served through the library's `fetch` option, a fake Auth0)

The four the brief names: a forged assertion, a reused `jti`, a wrong redirect, a missing PKCE. Also: `plain` PKCE;
wrong verifier; code reuse; foreign client host; a document with an extra redirect, another `jwks_uri`, inline `jwks`,
`client_secret_post`; `aud` foreign, mixed array, issuer and token endpoint accepted; `exp` too far; `sub` ≠ `iss`;
the full flow (authorize, Auth0 login, consent, token, `/mcp/gemini` call that reaches the research tools with the
right subject); refresh returns the same refresh token; revocation ends the link; a Gemini token refused on `/mcp`
and `/mcp/claude`; consent POST without the form token or with a foreign `Origin`; the four metadata forms and the
resource metadata; the switch off leaves every path as today; the store's encryption, AAD and HMAC keys; the frozen
tool lists unchanged.

## 11. Unknowns, and what the first live test decides

- Which `aud` Google puts in its assertion (issuer or token endpoint): both are accepted.
- Whether Google's revoke call carries an assertion.
- Whether the Gemini app wants a `registration_endpoint` after all. If it does, the fallback is a registration
  endpoint that answers every request with `invalid_client_metadata`, which no Gemini flow that uses CIMD reaches.
- Google forum reports (Gemini Spark, 2026) of Gemini never exchanging the code after the redirect: a Gemini-side
  failure AskRigor cannot fix; the opt-in diagnostics would show whether the token call ever arrives.
