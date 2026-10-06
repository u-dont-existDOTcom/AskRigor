import type { IncomingMessage, ServerResponse } from "node:http";

import type { OAuthTokenVerifier } from
  "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from
  "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

export const CASE_REVIEW_SCOPE = "cases:review";
export const RESEARCH_USE_SCOPE = "research:use";

export interface AskRigorOAuthResourceServer {
  resourceUrl: URL;
  authorizationServerUrls: readonly URL[];
  reviewerSubjects: ReadonlySet<string>;
  // Scopes advertised in protected-resource metadata. Defaults to both scopes.
  scopesSupported?: readonly string[];
  verifier: OAuthTokenVerifier;
}

// Separate resource for the Claude custom connector (/mcp/claude). It is off
// unless ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID is set; it binds tokens to its own
// audience and its own OAuth client and offers the same functionality as the
// primary surface: research:use for connected research and cases:review for
// the same single owner subject.
export function claudeOAuthResourceServerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AskRigorOAuthResourceServer | undefined {
  if (env.ASKRIGOR_OAUTH_ENABLED !== "true") return undefined;
  if (env.ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID === undefined) return undefined;

  const resourceUrl = parseHttpsUrl(
    env.ASKRIGOR_OAUTH_CLAUDE_RESOURCE_URL,
    "ASKRIGOR_OAUTH_CLAUDE_RESOURCE_URL",
  );
  if (resourceUrl.pathname !== "/mcp/claude") {
    throw new Error("ASKRIGOR_OAUTH_CLAUDE_RESOURCE_URL_INVALID");
  }
  const issuerUrl = parseHttpsUrl(
    env.ASKRIGOR_OAUTH_ISSUER_URL,
    "ASKRIGOR_OAUTH_ISSUER_URL",
  );
  const jwksUrl = parseHttpsUrl(
    env.ASKRIGOR_OAUTH_JWKS_URL,
    "ASKRIGOR_OAUTH_JWKS_URL",
  );
  const clientId = parseTokenBinding(
    env.ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID,
    "ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID",
  );
  const ownerSubject = parseTokenBinding(
    env.ASKRIGOR_OAUTH_ALLOWED_SUBJECT,
    "ASKRIGOR_OAUTH_ALLOWED_SUBJECT",
  );
  return createJwtOAuthResourceServer({
    resourceUrl,
    issuerUrl,
    jwks: createRemoteJWKSet(jwksUrl),
    allowedClientIds: [clientId],
    reviewerSubjects: [ownerSubject],
    scopesSupported: [RESEARCH_USE_SCOPE, CASE_REVIEW_SCOPE],
  });
}

export function oauthResourceServerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AskRigorOAuthResourceServer | undefined {
  if (env.ASKRIGOR_OAUTH_ENABLED !== "true") return undefined;

  const resourceUrl = parseHttpsUrl(
    env.ASKRIGOR_OAUTH_RESOURCE_URL,
    "ASKRIGOR_OAUTH_RESOURCE_URL",
  );
  const issuerUrl = parseHttpsUrl(
    env.ASKRIGOR_OAUTH_ISSUER_URL,
    "ASKRIGOR_OAUTH_ISSUER_URL",
  );
  const jwksUrl = parseHttpsUrl(
    env.ASKRIGOR_OAUTH_JWKS_URL,
    "ASKRIGOR_OAUTH_JWKS_URL",
  );
  const allowedClientIds = allowedChatGptClientIds(env);
  const allowedSubject = parseTokenBinding(
    env.ASKRIGOR_OAUTH_ALLOWED_SUBJECT,
    "ASKRIGOR_OAUTH_ALLOWED_SUBJECT",
  );
  return createJwtOAuthResourceServer({
    resourceUrl,
    issuerUrl,
    jwks: createRemoteJWKSet(jwksUrl),
    allowedClientIds,
    reviewerSubjects: [allowedSubject],
  });
}

