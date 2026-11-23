import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { MemoryGeminiSignInRowStore, type GeminiSignInRowStore } from "@askrigor/evidence-repository";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

import { deriveGeminiSignInKeys, type GeminiSignInSettings } from "../../apps/research-mcp/src/gemini-sign-in/config.js";
import { GOOGLE_JWKS_URL } from "../../apps/research-mcp/src/gemini-sign-in/google-client.js";
import { GeminiLogin } from "../../apps/research-mcp/src/gemini-sign-in/login.js";
import {
  createGeminiAuthorizationServer,
  type GeminiAuthorizationServer,
} from "../../apps/research-mcp/src/gemini-sign-in/provider.js";
import {
  createGeminiSignInRoutes,
  type GeminiSignInDiagnostic,
  type GeminiSignInRoutes,
} from "../../apps/research-mcp/src/gemini-sign-in/routes.js";
import { createTokenBucketLimiter } from "../../apps/research-mcp/src/rate-limit.js";

/**
 * A hermetic Gemini link: a fake Google (its own RS256 key served at Google's real key address, and a client document
 * shaped exactly like the real one of 21 Nov 2026 with an invented connector id), a fake Auth0 tenant, AskRigor's routes
 * on a local server, and a browser cookie jar.
 */
export const CONNECTOR = "user_bound_custom-mcp-0f1e2d3c4b5a69788796a5b4";
export const CLIENT_ID = `https://accountlinking.google.com/clientidmetadata/user_bound_provider/${CONNECTOR}`;
export const GOOGLE_REDIRECT = `https://oauth-redirect.googleusercontent.com/r/${CONNECTOR}`;
export const ISSUER = "https://mcp.askrigor.com/oauth/gemini";
export const RESOURCE = "https://mcp.askrigor.com/mcp/gemini";
export const TOKEN_URL = `${ISSUER}/token`;
export const AUTH0 = "https://askrigor-test.example.auth0.com/";
export const LOGIN_CLIENT = "gemini-login-client";
export const LOGIN_SECRET = "gemini-login-secret-not-real";
export const PERSON = "auth0|gemini-tester-1";

/** The real document's fields and order (21 Nov 2026), with only the connector id invented. */
export function googleDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: CLIENT_ID,
    client_name: "Google",
    logo_uri: "https://www.gstatic.com/images/branding/productlogos/google_search_round/v8/web-512dp/logo_google_search_round_color_1x_web_512dp.png",
    redirect_uris: [
      `https://oauth-redirect-sandbox.googleusercontent.com/r/${CONNECTOR}`,
      `https://oauth-redirect-test.googleusercontent.com/r/${CONNECTOR}`,
      `https://oauth-redirect.googleusercontent.com/r/${CONNECTOR}`,
      `https://oauth-redirect-sandbox.googleusercontent.com/a/${CONNECTOR}`,
      `https://oauth-redirect-test.googleusercontent.com/a/${CONNECTOR}`,
      `https://oauth-redirect.googleusercontent.com/a/${CONNECTOR}`,
    ],
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "RS256",
    jwks_uri: GOOGLE_JWKS_URL,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "research:use cases:review",
    ...overrides,
  };
}

export interface GeminiFixture {
  readonly baseUrl: string;
  readonly server: GeminiAuthorizationServer;
  readonly routes: GeminiSignInRoutes;
  readonly rows: GeminiSignInRowStore;
  /** The in-memory rows, unless the fixture was given other rows (a real PostgreSQL in the acceptance script). */
  readonly memoryRows: MemoryGeminiSignInRowStore | undefined;
  readonly login: GeminiLogin;
  readonly google: { kid: string; sign(claims: Record<string, unknown>, options?: { kid?: string; key?: CryptoKey }): Promise<string> };
  /** Fetches to Google's addresses, in order (tests of caching and refusal). */
  readonly googleFetches: string[];
  document: Record<string, unknown>;
  close(): Promise<void>;
  /** Another RS256 key Google never published (forgeries). */
  readonly strangerKey: CryptoKey;
  readonly auth0: {
    /** The sub the next login returns. */
    subject: string;
    /** When set, the next ID token is signed by a key the tenant never published. */
    forgeNextIdToken: boolean;
  };
}

