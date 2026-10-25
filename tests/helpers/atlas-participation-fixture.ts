import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { expect } from "vitest";

import {
  InMemoryAtlasPageSource,
  InMemoryAtlasParticipation,
  InMemoryAtlasPublicationStore,
  RESEARCH_USE_NOTICE_VERSION,
  type AtlasPublicationDraft,
} from "@askrigor/evidence-repository";

import { AtlasChangeSignal, announcingParticipationStore } from "../../apps/research-mcp/src/atlas/change-signal.js";
import {
  ATLAS_LOGIN_COOKIE,
  ATLAS_SESSION_COOKIE,
  type AtlasParticipationSettings,
} from "../../apps/research-mcp/src/atlas/participation.js";
import {
  ATLAS_PAGE_HEADERS,
  createAtlasPagesHandler,
  type AtlasPagesDispatchOptions,
  type AtlasPagesHandler,
  type AtlasParticipationRuntime,
} from "../../apps/research-mcp/src/atlas/pages-http.js";
import { planCardPublication } from "../../apps/research-mcp/src/atlas/publication.js";
import { findingsCardDigest, findingsCardSchema, withoutYouTubeData } from "../../apps/research-mcp/src/findings/card.js";
import type { FindingsRecord, FindingsSaveAccount } from "../../apps/research-mcp/src/findings/service.js";
import { createAskRigorHttpServer } from "../../apps/research-mcp/src/server.js";
import { LOW_DOSE_CARD, VELMOR_CARD } from "./atlas-scenario.js";

// The Atlas's sign-in, votes and comments over HTTP for the tests (decision 171, sections 4D and 4E): two synthetic
// cards' publications, an in-memory store, a fake Auth0 tenant and the research server's HTTP handler.

export const FREE: FindingsSaveAccount = { mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION, devAccount: false };
export const SAVED_AT = "2026-11-04T09:00:00.000Z";
export const ISSUER = "https://askrigor-test.example.auth0.com/";
export const CLIENT_ID = "atlas-web-client";
export const CLIENT_SECRET = "atlas-web-client-secret-0123456789";
export const SUBJECT = "auth0|atlas-reader-1";
export const OTHER_SUBJECT = "auth0|atlas-reader-2";
export const OWNER = "auth0|atlas-owner";
export const bytes = (fill: number) => new Uint8Array(32).fill(fill);

export function recordOf(card: object): FindingsRecord {
  const parsed = findingsCardSchema.parse(card);
  return {
    schema: "askrigor.findings-card.v1",
    card: withoutYouTubeData(parsed).card,
    card_sha256: findingsCardDigest(parsed),
    stamp: {
      saved_at: SAVED_AT, askrigor_version: "0.1.0", askrigor_build: "0123abc",
      protocols: [{ name: "HRP", version: "20.6.31", sha256: "a".repeat(64) }], tool_catalog_sha256: "c".repeat(64),
      surface: "/mcp/claude", reported_model_unverified: "Example Model 2026-08-06",
      research: { finalized_at: SAVED_AT, depth: "standard", status: "ready" },
    },
  };
}

/** The two synthetic cards' publications: P-1001 and P-1002 from the Velmor card, P-1003 from the low-dose one. */
export async function publications(): Promise<InMemoryAtlasPublicationStore> {
  const store = new InMemoryAtlasPublicationStore();
  for (const [cardNumber, card] of [[4242, VELMOR_CARD], [4243, LOW_DOSE_CARD]] as const) {
    const record = recordOf(card);
    const plan = planCardPublication({ record, setAside: false, route: { route: "save", account: FREE } });
    await store.publish({ cardNumber, cardSha256: record.card_sha256, findings: plan.drafts as AtlasPublicationDraft[],
      publishedAt: SAVED_AT, revive: false });
  }
  return store;
}

// The fake tenant ---------------------------------------------------------------------------------------------------

