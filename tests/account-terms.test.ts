import { createHash } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  type ResearchUseAccountRecord,
} from "@askrigor/evidence-repository";
import { SignJWT, base64url, createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ANSWER_POLICY, ANSWER_SCRIPT, PAGE_POLICY } from "../apps/research-mcp/src/account-terms/pages.js";
import { createAccountTermsRoutes, type AccountTermsAccess } from "../apps/research-mcp/src/account-terms/routes.js";
import {
  TERMS_TOKEN_AUDIENCE,
  accountTermsSettingsFromEnv,
  type AccountTermsSettings,
} from "../apps/research-mcp/src/account-terms/tokens.js";
import { PUBLIC_RATE_LIMIT } from "../apps/research-mcp/src/config.js";
import { createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import { createTokenBucketLimiter, type TokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import { noticeAcceptanceSentence } from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// Owner answer 419a (26 Nov 2026): AskRigor's terms page right after a person's first sign-in, between Auth0's
// post-login Action and Auth0's /continue. Synthetic subjects, secrets and states only.
const SECRET = "synthetic-terms-secret-for-tests-only-0123456789abcdef";
const ISSUER = "https://identity.askrigor.example/";
const ISSUER_HOST = "identity.askrigor.example";
const ENV = { ASKRIGOR_AUTH0_TERMS_SECRET: SECRET, ASKRIGOR_OAUTH_ENABLED: "true", ASKRIGOR_OAUTH_ISSUER_URL: ISSUER };
const SETTINGS = accountTermsSettingsFromEnv(ENV)!;
const PERSON = "auth0|synthetic-terms-person";
const OWNER = "auth0|synthetic-terms-owner";
const STATE = "hKFo2SBzeW50aGV0aWMtc3RhdGUtZm9yLXRlc3Rz";
const IDENTITY_SECRET = new TextEncoder().encode("synthetic-terms-identity-secret-at-least-32-bytes");
const NOW = new Date("2026-11-26T12:00:00.000Z");
const SECONDS = Math.floor(NOW.getTime() / 1_000);
const V5 = "free-contributor-v5-2026-11-05";
/** The agreement accept_free_contributor takes, as the tool's schema asks for it. */
const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
};

const servers: HttpServer[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

/** A token as the Action's api.redirect.encodeToken writes it: sub, the tenant's hostname as iss, exp, ip, and aud. */
async function actionToken(claims: Record<string, unknown> = {}, options: {
  secret?: string; lifetime?: number; issuedAt?: number | null; alg?: "HS256" | "HS512";
} = {}): Promise<string> {
  const issuedAt = options.issuedAt === undefined ? SECONDS : options.issuedAt;
  const jwt = new SignJWT({ sub: PERSON, iss: ISSUER_HOST, aud: TERMS_TOKEN_AUDIENCE, ip: "203.0.113.9", ...claims })
    .setProtectedHeader({ alg: options.alg ?? "HS256", typ: "JWT" })
    .setExpirationTime((issuedAt ?? SECONDS) + (options.lifetime ?? 600));
  if (issuedAt !== null) jwt.setIssuedAt(issuedAt);
  return await jwt.sign(new TextEncoder().encode(options.secret ?? SECRET));
}

function accountOf(service: ResearchContributorAccessService, subject: string,
  changes: Partial<ResearchUseAccountRecord> = {}): ResearchUseAccountRecord {
  const version = (changes.noticeVersion ?? RESEARCH_USE_NOTICE_VERSION) as string;
  return {
    accountKey: service.accountKeyForSubject(subject), status: "ACTIVE", mode: "FREE_CONTRIBUTOR",
    noticeVersion: version as never, agreement: { ...AGREEMENT, noticeVersion: version } as never,
    activatedAt: "2026-11-06T10:00:00.000Z", revokedAt: null, createdAt: "2026-10-06T10:00:00.000Z",
    updatedAt: "2026-11-06T10:00:00.000Z", noticeAcceptedBy: "PERSON", ...changes,
  };
}

async function start(options: {
  settings?: AccountTermsSettings | undefined; access?: AccountTermsAccess; rateLimiter?: TokenBucketLimiter;
  clock?: { now: Date };
} = {}) {
  const clock = options.clock ?? { now: NOW };
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({
    store, identitySecret: IDENTITY_SECRET, now: () => clock.now.toISOString(), ownerSubjects: new Set([OWNER]),
  });
  const server = createAskRigorHttpServer({
    researchContributorAccessService: service,
    accountTermsRoutes: createAccountTermsRoutes({
      settings: "settings" in options ? options.settings : SETTINGS,
      access: options.access ?? service,
      rateLimiter: options.rateLimiter ?? createTokenBucketLimiter({ ...PUBLIC_RATE_LIMIT, capacity: 1_000 }),
      now: () => clock.now,
    }),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  return { base, store, service, clock };
}

function pageUrl(base: URL, query: Record<string, string | string[]>): URL {
  const url = new URL("/account/terms", base);
  for (const [name, values] of Object.entries(query)) {
    for (const value of [values].flat()) url.searchParams.append(name, value);
  }
  return url;
}

async function post(base: URL, fields: Record<string, string>) {
  const response = await fetch(new URL("/account/terms", base), { method: "POST", body: new URLSearchParams(fields) });
  return { response, body: await response.text() };
}

async function visit(base: URL, query: Record<string, string | string[]>) {
  const response = await fetch(pageUrl(base, query));
  return { response, body: await response.text() };
}

const unescape = (text: string) => text.replaceAll("&quot;", "\"").replaceAll("&#39;", "'").replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">").replaceAll("&amp;", "&");

/** The answer page's form: where it posts, and the signed answer it carries, verified with the shared secret. */
async function answerOf(body: string) {
  const action = /<form id="continue" method="post" action="([^"]+)">/u.exec(body)?.[1];
  const token = /<input type="hidden" name="session_token" value="([^"]+)">/u.exec(body)?.[1];
  expect(action).toBeDefined();
  expect(token).toBeDefined();
  const { payload, protectedHeader } = await jwtVerify(token!, SETTINGS.secret, {
    algorithms: ["HS256"], issuer: TERMS_TOKEN_AUDIENCE, currentDate: NOW,
  });
  return { action: new URL(unescape(action!)), token: token!, payload, protectedHeader };
}

