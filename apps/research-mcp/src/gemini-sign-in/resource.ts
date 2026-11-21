import type { IncomingMessage, ServerResponse } from "node:http";

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import {
  attachOptionalOAuthIdentity,
  type AskRigorOAuthResourceServer,
  type SignInRefusal,
  type SignInState,
} from "../oauth-resource-server.js";
import { GEMINI_SCOPE } from "./config.js";
import { allowGeminiClientFetch } from "./google-client.js";
import type { GeminiAuthorizationServer } from "./provider.js";

/**
 * What /mcp/gemini accepts (design 4.5, v2 F1): a token issued by AskRigor's own authorization server is found in its
 * store and is valid only while its Grant still exists, has not expired and names the same client and account; a
 * revocation deletes the Grant, so a token written after it is dead on arrival. The tools then receive the same identity
 * shape an Auth0 token gives on /mcp. A JWT goes to the existing Auth0 check with /mcp's own resource, as today.
 */
export class GeminiTokenError extends Error {
  constructor(readonly refusal: SignInRefusal) {
    super(`GEMINI_SIGN_IN_TOKEN_${refusal.toUpperCase()}`);
  }
}

const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{32,256}$/u;

export async function verifyGeminiAccessToken(
  server: GeminiAuthorizationServer,
  token: string,
  now: () => Date = () => new Date(),
): Promise<AuthInfo> {
  if (!OPAQUE_TOKEN.test(token)) throw new GeminiTokenError("not_a_signed_token");
  let found;
  let grant;
  try {
    found = await server.provider.AccessToken.find(token);
    if (found !== undefined && typeof found.grantId === "string") grant = await server.provider.Grant.find(found.grantId);
  } catch {
    throw new GeminiTokenError("unverifiable");
  }
  const seconds = Math.floor(now().getTime() / 1_000);
  if (found === undefined) throw new GeminiTokenError("invalid_claims");
  if (found.isExpired || typeof found.exp !== "number" || found.exp <= seconds) throw new GeminiTokenError("expired");
  const audience = Array.isArray(found.aud) ? found.aud : [found.aud];
  if (audience.length !== 1 || audience[0] !== server.settings.resource.href) throw new GeminiTokenError("wrong_audience");
  if (!allowGeminiClientFetch(found.clientId)) throw new GeminiTokenError("client_not_allowed");
  const scopes = typeof found.scope === "string" ? found.scope.split(" ") : [];
  if (!scopes.includes(GEMINI_SCOPE)) throw new GeminiTokenError("invalid_claims");
  if (
    grant === undefined ||
    (typeof grant.exp === "number" && grant.exp <= seconds) ||
    grant.accountId !== found.accountId ||
    grant.clientId !== found.clientId ||
    typeof found.accountId !== "string" ||
    found.accountId.length === 0
  ) {
    throw new GeminiTokenError("invalid_claims");
  }
  return {
    token,
    clientId: found.clientId!,
    scopes: [GEMINI_SCOPE],
    expiresAt: found.exp,
    resource: new URL(server.settings.resource.href),
    extra: { subject: found.accountId },
  };
}

function bearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer ([^\s]+)$/u.exec(header);
  return match?.[1] ?? null;
}

/**
 * Attaches /mcp/gemini's identity: a Gemini token through the store; a JWT through /mcp's Auth0 check (unchanged).
 * Undefined when neither is configured.
 */
export async function attachGeminiSurfaceIdentity(
  request: IncomingMessage,
  gemini: GeminiAuthorizationServer | undefined,
  auth0: AskRigorOAuthResourceServer | undefined,
): Promise<SignInState | undefined> {
  if (gemini === undefined) return await attachOptionalOAuthIdentity(request, auth0);
  const token = bearerToken(request.headers.authorization);
  if (token === null) return { state: "absent" };
  if (token.includes(".")) {
    return auth0 === undefined
      ? { state: "refused", refusal: "not_a_signed_token" }
      : await attachOptionalOAuthIdentity(request, auth0);
  }
  try {
    (request as IncomingMessage & { auth?: AuthInfo }).auth = await verifyGeminiAccessToken(gemini, token);
    return { state: "accepted" };
  } catch (error) {
    return { state: "refused", refusal: error instanceof GeminiTokenError ? error.refusal : "unverifiable" };
  }
}

/** The transport challenge for a present but refused token, so Gemini refreshes or signs in again (v2). */
export function writeGeminiChallenge(response: ServerResponse, resourceMetadataUrl: URL): void {
  response.writeHead(401, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "www-authenticate": `Bearer error="invalid_token", error_description="Authentication required", ` +
      `resource_metadata="${resourceMetadataUrl.href}", scope="${GEMINI_SCOPE}"`,
  });
  response.end(JSON.stringify({ error: "invalid_token", error_description: "Authentication required" }));
}

/**
 * Ends every Gemini link of one person (manage_research_access, action disconnect_gemini, v2 F6): their Grants and every
 * code and token of those Grants. Returns how many links ended.
 */
export async function disconnectGeminiLinks(
  server: GeminiAuthorizationServer,
  subject: string,
  now: () => Date = () => new Date(),
): Promise<number> {
  const grantKeys = await server.rows.grantKeysOfAccount(server.sealer.accountRefOf(subject), now());
  return await server.rows.deleteGrants(grantKeys);
}

/** How many Gemini links one person has (manage_research_access inspect). */
export async function countGeminiLinks(
  server: GeminiAuthorizationServer,
  subject: string,
  now: () => Date = () => new Date(),
): Promise<number> {
  return (await server.rows.grantKeysOfAccount(server.sealer.accountRefOf(subject), now())).length;
}
