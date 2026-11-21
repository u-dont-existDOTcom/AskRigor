import { generateKeyPairSync } from "node:crypto";

import type { GeminiSignInRowStore } from "@askrigor/evidence-repository";
import Provider, { errors, type Client, type KoaContextWithOIDC } from "oidc-provider";

import { GEMINI_ISSUER_PATH, GEMINI_SCOPE, type GeminiSignInSettings } from "./config.js";
import { allowGeminiClient, allowGeminiClientFetch, geminiSignInFetch } from "./google-client.js";
import { errorPage } from "./pages.js";
import { geminiSignInAdapterFactory, GeminiSignInSealer } from "./sealed-store.js";

/**
 * AskRigor's own authorization server for Google's Gemini app (owner answer 386b), built on oidc-provider 9.15.0 with
 * every feature off except the authorization code flow with PKCE, Client ID Metadata Documents, `private_key_jwt`,
 * one resource, refresh tokens and revocation (design 4.6 and section 0).
 */
export interface GeminiAuthorizationServer {
  readonly provider: Provider;
  readonly settings: GeminiSignInSettings;
  readonly sealer: GeminiSignInSealer;
  readonly rows: GeminiSignInRowStore;
  /** The library's request handler, to be called with the issuer path stripped (see routes.ts). */
  readonly handle: ReturnType<Provider["callback"]>;
  /** The audiences a client assertion may carry, all computed from the configured issuer, never from a request. */
  readonly assertionAudiences: ReadonlySet<string>;
}

export const ACCESS_TOKEN_SECONDS = 60 * 60;
export const LINK_SECONDS = 180 * 24 * 60 * 60;
export const LOGIN_SECONDS = 10 * 60;
export const CODE_SECONDS = 60;
const CLOCK_TOLERANCE_SECONDS = 30;
const ASSERTION_MAX_SECONDS = 60 * 60;

/** The statics include Google's declared scopes so its document validates; only GEMINI_SCOPE is ever granted. */
const STATIC_SCOPES = ["openid", "offline_access", GEMINI_SCOPE, "cases:review"];

