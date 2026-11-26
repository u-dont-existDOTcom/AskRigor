import { readFile } from "node:fs/promises";
import type { Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";

import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_CHANGES,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { SignJWT, jwtVerify } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { createAccountTermsRoutes } from "../apps/research-mcp/src/account-terms/routes.js";
import {
  TERMS_TOKEN_AUDIENCE,
  TERMS_TOKEN_FIELD,
  TERMS_TOKEN_MAX_SECONDS,
  accountTermsSettingsFromEnv,
} from "../apps/research-mcp/src/account-terms/tokens.js";
import { PUBLIC_RATE_LIMIT } from "../apps/research-mcp/src/config.js";
import { createTokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// The Auth0 post-login Action of owner answer 419a, kept in the repository and run here without Auth0: its decisions,
// its two handlers against a stand-in for Auth0's api object, and a round trip through AskRigor's page with Auth0's
// documented token behaviour simulated. Synthetic secrets, users and states only.
const require = createRequire(import.meta.url);
const ACTION_PATH = "../ops/auth0/actions/terms-at-first-sign-in.js";

interface ActionModule {
  onExecutePostLogin(event: unknown, api: unknown): Promise<void>;
  onContinuePostLogin(event: unknown, api: unknown): Promise<void>;
  termsAction: {
    TERMS_AUDIENCE: string; TOKEN_FIELD: string; TOKEN_SECONDS: number; METADATA_KEY: string; DECLINED: string;
    UNCONFIRMED: string;
    settingsOf(secrets: unknown): unknown;
    redirectDecision(event: unknown, settings: unknown, alreadySent: boolean): { redirect: boolean; reason: string };
    continueDecision(payload: unknown, event: unknown): { deny: boolean; reason?: string; noticeVersion?: string };
  };
}
const action = require(ACTION_PATH) as ActionModule;
const { termsAction } = action;

const SECRET = "synthetic-terms-secret-for-tests-only-0123456789abcdef";
const PAGE = "https://mcp.askrigor.example/account/terms";
const USER = "auth0|synthetic-action-user";
const TENANT = "identity.askrigor.example";
const SECRETS = { TERMS_SECRET: SECRET, TERMS_PAGE_URL: PAGE, NOTICE_VERSION: RESEARCH_USE_NOTICE_VERSION, APPLY_TO: "*" };
const V5 = "free-contributor-v5-2026-11-05";

interface Event {
  secrets: Record<string, string | undefined>;
  client: { client_id: string };
  transaction: { id?: string; protocol?: string; prompt?: string[] };
  request: { query: Record<string, string>; body: Record<string, string> };
  user: { user_id: string; app_metadata: Record<string, unknown> };
}

function eventOf(changes: Partial<Event> = {}): Event {
  return {
    secrets: { ...SECRETS },
    client: { client_id: "synthetic-dev-client" },
    transaction: { id: "synthetic-transaction-1", protocol: "oidc-basic-profile", prompt: [] },
    request: { query: {}, body: {} },
    user: { user_id: USER, app_metadata: {} },
    ...changes,
  };
}

/** A stand-in for the post-login api object: what each handler called, with Auth0's cache kept between calls. */
function apiOf(options: {
  encodeToken?: (input: { secret: string; expiresInSeconds: number; payload: Record<string, unknown> }) => string;
  validateToken?: (input: { secret: string; tokenParameterName: string }) => unknown;
} = {}) {
  const cache = new Map<string, string>();
  const calls = {
    sendUserTo: [] as Array<{ url: string; options: { query: Record<string, string> } }>,
    encodeToken: [] as Array<{ secret: string; expiresInSeconds: number; payload: Record<string, unknown> }>,
    validateToken: [] as Array<{ secret: string; tokenParameterName: string }>,
    deny: [] as string[],
    setAppMetadata: [] as Array<[string, unknown]>,
  };
  const api = {
    cache: {
      get: (key: string) => cache.has(key) ? { value: cache.get(key), expires_at: Date.now() + 60_000 } : undefined,
      set: (key: string, value: string) => { cache.set(key, value); return { type: "success" }; },
    },
    redirect: {
      encodeToken: (input: { secret: string; expiresInSeconds: number; payload: Record<string, unknown> }) => {
        calls.encodeToken.push(input);
        return options.encodeToken?.(input) ?? "synthetic.encoded.token";
      },
      sendUserTo: (url: string, sendOptions: { query: Record<string, string> }) => {
        calls.sendUserTo.push({ url, options: sendOptions });
      },
      validateToken: (input: { secret: string; tokenParameterName: string }) => {
        calls.validateToken.push(input);
        if (options.validateToken === undefined) throw new Error("no token");
        return options.validateToken(input);
      },
    },
    access: { deny: (reason: string) => { calls.deny.push(reason); } },
    user: { setAppMetadata: (key: string, value: unknown) => { calls.setAppMetadata.push([key, value]); } },
  };
  return { api, calls, cache };
}

const servers: HttpServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("the Action's settings", () => {
  it("come from its four secrets, and without any of them it sends no one to the page", () => {
    expect(termsAction.settingsOf(SECRETS)).toEqual({ secret: SECRET, pageUrl: PAGE,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION, applyTo: "*" });
    expect(termsAction.settingsOf({ ...SECRETS, APPLY_TO: " synthetic-dev-client , other-client " }))
      .toMatchObject({ applyTo: new Set(["synthetic-dev-client", "other-client"]) });
    for (const changes of [
      { TERMS_SECRET: undefined }, { TERMS_SECRET: "too-short-0123456789" }, { TERMS_SECRET: `${SECRET} ` },
      { NOTICE_VERSION: undefined }, { NOTICE_VERSION: "v6" }, { TERMS_PAGE_URL: undefined },
      { TERMS_PAGE_URL: "http://mcp.askrigor.example/account/terms" }, { TERMS_PAGE_URL: `${PAGE}?next=1` },
      { TERMS_PAGE_URL: "not a url" }, { APPLY_TO: undefined }, { APPLY_TO: " , " },
    ]) {
      const settings = termsAction.settingsOf({ ...SECRETS, ...changes });
      expect(settings, JSON.stringify(changes)).toBeUndefined();
      expect(termsAction.redirectDecision(eventOf(), settings, false)).toEqual({ redirect: false, reason: "not_configured" });
    }
    expect(termsAction.settingsOf(undefined)).toBeUndefined();
  });

  it("match the server's: one secret's alphabet, the audience, the field, at most ten minutes, every notice version", () => {
    expect(termsAction.TERMS_AUDIENCE).toBe(TERMS_TOKEN_AUDIENCE);
    expect(termsAction.TOKEN_FIELD).toBe(TERMS_TOKEN_FIELD);
    expect(termsAction.TOKEN_SECONDS).toBeLessThanOrEqual(TERMS_TOKEN_MAX_SECONDS);
    expect(accountTermsSettingsFromEnv({ ASKRIGOR_AUTH0_TERMS_SECRET: SECRET, ASKRIGOR_OAUTH_ENABLED: "true",
      ASKRIGOR_OAUTH_ISSUER_URL: `https://${TENANT}/` })).toBeDefined();
    for (const { version } of RESEARCH_USE_NOTICE_CHANGES) {
      expect(termsAction.settingsOf({ ...SECRETS, NOTICE_VERSION: version }), version).toBeDefined();
    }
  });

  it("keep NOTICE_VERSION in step: the instructions next to the Action name the server's current version", async () => {
    const instructions = await readFile(new URL("../ops/auth0/actions/terms-at-first-sign-in.md", import.meta.url), "utf8");
    expect(instructions).toContain(`| \`NOTICE_VERSION\` | \`${RESEARCH_USE_NOTICE_VERSION}\`, the server's ` +
      "`RESEARCH_USE_NOTICE_VERSION`. |");
  });
});

describe("whether a sign-in goes to the page", () => {
  const settings = termsAction.settingsOf(SECRETS);

  it("goes on an interactive sign-in without the current version in app_metadata", () => {
    for (const protocol of ["oidc-basic-profile", "oidc-implicit-profile", "oidc-hybrid-profile"]) {
      expect(termsAction.redirectDecision(eventOf({ transaction: { id: "t", protocol } }), settings, false))
        .toEqual({ redirect: true, reason: "ask" });
    }
    const earlier = eventOf({ user: { user_id: USER, app_metadata: { askrigor_notice_version: V5 } } });
    expect(termsAction.redirectDecision(earlier, settings, false)).toEqual({ redirect: true, reason: "ask" });
    const login = eventOf({ transaction: { id: "t", protocol: "oidc-basic-profile", prompt: ["login", "consent"] } });
    expect(termsAction.redirectDecision(login, settings, false).redirect).toBe(true);
  });

  it("never goes on a refresh-token exchange or any other token grant", () => {
    for (const protocol of ["oauth2-refresh-token", "oauth2-password", "oauth2-resource-owner",
      "oauth2-resource-owner-jwt-bearer", "oauth2-token-exchange", "oauth2-device-code", "oauth2-access-token",
      "oauth2-webauthn", "oidc-ciba", "oidc-ciba-web-link", "samlp", "wsfed", "wstrust-usernamemixed", undefined]) {
      expect(termsAction.redirectDecision(eventOf({ transaction: { id: "t", protocol } }), settings, false), protocol)
        .toEqual({ redirect: false, reason: "not_interactive" });
    }
  });

  it("never goes with prompt=none, wherever Auth0 reports it", () => {
    for (const changes of [
      { transaction: { id: "t", protocol: "oidc-basic-profile", prompt: ["none"] } },
      { request: { query: { prompt: "none" }, body: {} } },
      { request: { query: {}, body: { prompt: "none" } } },
      { request: { query: { prompt: "consent none" }, body: {} } },
    ] satisfies Partial<Event>[]) {
      expect(termsAction.redirectDecision(eventOf(changes), settings, false)).toEqual({ redirect: false,
        reason: "prompt_none" });
    }
  });

  it("goes at most once in a transaction, not after the current version was recorded, and only for its applications", () => {
    expect(termsAction.redirectDecision(eventOf(), settings, true)).toEqual({ redirect: false, reason: "already_sent" });
    expect(termsAction.redirectDecision(eventOf({ transaction: { protocol: "oidc-basic-profile" } }), settings, false))
      .toEqual({ redirect: false, reason: "no_transaction" });
    const recorded = eventOf({ user: { user_id: USER, app_metadata: { askrigor_notice_version: RESEARCH_USE_NOTICE_VERSION } } });
    expect(termsAction.redirectDecision(recorded, settings, false)).toEqual({ redirect: false, reason: "accepted" });
    const devOnly = termsAction.settingsOf({ ...SECRETS, APPLY_TO: "synthetic-dev-client" });
    expect(termsAction.redirectDecision(eventOf(), devOnly, false).redirect).toBe(true);
    expect(termsAction.redirectDecision(eventOf({ client: { client_id: "synthetic-production-client" } }), devOnly, false))
      .toEqual({ redirect: false, reason: "other_application" });
  });

  it("redirects at most once per transaction through Auth0's cache, with a ten-minute token for the page", async () => {
    const { api, calls } = apiOf();
    await action.onExecutePostLogin(eventOf(), api);
    expect(calls.encodeToken).toEqual([{ secret: SECRET, expiresInSeconds: 600, payload: { aud: TERMS_TOKEN_AUDIENCE } }]);
    expect(calls.sendUserTo).toEqual([{ url: PAGE, options: { query: { session_token: "synthetic.encoded.token" } } }]);
    // The same transaction again (the pipeline run twice): no second redirect.
    await action.onExecutePostLogin(eventOf(), api);
    expect(calls.sendUserTo).toHaveLength(1);
    // A new transaction of a user still without the version goes once more; a renewal never does.
    await action.onExecutePostLogin(eventOf({ transaction: { id: "synthetic-transaction-2", protocol: "oidc-basic-profile" } }), api);
    await action.onExecutePostLogin(eventOf({ transaction: { id: "synthetic-transaction-3", protocol: "oauth2-refresh-token" } }), api);
    expect(calls.sendUserTo).toHaveLength(2);
    expect(calls.deny).toEqual([]);
  });

  it("touches nothing on a sign-in it doesn't send, and lets the sign-in go on if Auth0's api fails while sending", async () => {
    const { api, calls } = apiOf();
    const broken = { ...api, cache: { get: () => { throw new Error("synthetic cache failure"); },
      set: () => { throw new Error("synthetic cache failure"); } } };
    // A renewal and a user who already holds the version never reach the cache.
    await expect(action.onExecutePostLogin(eventOf({ transaction: { id: "t", protocol: "oauth2-refresh-token" } }), broken))
      .resolves.toBeUndefined();
    await expect(action.onExecutePostLogin(eventOf({ user: { user_id: USER,
      app_metadata: { askrigor_notice_version: RESEARCH_USE_NOTICE_VERSION } } }), broken)).resolves.toBeUndefined();
    // An interactive sign-in whose cache fails is not sent and not stopped: the server's notice check stays the backstop.
    await expect(action.onExecutePostLogin(eventOf(), broken)).resolves.toBeUndefined();
    const failingEncode = apiOf({ encodeToken: () => { throw new Error("synthetic encode failure"); } });
    await expect(action.onExecutePostLogin(eventOf(), failingEncode.api)).resolves.toBeUndefined();
    expect([...calls.sendUserTo, ...failingEncode.calls.sendUserTo]).toEqual([]);
    expect([...calls.deny, ...failingEncode.calls.deny]).toEqual([]);
  });
});

describe("what the page's answer does to the sign-in", () => {
  const userEvent = eventOf();

  it("records the accepted version, ends a declined sign-in with a plain reason, and refuses anything else", () => {
    expect(termsAction.continueDecision({ iss: TERMS_TOKEN_AUDIENCE, sub: USER, state: "s", accepted: true,
      notice_version: RESEARCH_USE_NOTICE_VERSION }, userEvent)).toEqual({ deny: false, noticeVersion: RESEARCH_USE_NOTICE_VERSION });
    // A paid private account's answer names no version: the sign-in goes on and nothing is recorded.
    expect(termsAction.continueDecision({ iss: TERMS_TOKEN_AUDIENCE, sub: USER, accepted: true }, userEvent))
      .toEqual({ deny: false, noticeVersion: undefined });
    expect(termsAction.continueDecision({ iss: TERMS_TOKEN_AUDIENCE, sub: USER, accepted: false }, userEvent))
      .toEqual({ deny: true, reason: termsAction.DECLINED });
    for (const payload of [null, "accepted", {}, { accepted: "true" }, { accepted: 1 },
      { iss: TENANT, sub: USER, accepted: true }, { iss: TERMS_TOKEN_AUDIENCE, sub: "auth0|someone-else", accepted: true }]) {
      expect(termsAction.continueDecision(payload, userEvent), JSON.stringify(payload))
        .toEqual({ deny: true, reason: termsAction.UNCONFIRMED });
    }
    // A version that isn't one is never written to app_metadata.
    expect(termsAction.continueDecision({ accepted: true, notice_version: "<script>" }, userEvent))
      .toEqual({ deny: false, noticeVersion: undefined });
    expect(termsAction.DECLINED).toBe("You declined AskRigor's free-use notice, so you weren't signed in. To use " +
      "AskRigor, sign in again and accept it.");
  });

  it("checks the answer with validateToken under the shared secret and the page's field", async () => {
    const accepted = apiOf({ validateToken: () => ({ iss: TERMS_TOKEN_AUDIENCE, sub: USER, accepted: true,
      notice_version: RESEARCH_USE_NOTICE_VERSION }) });
    await action.onContinuePostLogin(userEvent, accepted.api);
    expect(accepted.calls.validateToken).toEqual([{ secret: SECRET, tokenParameterName: "session_token" }]);
    expect(accepted.calls.setAppMetadata).toEqual([["askrigor_notice_version", RESEARCH_USE_NOTICE_VERSION]]);
    expect(accepted.calls.deny).toEqual([]);

    const declined = apiOf({ validateToken: () => ({ iss: TERMS_TOKEN_AUDIENCE, sub: USER, accepted: false }) });
    await action.onContinuePostLogin(userEvent, declined.api);
    expect(declined.calls.deny).toEqual([termsAction.DECLINED]);
    expect(declined.calls.setAppMetadata).toEqual([]);

    // Auth0 refused the token (signature, expiry or state): the sign-in ends, and nothing is recorded.
    const refused = apiOf({ validateToken: () => { throw new Error("The session token is invalid"); } });
    await action.onContinuePostLogin(userEvent, refused.api);
    expect(refused.calls.deny).toEqual([termsAction.UNCONFIRMED]);
    expect(refused.calls.setAppMetadata).toEqual([]);

    const paid = apiOf({ validateToken: () => ({ iss: TERMS_TOKEN_AUDIENCE, sub: USER, accepted: true }) });
    await action.onContinuePostLogin(userEvent, paid.api);
    expect(paid.calls.deny).toEqual([]);
    expect(paid.calls.setAppMetadata).toEqual([]);
  });
});

describe("a round trip through AskRigor's page", () => {
  const NOW = new Date("2026-11-26T12:00:00.000Z");
  const STATE = "hKFo2SByb3VuZC10cmlwLXN0YXRl";

  /**
   * Auth0's encodeToken as its documentation describes the token: sub (the user's ID), iss (the tenant's hostname),
   * exp and ip, with the payload's claims beside them, HS256 under the secret.
   */
  function auth0EncodeToken(event: Event) {
    return async (input: { secret: string; expiresInSeconds: number; payload: Record<string, unknown> }) => {
      const issuedAt = Math.floor(NOW.getTime() / 1_000);
      return await new SignJWT({ ...input.payload, sub: event.user.user_id, iss: TENANT, ip: "203.0.113.9" })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + input.expiresInSeconds).sign(new TextEncoder().encode(input.secret));
    };
  }

  /** Auth0's validateToken as documented: the signature, the expiry, and the state claim against the transaction's. */
  async function auth0ValidateToken(token: string, state: string) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), { algorithms: ["HS256"], currentDate: NOW });
    if (payload.state !== state) throw new Error("State in the token does not match the /continue state");
    return payload;
  }

  async function startPage() {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 9),
      now: () => NOW.toISOString() });
    const server = createAskRigorHttpServer({
      researchContributorAccessService: service,
      accountTermsRoutes: createAccountTermsRoutes({
        settings: accountTermsSettingsFromEnv({ ASKRIGOR_AUTH0_TERMS_SECRET: SECRET, ASKRIGOR_OAUTH_ENABLED: "true",
          ASKRIGOR_OAUTH_ISSUER_URL: `https://${TENANT}/` }),
        access: service,
        rateLimiter: createTokenBucketLimiter(PUBLIC_RATE_LIMIT),
        now: () => NOW,
      }),
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { base: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`), store, service };
  }

  /** The Action sends the person; the page is shown; the person answers; the Action reads the answer. */
  async function signIn(decision: "accept" | "decline") {
    const page = await startPage();
    const event = eventOf();
    // Auth0's encodeToken returns at once; the token it would return for the Action's request is made beforehand.
    const request = { secret: SECRET, expiresInSeconds: 600, payload: { aud: TERMS_TOKEN_AUDIENCE } };
    const token = await auth0EncodeToken(event)(request);
    const sender = apiOf({ encodeToken: (input) => { expect(input).toEqual(request); return token; } });
    await action.onExecutePostLogin(event, sender.api);
    const sent = sender.calls.sendUserTo[0]!;
    expect(sent.options.query).toEqual({ session_token: token });
    // Auth0 adds the transaction's state to the page's address after the Action has run; the page is served locally.
    const address = new URL(sent.url);
    address.searchParams.set("session_token", token);
    address.searchParams.set("state", STATE);
    const visit = new URL(`${address.pathname}${address.search}`, page.base);
    const shown = await (await fetch(visit)).text();
    expect(shown).toContain("Accept and continue");
    const answered = await (await fetch(new URL("/account/terms", page.base), {
      method: "POST", body: new URLSearchParams({ session_token: token, state: STATE, decision }),
    })).text();
    const form = /<form id="continue" method="post" action="([^"]+)">/u.exec(answered)![1]!;
    expect(new URL(form.replaceAll("&amp;", "&")).href).toBe(`https://${TENANT}/continue?state=${STATE}`);
    const answer = /<input type="hidden" name="session_token" value="([^"]+)">/u.exec(answered)![1]!;
    const payload = await auth0ValidateToken(answer, STATE);
    const receiver = apiOf({ validateToken: () => payload });
    await action.onContinuePostLogin(event, receiver.api);
    // The Action's own token can never stand in for the answer: it has no state for Auth0 to match.
    await expect(auth0ValidateToken(token, STATE)).rejects.toThrow("State in the token does not match");
    return { ...page, receiver };
  }

  it("Accept: the server records the yes and the Action records the version", async () => {
    const { store, receiver } = await signIn("accept");
    expect(store.allAccounts()).toMatchObject([{ noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      noticeAcceptedBy: "PERSON_SIGN_IN_PAGE" }]);
    expect(receiver.calls.deny).toEqual([]);
    expect(receiver.calls.setAppMetadata).toEqual([["askrigor_notice_version", RESEARCH_USE_NOTICE_VERSION]]);
  });

  it("Decline: nothing is recorded anywhere and the sign-in ends with the plain reason", async () => {
    const { store, receiver } = await signIn("decline");
    expect(store.allAccounts()).toEqual([]);
    expect(receiver.calls.deny).toEqual([termsAction.DECLINED]);
    expect(receiver.calls.setAppMetadata).toEqual([]);
  });
});