/**
 * The clients whose tokens /mcp accepts. Plugins created before October 2026
 * sign in through the static client (ASKRIGOR_OAUTH_ALLOWED_CLIENT_ID).
 * ChatGPT now signs in as a Client ID Metadata Document instead: its client ID
 * is the document's https URL (https://chatgpt.com/oauth/client.json), which
 * the Auth0 tenant imports once. When ASKRIGOR_OAUTH_CHATGPT_METADATA_CLIENT_ID
 * names it, both clients are accepted.
 */
export function allowedChatGptClientIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const staticClientId = parseTokenBinding(
    env.ASKRIGOR_OAUTH_ALLOWED_CLIENT_ID,
    "ASKRIGOR_OAUTH_ALLOWED_CLIENT_ID",
  );
  const metadataClientId = env.ASKRIGOR_OAUTH_CHATGPT_METADATA_CLIENT_ID;
  return metadataClientId === undefined
    ? [staticClientId]
    : [
        staticClientId,
        parseMetadataDocumentClientId(metadataClientId, "ASKRIGOR_OAUTH_CHATGPT_METADATA_CLIENT_ID"),
      ];
}

/** A metadata document's client ID: an exact https URL with a path, and no credentials or fragment. */
function parseMetadataDocumentClientId(value: string, name: string): string {
  const clientId = parseTokenBinding(value, name);
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new Error(`${name}_INVALID`);
  }
  if (
    url.protocol !== "https:" ||
    url.pathname === "/" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.href !== clientId
  ) {
    throw new Error(`${name}_INVALID`);
  }
  return clientId;
}

export function createJwtOAuthResourceServer(options: {
  resourceUrl: URL;
  issuerUrl: URL;
  jwks: JWTVerifyGetKey;
  allowedClientIds?: readonly string[];
  allowedSubjects?: readonly string[];
  reviewerSubjects?: readonly string[];
  scopesSupported?: readonly string[];
}): AskRigorOAuthResourceServer {
  const resourceUrl = parseHttpsUrl(
    options.resourceUrl.href,
    "OAUTH_RESOURCE_URL",
  );
  const issuerUrl = parseHttpsUrl(
    options.issuerUrl.href,
    "OAUTH_ISSUER_URL",
  );
  const allowedClientIds = new Set(options.allowedClientIds ?? []);
  const allowedSubjects = new Set(options.allowedSubjects ?? []);
  const reviewerSubjects = new Set(options.reviewerSubjects ?? []);
  return Object.freeze({
    resourceUrl,
    authorizationServerUrls: Object.freeze([issuerUrl]),
    reviewerSubjects,
    ...(options.scopesSupported === undefined
      ? {}
      : { scopesSupported: Object.freeze([...options.scopesSupported]) }),
    verifier: {
      async verifyAccessToken(token: string): Promise<AuthInfo> {
        if (token.length === 0 || token.length > 16_384) {
          throw new Error("OAUTH_ACCESS_TOKEN_INVALID");
        }
        const { payload } = await jwtVerify(token, options.jwks, {
          issuer: issuerUrl.href,
          audience: resourceUrl.href,
          algorithms: ["RS256", "PS256", "ES256"],
        });
        if (payload.exp === undefined) {
          throw new Error("OAUTH_ACCESS_TOKEN_EXPIRY_REQUIRED");
        }
        const clientId = typeof payload.client_id === "string"
          ? payload.client_id
          : typeof payload.azp === "string"
            ? payload.azp
            : undefined;
        if (clientId === undefined || clientId.length === 0) {
          throw new Error("OAUTH_ACCESS_TOKEN_CLIENT_REQUIRED");
        }
        if (allowedClientIds.size > 0 && !allowedClientIds.has(clientId)) {
          throw new Error("OAUTH_ACCESS_TOKEN_CLIENT_NOT_ALLOWED");
        }
        const subject = typeof payload.sub === "string"
          ? payload.sub
          : undefined;
        if (
          allowedSubjects.size > 0 &&
          (subject === undefined || !allowedSubjects.has(subject))
        ) {
          throw new Error("OAUTH_ACCESS_TOKEN_SUBJECT_NOT_ALLOWED");
        }
        return {
          token,
          clientId,
          scopes: extractScopes(payload.scope, payload.scp),
          expiresAt: payload.exp,
          resource: resourceUrl,
          extra: subject === undefined ? {} : { subject },
        };
      },
    },
  });
}

