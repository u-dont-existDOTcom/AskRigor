# Claude custom connector

AskRigor's existing MCP endpoint (`/mcp`) serves ChatGPT. ChatGPT links accounts from a tool result, but Claude only starts OAuth on a transport-level `401 Unauthorized`. The production resource server also accepts exactly one OAuth client. So Claude connects to `/mcp` anonymously, and every research tool then refuses it.

`/mcp/claude` is a separate surface for Claude:

- **Own OAuth resource.** Its resource is `https://mcp.askrigor.com/mcp/claude`. Tokens must carry that audience and the configured Claude client ID. Tokens for `/mcp`, or from any other client, are refused.
- **Challenge on every request.** Any request without a valid bearer gets HTTP 401 with `WWW-Authenticate: Bearer … resource_metadata=".../.well-known/oauth-protected-resource/mcp/claude", scope="research:use cases:review"`. Claude then runs its OAuth flow.
- **Same functionality as ChatGPT.** It serves the same standard tool catalog and advertises both scopes. `research:use` covers connected research. `cases:review` covers owner case review and, exactly as on `/mcp`, works only for the single owner subject (`ASKRIGOR_OAUTH_ALLOWED_SUBJECT`).
- **Same research account.** The same Auth0 user (`sub`) reaches the same research-access enrollment as in ChatGPT.
- **Off by default.** The surface stays off (404) until `ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID` is set. `/mcp` behaves exactly as before.

## What the model sees

Claude's apps differ in which part of a tool result they hand the model. Claude Code (2.1.312, read from its own code
on 7 November 2026) gives the model a result's structured content as JSON and leaves out its text blocks, unless a
setting on Anthropic's side turns that around; a Claude agent harness gave the model only the text (lesson #59). So
every AskRigor result also carries its structured content as text, after the tool's own text: the JSON, or for a
`load_protocol` page, the other fields' JSON and then the page's exact bytes, which hash to `scope_sha256`. Only a
call carrying ChatGPT's signals gets the tool's text alone (`apps/research-mcp/src/tool-result.ts`; the privacy data
map's "Payload text"). Whichever part an app hands over, it holds the whole payload.

Sizes, measured on 8 November 2026: Claude Code 2.1.312, run against a local server, kept the HRP core page in the
conversation although the whole result was 82,745 characters, because it counts only the part it shows the model (there
the structured content, 41,119 characters) against its 50,000-character limit, past which it saves a result to a file.
claude.ai and Claude Desktop take a result of up to about 150,000 characters in all (Claude's connector documentation).
The tests hold each part of every protocol page and of a full video audit under 50,000 characters and the whole under
150,000 (`tests/text-only-clients.test.ts`, `tests/mcp-tools.test.ts`), and the Atlas lookup keeps its structured
content under 46,000 bytes. A higher Claude Code limit would need `_meta["anthropic/maxResultSizeChars"]` in the tool
list, which is frozen. Not checked: whether OpenAI's Responses API, which may send the same `openai-mcp/` User-Agent and
so get the text alone, shows its model the structured content too.

Guidance written only in a result's text, such as the reminders after a receipt, still reaches only apps that read the
text.

## Auth0 (owner, once)

1. **Create the API.** Name it `AskRigor MCP (Claude)` and set its identifier to `https://mcp.askrigor.com/mcp/claude` (RS256). Add the permissions `research:use` and `cases:review`, and allow offline access. The tenant's Resource Parameter Compatibility Profile is already on, so Claude's `resource=` parameter maps to this API.
2. **Create the application.** Name it `Claude` and make it a Regular Web Application.
   - Allowed Callback URL: `https://claude.ai/api/mcp/auth_callback`.
   - Grant types: Authorization Code and Refresh Token.
   - Connections: enable the same sign-in connection that the ChatGPT application uses.
3. **Authorize the application.** Give the `Claude` application user access to `AskRigor MCP (Claude)` with `research:use` and `cases:review`. The server still limits case review to the owner subject.
4. **Copy the credentials.** Note the application's Client ID (non-secret) and Client Secret.

## AskRigor production

Set:

```
ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID=<Claude application client ID>
ASKRIGOR_OAUTH_CLAUDE_RESOURCE_URL=https://mcp.askrigor.com/mcp/claude
```

Deploy, then verify:

- `GET https://mcp.askrigor.com/.well-known/oauth-protected-resource/mcp/claude` returns `resource` equal to the URL above, with `scopes_supported: ["research:use", "cases:review"]`.
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