export async function startGeminiFixture(options: {
  now?: () => Date;
  rows?: GeminiSignInRowStore;
  /** The step log's sink (ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled); off when not given. */
  diagnostic?: (record: GeminiSignInDiagnostic) => void;
} = {}): Promise<GeminiFixture> {
  const googleKeys = await generateKeyPair("RS256", { extractable: true });
  const stranger = await generateKeyPair("RS256", { extractable: true });
  const auth0Keys = await generateKeyPair("RS256", { extractable: true });
  const auth0Stranger = await generateKeyPair("RS256", { extractable: true });
  const googleJwk: JWK = { ...(await exportJWK(googleKeys.publicKey)), kid: "google-test-1", alg: "RS256", use: "sig" };
  const auth0Jwk: JWK = { ...(await exportJWK(auth0Keys.publicKey)), kid: "auth0-test-1", alg: "RS256", use: "sig" };
  const googleFetches: string[] = [];
  const pendingAuth0 = new Map<string, { nonce: string; challenge: string; redirectUri: string }>();
  const auth0State = { subject: PERSON, forgeNextIdToken: false };

  const fixture = {
    document: googleDocument(),
  } as { document: Record<string, unknown> };

  const googleFetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    googleFetches.push(url);
    if (url === GOOGLE_JWKS_URL) {
      return new Response(JSON.stringify({ keys: [googleJwk] }), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "public, max-age=3000" },
      });
    }
    if (url === CLIENT_ID) {
      return new Response(JSON.stringify(fixture.document), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache, no-store" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const auth0Fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== `${AUTH0}oauth/token`) return new Response("not found", { status: 404 });
    const form = new URLSearchParams(String(init?.body ?? ""));
    const code = form.get("code") ?? "";
    const pending = pendingAuth0.get(code);
    pendingAuth0.delete(code);
    const verifier = form.get("code_verifier") ?? "";
    if (
      pending === undefined ||
      form.get("grant_type") !== "authorization_code" ||
      form.get("client_id") !== LOGIN_CLIENT ||
      form.get("client_secret") !== LOGIN_SECRET ||
      form.get("redirect_uri") !== pending.redirectUri ||
      createHash("sha256").update(verifier).digest("base64url") !== pending.challenge
    ) {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const forge = auth0State.forgeNextIdToken;
    auth0State.forgeNextIdToken = false;
    const at = Math.floor((options.now?.() ?? new Date()).getTime() / 1_000);
    const idToken = await new SignJWT({ nonce: pending.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "auth0-test-1", typ: "JWT" })
      .setIssuer(AUTH0)
      .setAudience(LOGIN_CLIENT)
      .setSubject(auth0State.subject)
      .setIssuedAt(at)
      .setExpirationTime(at + 600)
      .sign(forge ? auth0Stranger.privateKey : auth0Keys.privateKey);
    return new Response(JSON.stringify({
      access_token: randomBytes(16).toString("hex"),
      token_type: "Bearer",
      expires_in: 60,
      id_token: idToken,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const settings: GeminiSignInSettings = {
    issuer: new URL(ISSUER),
    resource: new URL(RESOURCE),
    auth0Issuer: new URL(AUTH0),
    auth0JwksUrl: new URL(`${AUTH0}.well-known/jwks.json`),
    loginClientId: LOGIN_CLIENT,
    loginClientSecret: LOGIN_SECRET,
    keys: deriveGeminiSignInKeys(Buffer.alloc(32, 7)),
    diagnostics: false,
  };
  const memoryRows = options.rows === undefined ? new MemoryGeminiSignInRowStore() : undefined;
  const rows: GeminiSignInRowStore = options.rows ?? memoryRows!;
  const server = createGeminiAuthorizationServer(settings, rows, {
    fetch: googleFetch,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
  });
  const login = new GeminiLogin(settings, {
    jwks: createLocalJWKSet({ keys: [auth0Jwk] }),
    fetch: auth0Fetch,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const routes = createGeminiSignInRoutes(server, login, {
    rateLimiter: createTokenBucketLimiter({ capacity: 10_000, refillTokensPerMinute: 10_000, maxKeys: 100, idleTtlMs: 60_000 }),
    ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
  });

  const http: Server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const pathname = (request.url ?? "/").split("?")[0]!;
    if (pathname === "/__auth0/authorize") {
      // The fake tenant's login page: records the request and returns to AskRigor's callback with a code.
      const query = new URL(request.url!, "http://local").searchParams;
      const code = randomUUID();
      pendingAuth0.set(code, {
        nonce: query.get("nonce") ?? "",
        challenge: query.get("code_challenge") ?? "",
        redirectUri: query.get("redirect_uri") ?? "",
      });
      const back = new URL(query.get("redirect_uri") ?? "");
      back.search = new URLSearchParams({ code, state: query.get("state") ?? "", iss: AUTH0 }).toString();
      response.writeHead(302, { location: back.href }).end();
      return;
    }
    if (!(await routes.dispatch(request, response, { pathname, clientIp: "127.0.0.1" }))) {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

  return Object.assign(fixture, {
    baseUrl,
    server,
    routes,
    rows,
    memoryRows,
    login,
    googleFetches,
    strangerKey: stranger.privateKey as CryptoKey,
    auth0: auth0State,
    google: {
      kid: "google-test-1",
      async sign(claims: Record<string, unknown>, signOptions: { kid?: string; key?: CryptoKey } = {}) {
        return await new SignJWT(claims)
          .setProtectedHeader({ alg: "RS256", kid: signOptions.kid ?? "google-test-1", typ: "JWT" })
          .sign(signOptions.key ?? googleKeys.privateKey);
      },
    },
    async close() {
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  }) as GeminiFixture;
}

/** A browser: cookies by path, manual redirects, and AskRigor's absolute addresses mapped to the local server. */
const REFERRER_POLICIES = new Set([
  "no-referrer", "no-referrer-when-downgrade", "same-origin", "origin", "strict-origin", "origin-when-cross-origin",
  "strict-origin-when-cross-origin", "unsafe-url",
]);

/**
 * The Origin header a browser sends with a form's POST from a page (Fetch standard, "append a request `Origin`
 * header", for a navigation request): the page's origin, or "null" when the page's referrer policy says so.
 * "no-referrer" always sends "null": Chromium did so on 22 Nov 2026 for a same-origin form, and AskRigor's consent
 * page, then served with that policy, had its Allow refused as invalid_request (the owner's Gemini links of 21 and
 * 22 Nov). The last policy token the browser knows wins; none means its default, strict-origin-when-cross-origin.
 */
export function browserFormOrigin(page: URL, target: URL, referrerPolicy: string | null): string {
  const policy = (referrerPolicy ?? "").split(",").map((token) => token.trim().toLowerCase())
    .filter((token) => REFERRER_POLICIES.has(token)).pop() ?? "strict-origin-when-cross-origin";
  if (policy === "no-referrer") return "null";
  if (policy === "same-origin") return target.origin === page.origin ? page.origin : "null";
  if (policy === "no-referrer-when-downgrade" || policy === "strict-origin" || policy === "strict-origin-when-cross-origin") {
    return page.protocol === "https:" && target.protocol !== "https:" ? "null" : page.origin;
  }
  return page.origin;
}

export class Browser {
  private readonly cookies = new Map<string, { value: string; path: string }>();
  /** The page shown last: its address and referrer policy decide what its forms send. */
  private page: { url: URL; referrerPolicy: string | null } | undefined;

  /**
   * proxyReferrerPolicy: the Referrer-Policy production's proxy puts on every page (mcp.askrigor.com's Caddy sets
   * no-referrer and replaces the server's own value, which ended release E on 22 Nov 2026), so a test sees what a
   * browser behind it receives.
   */
  constructor(private readonly baseUrl: string, private readonly options: { proxyReferrerPolicy?: string } = {}) {}

  local(location: string): string {
    const url = new URL(location, "https://mcp.askrigor.com");
    if (url.origin === "https://mcp.askrigor.com") return `${this.baseUrl}${url.pathname}${url.search}`;
    if (url.origin === AUTH0.replace(/\/$/u, "")) return `${this.baseUrl}/__auth0${url.pathname}${url.search}`;
    return url.href;
  }

  cookieFor(path: string): string | undefined {
    const parts = [...this.cookies.entries()]
      .filter(([, cookie]) => path === cookie.path || path.startsWith(cookie.path.endsWith("/") ? cookie.path : `${cookie.path}/`) || cookie.path === "/")
      .map(([name, cookie]) => `${name}=${cookie.value}`);
    return parts.length === 0 ? undefined : parts.join("; ");
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }

  async request(target: string, init: RequestInit & { form?: Record<string, string> } = {}): Promise<Response> {
    const url = new URL(this.local(target));
    const headers = new Headers(init.headers);
    const cookie = this.cookieFor(url.pathname);
    if (cookie !== undefined) headers.set("cookie", cookie);
    let body = init.body;
    if (init.form !== undefined) {
      headers.set("content-type", "application/x-www-form-urlencoded");
      body = new URLSearchParams(init.form).toString();
    }
    const response = await fetch(url, { ...init, headers, body, redirect: "manual" });
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";").map((part) => part.trim());
      const at = pair!.indexOf("=");
      const name = pair!.slice(0, at);
      const value = pair!.slice(at + 1);
      const path = attributes.find((attribute) => /^path=/iu.test(attribute))?.slice(5) ?? "/";
      const maxAge = attributes.find((attribute) => /^max-age=/iu.test(attribute));
      const expires = attributes.find((attribute) => /^expires=/iu.test(attribute));
      const gone = (maxAge !== undefined && Number(maxAge.slice(8)) <= 0) ||
        (expires !== undefined && Date.parse(expires.slice(8)) < Date.now()) || value === "";
      if (gone) this.cookies.delete(name);
      else this.cookies.set(name, { value, path });
    }
    if (response.status === 200 && (response.headers.get("content-type") ?? "").startsWith("text/html")) {
      this.page = {
        url: new URL(target, "https://mcp.askrigor.com"),
        referrerPolicy: this.options.proxyReferrerPolicy ?? response.headers.get("referrer-policy"),
      };
    }
    return response;
  }

  /** Submits a form of the page shown last as a browser does: the Origin its referrer policy allows, Sec-Fetch-Site. */
  async submit(action: string, form: Record<string, string>): Promise<Response> {
    if (this.page === undefined) throw new Error("no page shown");
    const target = new URL(action, this.page.url);
    return await this.request(target.href, {
      method: "POST",
      headers: {
        origin: browserFormOrigin(this.page.url, target, this.page.referrerPolicy),
        "sec-fetch-site": target.origin === this.page.url.origin ? "same-origin" : "cross-site",
      },
      form,
    });
  }
}

export const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

export function authorizeUrl(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) if (value !== undefined) search.set(name, value);
  return `https://mcp.askrigor.com/oauth/gemini/auth?${search.toString()}`;
}

/** Google's side: a client assertion for this connector, valid for five minutes unless overridden. */
export async function clientAssertion(fixture: GeminiFixture, overrides: Record<string, unknown> = {},
  signOptions: { kid?: string; key?: CryptoKey } = {}): Promise<string> {
  const at = Math.floor(Date.now() / 1_000);
  return await fixture.google.sign({
    iss: CLIENT_ID,
    sub: CLIENT_ID,
    aud: TOKEN_URL,
    jti: randomUUID(),
    iat: at,
    exp: at + 300,
    ...overrides,
  }, signOptions);
}

/** Runs the whole link in a browser up to Google's redirect; returns the code and the PKCE verifier. */
export async function linkToCode(fixture: GeminiFixture, browser: Browser,
  options: { scope?: string; resource?: string | null } = {}): Promise<{ code: string; verifier: string; location: URL }> {
  const { verifier, challenge } = pkce();
  let response = await browser.request(authorizeUrl({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT,
    scope: options.scope ?? "research:use cases:review",
    state: "google-state-1",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(options.resource === null ? {} : { resource: options.resource ?? RESOURCE }),
  }));
  for (let step = 0; step < 12; step += 1) {
    if (response.status === 200) {
      const html = await response.text();
      const token = /name="form_token" value="([^"]+)"/u.exec(html)?.[1];
      const action = /<form method="post" action="([^"]+)"/u.exec(html)?.[1];
      if (token === undefined || action === undefined) throw new Error(`unexpected page: ${html.slice(0, 200)}`);
      response = await browser.submit(action, { form_token: token, decision: "allow" });
      continue;
    }
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || location === null) {
      throw new Error(`step ${step}: status ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const absolute = new URL(location, "https://mcp.askrigor.com");
    if (absolute.origin === "https://oauth-redirect.googleusercontent.com") {
      const code = absolute.searchParams.get("code");
      if (code === null) throw new Error(`no code: ${absolute.href}`);
      return { code, verifier, location: absolute };
    }
    response = await browser.request(absolute.href);
  }
  throw new Error("too many steps");
}

export async function tokenRequest(fixture: GeminiFixture, form: Record<string, string>,
  headers: Record<string, string> = {}): Promise<Response> {
  return await fetch(`${fixture.baseUrl}/oauth/gemini/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(form).toString(),
  });
}
