# Google Gemini connector: AskRigor's own sign-in

Owner answer 386b (20 November 2026). Design and threat model:
`docs/superpowers/plans/2026-11-21-gemini-sign-in-design.md` (v2, after Codex's red team).

Google's Gemini app names each custom connector by a Client ID Metadata Document on accountlinking.google.com that
authenticates with `private_key_jwt` (RS256) against Google's keys on www.gstatic.com. Auth0 refuses such a client on
every plan. So Gemini signs in through AskRigor's own authorization server, built on `oidc-provider` 9.15.0:

- **Address people add:** `https://mcp.askrigor.com/mcp/gemini` (Gemini's compact tool list). `/mcp` and `/mcp/claude`
  keep Auth0 and are unchanged; a Gemini user who adds `/mcp` still meets Auth0's error page.
- **Issuer:** `https://mcp.askrigor.com/oauth/gemini`, with metadata at all four discovery addresses, and resource
  metadata at `/.well-known/oauth-protected-resource/mcp/gemini` naming it.
- **Clients:** only `https://accountlinking.google.com/clientidmetadata/user_bound_provider/user_bound_custom-mcp-…`,
  whose document uses Google's key address, `private_key_jwt` with RS256, both grant types, and redirects only to
  Google's six addresses for the same connector (`apps/research-mcp/src/gemini-sign-in/google-client.ts`).
- **Login:** AskRigor's own regular web application in the Auth0 tenant, `openid` only, `prompt=login`; then a consent
  page. Only `research:use` on `/mcp/gemini` is ever granted.
- **After Allow or Cancel:** the form is answered with a page of AskRigor's own that goes on by itself (a meta refresh to
  the library's next step, and a link), never with a redirect. Chromium checks every hop of a form's redirect chain against the
  form page's `form-action`, and Google's relay redirects once more, to another Google address: with a redirect the browser
  stayed on the Allow page and Google never got the code (the owner's links of 22, 23 and 24 Nov 2026; the same failure and
  the same fix on Google's developer forum, "Gemini Spark custom MCP OAuth stops after 302 callback and never calls /token",
  15 Oct 2026). Reproduced in Chromium on 24 Nov 2026 with three local addresses.
- **Tokens:** opaque; access 1 hour, links (grant and refresh token, not rotated) 180 days. Stored encrypted in
  `living_evidence.gemini_oauth_store`, tokens only as HMACs (privacy data map, "Gemini's sign-in").
- **Ending a link:** Gemini's revocation call; `manage_research_access` action `disconnect_gemini` from any connected
  app; or switching the feature off (below). A password change at Auth0 does not end a link.
- **Resource:** an authorization request must carry exactly one `resource=https://mcp.askrigor.com/mcp/gemini`
  (Gemini sends `resource`); without it, or with another, it is refused before any login.
- **Research notice:** Gemini's tool list has no `manage_research_access`, so a person accepts AskRigor's research
  notice once in Claude or ChatGPT; a Gemini research call on an account without it says so.

## Settings

| Setting | Value |
|---|---|
| `ASKRIGOR_GEMINI_OAUTH` | `enabled` turns it on. Needs `ASKRIGOR_OAUTH_ENABLED=true` and the research-access database, or the server refuses to start. |
| `ASKRIGOR_GEMINI_OAUTH_SECRET` | 32 or more random bytes, canonical base64url (`openssl rand 32 \| basenc --base64url \| tr -d =`). Every key of the feature is derived from it; changing it ends every link. |
| `ASKRIGOR_GEMINI_LOGIN_CLIENT_ID` / `_SECRET` | Optional: a separate Auth0 application for this login. Without them, the Atlas's application (`ASKRIGOR_ATLAS_AUTH0_CLIENT_ID` / `_SECRET`) is used. |
| `ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS` | `enabled` writes the step log: one line per step of a link (request, login, consent, the code's issue, Google's token call, each research call that carries a token), each naming its stage, its outcome and fixed details only (which parameters and headers came, what kind of audience an assertion names, the library's own error code and word-for-word message, coarse time buckets; `diagnostics.ts` lists them). No id, code, token, client id, address, header value or account. Off by default; for live tests of a link. |

The issuer and resource come from `ASKRIGOR_OAUTH_RESOURCE_URL`'s origin; the Auth0 tenant from
`ASKRIGOR_OAUTH_ISSUER_URL` and `ASKRIGOR_OAUTH_JWKS_URL`.

## Auth0 (owner, once)

In the application this login uses (the Atlas's, or a new Regular Web Application), add the Allowed Callback URL
`https://mcp.askrigor.com/oauth/gemini/callback`. Nothing else changes in Auth0.

## Release steps

1. Migration `0039_gemini_oauth_store` (the usual migrate step), then rerun
   `infra/living-evidence-production/provision-research-access-role.sh`, which grants the research-access role this table.
2. Auth0 callback (above).
3. `ASKRIGOR_GEMINI_OAUTH_SECRET` generated on the host into `runtime.env` without printing it; `ASKRIGOR_GEMINI_OAUTH=enabled`.
4. Acceptance: the four metadata addresses and the resource metadata answer 200 with issuer
   `https://mcp.askrigor.com/oauth/gemini`; `/mcp/gemini` without a token still initializes; a made-up token gets 401
   naming `/.well-known/oauth-protected-resource/mcp/gemini`; then a real link from a Gemini app (the owner's or a
   tester's), a research call, and removing the connector in Gemini (does Google's revocation arrive and end the link?).
   With `ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled` for that test, the log shows each stage, a missing `resource` and
   the login's outcome (Auth0's `iss` response parameter is required: the tenant's metadata advertises it). Since
   23 Nov 2026 it also shows the steps after Allow: whether the code was issued to Google's address, whether Google's
   token call arrived and why it failed (for instance an assertion whose audience is not one of AskRigor's addresses),
   and each research call's token check. Read it with
   `ssh -n mission-control-secondary 'docker logs --timestamps --since <time> askrigor-research-mcp-1 2>&1 | grep askrigor_gemini_sign_in'`.
   The owner's link of 22 Nov 2026 ended after Allow and left a consent and no token; the token call was invisible.
5. Only after a real link works: the Add page's Gemini section goes public.

## Rollback

Unset `ASKRIGOR_GEMINI_OAUTH` and recreate the research service: every `/oauth/gemini` and resource-metadata path is
404 again and `/mcp/gemini` accepts what it accepted before. Links stop working at once. The table stays; to end the
links for good before a later re-enable, delete its rows (`DELETE FROM living_evidence.gemini_oauth_store`) or change
the secret.

## Tests

`tests/gemini-sign-in.test.ts` (the end-to-end link and the four required refusals: forged assertion, reused `jti`, wrong
redirect, missing PKCE), `tests/gemini-sign-in-rules.test.ts`, `tests/gemini-sign-in-server.test.ts`,
`tests/gemini-sign-in-diagnostics.test.ts` (the step log of a whole link and of each failure, and that no line holds a
value a request carried), and
`scripts/gemini-sign-in-postgres-acceptance.mts` on a real PostgreSQL 17.6 (run by
`npm run contributor-access:postgres-acceptance`).