export function createGeminiAuthorizationServer(
  settings: GeminiSignInSettings,
  rows: GeminiSignInRowStore,
  options: { fetch?: typeof fetch; now?: () => Date } = {},
): GeminiAuthorizationServer {
  const now = options.now ?? (() => new Date());
  const issuer = settings.issuer.href.replace(/\/$/u, "");
  const resource = settings.resource.href;
  const assertionAudiences = new Set([issuer, `${issuer}/token`, `${issuer}/token/revocation`]);
  const sealer = new GeminiSignInSealer(settings.keys);
  // The library needs a signing key for its keystore and for the client default id_token_signed_response_alg (RS256).
  // Nothing it could sign is issued here: no ID token, JWT access token or signed response.
  const signingKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "jwk" });

  const accessTokenSeconds = (ctx: KoaContextWithOIDC): number => {
    const grant = ctx.oidc.entities.Grant as { exp?: number } | undefined;
    const left = typeof grant?.exp === "number" ? grant.exp - Math.floor(now().getTime() / 1_000) : ACCESS_TOKEN_SECONDS;
    return Math.max(1, Math.min(ACCESS_TOKEN_SECONDS, left));
  };
  const refreshTokenSeconds = (ctx: KoaContextWithOIDC): number => {
    const grant = ctx.oidc.entities.Grant as { exp?: number } | undefined;
    const left = typeof grant?.exp === "number" ? grant.exp - Math.floor(now().getTime() / 1_000) : LINK_SECONDS;
    return Math.max(1, Math.min(LINK_SECONDS, left));
  };

  const provider = new Provider(issuer, {
    adapter: geminiSignInAdapterFactory(rows, sealer, now),
    clients: [],
    clientAuthMethods: ["private_key_jwt"],
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
    cookies: {
      keys: [settings.keys.libraryCookie],
      long: { signed: true, httpOnly: true, sameSite: "lax" },
      short: { signed: true, httpOnly: true, sameSite: "lax" },
    },
    enabledJWA: { clientAuthSigningAlgValues: ["RS256"] },
    expiresWithSession: async () => false,
    fetch: geminiSignInFetch({ ...(options.fetch === undefined ? {} : { fetch: options.fetch }) }),
    fetchResponseBodyLimits: { "client_id metadata document": 5_120, jwks_uri: 65_536, sector_identifier_uri: 0 },
    findAccount: async (_ctx: unknown, accountId: string) => ({
      accountId,
      claims: async () => ({ sub: accountId }),
    }),
    features: {
      clientIdMetadataDocument: {
        enabled: true,
        ack: "draft-03",
        allowFetch: async (_ctx: unknown, clientId: string) => allowGeminiClientFetch(clientId),
        allowClient: async (_ctx: unknown, client: Client) => allowGeminiClient(client),
        cacheDuration: { min: 30, max: 3_600 },
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: async () => resource,
        useGrantedResource: async () => true,
        getResourceServerInfo: async (_ctx: unknown, indicator: string) => {
          if (indicator !== resource) throw new errors.InvalidTarget();
          return { scope: GEMINI_SCOPE, audience: resource, accessTokenFormat: "opaque" };
        },
      },
      revocation: { enabled: true },
      devInteractions: { enabled: false },
      userinfo: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      introspection: { enabled: false },
      registration: { enabled: false },
      deviceFlow: { enabled: false },
      clientCredentials: { enabled: false },
      ciba: { enabled: false },
      pushedAuthorizationRequests: { enabled: false },
      requestObjects: { enabled: false },
      dPoP: { enabled: false },
      claimsParameter: { enabled: false },
      jwtResponseModes: { enabled: false },
      jwtUserinfo: { enabled: false },
      encryption: { enabled: false },
      webMessageResponseMode: { enabled: false },
      backchannelLogout: { enabled: false },
      richAuthorizationRequests: { enabled: false },
    },
    interactions: {
      url: async (_ctx: unknown, interaction: { uid: string }) => `${GEMINI_ISSUER_PATH}/interaction/${interaction.uid}`,
    },
    issueRefreshToken: async (_ctx: unknown, client: Client) =>
      client.grantTypeAllowed("refresh_token") && allowGeminiClient(client),
    jwks: { keys: [{ ...signingKey, kid: "askrigor-gemini-unused", alg: "RS256", use: "sig" }] },
    pkce: { required: () => true },
    responseTypes: ["code"],
    revokeGrantPolicy: () => true,
    rotateRefreshToken: false,
    scopes: STATIC_SCOPES,
    ttl: {
      AccessToken: accessTokenSeconds,
      AuthorizationCode: CODE_SECONDS,
      Grant: LINK_SECONDS,
      Interaction: LOGIN_SECONDS,
      RefreshToken: refreshTokenSeconds,
      Session: LOGIN_SECONDS,
    },
    assertJwtClientAuthClaimsAndHeader: async (
      _ctx: unknown,
      claims: Record<string, unknown>,
      header: Record<string, unknown>,
    ) => {
      const reject = (reason: string) => {
        throw new errors.InvalidClientAuth(reason);
      };
      if (header.alg !== "RS256") reject("alg must be RS256");
      if (typeof claims.sub !== "string" || claims.sub !== claims.iss) reject("sub must equal iss");
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (audiences.length === 0 || !audiences.every((aud) => typeof aud === "string" && assertionAudiences.has(aud))) {
        reject("every audience must be this authorization server");
      }
      const at = Math.floor(now().getTime() / 1_000);
      if (typeof claims.exp !== "number" || claims.exp > at + ASSERTION_MAX_SECONDS + CLOCK_TOLERANCE_SECONDS) {
        reject("expiry too far ahead");
      }
      if (claims.iat !== undefined && (typeof claims.iat !== "number" || claims.iat > at + CLOCK_TOLERANCE_SECONDS)) {
        reject("issued in the future");
      }
    },
    renderError: async (ctx: KoaContextWithOIDC, out: { error?: unknown }) => {
      ctx.set("content-type", "text/html; charset=utf-8");
      setPageHeaders((field, value) => ctx.set(field, value));
      ctx.body = errorPage(typeof out.error === "string" ? out.error : "server_error");
    },
  });
  // Caddy terminates TLS; the dispatcher pins Host and the forwarded protocol before any request reaches the library.
  provider.proxy = true;
  // The metadata names only the scope that can be granted (the library lists every static scope otherwise).
  provider.use(async (ctx, next) => {
    await next();
    if (ctx.oidc?.route === "discovery" && typeof ctx.body === "object" && ctx.body !== null) {
      const body = ctx.body as Record<string, unknown>;
      body.scopes_supported = [GEMINI_SCOPE];
      delete body.claims_supported;
      delete body.claims_parameter_supported;
    }
  });

  return Object.freeze({
    provider,
    settings,
    sealer,
    rows,
    handle: provider.callback(),
    assertionAudiences,
  });
}

/** Headers of every page this server renders: never cached, never framed, never a referrer. */
export function setPageHeaders(set: (field: string, value: string) => void): void {
  set("cache-control", "no-store");
  set("referrer-policy", "no-referrer");
  set("x-frame-options", "DENY");
  set("x-content-type-options", "nosniff");
  set(
    "content-security-policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
}
