import { createHash } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  InMemoryResearchContributorAccessStore,
  InMemoryTermsPageAnswerStore,
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  type ResearchUseAccountRecord,
  type TermsPageAnswerStore,
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
// post-login Action and Auth0's /continue, with the security review's fixes of the same day: each token answers once,
// a yes counts only for the notice shown, and a failure lets the sign-in go on with nothing recorded. Synthetic
// subjects, secrets and states only.
const SECRET = "synthetic-terms-secret-for-tests-only-0123456789abcdef";
const OTHER_SECRET = "another-synthetic-secret-0123456789abcdefghijklmno";
const ISSUER = "https://identity.askrigor.example/";
const ISSUER_HOST = "identity.askrigor.example";
const CUSTOM_CONTINUE = "https://login.askrigor.example/continue";
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
const NOTHING_RECORDED = "Nothing was recorded, and AskRigor's research tools won't run until its free-use notice " +
  "is accepted.";

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

async function listen(server: HttpServer): Promise<URL> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
}

async function start(options: {
  settings?: AccountTermsSettings | undefined; access?: AccountTermsAccess; answers?: TermsPageAnswerStore;
  rateLimiter?: TokenBucketLimiter; clock?: { now: Date };
} = {}) {
  const clock = options.clock ?? { now: NOW };
  const store = new InMemoryResearchContributorAccessStore();
  const answers = new InMemoryTermsPageAnswerStore();
  const service = new ResearchContributorAccessService({
    store, identitySecret: IDENTITY_SECRET, now: () => clock.now.toISOString(), ownerSubjects: new Set([OWNER]),
  });
  const base = await listen(createAskRigorHttpServer({
    researchContributorAccessService: service,
    accountTermsRoutes: createAccountTermsRoutes({
      settings: "settings" in options ? options.settings : SETTINGS,
      access: options.access ?? service,
      answers: options.answers ?? answers,
      rateLimiter: options.rateLimiter ?? createTokenBucketLimiter({ ...PUBLIC_RATE_LIMIT, capacity: 1_000 }),
      now: () => clock.now,
    }),
  }));
  return { base, store, service, answers, clock };
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

/** Accept and continue, as the notice's form sends it: with the version the page showed. */
async function accept(base: URL, token: string, state = STATE, noticeVersion = RESEARCH_USE_NOTICE_VERSION) {
  return await post(base, { session_token: token, state, notice_version: noticeVersion, decision: "accept" });
}

async function decline(base: URL, token: string, state = STATE) {
  return await post(base, { session_token: token, state, notice_version: RESEARCH_USE_NOTICE_VERSION, decision: "decline" });
}

async function visit(base: URL, query: Record<string, string | string[]>) {
  const response = await fetch(pageUrl(base, query));
  return { response, body: await response.text() };
}

const unescape = (text: string) => text.replaceAll("&quot;", "\"").replaceAll("&#39;", "'").replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">").replaceAll("&amp;", "&");

/** The answer page's form: where it posts, and the signed answer it carries, verified with the shared secret. */
async function answerOf(body: string, secret = SETTINGS.secret!) {
  const action = /<form id="continue" method="post" action="([^"]+)">/u.exec(body)?.[1];
  const token = /<input type="hidden" name="session_token" value="([^"]+)">/u.exec(body)?.[1];
  expect(action).toBeDefined();
  expect(token).toBeDefined();
  const { payload, protectedHeader } = await jwtVerify(token!, secret, {
    algorithms: ["HS256"], issuer: TERMS_TOKEN_AUDIENCE, currentDate: NOW,
  });
  const wayOn = /<a href="([^"]+)">go on to your app here<\/a>/u.exec(body)?.[1];
  return { action: new URL(unescape(action!)), token: token!, payload, protectedHeader,
    wayOn: wayOn === undefined ? undefined : new URL(unescape(wayOn)) };
}

