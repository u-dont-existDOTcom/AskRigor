import { hkdfSync } from "node:crypto";

/**
 * Settings of Gemini's sign-in (owner answer 386b; design docs/superpowers/plans/2026-11-21-gemini-sign-in-design.md):
 * AskRigor's own authorization server for Google's Gemini app, which checks Google's signed client assertion itself and
 * uses Auth0 only for the person's own login.
 */
export interface GeminiSignInSettings {
  /** https://mcp.askrigor.com/oauth/gemini: the authorization server's issuer identifier. */
  readonly issuer: URL;
  /** https://mcp.askrigor.com/mcp/gemini: the one resource its tokens are for. */
  readonly resource: URL;
  /** The Auth0 tenant (ASKRIGOR_OAUTH_ISSUER_URL), for the person's own login only. */
  readonly auth0Issuer: URL;
  /** The tenant's signing keys (ASKRIGOR_OAUTH_JWKS_URL). */
  readonly auth0JwksUrl: URL;
  /** AskRigor's own regular web application in that tenant, which asks only for `openid`. */
  readonly loginClientId: string;
  readonly loginClientSecret: string;
  readonly keys: GeminiSignInKeys;
  /** Whether fixed, content-free stage and error codes are logged (off by default). */
  readonly diagnostics: boolean;
}

/** Keys derived from one server secret, one per use, so no key serves two purposes. */
export interface GeminiSignInKeys {
  /** HMAC key for the stored rows' keys and indexes. */
  readonly storeIndex: Buffer;
  /** AES-256-GCM key for the stored rows' payloads. */
  readonly storeSeal: Buffer;
  /** The library's cookie signing key. */
  readonly libraryCookie: Buffer;
  /** AES-256-GCM key for AskRigor's own login-state and login-result cookies. */
  readonly loginSeal: Buffer;
  /** HMAC key for the consent form's token. */
  readonly consentForm: Buffer;
}

export const GEMINI_ISSUER_PATH = "/oauth/gemini";
export const GEMINI_RESOURCE_PATH = "/mcp/gemini";
export const GEMINI_SCOPE = "research:use";

const SALT = "askrigor-gemini-sign-in-v1";

export function deriveGeminiSignInKeys(secret: Uint8Array): GeminiSignInKeys {
  if (secret.byteLength < 32) throw new Error("ASKRIGOR_GEMINI_OAUTH_SECRET_INVALID");
  const derive = (use: string) => Buffer.from(hkdfSync("sha256", Buffer.from(secret), SALT, use, 32));
  return Object.freeze({
    storeIndex: derive("store-index"),
    storeSeal: derive("store-seal"),
    libraryCookie: derive("library-cookie"),
    loginSeal: derive("login-seal"),
    consentForm: derive("consent-form"),
  });
}

/**
 * The settings from the environment, or undefined while Gemini's sign-in is off. It is on only with
 * ASKRIGOR_GEMINI_OAUTH=enabled, and then every other setting must be valid or the server refuses to start.
 */
export function geminiSignInSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): GeminiSignInSettings | undefined {
  if (env.ASKRIGOR_GEMINI_OAUTH !== "enabled") return undefined;
  if (env.ASKRIGOR_OAUTH_ENABLED !== "true") throw new Error("ASKRIGOR_GEMINI_OAUTH_NEEDS_OAUTH");
  const mcpResource = httpsUrl(env.ASKRIGOR_OAUTH_RESOURCE_URL, "ASKRIGOR_OAUTH_RESOURCE_URL");
  const origin = mcpResource.origin;
  const secretText = env.ASKRIGOR_GEMINI_OAUTH_SECRET;
  if (secretText === undefined || !/^[A-Za-z0-9_-]{43,512}$/u.test(secretText)) {
    throw new Error("ASKRIGOR_GEMINI_OAUTH_SECRET_INVALID");
  }
  const secret = Buffer.from(secretText, "base64url");
  if (secret.byteLength < 32 || secret.toString("base64url") !== secretText) {
    throw new Error("ASKRIGOR_GEMINI_OAUTH_SECRET_INVALID");
  }
  const geminiClientId = env.ASKRIGOR_GEMINI_LOGIN_CLIENT_ID;
  const loginClientId = binding(geminiClientId ?? env.ASKRIGOR_ATLAS_AUTH0_CLIENT_ID, "ASKRIGOR_GEMINI_LOGIN_CLIENT_ID");
  const loginClientSecret = binding(
    geminiClientId === undefined ? env.ASKRIGOR_ATLAS_AUTH0_CLIENT_SECRET : env.ASKRIGOR_GEMINI_LOGIN_CLIENT_SECRET,
    "ASKRIGOR_GEMINI_LOGIN_CLIENT_SECRET",
  );
  return Object.freeze({
    issuer: new URL(`${origin}${GEMINI_ISSUER_PATH}`),
    resource: new URL(`${origin}${GEMINI_RESOURCE_PATH}`),
    auth0Issuer: httpsUrl(env.ASKRIGOR_OAUTH_ISSUER_URL, "ASKRIGOR_OAUTH_ISSUER_URL"),
    auth0JwksUrl: httpsUrl(env.ASKRIGOR_OAUTH_JWKS_URL, "ASKRIGOR_OAUTH_JWKS_URL"),
    loginClientId,
    loginClientSecret,
    keys: deriveGeminiSignInKeys(secret),
    diagnostics: env.ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS === "enabled",
  });
}

function httpsUrl(value: string | undefined, name: string): URL {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error(`${name}_INVALID`);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Error(`${name}_INVALID`);
  }
  return url;
}

function binding(value: string | undefined, name: string): string {
  if (value === undefined || !/^[^\s\u0000-\u001f\u007f]{1,512}$/u.test(value)) throw new Error(`${name}_INVALID`);
  return value;
}