function expectExpired(page: { response: Response; body: string }) {
  expect(page.response.status).toBe(400);
  expect(page.body).toContain("<h1>This sign-in link has expired</h1>");
  expect(page.body).toContain("Nothing was recorded. Go back to the app you were signing in from and sign in to " +
    "AskRigor again.");
  expect(page.body).not.toContain("<form");
  expect(page.response.headers.get("content-security-policy")).toBe(PAGE_POLICY);
}

describe("AskRigor's terms page at sign-in (owner answer 419a)", () => {
  it("shows the current free-use notice word for word, with the terms and privacy links and two buttons", async () => {
    const { base, store } = await start();
    const token = await actionToken();
    const page = await visit(base, { session_token: token, state: STATE });
    expect(page.response.status).toBe(200);
    expect(page.response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.response.headers.get("cache-control")).toBe("no-store");
    expect(page.response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.response.headers.get("x-frame-options")).toBe("DENY");
    expect(page.response.headers.get("content-security-policy")).toBe(PAGE_POLICY);
    expect(PAGE_POLICY).toContain("form-action 'self'");
    expect(page.body).not.toContain("<script");
    // The notice every AI app is given, one sentence per paragraph, and nothing added to it.
    const notice = page.body.slice(page.body.indexOf("</h1>") + 5, page.body.indexOf('<p class="links">'));
    const sentences = [...notice.matchAll(/<p>([^<]*)<\/p>/gu)].map(([, sentence]) => unescape(sentence!));
    expect(sentences.join(" ")).toBe(RESEARCH_USE_NOTICE);
    expect(notice.replace(/<p>[^<]*<\/p>/gu, "").trim()).toBe("");
    expect(page.body).toContain('<a href="https://askrigor.com/terms" target="_blank" rel="noopener noreferrer">Terms</a>');
    expect(page.body).toContain('<a href="https://askrigor.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>');
    // Both buttons post the same token and state back to the page itself.
    expect(page.body).toContain('<form method="post" action="/account/terms">');
    expect(page.body).toContain(`<input type="hidden" name="session_token" value="${token}">`);
    expect(page.body).toContain(`<input type="hidden" name="state" value="${STATE}">`);
    expect(page.body).toContain('<button class="accept" type="submit" name="decision" value="accept">Accept and continue</button>');
    expect(page.body).toContain('<button type="submit" name="decision" value="decline">Decline</button>');
    expect(page.body.match(/<button/gu)).toHaveLength(2);
    // A GET records nothing.
    expect(store.allAccounts()).toEqual([]);
  });

  it("shows no page and records nothing without a valid token: missing, expired, altered, or for another audience or state", async () => {
    const { base, store } = await start();
    const valid = await actionToken();
    const [header, payload, signature] = valid.split(".") as [string, string, string];
    const otherPayload = base64url.encode(JSON.stringify({
      ...JSON.parse(new TextDecoder().decode(base64url.decode(payload))), sub: "auth0|synthetic-someone-else",
    }));
    // A character in the middle carries six bits of the signature, unlike the last one's padding bits.
    const flipped = `${signature.slice(0, 10)}${signature[10] === "A" ? "B" : "A"}${signature.slice(11)}`;
    const unsigned = `${base64url.encode(JSON.stringify({ alg: "none", typ: "JWT" }))}.${payload}.`;
    const refused: Record<string, Record<string, string | string[]>> = {
      "no token": { state: STATE },
      "no state": { session_token: valid },
      "two tokens": { session_token: [valid, valid], state: STATE },
      "two states": { session_token: valid, state: [STATE, STATE] },
      "not a token": { session_token: "not-a-token", state: STATE },
      "a state outside Auth0's alphabet": { session_token: valid, state: "a state with spaces" },
      "expired": { session_token: await actionToken({}, { issuedAt: SECONDS - 700 }), state: STATE },
      "for another audience": { session_token: await actionToken({ aud: "askrigor-other" }), state: STATE },
      "without an audience": { session_token: await actionToken({ aud: undefined }), state: STATE },
      "for another state": { session_token: await actionToken({ state: "another-state" }), state: STATE },
      "from another issuer": { session_token: await actionToken({ iss: "identity.example.org" }), state: STATE },
      "without a subject": { session_token: await actionToken({ sub: undefined }), state: STATE },
      "valid for more than ten minutes": { session_token: await actionToken({}, { lifetime: 601 }), state: STATE },
      "valid for more than ten minutes, without iat": {
        session_token: await actionToken({}, { issuedAt: null, lifetime: 1_200 }), state: STATE },
      "signed with another secret": {
        session_token: await actionToken({}, { secret: "another-synthetic-secret-0123456789abcdefghijklmno" }), state: STATE },
      "signed with another algorithm": { session_token: await actionToken({}, { alg: "HS512" }), state: STATE },
      "altered": { session_token: `${header}.${otherPayload}.${signature}`, state: STATE },
      "with an altered signature": { session_token: `${header}.${payload}.${flipped}`, state: STATE },
      "unsigned": { session_token: unsigned, state: STATE },
    };
    for (const [name, query] of Object.entries(refused)) {
      const page = await visit(base, query);
      expect(page.response.status, name).toBe(400);
      expectExpired(page);
      if (typeof query.session_token === "string" && typeof query.state === "string") {
        for (const decision of ["accept", "decline"]) {
          const answer = await post(base, { session_token: query.session_token, state: query.state, decision });
          expect(answer.response.status, `${name}, ${decision}`).toBe(400);
          expectExpired(answer);
        }
      }
    }
    // The valid token itself is admitted, with or without a state claim equal to the address's.
    expect((await visit(base, { session_token: valid, state: STATE })).response.status).toBe(200);
    expect((await visit(base, { session_token: await actionToken({ state: STATE }), state: STATE })).response.status)
      .toBe(200);
    expect(store.allAccounts()).toEqual([]);
  });

  it("accepts a token whose issuer is written as the tenant's issuer URL, and refuses a form without a decision", async () => {
    const { base, store } = await start();
    const token = await actionToken({ iss: ISSUER });
    expect((await visit(base, { session_token: token, state: STATE })).response.status).toBe(200);
    for (const decision of [undefined, "maybe", "ACCEPT"]) {
      const page = await post(base, { session_token: token, state: STATE, ...(decision === undefined ? {} : { decision }) });
      expectExpired(page);
    }
    const twice = await fetch(new URL("/account/terms", base), {
      method: "POST", body: `session_token=${token}&state=${STATE}&decision=accept&decision=decline`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(twice.status).toBe(400);
    const json = await fetch(new URL("/account/terms", base), {
      method: "POST", body: JSON.stringify({ session_token: token, state: STATE, decision: "accept" }),
      headers: { "content-type": "application/json" },
    });
    expect(json.status).toBe(400);
    expect(store.allAccounts()).toEqual([]);
  });

  it("records the same acceptance accept_free_contributor records, noted as given on the page, and goes back signed", async () => {
    const { base, store, service } = await start();
    const page = await post(base, { session_token: await actionToken(), state: STATE, decision: "accept" });
    expect(page.response.status).toBe(200);
    // What accept_free_contributor records for the same person at the same moment, through the same service.
    const toolStore = new InMemoryResearchContributorAccessStore();
    const tool = new ResearchContributorAccessService({
      store: toolStore, identitySecret: IDENTITY_SECRET, now: () => NOW.toISOString(), ownerSubjects: new Set([OWNER]),
    });
    await tool.acceptFreeContributor(PERSON, AGREEMENT);
    expect(store.allAccounts()).toEqual([{ ...toolStore.allAccounts()[0], noticeAcceptedBy: "PERSON_SIGN_IN_PAGE" }]);
    expect(store.allAccounts()[0]).toMatchObject({
      accountKey: service.accountKeyForSubject(PERSON), status: "ACTIVE", mode: "FREE_CONTRIBUTOR",
      noticeVersion: RESEARCH_USE_NOTICE_VERSION, agreement: AGREEMENT, activatedAt: NOW.toISOString(),
    });
    // inspect shows the person's own yes to the current notice, which needs no sentence of its own.
    const view = await service.inspect(PERSON);
    expect(view).toMatchObject({ status: "ACTIVE", mode: "FREE_CONTRIBUTOR", acceptance: {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION, acceptedAt: NOW.toISOString(), acceptedBy: "PERSON_SIGN_IN_PAGE",
      current: "accepted" } });
    expect(noticeAcceptanceSentence(view.acceptance)).toBe("");
    await expect(service.requireActive(PERSON)).resolves.toBe("FREE_CONTRIBUTOR");
    // Back to Auth0's /continue by itself: the state in the address, the signed answer only in the body.
    expect(page.response.headers.get("content-security-policy")).toBe(ANSWER_POLICY);
    expect(ANSWER_POLICY).not.toContain("form-action");
    expect(ANSWER_POLICY).toContain(`script-src 'sha256-${createHash("sha256").update(ANSWER_SCRIPT).digest("base64")}'`);
    expect(page.response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.response.headers.get("cache-control")).toBe("no-store");
    expect(page.body).toContain(`<script>${ANSWER_SCRIPT}</script>`);
    expect(page.body).toContain('<button class="accept" type="submit">Continue</button>');
    const answer = await answerOf(page.body);
    expect(answer.action.origin + answer.action.pathname).toBe(`${ISSUER}continue`);
    expect([...answer.action.searchParams]).toEqual([["state", STATE]]);
    expect(answer.protectedHeader).toEqual({ alg: "HS256", typ: "JWT" });
    expect(answer.payload).toEqual({
      iss: TERMS_TOKEN_AUDIENCE, sub: PERSON, state: STATE, accepted: true, notice_version: RESEARCH_USE_NOTICE_VERSION,
      iat: SECONDS, exp: SECONDS + 300,
    });
  });

  it("takes Auth0's state in base64 as well as base64url, and gives it back unchanged", async () => {
    const { base, store } = await start();
    const state = "hKFo2SB+synthetic/state==";
    const token = await actionToken();
    const page = await visit(base, { session_token: token, state });
    expect(page.body).toContain(`<input type="hidden" name="state" value="${state}">`);
    const answered = await post(base, { session_token: token, state, decision: "decline" });
    const answer = await answerOf(answered.body);
    expect(answer.payload.state).toBe(state);
    expect(answer.action.search).toBe(`?state=${encodeURIComponent(state)}`);
    expect(answer.action.searchParams.get("state")).toBe(state);
    expect(store.allAccounts()).toEqual([]);
  });

  it("records a person's yes only as the person's: the owner's standing instruction is never a caller's to give", async () => {
    const { store, service } = await start();
    await expect(service.acceptFreeContributor(PERSON, AGREEMENT, "OWNER_STANDING_INSTRUCTION_2026_11_06" as never))
      .rejects.toThrow();
    await expect(service.acceptFreeContributor(PERSON, AGREEMENT, "SOMEONE_ELSE" as never)).rejects.toThrow();
    expect(store.allAccounts()).toEqual([]);
  });

  it("writes nothing over on a second press of Accept, or after a yes given meanwhile in an app", async () => {
    const clock = { now: NOW };
    const { base, store, service } = await start({ clock });
    const token = await actionToken();
    await post(base, { session_token: token, state: STATE, decision: "accept" });
    const first = store.allAccounts();
    clock.now = new Date(NOW.getTime() + 20_000);
    const again = await post(base, { session_token: token, state: STATE, decision: "accept" });
    expect(store.allAccounts()).toEqual(first);
    expect((await answerOf(again.body)).payload).toMatchObject({ accepted: true, notice_version: RESEARCH_USE_NOTICE_VERSION });
    // A yes in an AI app between the page and the press is kept as it is.
    const other = "auth0|synthetic-terms-app-yes";
    const shown = await actionToken({ sub: other });
    expect((await visit(base, { session_token: shown, state: STATE })).response.status).toBe(200);
    await service.acceptFreeContributor(other, AGREEMENT);
    const inApp = store.allAccounts().find(({ accountKey }) => accountKey === service.accountKeyForSubject(other));
    await post(base, { session_token: shown, state: STATE, decision: "accept" });
    expect(store.allAccounts().find(({ accountKey }) => accountKey === service.accountKeyForSubject(other)))
      .toEqual(inApp);
    expect(inApp?.noticeAcceptedBy).toBe("PERSON");
  });

  it("records nothing on Decline and goes back declined, for a new account and for one under an earlier notice", async () => {
    const { base, store, service } = await start();
    const page = await post(base, { session_token: await actionToken(), state: STATE, decision: "decline" });
    expect(page.response.status).toBe(200);
    expect(store.allAccounts()).toEqual([]);
    const answer = await answerOf(page.body);
    expect(answer.payload).toEqual({ iss: TERMS_TOKEN_AUDIENCE, sub: PERSON, state: STATE, accepted: false,
      iat: SECONDS, exp: SECONDS + 300 });
    expect([...answer.action.searchParams]).toEqual([["state", STATE]]);
    const earlier = accountOf(service, PERSON, { noticeVersion: V5 as never });
    await store.saveAccount(earlier);
    const declined = await post(base, { session_token: await actionToken(), state: STATE, decision: "decline" });
    expect((await answerOf(declined.body)).payload.accepted).toBe(false);
    expect(store.allAccounts()).toEqual([earlier]);
  });

  it("goes straight back as accepted for an account whose yes covers the current notice, and asks one under an earlier notice", async () => {
    const { base, store, service } = await start();
    const covered = accountOf(service, PERSON);
    await store.saveAccount(covered);
    const page = await visit(base, { session_token: await actionToken(), state: STATE });
    expect(page.response.status).toBe(200);
    expect(page.response.headers.get("content-security-policy")).toBe(ANSWER_POLICY);
    expect(page.body).not.toContain("Accept and continue");
    expect((await answerOf(page.body)).payload).toEqual({ iss: TERMS_TOKEN_AUDIENCE, sub: PERSON, state: STATE,
      accepted: true, notice_version: RESEARCH_USE_NOTICE_VERSION, iat: SECONDS, exp: SECONDS + 300 });
    expect(store.allAccounts()).toEqual([covered]);
    // Under v5, which v6 changed materially, and revoked: both are shown the notice, and the GET writes nothing.
    const other = "auth0|synthetic-terms-earlier";
    const earlier = accountOf(service, other, { noticeVersion: V5 as never });
    const revokedSubject = "auth0|synthetic-terms-revoked";
    const revoked = accountOf(service, revokedSubject, { status: "REVOKED", mode: null, noticeVersion: null,
      agreement: null, activatedAt: null, revokedAt: "2026-11-20T10:00:00.000Z", noticeAcceptedBy: null });
    await store.saveAccount(earlier);
    await store.saveAccount(revoked);
    for (const subject of [other, revokedSubject]) {
      const shown = await visit(base, { session_token: await actionToken({ sub: subject }), state: STATE });
      expect(shown.body, subject).toContain("Accept and continue");
    }
    expect(store.allAccounts()).toEqual([covered, earlier, revoked]);
  });

  it("lets the owner's own free login through under the standing instruction, recording nothing on the GET", async () => {
    const { base, store, service } = await start();
    const owner = accountOf(service, OWNER, { noticeVersion: V5 as never });
    await store.saveAccount(owner);
    const page = await visit(base, { session_token: await actionToken({ sub: OWNER }), state: STATE });
    expect((await answerOf(page.body)).payload).toMatchObject({ sub: OWNER, accepted: true,
      notice_version: RESEARCH_USE_NOTICE_VERSION });
    // The standing acceptance is recorded, as before, by the first research call that relies on it.
    expect(store.allAccounts()).toEqual([owner]);
    await expect(service.requireActive(OWNER)).resolves.toBe("FREE_CONTRIBUTOR");
    expect(store.allAccounts()[0]).toMatchObject({ noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      noticeAcceptedBy: "OWNER_STANDING_INSTRUCTION_2026_11_06" });
  });

  it("lets an active paid private account through with no notice version, and Accept never switches it to free use", async () => {
    const { base, store, service } = await start();
    const paid = accountOf(service, PERSON, { mode: "PAID_PRIVATE", noticeVersion: null, agreement: null,
      noticeAcceptedBy: null });
    await store.saveAccount(paid);
    const token = await actionToken();
    const page = await visit(base, { session_token: token, state: STATE });
    expect((await answerOf(page.body)).payload).toEqual({ iss: TERMS_TOKEN_AUDIENCE, sub: PERSON, state: STATE,
      accepted: true, iat: SECONDS, exp: SECONDS + 300 });
    const pressed = await post(base, { session_token: token, state: STATE, decision: "accept" });
    expect((await answerOf(pressed.body)).payload).not.toHaveProperty("notice_version");
    expect(store.allAccounts()).toEqual([paid]);
  });

  it("sends no answer back when the account store fails", async () => {
    const failing: AccountTermsAccess = {
      signInNoticeStatus: async () => { throw new Error("synthetic store failure"); },
      acceptFreeContributor: async () => { throw new Error("synthetic store failure"); },
    };
    const { base } = await start({ access: failing });
    const token = await actionToken();
    for (const page of [await visit(base, { session_token: token, state: STATE }),
      await post(base, { session_token: token, state: STATE, decision: "accept" })]) {
      expect(page.response.status).toBe(503);
      expect(page.body).toContain("<h1>AskRigor's sign-in step isn't available</h1>");
      expect(page.body).not.toContain("<form");
    }
    // A write that fails after the read sends nothing back either.
    const writeFails: AccountTermsAccess = {
      signInNoticeStatus: async () => "ask",
      acceptFreeContributor: async () => { throw new Error("synthetic write failure"); },
    };
    const second = await start({ access: writeFails });
    const pressed = await post(second.base, { session_token: token, state: STATE, decision: "accept" });
    expect(pressed.response.status).toBe(503);
    expect(pressed.body).not.toContain('id="continue"');
    expect(pressed.body).not.toContain("session_token");
  });

  it("answers only GET and POST, and tells a client that asks too often to wait", async () => {
    const { base } = await start({ rateLimiter: createTokenBucketLimiter({
      capacity: 2, refillTokensPerMinute: 1, maxKeys: 10, idleTtlMs: 60_000, now: () => NOW.getTime() }) });
    const put = await fetch(new URL("/account/terms", base), { method: "PUT" });
    expect(put.status).toBe(405);
    expect(put.headers.get("allow")).toBe("GET, POST");
    expect((await visit(base, { session_token: await actionToken(), state: STATE })).response.status).toBe(200);
    const third = await visit(base, { session_token: await actionToken(), state: STATE });
    expect(third.response.status).toBe(429);
    expect(third.response.headers.get("retry-after")).toBe("60");
    expect(third.body).not.toContain("<form");
  });
});

describe("the terms page's settings", () => {
  it("are read from ASKRIGOR_AUTH0_TERMS_SECRET and the tenant the connector trusts, and are off otherwise", () => {
    expect(SETTINGS.issuerUrl.href).toBe(ISSUER);
    expect(SETTINGS.continueUrl.href).toBe(`${ISSUER}continue`);
    expect(new TextDecoder().decode(SETTINGS.secret)).toBe(SECRET);
    const off: NodeJS.ProcessEnv[] = [
      {},
      { ...ENV, ASKRIGOR_AUTH0_TERMS_SECRET: undefined },
      { ...ENV, ASKRIGOR_AUTH0_TERMS_SECRET: "" },
      { ...ENV, ASKRIGOR_AUTH0_TERMS_SECRET: "too-short-0123456789" },
      { ...ENV, ASKRIGOR_AUTH0_TERMS_SECRET: ` ${SECRET}` },
      { ...ENV, ASKRIGOR_AUTH0_TERMS_SECRET: `${SECRET}=` },
      { ...ENV, ASKRIGOR_OAUTH_ENABLED: "false" },
      { ...ENV, ASKRIGOR_OAUTH_ISSUER_URL: undefined },
      { ...ENV, ASKRIGOR_OAUTH_ISSUER_URL: "http://identity.askrigor.example/" },
      { ...ENV, ASKRIGOR_OAUTH_ISSUER_URL: "https://identity.askrigor.example/tenant/" },
      { ...ENV, ASKRIGOR_OAUTH_ISSUER_URL: "https://identity.askrigor.example:8443/" },
      { ...ENV, ASKRIGOR_OAUTH_ISSUER_URL: "https://identity.askrigor.example/?x=1" },
    ];
    for (const env of off) expect(accountTermsSettingsFromEnv(env), JSON.stringify(env)).toBeUndefined();
  });

  /** The server as production makes it: the page's settings from the environment, with the connector's OAuth on. */
  async function startFromEnvironment(store: InMemoryResearchContributorAccessStore) {
    const { publicKey } = await generateKeyPair("RS256");
    const server = createAskRigorHttpServer({
      oauthResourceServer: createJwtOAuthResourceServer({
        resourceUrl: new URL("https://mcp.askrigor.com/mcp"), issuerUrl: new URL(ISSUER),
        jwks: createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "terms-test" }] }),
        allowedClientIds: ["synthetic-client"], reviewerSubjects: [OWNER],
      }),
      claudeOAuthResourceServer: null,
      geminiSignIn: null,
      researchContributorAccessService: new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET }),
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  }

  it("make the page answer 503 while the secret is unset, and nothing else changes", async () => {
    vi.stubEnv("ASKRIGOR_OAUTH_ENABLED", "true");
    vi.stubEnv("ASKRIGOR_OAUTH_ISSUER_URL", ISSUER);
    vi.stubEnv("ASKRIGOR_AUTH0_TERMS_SECRET", undefined);
    const store = new InMemoryResearchContributorAccessStore();
    const base = await startFromEnvironment(store);
    const token = await actionToken();
    for (const page of [await visit(base, { session_token: token, state: STATE }),
      await post(base, { session_token: token, state: STATE, decision: "accept" })]) {
      expect(page.response.status).toBe(503);
      expect(page.body).toContain("<h1>AskRigor's sign-in step isn't available</h1>");
      expect(page.body).not.toContain("<form");
    }
    expect(store.allAccounts()).toEqual([]);
    expect((await fetch(new URL("/healthz", base))).status).toBe(200);
    expect((await fetch(new URL("/account/terms/other", base))).status).toBe(404);
    // The secret alone turns the page on (this server reads the real clock).
    vi.stubEnv("ASKRIGOR_AUTH0_TERMS_SECRET", SECRET);
    const on = await startFromEnvironment(store);
    const current = await actionToken({}, { issuedAt: Math.floor(Date.now() / 1_000) });
    expect((await visit(on, { session_token: current, state: STATE })).body).toContain("Accept and continue");
  });

  it("make the page answer 503 without the connector's research accounts, whatever the secret", async () => {
    const server = createAskRigorHttpServer({
      accountTermsRoutes: createAccountTermsRoutes({ settings: SETTINGS, access: undefined,
        rateLimiter: createTokenBucketLimiter(PUBLIC_RATE_LIMIT) }),
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    expect((await visit(base, { session_token: await actionToken(), state: STATE })).response.status).toBe(503);
  });
});