/** A signed answer that lets the sign-in go on with nothing recorded, for this reason. */
async function expectNotRecorded(page: { response: Response; body: string }, reason: string, extra: Record<string, unknown> = {}) {
  expect(page.response.status).toBe(200);
  expect(page.response.headers.get("content-security-policy")).toBe(ANSWER_POLICY);
  expect(page.body).toContain(`AskRigor couldn't take an answer this time. ${NOTHING_RECORDED}`);
  const answer = await answerOf(page.body);
  expect(answer.payload).toEqual({ iss: TERMS_TOKEN_AUDIENCE, state: STATE, not_recorded: reason, iat: SECONDS,
    exp: SECONDS + 300, ...extra });
  expect(answer.wayOn?.href).toBe(answer.action.href);
  return answer;
}

function expectExpired(page: { response: Response; body: string }) {
  expect(page.response.status).toBe(400);
  expect(page.body).toContain("<h1>This sign-in link has expired</h1>");
  expect(page.body).toContain("Nothing was recorded. Go back to the app you were signing in from and sign in to " +
    "AskRigor again.");
  expect(page.body).not.toContain("<form");
  expect(page.body).not.toContain("<a ");
  expect(page.response.headers.get("content-security-policy")).toBe(PAGE_POLICY);
}

describe("AskRigor's terms page at sign-in (owner answer 419a)", () => {
  it("shows the current free-use notice word for word, with the terms and privacy links and two buttons", async () => {
    const { base, store, answers } = await start();
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
    expect(page.body).not.toContain('class="changed"');
    // The notice every AI app is given, one sentence per paragraph, and nothing added to it.
    const notice = page.body.slice(page.body.indexOf("</h1>") + 5, page.body.indexOf('<p class="links">'));
    const sentences = [...notice.matchAll(/<p>([^<]*)<\/p>/gu)].map(([, sentence]) => unescape(sentence!));
    expect(sentences.join(" ")).toBe(RESEARCH_USE_NOTICE);
    expect(notice.replace(/<p>[^<]*<\/p>/gu, "").trim()).toBe("");
    expect(page.body).toContain('<a href="https://askrigor.com/terms" target="_blank" rel="noopener noreferrer">Terms</a>');
    expect(page.body).toContain('<a href="https://askrigor.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>');
    // Both buttons post the same token and state back to the page itself, with the notice version shown.
    expect(page.body).toContain('<form method="post" action="/account/terms">');
    expect(page.body).toContain(`<input type="hidden" name="session_token" value="${token}">`);
    expect(page.body).toContain(`<input type="hidden" name="state" value="${STATE}">`);
    expect(page.body).toContain(`<input type="hidden" name="notice_version" value="${RESEARCH_USE_NOTICE_VERSION}">`);
    expect(page.body).toContain('<button class="accept" type="submit" name="decision" value="accept">Accept and continue</button>');
    expect(page.body).toContain('<button type="submit" name="decision" value="decline">Decline</button>');
    expect(page.body.match(/<button/gu)).toHaveLength(2);
    // A GET records nothing and does not use the token.
    expect(store.allAccounts()).toEqual([]);
    expect(answers.size).toBe(0);
  });

  it("shows no page and records nothing for a request without one token and one well-formed state", async () => {
    const { base, store, answers } = await start();
    const valid = await actionToken();
    const [header, payload] = valid.split(".") as [string, string, string];
    const unsigned = `${base64url.encode(JSON.stringify({ alg: "none", typ: "JWT" }))}.${payload}.`;
    const malformed: Record<string, Record<string, string | string[]>> = {
      "no token": { state: STATE },
      "no state": { session_token: valid },
      "two tokens": { session_token: [valid, valid], state: STATE },
      "two states": { session_token: valid, state: [STATE, STATE] },
      "not a token": { session_token: "not-a-token", state: STATE },
      "unsigned": { session_token: unsigned, state: STATE },
      "a header alone": { session_token: `${header}..`, state: STATE },
      "a state outside Auth0's alphabet": { session_token: valid, state: "a state with spaces" },
    };
    for (const [name, query] of Object.entries(malformed)) {
      const page = await visit(base, query);
      expect(page.response.status, name).toBe(400);
      expectExpired(page);
      // The same fields posted (a field given twice is posted twice, as a form would).
      for (const decision of ["accept", "decline"]) {
        const body = new URLSearchParams({ notice_version: RESEARCH_USE_NOTICE_VERSION, decision });
        for (const [key, values] of Object.entries(query)) for (const value of [values].flat()) body.append(key, value);
        const response = await fetch(new URL("/account/terms", base), { method: "POST", body });
        const answer = { response, body: await response.text() };
        expect(answer.response.status, `${name}, ${decision}`).toBe(400);
        expectExpired(answer);
      }
    }
    for (const decision of [undefined, "maybe", "ACCEPT"]) {
      expectExpired(await post(base, { session_token: valid, state: STATE, notice_version: RESEARCH_USE_NOTICE_VERSION,
        ...(decision === undefined ? {} : { decision }) }));
    }
    const twice = await fetch(new URL("/account/terms", base), {
      method: "POST", body: `session_token=${valid}&state=${STATE}&decision=accept&decision=decline`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(twice.status).toBe(400);
    const json = await fetch(new URL("/account/terms", base), {
      method: "POST", body: JSON.stringify({ session_token: valid, state: STATE, decision: "accept" }),
      headers: { "content-type": "application/json" },
    });
    expect(json.status).toBe(400);
    expect(store.allAccounts()).toEqual([]);
    expect(answers.size).toBe(0);
  });

  it("lets a person with a token that doesn't check out go on with nothing recorded, and never shows them the notice", async () => {
    const { base, store, answers } = await start();
    const valid = await actionToken();
    const [header, payload, signature] = valid.split(".") as [string, string, string];
    const otherPayload = base64url.encode(JSON.stringify({
      ...JSON.parse(new TextDecoder().decode(base64url.decode(payload))), sub: "auth0|synthetic-someone-else",
    }));
    // A character in the middle carries six bits of the signature, unlike the last one's padding bits.
    const flipped = `${signature.slice(0, 10)}${signature[10] === "A" ? "B" : "A"}${signature.slice(11)}`;
    // Signed with the shared secret: its subject is the Action's and goes back with the answer.
    const signed: Record<string, string> = {
      "expired": await actionToken({}, { issuedAt: SECONDS - 700 }),
      "for another audience": await actionToken({ aud: "askrigor-other" }),
      "without an audience": await actionToken({ aud: undefined }),
      "for another state": await actionToken({ state: "another-state" }),
      "from another issuer": await actionToken({ iss: "identity.example.org" }),
      "valid for more than ten minutes": await actionToken({}, { lifetime: 601 }),
      "valid for more than ten minutes, without iat": await actionToken({}, { issuedAt: null, lifetime: 1_200 }),
    };
    // Not signed with the shared secret: nothing in it is read.
    const foreign: Record<string, string> = {
      "signed with another secret": await actionToken({}, { secret: OTHER_SECRET }),
      "signed with another algorithm": await actionToken({}, { alg: "HS512" }),
      "altered": `${header}.${otherPayload}.${signature}`,
      "with an altered signature": `${header}.${payload}.${flipped}`,
    };
    for (const [name, token] of [...Object.entries(signed), ...Object.entries(foreign)]) {
      const isSigned = name in signed;
      const subject = isSigned ? { sub: PERSON } : {};
      for (const page of [await visit(base, { session_token: token, state: STATE }), await accept(base, token)]) {
        const answer = await expectNotRecorded(page, "link_not_verified", subject);
        expect(page.body, name).not.toContain("Accept and continue");
        expect(answer.action.href).toBe(`${ISSUER}continue?state=${STATE}`);
      }
      // A Decline goes back as one whenever the token is the Action's, so it ends the sign-in; with a foreign token it
      // gets no way on at all.
      const declined = await decline(base, token);
      if (isSigned) {
        const answer = await answerOf(declined.body);
        expect(answer.payload, name).toEqual({ iss: TERMS_TOKEN_AUDIENCE, sub: PERSON, state: STATE, accepted: false,
          iat: SECONDS, exp: SECONDS + 300 });
        expect(answer.wayOn).toBeUndefined();
      } else {
        expectExpired(declined);
      }
    }
    // A subject that isn't one goes back without one.
    const noSubject = await actionToken({ sub: undefined });
    await expectNotRecorded(await visit(base, { session_token: noSubject, state: STATE }), "link_not_verified");
    // The valid token itself is admitted, with or without a state claim equal to the address's.
    expect((await visit(base, { session_token: valid, state: STATE })).body).toContain("Accept and continue");
    expect((await visit(base, { session_token: await actionToken({ state: STATE }), state: STATE })).body)
      .toContain("Accept and continue");
    expect(store.allAccounts()).toEqual([]);
    expect(answers.size).toBe(0);
  });

  it("sends the answer to the /continue the Action names for the domain in use, and to the tenant's otherwise", async () => {
    const { base } = await start();
    const custom = await actionToken({ continue_uri: CUSTOM_CONTINUE });
    expect((await answerOf((await decline(base, custom)).body)).action.href).toBe(`${CUSTOM_CONTINUE}?state=${STATE}`);
    // A custom domain whose hostname Auth0 writes as iss: the token doesn't check out, and the person still goes on,
    // to the right domain.
    const customIssuer = await actionToken({ iss: "login.askrigor.example", continue_uri: CUSTOM_CONTINUE });
    const passed = await expectNotRecorded(await visit(base, { session_token: customIssuer, state: STATE }),
      "link_not_verified", { sub: PERSON });
    expect(passed.action.href).toBe(`${CUSTOM_CONTINUE}?state=${STATE}`);
    // Only an exact https://<host>/continue is taken, and never from a token the secret didn't sign.
    for (const continueUri of ["http://login.askrigor.example/continue", "https://login.askrigor.example:8443/continue",
      "https://login.askrigor.example/continue?next=1", "https://login.askrigor.example/elsewhere",
      "https://user@login.askrigor.example/continue", "https://login/continue", "javascript:alert(1)"]) {
      const odd = await actionToken({ continue_uri: continueUri });
      expect((await answerOf((await decline(base, odd)).body)).action.href, continueUri).toBe(`${ISSUER}continue?state=${STATE}`);
    }
    const foreign = await actionToken({ continue_uri: "https://elsewhere.example/continue" }, { secret: OTHER_SECRET });
    const page = await visit(base, { session_token: foreign, state: STATE });
    expect((await answerOf(page.body)).action.href).toBe(`${ISSUER}continue?state=${STATE}`);
  });

  it("takes Auth0's state in base64 as well as base64url, and gives it back unchanged", async () => {
    const { base, store } = await start();
    const state = "hKFo2SB+synthetic/state==";
    const token = await actionToken();
    const page = await visit(base, { session_token: token, state });
    expect(page.body).toContain(`<input type="hidden" name="state" value="${state}">`);
    const answered = await decline(base, token, state);
    const answer = await answerOf(answered.body);
    expect(answer.payload.state).toBe(state);
    expect(answer.action.search).toBe(`?state=${encodeURIComponent(state)}`);
    expect(answer.action.searchParams.get("state")).toBe(state);
    expect(store.allAccounts()).toEqual([]);
  });

  it("records the same acceptance accept_free_contributor records, noted as given on the page, and goes back signed", async () => {
    const { base, store, service, answers } = await start();
    const token = await actionToken();
    const page = await accept(base, token);
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
    // The token is used: its SHA-256 is kept with the answer, and nothing that names the person.
    expect(answers.size).toBe(1);
    // Back to Auth0's /continue by itself: the state in the address, the signed answer only in the body.
    expect(page.response.headers.get("content-security-policy")).toBe(ANSWER_POLICY);
    expect(ANSWER_POLICY).not.toContain("form-action");
    expect(ANSWER_POLICY).toContain(`script-src 'sha256-${createHash("sha256").update(ANSWER_SCRIPT).digest("base64")}'`);
    expect(page.response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.response.headers.get("cache-control")).toBe("no-store");
    expect(page.body).toContain(`<script>${ANSWER_SCRIPT}</script>`);
    expect(page.body).toContain('<button class="accept" type="submit">Continue</button>');
    expect(page.body).not.toContain("couldn't take an answer");
    const answer = await answerOf(page.body);
    expect(answer.action.origin + answer.action.pathname).toBe(`${ISSUER}continue`);
    expect([...answer.action.searchParams]).toEqual([["state", STATE]]);
    expect(answer.protectedHeader).toEqual({ alg: "HS256", typ: "JWT" });
    expect(answer.payload).toEqual({
      iss: TERMS_TOKEN_AUDIENCE, sub: PERSON, state: STATE, accepted: true, notice_version: RESEARCH_USE_NOTICE_VERSION,
      iat: SECONDS, exp: SECONDS + 300,
    });
    // A plain link goes on too, for a browser or proxy that stops the form; the answer is already recorded.
    expect(answer.wayOn?.href).toBe(answer.action.href);
    expect(page.body).toContain("your answer is already recorded.");
  });

  it("records a yes only for the notice shown: a page showing an earlier version is shown again with the current one", async () => {
    const { base, store, answers } = await start();
    const token = await actionToken();
    for (const shown of [V5, "", "free-contributor-v7-2026-12-01"]) {
      const page = shown === ""
        ? await post(base, { session_token: token, state: STATE, decision: "accept" })
        : await accept(base, token, STATE, shown);
      expect(page.response.status, shown).toBe(200);
      expect(page.body).toContain('<p class="changed">The notice changed while this page was open. This is the current ' +
        "one.</p>");
      expect(page.body).toContain(`<input type="hidden" name="notice_version" value="${RESEARCH_USE_NOTICE_VERSION}">`);
      expect(page.body).toContain(`<input type="hidden" name="session_token" value="${token}">`);
      expect(page.body).toContain("Accept and continue");
    }
    // Nothing recorded and the token still unused, so the page shown again can be answered with it.
    expect(store.allAccounts()).toEqual([]);
    expect(answers.size).toBe(0);
    expect((await answerOf((await accept(base, token)).body)).payload).toMatchObject({ accepted: true });
    expect(store.allAccounts()).toMatchObject([{ noticeVersion: RESEARCH_USE_NOTICE_VERSION }]);
  });

  it("uses each token once: a second press gets the same answer, the other answer is refused, a Decline never becomes a yes", async () => {
    const clock = { now: NOW };
    const { base, store, answers } = await start({ clock });
    // Decline, then Accept with the same token (a copy of the page's address): refused, and nothing recorded.
    const declined = await actionToken();
    expect((await answerOf((await decline(base, declined)).body)).payload.accepted).toBe(false);
    const turned = await accept(base, declined);
    expect(turned.response.status).toBe(409);
    expect(turned.body).toContain("<h1>This sign-in link was already answered</h1>");
    expect(turned.body).not.toContain("<form");
    expect(turned.body).not.toContain("<a ");
    expect(store.allAccounts()).toEqual([]);
    // Declined twice (a double press): declined again.
    expect((await answerOf((await decline(base, declined)).body)).payload.accepted).toBe(false);
    // Accept, then the same again a moment later: the same answer, and the record isn't written again.
    const other = "auth0|synthetic-terms-double-press";
    const accepted = await actionToken({ sub: other });
    await accept(base, accepted);
    const first = store.allAccounts();
    clock.now = new Date(NOW.getTime() + 20_000);
    expect((await answerOf((await accept(base, accepted)).body)).payload).toMatchObject({ sub: other, accepted: true,
      notice_version: RESEARCH_USE_NOTICE_VERSION });
    expect(store.allAccounts()).toEqual(first);
    // Accept, then Decline: refused too, and the yes stays as given.
    expect((await decline(base, accepted)).response.status).toBe(409);
    expect(store.allAccounts()).toEqual(first);
    expect(answers.size).toBe(2);
  });

  it("keeps a token's answer while the token can be used, then lets the row go", async () => {
    const clock = { now: NOW };
    const { base, store, answers } = await start({ clock });
    const token = await actionToken();
    await decline(base, token);
    expect(answers.size).toBe(1);
    // Admitted until its expiry and the 30 seconds allowed (here 20 seconds past its expiry): still answered.
    clock.now = new Date(NOW.getTime() + 620_000);
    expect((await accept(base, token)).response.status).toBe(409);
    // Past that, the token is admitted nowhere: the sign-in goes on with nothing recorded, and the next use of the page
    // deletes its row (kept a minute past the token's last moment).
    clock.now = new Date(NOW.getTime() + 700_000);
    expect((await accept(base, token)).body).toContain(`AskRigor couldn't take an answer this time. ${NOTHING_RECORDED}`);
    expect(answers.size).toBe(1);
    const later = Math.floor(clock.now.getTime() / 1_000);
    await decline(base, await actionToken({ sub: "auth0|synthetic-terms-later" }, { issuedAt: later }));
    expect(answers.size).toBe(1);
    expect(store.allAccounts()).toEqual([]);
  });

  it("writes nothing over a yes given meanwhile in an app", async () => {
    const { base, store, service } = await start();
    const other = "auth0|synthetic-terms-app-yes";
    const shown = await actionToken({ sub: other });
    expect((await visit(base, { session_token: shown, state: STATE })).body).toContain("Accept and continue");
    await service.acceptFreeContributor(other, AGREEMENT);
    const inApp = store.allAccounts()[0];
    expect((await answerOf((await accept(base, shown)).body)).payload).toMatchObject({ accepted: true });
    expect(store.allAccounts()).toEqual([inApp]);
    expect(inApp?.noticeAcceptedBy).toBe("PERSON");
  });

  it("records a person's yes only as the person's: the owner's standing instruction is never a caller's to give", async () => {
    const { store, service } = await start();
    await expect(service.acceptFreeContributor(PERSON, AGREEMENT, "OWNER_STANDING_INSTRUCTION_2026_11_06" as never))
      .rejects.toThrow();
    await expect(service.acceptFreeContributor(PERSON, AGREEMENT, "SOMEONE_ELSE" as never)).rejects.toThrow();
    expect(store.allAccounts()).toEqual([]);
  });

  it("records nothing on Decline and goes back declined, with no way on, for a new account and one under an earlier notice", async () => {
    const { base, store, service } = await start();
    const page = await decline(base, await actionToken());
    expect(page.response.status).toBe(200);
    expect(store.allAccounts()).toEqual([]);
    const answer = await answerOf(page.body);
    expect(answer.payload).toEqual({ iss: TERMS_TOKEN_AUDIENCE, sub: PERSON, state: STATE, accepted: false,
      iat: SECONDS, exp: SECONDS + 300 });
    expect([...answer.action.searchParams]).toEqual([["state", STATE]]);
    // No plain link: a Decline must never become a sign-in.
    expect(answer.wayOn).toBeUndefined();
    expect(page.body).not.toContain("<a ");
    const earlier = accountOf(service, PERSON, { noticeVersion: V5 as never });
    await store.saveAccount(earlier);
    const declined = await decline(base, await actionToken({ ip: "203.0.113.10" }));
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
    const pressed = await accept(base, token);
    expect((await answerOf(pressed.body)).payload).not.toHaveProperty("notice_version");
    expect(store.allAccounts()).toEqual([paid]);
  });

  it("lets the sign-in go on with nothing recorded when the account store fails, and still honours a Decline", async () => {
    const reading: AccountTermsAccess = {
      signInNoticeStatus: async () => { throw new Error("synthetic store failure"); },
      acceptFreeContributor: async () => { throw new Error("synthetic store failure"); },
    };
    const first = await start({ access: reading });
    const token = await actionToken();
    for (const page of [await visit(first.base, { session_token: token, state: STATE }), await accept(first.base, token)]) {
      await expectNotRecorded(page, "account_store_unavailable", { sub: PERSON });
    }
    // The write fails after the read: nothing recorded, and the person goes on.
    const writing: AccountTermsAccess = {
      signInNoticeStatus: async () => "ask",
      acceptFreeContributor: async () => { throw new Error("synthetic write failure"); },
    };
    const second = await start({ access: writing });
    await expectNotRecorded(await accept(second.base, await actionToken()), "account_store_unavailable", { sub: PERSON });
    // A second press after a first that recorded nothing records nothing either.
    await expectNotRecorded(await accept(second.base, await actionToken()), "already_answered", { sub: PERSON });
    // The answers' store fails: Accept goes on with nothing recorded; Decline still ends the sign-in.
    const failingAnswers: TermsPageAnswerStore = { claim: async () => { throw new Error("synthetic store failure"); } };
    const third = await start({ answers: failingAnswers });
    await expectNotRecorded(await accept(third.base, token), "account_store_unavailable", { sub: PERSON });
    expect(third.store.allAccounts()).toEqual([]);
    const declined = await answerOf((await decline(third.base, token)).body);
    expect(declined.payload.accepted).toBe(false);
    expect(declined.wayOn).toBeUndefined();
  });

  it("lets the sign-in go on when the server's secret is not the Action's, without reading the token", async () => {
    const { base, store } = await start({ settings: accountTermsSettingsFromEnv({ ...ENV,
      ASKRIGOR_AUTH0_TERMS_SECRET: OTHER_SECRET }) });
    const token = await actionToken({ continue_uri: "https://elsewhere.example/continue" });
    const page = await visit(base, { session_token: token, state: STATE });
    const answer = await answerOf(page.body, new TextEncoder().encode(OTHER_SECRET));
    expect(answer.payload).toEqual({ iss: TERMS_TOKEN_AUDIENCE, state: STATE, not_recorded: "link_not_verified",
      iat: SECONDS, exp: SECONDS + 300 });
    expect(answer.action.href).toBe(`${ISSUER}continue?state=${STATE}`);
    expectExpired(await decline(base, token));
    expect(store.allAccounts()).toEqual([]);
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

describe("the terms page's answers", () => {
  it("keeps each token's first answer by its SHA-256 until it may go, and refuses anything else", async () => {
    const answers = new InMemoryTermsPageAnswerStore();
    const key = "a".repeat(64);
    const until = new Date(NOW.getTime() + 690_000);
    expect(await answers.claim(key, "decline", until, NOW)).toEqual({ claimed: true });
    expect(await answers.claim(key, "accept", until, NOW)).toEqual({ claimed: false, decision: "decline" });
    expect(await answers.claim(key, "decline", until, NOW)).toEqual({ claimed: false, decision: "decline" });
    // Past its time the row is gone, at the next claim of any token.
    expect(await answers.claim("b".repeat(64), "accept", new Date(until.getTime() + 600_000), until))
      .toEqual({ claimed: true });
    expect(answers.size).toBe(1);
    for (const bad of ["A".repeat(64), "a".repeat(63), "a token"]) {
      await expect(answers.claim(bad, "accept", until, NOW)).rejects.toThrow("TERMS_PAGE_ANSWER_KEY_INVALID");
    }
    await expect(answers.claim(key, "maybe" as never, until, NOW)).rejects.toThrow("TERMS_PAGE_DECISION_INVALID");
  });
});

describe("the terms page's settings", () => {
  it("are read from the tenant the connector trusts, with ASKRIGOR_AUTH0_TERMS_SECRET when it is well formed", () => {
    expect(SETTINGS.issuerUrl.href).toBe(ISSUER);
    expect(SETTINGS.continueUrl.href).toBe(`${ISSUER}continue`);
    expect(new TextDecoder().decode(SETTINGS.secret)).toBe(SECRET);
    for (const secret of [undefined, "", "too-short-0123456789", ` ${SECRET}`, `${SECRET}=`]) {
      const settings = accountTermsSettingsFromEnv({ ...ENV, ASKRIGOR_AUTH0_TERMS_SECRET: secret });
      expect(settings?.continueUrl.href, String(secret)).toBe(`${ISSUER}continue`);
      expect(settings?.secret, String(secret)).toBeUndefined();
    }
    const off: NodeJS.ProcessEnv[] = [
      {},
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
    return await listen(createAskRigorHttpServer({
      oauthResourceServer: createJwtOAuthResourceServer({
        resourceUrl: new URL("https://mcp.askrigor.com/mcp"), issuerUrl: new URL(ISSUER),
        jwks: createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "terms-test" }] }),
        allowedClientIds: ["synthetic-client"], reviewerSubjects: [OWNER],
      }),
      claudeOAuthResourceServer: null,
      geminiSignIn: null,
      researchContributorAccessService: new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET }),
      termsPageAnswers: new InMemoryTermsPageAnswerStore(),
    }));
  }

  it("make the page answer 503 while the secret is unset, with a way on that records nothing, never after a Decline", async () => {
    vi.stubEnv("ASKRIGOR_OAUTH_ENABLED", "true");
    vi.stubEnv("ASKRIGOR_OAUTH_ISSUER_URL", ISSUER);
    vi.stubEnv("ASKRIGOR_AUTH0_TERMS_SECRET", undefined);
    const store = new InMemoryResearchContributorAccessStore();
    const base = await startFromEnvironment(store);
    const token = await actionToken();
    for (const page of [await visit(base, { session_token: token, state: STATE }), await accept(base, token)]) {
      expect(page.response.status).toBe(503);
      expect(page.body).toContain("<h1>AskRigor's sign-in step isn't available</h1>");
      expect(page.body).not.toContain("<form");
      expect(page.body).toContain(`${NOTHING_RECORDED} <a href="${ISSUER}continue?state=${STATE}">Go on to your app ` +
        "here</a>.");
    }
    const declined = await decline(base, token);
    expect(declined.response.status).toBe(503);
    expect(declined.body).not.toContain("<a ");
    expect((await visit(base, { session_token: token })).body).not.toContain("<a ");
    expect(store.allAccounts()).toEqual([]);
    expect((await fetch(new URL("/healthz", base))).status).toBe(200);
    expect((await fetch(new URL("/account/terms/other", base))).status).toBe(404);
    // The secret alone turns the page on (this server reads the real clock).
    vi.stubEnv("ASKRIGOR_AUTH0_TERMS_SECRET", SECRET);
    const on = await startFromEnvironment(store);
    const current = await actionToken({}, { issuedAt: Math.floor(Date.now() / 1_000) });
    expect((await visit(on, { session_token: current, state: STATE })).body).toContain("Accept and continue");
  });

  it("make the page answer 503 without the connector's research accounts or the answers' store", async () => {
    for (const missing of ["access", "answers"]) {
      const base = await listen(createAskRigorHttpServer({
        accountTermsRoutes: createAccountTermsRoutes({ settings: SETTINGS,
          access: missing === "access" ? undefined : new ResearchContributorAccessService({
            store: new InMemoryResearchContributorAccessStore(), identitySecret: IDENTITY_SECRET }),
          answers: missing === "answers" ? undefined : new InMemoryTermsPageAnswerStore(),
          rateLimiter: createTokenBucketLimiter(PUBLIC_RATE_LIMIT) }),
      }));
      expect((await visit(base, { session_token: await actionToken(), state: STATE })).response.status, missing).toBe(503);
    }
    // Without the tenant there is nowhere to go on to.
    const base = await listen(createAskRigorHttpServer({
      accountTermsRoutes: createAccountTermsRoutes({ settings: undefined, access: undefined, answers: undefined,
        rateLimiter: createTokenBucketLimiter(PUBLIC_RATE_LIMIT) }),
    }));
    const page = await visit(base, { session_token: await actionToken(), state: STATE });
    expect(page.response.status).toBe(503);
    expect(page.body).not.toContain("<a ");
  });
});