function parseTokenBinding(value: string | undefined, name: string): string {
  if (
    value === undefined ||
    value.trim() !== value ||
    !/^[^\s\u0000-\u001f\u007f]{1,512}$/u.test(value)
  ) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

/**
 * Why a request's bearer token was refused, as a fixed class. It is returned
 * only to the caller that sent the token, so a client whose sign-in is set up
 * wrongly can say why its research calls are refused; it is never logged, and
 * it never carries the token or its claims.
 */
export type SignInRefusal =
  | "expired"
  | "wrong_audience"
  | "wrong_issuer"
  | "not_a_signed_token"
  | "bad_signature"
  | "client_not_allowed"
  | "subject_not_allowed"
  | "invalid_claims"
  | "unverifiable";

export const SIGN_IN_REFUSALS = [
  "expired",
  "wrong_audience",
  "wrong_issuer",
  "not_a_signed_token",
  "bad_signature",
  "client_not_allowed",
  "subject_not_allowed",
  "invalid_claims",
  "unverifiable",
] as const satisfies readonly SignInRefusal[];

/** What happened to one request's sign-in on /mcp. */
export type SignInState =
  | { readonly state: "absent" }
  | { readonly state: "refused"; readonly refusal: SignInRefusal }
  | { readonly state: "accepted" };

/**
 * The refusal class of a verification error, from jose's error codes and this
 * module's own error identifiers: exact identities, not message wording.
 */
export function signInRefusal(error: unknown): SignInRefusal {
  const code = typeof error === "object" && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
  switch (code) {
    case "ERR_JWT_EXPIRED":
      return "expired";
    case "ERR_JWT_CLAIM_VALIDATION_FAILED": {
      const claim = (error as { claim?: unknown }).claim;
      return claim === "aud" ? "wrong_audience" : claim === "iss" ? "wrong_issuer" : "invalid_claims";
    }
    // Not a signed JWT at all: for example an opaque or encrypted token, which an
    // authorization server issues when the sign-in did not ask for this API.
    case "ERR_JWS_INVALID":
    case "ERR_JWT_INVALID":
      return "not_a_signed_token";
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
    case "ERR_JWKS_NO_MATCHING_KEY":
    case "ERR_JWKS_MULTIPLE_MATCHING_KEYS":
    case "ERR_JOSE_ALG_NOT_ALLOWED":
    case "ERR_JOSE_NOT_SUPPORTED":
      return "bad_signature";
  }
  const identifier = error instanceof Error ? error.message : undefined;
  switch (identifier) {
    case "OAUTH_ACCESS_TOKEN_CLIENT_NOT_ALLOWED":
      return "client_not_allowed";
    case "OAUTH_ACCESS_TOKEN_SUBJECT_NOT_ALLOWED":
      return "subject_not_allowed";
    case "OAUTH_ACCESS_TOKEN_INVALID":
    case "OAUTH_ACCESS_TOKEN_EXPIRY_REQUIRED":
    case "OAUTH_ACCESS_TOKEN_CLIENT_REQUIRED":
    case "OAUTH_VERIFIER_RESULT_INVALID":
      return "invalid_claims";
  }
  // Anything else, such as the signing keys being unreachable, is on AskRigor's side.
  return "unverifiable";
}

/**
 * Attaches a valid token's identity to the request and says what happened to
 * the sign-in; undefined when /mcp has no OAuth configured.
 */
export async function attachOptionalOAuthIdentity(
  request: IncomingMessage,
  config: AskRigorOAuthResourceServer | undefined,
): Promise<SignInState | undefined> {
  if (config === undefined) return undefined;
  const token = bearerToken(request.headers.authorization);
  if (token === null) return { state: "absent" };
  try {
    const authInfo = await config.verifier.verifyAccessToken(token);
    validateVerifiedAuthInfo(authInfo, token, config.resourceUrl);
    (request as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
    return { state: "accepted" };
  } catch (error) {
    // Authentication is attached at the transport boundary, while each tool
    // enforces its own scope and returns the matching OAuth challenge.
    return { state: "refused", refusal: signInRefusal(error) };
  }
}

export function oauthProtectedResourceMetadata(
  config: AskRigorOAuthResourceServer,
): Record<string, unknown> {
  return {
    resource: config.resourceUrl.href,
    authorization_servers: config.authorizationServerUrls.map(({ href }) => href),
    scopes_supported: config.scopesSupported ?? [RESEARCH_USE_SCOPE, CASE_REVIEW_SCOPE],
  };
}

// Verifies a required bearer for a resource. Returns true and attaches the
// identity only when the token is valid for exactly this resource and client.
export async function attachRequiredOAuthIdentity(
  request: IncomingMessage,
  config: AskRigorOAuthResourceServer,
): Promise<boolean> {
  const token = bearerToken(request.headers.authorization);
  if (token === null) return false;
  try {
    const authInfo = await config.verifier.verifyAccessToken(token);
    validateVerifiedAuthInfo(authInfo, token, config.resourceUrl);
    (request as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
    return true;
  } catch {
    return false;
  }
}

// Transport-level challenge (HTTP 401) so clients that only honor 401, such as
// Claude, start their OAuth flow instead of receiving a tool error.
export function writeOAuthChallenge(
  response: ServerResponse,
  config: AskRigorOAuthResourceServer,
): void {
  const scope = (config.scopesSupported ?? [RESEARCH_USE_SCOPE]).join(" ");
  response.writeHead(401, {
    "content-type": "application/json",
    "www-authenticate": `Bearer error="invalid_token", error_description="Authentication required", resource_metadata="${protectedResourceMetadataUrl(config.resourceUrl).href}", scope="${scope}"`,
  });
  response.end(JSON.stringify({
    error: "invalid_token",
    error_description: "Authentication required",
  }));
}

export function protectedResourceMetadataUrl(resourceUrl: URL): URL {
  const path = resourceUrl.pathname === "/"
    ? ""
    : resourceUrl.pathname.replace(/\/$/u, "");
  return new URL(`/.well-known/oauth-protected-resource${path}`, resourceUrl);
}

export function writeOAuthProtectedResourceMetadata(
  response: ServerResponse,
  config: AskRigorOAuthResourceServer,
): void {
  response.writeHead(200, {
    "cache-control": "public, max-age=300",
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(oauthProtectedResourceMetadata(config)));
}

function parseHttpsUrl(value: string | undefined, name: string): URL {
  if (value === undefined || value.trim() !== value) {
    throw new Error(`${name}_INVALID`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name}_INVALID`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error(`${name}_INVALID`);
  }
  return parsed;
}

function extractScopes(scope: unknown, scp: unknown): string[] {
  const values = typeof scope === "string"
    ? scope.split(/\s+/u)
    : Array.isArray(scp)
      ? scp.filter((value): value is string => typeof value === "string")
      : [];
  return [...new Set(values.filter((value) => value.length > 0))];
}

function bearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer ([^\s]+)$/u.exec(header);
  return match?.[1] ?? null;
}

function validateVerifiedAuthInfo(
  authInfo: AuthInfo,
  token: string,
  resourceUrl: URL,
): void {
  if (
    authInfo.token !== token ||
    authInfo.clientId.length === 0 ||
    !Array.isArray(authInfo.scopes) ||
    authInfo.scopes.some((scope) => typeof scope !== "string") ||
    authInfo.expiresAt === undefined ||
    authInfo.expiresAt <= Date.now() / 1_000 ||
    authInfo.resource?.href !== resourceUrl.href
  ) {
    throw new Error("OAUTH_VERIFIER_RESULT_INVALID");
  }
}
