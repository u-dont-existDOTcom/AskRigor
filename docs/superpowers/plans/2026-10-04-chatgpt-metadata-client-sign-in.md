# ChatGPT's new sign-in client (owner report, 2026-10-04)

Date: 2026-10-04. Status: **server change built; the owner's Auth0 steps and
the release are open**.

## What happened

On 2026-10-03 the owner reinstalled the AskRigor ChatGPT plugin. In the main
account, every call then failed with what the chat called an internal error.
On the second account, connecting landed on Auth0's error page. The owner sent
the sign-in link. Its client is
`client_id=https://chatgpt.com/oauth/client.json`, and fetching it gives:

> invalid_request : Unknown client: https://chatgpt.com/oauth/client.json

Auth0 tracking ID: `ab1f6499a8c2efc343da`.

ChatGPT now signs in with a Client ID Metadata Document (CIMD): its client ID
is the document's URL. It no longer asks for a static client ID, secret,
token-endpoint method or callback URL, which is why the owner saw none of the
fields in the 28 Sep steps. Auth0's metadata advertises
`client_id_metadata_document_supported: true`, so ChatGPT uses it. But the
tenant has not imported ChatGPT's document, so Auth0 does not know the client.

An earlier guess blamed the updated free-use notice. The owner rejected that,
and this is the evidence-backed cause. The main account's plugin very likely
failed the same way: a plugin that is installed but not signed in has every
research call refused.

AskRigor's server would refuse the new client too. `/mcp` accepted tokens from
exactly one client, the static "AskRigor ChatGPT reviewer" application.

## Server change

`ASKRIGOR_OAUTH_CHATGPT_METADATA_CLIENT_ID`, optional. When it names the
document's exact https URL, `/mcp` accepts tokens from that client as well as
from the static one, so plugins created before the change keep working. It
must be an exact https URL with a path, and no credentials or fragment.

Release step: set it to `https://chatgpt.com/oauth/client.json` in
`/opt/askrigor/runtime.env` when the release recreates `research-mcp`.

## Owner's Auth0 steps (Auth0's CIMD guide, checked 2026-10-04)

1. Applications → Applications → Create Application → **Import from URL** →
   `https://chatgpt.com/oauth/client.json` → Preview → Create.
2. Applications → APIs → the AskRigor API (`https://mcp.askrigor.com/mcp`) →
   **Application Access** → the ChatGPT client → Edit → grant
   **User-Delegated Access** with `research:use` and `cases:review` → Save.
   The tenant already authorizes this API per application.
3. Authentication → Database → Username-Password-Authentication → Settings →
   **Promote Connection to Domain Level** on → Save. Do the same for
   Authentication → Social → google-oauth2. A CIMD client is a strict
   third-party client, so it sees only domain-level connections.
4. Auth Pipeline → Rules must have no active rule; CIMD logins fail when one
   is active.

After the release, the owner reconnects the plugin. Auth0 shows a one-time
consent screen for ChatGPT, then the plugin works.

## Checks

- `tests/public-gap-oauth-review.test.ts`:
  - both clients are accepted when the variable is set, and a third is refused;
  - only the static client is accepted when the variable is unset;
  - malformed values are refused.
- `npm run verify` on the branch.
