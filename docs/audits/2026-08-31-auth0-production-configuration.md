# Auth0 production configuration receipt

Recorded 2026-08-31 for the bounded public evidence-gap release. This provider
configuration is production-accepted; deployment and product evidence is in
`2026-08-31-auth0-evidence-gap-production-release.json` and `.md`.

The Auth0 production tenant is `askrigor-prod` in US region shard `US-5` with
issuer `https://askrigor-prod.us.auth0.com/`. Its AskRigor API resource is
`https://mcp.askrigor.com/mcp`, signed with RS256 under the RFC 9068 profile.
Offline access is enabled and user-delegated application access is selected.
The only API permission is `cases:review`.

The durable ChatGPT client is a regular confidential web application with
client ID `KpzLdf3h7yMofpcpHCrhqB12YkEpvejD`, callback
`https://chatgpt.com/connector_platform_oauth_redirect`, and only
authorization-code and refresh-token grants. Its user-delegated grant contains
the one `cases:review` permission; client-credentials access is denied. Its
only enabled identity connection is `Username-Password-Authentication`.
Google login is disabled for this application and public database signup is
disabled.

One primary owner account exists in the closed connection. Auth0 returned HTTP
200 for its password-setup email request, password setup completed, and the
primary ChatGPT OAuth callback and protected-tool acceptance passed. The email
address, stable token subject, temporary password, client secret, and all tokens
are excluded from Git. The temporary bootstrap password was generated in memory
and cleared.
The stable owner subject and exact client ID are required separately by the
production AskRigor resource server, so a correctly signed token for another
client or user is rejected.

The initially imported OpenAI CIMD client depends on Auth0
`private_key_jwt`; current Auth0 documentation and pricing classify that and
Role Management as non-Free features. Its AskRigor grant was revoked to 0/1.
API RBAC and the permissions claim are disabled. The inert imported client and
unused reviewer role were deleted after the replacement's primary-account
acceptance succeeded. No release behavior relies on the trial.

Public discovery readback advertises the exact issuer, authorization endpoint,
token endpoint, JWKS endpoint, `offline_access`, authorization-code and
refresh-token grants, `client_secret_basic`, `client_secret_post`, CIMD
support, and issuer-in-authorization-response support. Resource Parameter
Compatibility and the tenant default audience are enabled in the dashboard.

Focused authorization, deployment, intake, site, and release-packet tests pass
53/53, and TypeScript typecheck passes. Operational alignment passes for the
production provider and primary ChatGPT OAuth path. Scientific adequacy is
unchanged and limited to the already-tested provenance, missingness,
comparison, unverified, and noncausal semantics. Release adequacy passes in the
linked production release receipt.
