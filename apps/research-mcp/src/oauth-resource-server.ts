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

export interface AskRigorOAuthResourceServer {
  resourceUrl: URL;
  authorizationServerUrls: readonly URL[];
  verifier: OAuthTokenVerifier;
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
  const allowedClientId = parseTokenBinding(
    env.ASKRIGOR_OAUTH_ALLOWED_CLIENT_ID,
    "ASKRIGOR_OAUTH_ALLOWED_CLIENT_ID",
  );
  const allowedSubject = parseTokenBinding(
    env.ASKRIGOR_OAUTH_ALLOWED_SUBJECT,
    "ASKRIGOR_OAUTH_ALLOWED_SUBJECT",
  );
  return createJwtOAuthResourceServer({
    resourceUrl,
    issuerUrl,
    jwks: createRemoteJWKSet(jwksUrl),
    allowedClientIds: [allowedClientId],
    allowedSubjects: [allowedSubject],
  });
}

export function createJwtOAuthResourceServer(options: {
  resourceUrl: URL;
  issuerUrl: URL;
  jwks: JWTVerifyGetKey;
  allowedClientIds?: readonly string[];
  allowedSubjects?: readonly string[];
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
  return Object.freeze({
    resourceUrl,
    authorizationServerUrls: Object.freeze([issuerUrl]),
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

export async function attachOptionalOAuthIdentity(
  request: IncomingMessage,
  config: AskRigorOAuthResourceServer | undefined,
): Promise<void> {
  if (config === undefined) return;
  const token = bearerToken(request.headers.authorization);
  if (token === null) return;
  try {
    const authInfo = await config.verifier.verifyAccessToken(token);
    validateVerifiedAuthInfo(authInfo, token, config.resourceUrl);
    (request as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
  } catch {
    // Optional authentication must not break anonymous research tools. A
    // protected tool will return its own OAuth challenge for this request.
  }
}

export function oauthProtectedResourceMetadata(
  config: AskRigorOAuthResourceServer,
): Record<string, unknown> {
  return {
    resource: config.resourceUrl.href,
    authorization_servers: config.authorizationServerUrls.map(({ href }) => href),
    scopes_supported: [CASE_REVIEW_SCOPE],
  };
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