export async function fakeTenant() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "tenant-key", alg: "RS256" } as JWK;
  const { privateKey: forgedKey } = await generateKeyPair("RS256");
  const tenant = {
    jwks: createLocalJWKSet({ keys: [jwk] }),
    /** What the next token request answers with. */
    next: { subject: SUBJECT, nonce: "", audience: CLIENT_ID, issuer: ISSUER, forged: false, expiresIn: "5m", status: 200 },
    requests: [] as Array<{ url: string; body: URLSearchParams }>,
    fetch: (async (input: URL | RequestInfo, init?: RequestInit) => {
      tenant.requests.push({ url: String(input), body: new URLSearchParams(String(init?.body ?? "")) });
      if (tenant.next.status !== 200) return new Response("{}", { status: tenant.next.status });
      const token = await new SignJWT({ nonce: tenant.next.nonce })
        .setProtectedHeader({ alg: "RS256", kid: "tenant-key" })
        .setIssuer(tenant.next.issuer)
        .setAudience(tenant.next.audience)
        .setSubject(tenant.next.subject)
        .setIssuedAt()
        .setExpirationTime(tenant.next.expiresIn)
        .sign(tenant.next.forged ? forgedKey : privateKey);
      return new Response(JSON.stringify({ id_token: token, access_token: "unused", token_type: "Bearer" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  };
  return tenant;
}

// Serving -----------------------------------------------------------------------------------------------------------

const closers: Array<() => Promise<void>> = [];

/** Closes every server the tests started; each test file runs it after each test. */
export async function closeAtlasServers(): Promise<void> {
  await Promise.all(closers.splice(0).map((close) => close()));
}

/** Serves a handler on a free port; the handler can be given once the address is known. */
export async function serve(handler: AtlasPagesHandler | ((base: string) => AtlasPagesHandler)): Promise<string> {
  let inner: AtlasPagesHandler | undefined = typeof handler === "function" ? undefined : handler;
  const late: AtlasPagesHandler = {
    dispatch: (request: IncomingMessage, response: ServerResponse, options: AtlasPagesDispatchOptions) =>
      inner!.dispatch(request, response, options),
    refuseTarget: (request: IncomingMessage, response: ServerResponse) => inner!.refuseTarget(request, response),
  };
  const server = createAskRigorHttpServer({ publicServerEnabled: false, atlasPagesHandler: late });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  if (typeof handler === "function") inner = handler(base);
  return base;
}

export interface Fixture {
  base: string;
  settings: AtlasParticipationSettings;
  tenant: Awaited<ReturnType<typeof fakeTenant>>;
  store: InMemoryAtlasParticipation;
  publications: InMemoryAtlasPublicationStore;
  signal: AtlasChangeSignal;
  /** Signs in as a subject through the fake tenant; returns the session cookie's header value. */
  signIn(subject?: string): Promise<string>;
  get(path: string, cookie?: string): Promise<{ response: Response; body: string }>;
  post(path: string, fields: Record<string, string>, options?: { cookie?: string; origin?: string | null; referer?: string;
    type?: string }): Promise<Response>;
}

export async function fixture(options: {
  limiters?: AtlasParticipationRuntime["limiters"];
  participation?: boolean;
  now?: () => number;
} = {}): Promise<Fixture> {
  const published = await publications();
  const store = new InMemoryAtlasParticipation(published);
  const tenant = await fakeTenant();
  const settings: AtlasParticipationSettings = {
    publicOrigin: "https://askrigor.example", sessionKey: bytes(7), participantSecret: bytes(9), identitySecret: bytes(11),
  };
  const signal = new AtlasChangeSignal();
  const base = await serve((origin) => {
    settings.publicOrigin = origin;
    return createAtlasPagesHandler({
      enabled: true,
      publicOrigin: origin,
      source: new InMemoryAtlasPageSource({ publications: published, participation: store }),
      signal,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.participation === false ? {} : {
        participation: {
          settings,
          store: announcingParticipationStore(store, signal),
          signIn: { issuerUrl: new URL(ISSUER), clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, jwks: tenant.jwks,
            fetch: tenant.fetch },
          ...(options.limiters === undefined ? {} : { limiters: options.limiters }),
        },
      }),
    });
  });
  const get = async (path: string, cookie?: string) => {
    const response = await fetch(`${base}${path}`, { redirect: "manual", ...(cookie === undefined ? {} : { headers: { cookie } }) });
    return { response, body: await response.text() };
  };
  const post = async (path: string, fields: Record<string, string>, postOptions: { cookie?: string; origin?: string | null;
    referer?: string; type?: string } = {}) => fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": postOptions.type ?? "application/x-www-form-urlencoded",
      ...(postOptions.origin === null ? {} : { origin: postOptions.origin ?? base }),
      ...(postOptions.referer === undefined ? {} : { referer: postOptions.referer }),
      ...(postOptions.cookie === undefined ? {} : { cookie: postOptions.cookie }),
    },
    body: new URLSearchParams(fields).toString(),
  });
  const signIn = async (subject = SUBJECT) => {
    const login = await get("/atlas/auth/login?return=/atlas/findings/P-1001");
    const location = new URL(login.response.headers.get("location")!);
    const loginCookie = cookiePart(login.response, ATLAS_LOGIN_COOKIE)!;
    tenant.next = { ...tenant.next, subject, nonce: location.searchParams.get("nonce")! };
    const callback = await get(`/atlas/auth/callback?code=synthetic-code&state=${location.searchParams.get("state")}`,
      loginCookie);
    expect(callback.response.status, callback.body).toBe(303);
    return cookiePart(callback.response, ATLAS_SESSION_COOKIE)!;
  };
  return { base, settings, tenant, store, publications: published, signal, signIn, get, post };
}

/** The name=value part of a response's Set-Cookie for a cookie, as a request's Cookie header carries it. */
export function cookiePart(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().map((header) => header.split(";")[0]!).find((part) => part.startsWith(`${name}=`));
}

/** A form's CSRF token on a page: the first token after the form's action. */
export function tokenFor(html: string, action: string): string {
  const at = html.indexOf(`action="${action}"`);
  expect(at, `no form for ${action}`).toBeGreaterThan(-1);
  return /name="csrf" value="([^"]+)"/u.exec(html.slice(at))![1]!;
}

export function expectPageHeaders(response: Response) {
  for (const [name, value] of Object.entries(ATLAS_PAGE_HEADERS)) expect(response.headers.get(name), name).toBe(value);
}
