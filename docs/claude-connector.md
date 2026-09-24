# Claude custom connector

AskRigor's existing MCP endpoint (`/mcp`) serves ChatGPT. ChatGPT links accounts from a tool result, but Claude only starts OAuth on a transport-level `401 Unauthorized`. The production resource server also accepts exactly one OAuth client. So Claude connects to `/mcp` anonymously, and every research tool then refuses it.

`/mcp/claude` is a separate surface for Claude:

- **Own OAuth resource.** Its resource is `https://mcp.askrigor.com/mcp/claude`. Tokens must carry that audience and the configured Claude client ID. Tokens for `/mcp`, or from any other client, are refused.
- **Challenge on every request.** Any request without a valid bearer gets HTTP 401 with `WWW-Authenticate: Bearer … resource_metadata=".../.well-known/oauth-protected-resource/mcp/claude", scope="research:use"`. Claude then runs its OAuth flow.
- **Research scope only.** The metadata advertises `research:use` only. The surface has no reviewer subjects, so owner case review (`cases:review`) never works through it, even if a token carries that scope.
- **Same research account.** It serves the same standard tool catalog. The same Auth0 user (`sub`) reaches the same research-access enrollment as in ChatGPT.
- **Off by default.** The surface stays off (404) until `ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID` is set. `/mcp` behaves exactly as before.

## Auth0 (owner, once)

1. **Create the API.** Name it `AskRigor MCP (Claude)` and set its identifier to `https://mcp.askrigor.com/mcp/claude` (RS256). Add the permission `research:use` and allow offline access. The tenant's Resource Parameter Compatibility Profile is already on, so Claude's `resource=` parameter maps to this API.
2. **Create the application.** Name it `Claude` and make it a Regular Web Application.
   - Allowed Callback URL: `https://claude.ai/api/mcp/auth_callback`.
   - Grant types: Authorization Code and Refresh Token.
   - Connections: enable the same sign-in connection that the ChatGPT application uses.
3. **Authorize the application.** Give the `Claude` application user access to `AskRigor MCP (Claude)` with `research:use` only. Do not grant `cases:review`.
4. **Copy the credentials.** Note the application's Client ID (non-secret) and Client Secret.

## AskRigor production

Set:

```
ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID=<Claude application client ID>
ASKRIGOR_OAUTH_CLAUDE_RESOURCE_URL=https://mcp.askrigor.com/mcp/claude
```

Deploy, then verify:

- `GET https://mcp.askrigor.com/.well-known/oauth-protected-resource/mcp/claude` returns `resource` equal to the URL above, with `scopes_supported: ["research:use"]`.
- An unauthenticated `POST https://mcp.askrigor.com/mcp/claude` returns 401 with the `WWW-Authenticate` header above.
- `/mcp` still initializes anonymously for ChatGPT.

Claude's requests come from Anthropic's egress range, `160.79.104.0/21`. If any WAF or per-IP limit sits in front of the service, make sure it does not block that range.

## Claude (owner)

1. Add a custom connector with the URL `https://mcp.askrigor.com/mcp/claude`.
2. Under advanced settings, enter the Client ID and Client Secret from Auth0.
3. Connect, then sign in through Auth0.
4. Save the `askrigor` skill from `skills/askrigor/SKILL.md`, or from the Claude skill proposal.

## Rollback

Unset `ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID`. The surface returns 404 again, and nothing else changes.
