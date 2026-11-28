import { createHash } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  InMemoryResearchContributorAccessStore,
  InMemoryTermsPageAnswerStore,
  MemoryGeminiSignInRowStore,
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  type ResearchUseAccountRecord,
  type TermsPageAnswerStore,
} from "@askrigor/evidence-repository";
import { createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccountTermsAccess } from "../apps/research-mcp/src/account-terms/decision.js";
import { PAGE_POLICY } from "../apps/research-mcp/src/account-terms/pages.js";
import { geminiSignInFromEnv, type GeminiNoticeStep } from "../apps/research-mcp/src/gemini-sign-in/index.js";
import {
  CONSENT_NOTICE_NOTES,
  NOTICE_STEP_AFTER,
  NOTICE_STEP_LEAD,
  consentPage,
} from "../apps/research-mcp/src/gemini-sign-in/pages.js";
import { verifyGeminiAccessToken } from "../apps/research-mcp/src/gemini-sign-in/resource.js";
import type { GeminiSignInDiagnostic } from "../apps/research-mcp/src/gemini-sign-in/routes.js";
import { createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import {
  AUTH0,
  Browser,
  CLIENT_ID,
  GOOGLE_REDIRECT,
  PERSON,
  RESOURCE,
  authorizeUrl,
  clientAssertion,
  linkToCode,
  movesOnTo,
  pkce,
  startGeminiFixture,
  tokenRequest,
  type GeminiFixture,
} from "./helpers/gemini-sign-in-fixture.js";

// Owner answer 419a for Gemini (the owner, 27 Nov 2026: "gemini is still not working ... can you pls fix that"): Gemini
// can't show AskRigor's free-use notice in its chat, so its sign-in shows it on AskRigor's own page, after the login and
// before Allow, with the terms page's own rendering and recording. Synthetic subjects and secrets only.
const OWNER = "auth0|synthetic-gemini-notice-owner";
const V5 = "free-contributor-v5-2026-11-05";
const IDENTITY_SECRET = new TextEncoder().encode("synthetic-gemini-notice-identity-secret-32-bytes");
const NOW = new Date("2026-11-27T12:00:00.000Z");
const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
};
const SITE = "https://mcp.askrigor.com";

const fixtures: GeminiFixture[] = [];
const servers: HttpServer[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const unescape = (text: string) => text.replaceAll("&quot;", "\"").replaceAll("&#39;", "'").replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const escaped = (text: string) => text.replaceAll("&", "&amp;").replaceAll("'", "&#39;");

async function start(options: {
  access?: AccountTermsAccess;
  answers?: TermsPageAnswerStore;
  diagnostic?: (record: GeminiSignInDiagnostic) => void;
  clock?: { now: Date };
} = {}) {
  const clock = options.clock ?? { now: NOW };
  const store = new InMemoryResearchContributorAccessStore();
  const answers = new InMemoryTermsPageAnswerStore();
  const service = new ResearchContributorAccessService({
    store, identitySecret: IDENTITY_SECRET, now: () => clock.now.toISOString(), ownerSubjects: new Set([OWNER]),
  });
  const notice: GeminiNoticeStep = { access: options.access ?? service, answers: options.answers ?? answers };
  const fixture = await startGeminiFixture({
    notice,
    ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
  });
  fixtures.push(fixture);
  return { fixture, store, service, answers, browser: new Browser(fixture.baseUrl) };
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

interface Page { response: Response; html: string }

/** A link from Gemini's request through the login to the first page that asks something: the notice or the consent. */
async function begin(browser: Browser): Promise<Page & { verifier: string }> {
  const { verifier, challenge } = pkce();
  let response = await browser.request(authorizeUrl({
    response_type: "code", client_id: CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, scope: "research:use",
    state: "google-state-1", code_challenge: challenge, code_challenge_method: "S256", resource: RESOURCE,
  }));
  while (response.status === 302 || response.status === 303) {
    response = await browser.request(new URL(response.headers.get("location")!, SITE).href);
  }
  return { response, html: await response.text(), verifier };
}

function formOf(html: string) {
  return {
    action: /<form method="post" action="([^"]+)">/u.exec(html)?.[1],
    token: /<input type="hidden" name="form_token" value="([^"]+)">/u.exec(html)?.[1],
    version: /<input type="hidden" name="notice_version" value="([^"]+)">/u.exec(html)?.[1],
  };
}

/** Accept or Decline on the notice page, as its form sends it, with any field replaced. */
async function answer(browser: Browser, notice: string, decision: string, replaced: Record<string, string> = {}) {
  const form = formOf(notice);
  const response = await browser.submit(form.action!, {
    form_token: form.token!, notice_version: form.version!, decision, ...replaced,
  });
  return { response, html: await response.text() };
}

function isNoticePage(html: string): boolean {
  return html.includes("<h1>AskRigor's free-use notice</h1>") && html.includes("Accept and continue");
}

function isConsentPage(html: string): boolean {
  return html.includes("<h1>Connect Google Gemini to AskRigor?</h1>") && html.includes('value="allow">Allow</button>');
}

/** Allow on the consent page, then on to Google: the code. */
async function allowToCode(browser: Browser, consent: string): Promise<string> {
  const form = formOf(consent);
  const allowed = await browser.submit(form.action!, { form_token: form.token!, decision: "allow" });
  expect(allowed.status).toBe(200);
  let response = await browser.request(new URL(movesOnTo(await allowed.text())!, SITE).href);
  while (response.status === 302 || response.status === 303) {
    const location = new URL(response.headers.get("location")!, SITE);
    if (location.origin === "https://oauth-redirect.googleusercontent.com") {
      const code = location.searchParams.get("code");
      expect(code).toEqual(expect.any(String));
      return code!;
    }
    response = await browser.request(location.href);
  }
  throw new Error(`no code: ${response.status}`);
}

async function tokensFor(fixture: GeminiFixture, code: string, verifier: string) {
  const response = await tokenRequest(fixture, {
    grant_type: "authorization_code", code, redirect_uri: GOOGLE_REDIRECT, code_verifier: verifier,
    client_assertion_type: ASSERTION_TYPE, client_assertion: await clientAssertion(fixture),
  });
  expect(response.status).toBe(200);
  return await response.json() as { access_token: string };
}

describe("Gemini's sign-in: AskRigor's free-use notice before Allow (owner answer 419a, 27 Nov 2026)", () => {
  it("shows an account without a yes the current notice word for word after the login, before the consent step", async () => {
    const { store, answers, browser } = await start();
    const page = await begin(browser);
    expect(page.response.status).toBe(200);
    expect(page.response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.response.headers.get("cache-control")).toBe("no-store");
    expect(page.response.headers.get("x-frame-options")).toBe("DENY");
    // The consent page's own headers: no script, forms only to this server, never framed.
    expect(page.response.headers.get("content-security-policy")).toBe(PAGE_POLICY);
    expect(page.response.headers.get("referrer-policy")).toBe("same-origin");
    expect(page.html).not.toContain("<script");
    expect(isNoticePage(page.html)).toBe(true);
    expect(isConsentPage(page.html)).toBe(false);
    // Why it is shown here, then the notice every AI app is given, one sentence per paragraph, and nothing added to it.
    expect(page.html).toContain(`<h1>AskRigor's free-use notice</h1>\n<p class="lead">${escaped(NOTICE_STEP_LEAD)}</p>\n`);
    const notice = page.html.slice(page.html.indexOf('<p class="lead">'), page.html.indexOf('<p class="links">'));
    const sentences = [...notice.matchAll(/<p>([^<]*)<\/p>/gu)].map(([, sentence]) => unescape(sentence!));
    expect(sentences.join(" ")).toBe(RESEARCH_USE_NOTICE);
    expect(notice.replace(/<p class="lead">[^<]*<\/p>/u, "").replace(/<p>[^<]*<\/p>/gu, "").trim()).toBe("");
    expect(page.html).toContain('<a href="https://askrigor.com/terms" target="_blank" rel="noopener noreferrer">Terms</a>');
    expect(page.html).toContain('<a href="https://askrigor.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>');
    // Both buttons post this interaction's notice token and the version shown to the notice step.
    const form = formOf(page.html);
    expect(form.action).toMatch(/^\/oauth\/gemini\/interaction\/[A-Za-z0-9_-]{1,64}\/notice$/u);
    expect(form.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(form.version).toBe(RESEARCH_USE_NOTICE_VERSION);
    expect(page.html).toContain('<button class="accept" type="submit" name="decision" value="accept">Accept and continue</button>');
    expect(page.html).toContain('<button type="submit" name="decision" value="decline">Decline</button>');
    expect(page.html.match(/<button/gu)).toHaveLength(2);
    expect(page.html).toContain(`</form>\n<p class="after">${escaped(NOTICE_STEP_AFTER)}</p>`);
    // Showing it records nothing and uses nothing.
    expect(store.allAccounts()).toEqual([]);
    expect(answers.size).toBe(0);
  });

  it("records Accept as the person's own yes, as accept_free_contributor and /account/terms do, then goes on to Allow and tokens", async () => {
    const { fixture, store, service, answers, browser } = await start();
    const notice = await begin(browser);
    expect(notice.html).toContain('<input type="checkbox" name="keep_failed_searches" value="true">');
    const accepted = await answer(browser, notice.html, "accept", { keep_failed_searches: "true" });
    expect(accepted.response.status).toBe(200);
    expect(isConsentPage(accepted.html)).toBe(true);
    expect(accepted.html).toContain(`<h1>Connect Google Gemini to AskRigor?</h1>\n<p class="note">` +
      `${escaped(CONSENT_NOTICE_NOTES.accepted)}</p>\n`);
    // What accept_free_contributor records for the same person at the same moment, through the same service.
    const toolStore = new InMemoryResearchContributorAccessStore();
    const tool = new ResearchContributorAccessService({
      store: toolStore, identitySecret: IDENTITY_SECRET, now: () => NOW.toISOString(), ownerSubjects: new Set([OWNER]),
    });
    await tool.acceptFreeContributor(PERSON, AGREEMENT, "PERSON", { keepFailedSearches: true });
    await expect(service.failedSearchPreference(service.accountKeyForSubject(PERSON))).resolves.toEqual({ enabled: true });
    expect(store.allAccounts()).toEqual([{ ...toolStore.allAccounts()[0], noticeAcceptedBy: "PERSON_SIGN_IN_PAGE" }]);
    expect(await service.inspect(PERSON)).toMatchObject({ status: "ACTIVE", mode: "FREE_CONTRIBUTOR", acceptance: {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION, acceptedAt: NOW.toISOString(), acceptedBy: "PERSON_SIGN_IN_PAGE",
      current: "accepted" } });
    await expect(service.requireActive(PERSON)).resolves.toBe("FREE_CONTRIBUTOR");
    expect(answers.size).toBe(1);
    // The consent form has a token of its own, which the notice's isn't.
    expect(formOf(accepted.html).token).not.toBe(formOf(notice.html).token);
    const code = await allowToCode(browser, accepted.html);
    const { access_token: access } = await tokensFor(fixture, code, notice.verifier);
    await expect(verifyGeminiAccessToken(fixture.server, access)).resolves.toMatchObject({ extra: { subject: PERSON } });
  });

  it("records nothing on Decline and still lets the person connect Gemini; research keeps being refused", async () => {
    const { fixture, store, service, answers, browser } = await start();
    const notice = await begin(browser);
    const declined = await answer(browser, notice.html, "decline");
    expect(declined.response.status).toBe(200);
    expect(isConsentPage(declined.html)).toBe(true);
    expect(declined.html).toContain(`<p class="note">${escaped(CONSENT_NOTICE_NOTES.declined)}</p>`);
    expect(store.allAccounts()).toEqual([]);
    await expect(service.requireActive(PERSON)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    // The Decline itself is kept, so the step's token never gives a yes.
    expect(answers.size).toBe(1);
    const code = await allowToCode(browser, declined.html);
    expect((await tokensFor(fixture, code, notice.verifier)).access_token).toEqual(expect.any(String));
    expect(store.allAccounts()).toEqual([]);
  });

  it("asks nothing of an account whose yes covers the current notice, the owner's free login or a paid private one", async () => {
    const { fixture, store, service, answers } = await start();
    const covered = accountOf(service, PERSON);
    const owner = accountOf(service, OWNER, { noticeVersion: V5 as never });
    const paidSubject = "auth0|synthetic-gemini-notice-paid";
    const paid = accountOf(service, paidSubject, { mode: "PAID_PRIVATE", noticeVersion: null, agreement: null,
      noticeAcceptedBy: null });
    for (const record of [covered, owner, paid]) await store.saveAccount(record);
    for (const subject of [PERSON, OWNER, paidSubject]) {
      fixture.auth0.subject = subject;
      const browser = new Browser(fixture.baseUrl);
      const page = await begin(browser);
      expect(page.response.status, subject).toBe(200);
      expect(isConsentPage(page.html), subject).toBe(true);
      // The consent step exactly as without the notice step: no note, nothing else added.
      const uid = /action="\/oauth\/gemini\/interaction\/([A-Za-z0-9_-]+)"/u.exec(page.html)![1]!;
      expect(page.html, subject).toBe(consentPage({ uid, formToken: formOf(page.html).token! }));
      expect(page.html).not.toContain('class="note"');
      await allowToCode(browser, page.html);
    }
    expect(store.allAccounts()).toEqual([covered, owner, paid]);
    expect(answers.size).toBe(0);
  });

  it("asks an account under an earlier notice that collected or published less, and a revoked one", async () => {
    const { fixture, store, service } = await start();
    const earlier = accountOf(service, PERSON, { noticeVersion: V5 as never });
    const revokedSubject = "auth0|synthetic-gemini-notice-revoked";
    const revoked = accountOf(service, revokedSubject, { status: "REVOKED", mode: null, noticeVersion: null,
      agreement: null, activatedAt: null, revokedAt: "2026-11-20T10:00:00.000Z", noticeAcceptedBy: null });
    await store.saveAccount(earlier);
    await store.saveAccount(revoked);
    fixture.auth0.subject = revokedSubject;
    expect(isNoticePage((await begin(new Browser(fixture.baseUrl))).html)).toBe(true);
    fixture.auth0.subject = PERSON;
    const browser = new Browser(fixture.baseUrl);
    const notice = await begin(browser);
    expect(isNoticePage(notice.html)).toBe(true);
    expect(store.allAccounts()).toEqual([earlier, revoked]);
    await answer(browser, notice.html, "accept");
    expect(store.allAccounts()[0]).toMatchObject({ accountKey: earlier.accountKey, noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      noticeAcceptedBy: "PERSON_SIGN_IN_PAGE", status: "ACTIVE", mode: "FREE_CONTRIBUTOR" });
  });

  it("records a yes only for the notice shown: an Accept for another version shows the current one again, its token unused", async () => {
    const { store, answers, browser } = await start();
    const notice = await begin(browser);
    for (const shown of [V5, "free-contributor-v7-2026-12-01", ""]) {
      const again = await answer(browser, notice.html, "accept", { notice_version: shown });
      expect(again.response.status, shown).toBe(200);
      expect(isNoticePage(again.html)).toBe(true);
      expect(again.html).toContain(`<p class="lead">${escaped(NOTICE_STEP_LEAD)}</p>\n<p class="changed">The notice ` +
        "changed while this page was open. This is the current one.</p>");
      expect(formOf(again.html)).toEqual(formOf(notice.html));
    }
    expect(store.allAccounts()).toEqual([]);
    expect(answers.size).toBe(0);
    const accepted = await answer(browser, notice.html, "accept");
    expect(accepted.html).toContain(escaped(CONSENT_NOTICE_NOTES.accepted));
    expect(store.allAccounts()).toMatchObject([{ noticeVersion: RESEARCH_USE_NOTICE_VERSION }]);
  });

  it("answers each link's notice once: a double press gets the same answer, the other is refused, a Decline never becomes a yes", async () => {
    const clock = { now: NOW };
    const { fixture, store, answers, browser } = await start({ clock });
    // Decline, then Accept with the same page (Back, or a copy of the form): refused, and nothing recorded.
    const notice = await begin(browser);
    expect((await answer(browser, notice.html, "decline")).html).toContain(escaped(CONSENT_NOTICE_NOTES.declined));
    const turned = await answer(browser, notice.html, "accept");
    expect(turned.response.status).toBe(409);
    expect(turned.html).toContain("<h1>This sign-in link was already answered</h1>");
    expect(turned.html).not.toContain("<form");
    expect(store.allAccounts()).toEqual([]);
    // Declined twice: declined again, and the consent step still follows.
    const twice = await answer(browser, notice.html, "decline");
    expect(isConsentPage(twice.html)).toBe(true);
    expect(twice.html).toContain(escaped(CONSENT_NOTICE_NOTES.declined));
    // Showing the step again (Back, a reload) shows the notice again, with the same token: still only Decline answers it.
    const reload = await browser.request(`${SITE}${formOf(notice.html).action!.replace(/\/notice$/u, "")}`);
    expect(reload.status).toBe(200);
    const reloaded = await reload.text();
    expect(isNoticePage(reloaded)).toBe(true);
    expect(formOf(reloaded)).toEqual(formOf(notice.html));
    expect((await answer(browser, reloaded, "accept")).response.status).toBe(409);
    expect(store.allAccounts()).toEqual([]);
    // Accept, then the same again a moment later: the same answer, and the record isn't written again.
    fixture.auth0.subject = "auth0|synthetic-gemini-notice-double";
    const second = new Browser(fixture.baseUrl);
    const other = await begin(second);
    await answer(second, other.html, "accept");
    const first = store.allAccounts();
    expect(first).toHaveLength(1);
    clock.now = new Date(NOW.getTime() + 20_000);
    const again = await answer(second, other.html, "accept");
    expect(isConsentPage(again.html)).toBe(true);
    expect(again.html).toContain(escaped(CONSENT_NOTICE_NOTES.accepted));
    expect(store.allAccounts()).toEqual(first);
    // Accept, then Decline: refused too, and the yes stays as given.
    expect((await answer(second, other.html, "decline")).response.status).toBe(409);
    expect(store.allAccounts()).toEqual(first);
    // One answer kept per link.
    expect(answers.size).toBe(2);
  });

  it("refuses an answer that isn't this step's own: no token, two, another link's, another site, browser or interaction", async () => {
    const { fixture, store, answers, browser } = await start();
    const notice = await begin(browser);
    const form = formOf(notice.html);
    const target = `${SITE}${form.action!}`;
    const malformed = "The request to connect Gemini was incomplete or malformed.";
    const expired = "This sign-in took too long or was opened in another browser. Start again from Gemini.";
    const post = async (target_: string, body: string, headers: Record<string, string> = {}, from = browser) => {
      const response = await from.request(target_, { method: "POST", body, headers: {
        "content-type": "application/x-www-form-urlencoded", origin: SITE, "sec-fetch-site": "same-origin", ...headers } });
      return { status: response.status, html: await response.text() };
    };
    const fields = (values: Record<string, string>) => new URLSearchParams(values).toString();
    const valid = { form_token: form.token!, notice_version: form.version!, decision: "accept" };
    // Another link's token, for the same person in another browser.
    const elsewhere = formOf((await begin(new Browser(fixture.baseUrl))).html).token!;
    for (const [name, body] of Object.entries({
      "no token": fields({ notice_version: form.version!, decision: "accept" }),
      "the token twice": `${fields(valid)}&form_token=${form.token!}`,
      "another link's token": fields({ ...valid, form_token: elsewhere }),
    })) {
      const refused = await post(target, body);
      expect(refused.status, name).toBe(403);
      expect(refused.html, name).toContain(malformed);
    }
    for (const decision of ["allow", "maybe", ""]) {
      expect((await post(target, fields({ ...valid, decision }))).status, decision).toBe(400);
    }
    // Another site's page: refused before anything is read.
    const foreign = await post(target, fields(valid), { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(foreign.status).toBe(403);
    // Another browser, without this link's cookies; this browser posting to another interaction's address.
    const stranger = await post(target, fields(valid), {}, new Browser(fixture.baseUrl));
    expect(stranger.status).toBe(400);
    expect(stranger.html).toContain(expired);
    const otherUid = await post(target.replace(/\/interaction\/[A-Za-z0-9_-]+\//u, "/interaction/someOtherInteraction1/"),
      fields(valid));
    expect(otherUid.status).toBe(400);
    expect(otherUid.html).toContain(expired);
    // Only POST.
    const get = await browser.request(target);
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect(store.allAccounts()).toEqual([]);
    expect(answers.size).toBe(0);
    // The step still answers its own form, once the refusals are past.
    const declined = await answer(browser, notice.html, "decline");
    expect(isConsentPage(declined.html)).toBe(true);
    // After the link ends (the code went to Google), the step is gone: nothing more can be recorded with its token.
    await allowToCode(browser, declined.html);
    const late = await post(target, fields(valid));
    expect(late.status).toBe(400);
    expect(late.html).toContain(expired);
    expect(store.allAccounts()).toEqual([]);
  });

  it("takes no answer once the step's ten minutes are over: the link has expired, and nothing is recorded", async () => {
    const { store, answers, browser } = await start();
    const notice = await begin(browser);
    // Eleven minutes on: the sign-in step and its login session have expired (only Date moves; timers stay real).
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 11 * 60_000 });
    try {
      for (const decision of ["accept", "decline"]) {
        const late = await answer(browser, notice.html, decision);
        expect(late.response.status, decision).toBe(400);
        expect(late.html).toContain("This sign-in took too long or was opened in another browser. Start again from Gemini.");
      }
    } finally {
      vi.useRealTimers();
    }
    expect(store.allAccounts()).toEqual([]);
    expect(answers.size).toBe(0);
  });

  it("never stops the connection when a store doesn't answer, and records nothing", async () => {
    const records: GeminiSignInDiagnostic[] = [];
    const failing = async () => { throw new Error("synthetic store failure"); };
    // The account store can't be read: the consent step comes at once and says nothing was recorded (whether the
    // account needed the notice is unknown).
    const unreadable: AccountTermsAccess = { signInNoticeStatus: failing, acceptFreeContributor: failing };
    const first = await start({ access: unreadable, diagnostic: (record) => records.push(record) });
    const page = await begin(first.browser);
    expect(isConsentPage(page.html)).toBe(true);
    expect(page.html).toContain(`<p class="note">${escaped(CONSENT_NOTICE_NOTES.unchecked)}</p>`);
    await allowToCode(first.browser, page.html);
    expect(records.filter(({ stage }) => stage === "notice")).toEqual([
      { event: "askrigor_gemini_sign_in", stage: "notice", outcome: "not_recorded", detail: { reason: "account_store_unavailable" } },
    ]);
    // The yes can't be written: nothing recorded, and a second press records nothing either.
    records.length = 0;
    const unwritable: AccountTermsAccess = { signInNoticeStatus: async () => "ask", acceptFreeContributor: failing };
    const second = await start({ access: unwritable, diagnostic: (record) => records.push(record) });
    const notice = await begin(second.browser);
    for (let press = 0; press < 2; press += 1) {
      const pressed = await answer(second.browser, notice.html, "accept");
      expect(isConsentPage(pressed.html)).toBe(true);
      expect(pressed.html).toContain(escaped(CONSENT_NOTICE_NOTES.not_recorded));
    }
    expect(records.filter(({ stage }) => stage === "notice").map(({ outcome, detail }) => [outcome, detail?.reason]))
      .toEqual([["shown", undefined], ["not_recorded", "account_store_unavailable"], ["not_recorded", "already_answered"]]);
    // The answers' store can't be written: Accept goes on with nothing recorded; Decline is still a Decline.
    const lost: TermsPageAnswerStore = { claim: failing };
    const third = await start({ answers: lost });
    const asked = await begin(third.browser);
    expect((await answer(third.browser, asked.html, "accept")).html).toContain(escaped(CONSENT_NOTICE_NOTES.not_recorded));
    expect(third.store.allAccounts()).toEqual([]);
    const fourth = await start({ answers: lost });
    const declined = await answer(fourth.browser, (await begin(fourth.browser)).html, "decline");
    expect(declined.html).toContain(escaped(CONSENT_NOTICE_NOTES.declined));
    await allowToCode(fourth.browser, declined.html);
  });

  it("keeps each answer by its form token's SHA-256 until a minute past the step's interaction, never the token", async () => {
    const claims: { key: string; decision: string; until: number; at: number }[] = [];
    const kept = new InMemoryTermsPageAnswerStore();
    const answers: TermsPageAnswerStore = {
      claim: async (key, decision, until, at) => {
        claims.push({ key, decision, until: until.getTime(), at: at.getTime() });
        return await kept.claim(key, decision, until, at);
      },
    };
    const { browser } = await start({ answers });
    const notice = await begin(browser);
    const before = Date.now();
    await answer(browser, notice.html, "decline");
    const token = formOf(notice.html).token!;
    expect(claims).toHaveLength(1);
    expect(claims[0]!.key).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(claims[0]!.key).not.toContain(token);
    expect(claims[0]!.decision).toBe("decline");
    // The interaction lasts ten minutes from its start, a moment before; the answer is kept a minute past that.
    expect(claims[0]!.until).toBeGreaterThan(before + 10 * 60_000);
    expect(claims[0]!.until).toBeLessThanOrEqual(Date.now() + 11 * 60_000);
    expect(kept.size).toBe(1);
  });

  it("goes through production's proxy, which sends no-referrer on every page (release E)", async () => {
    const { fixture, store } = await start();
    const behindProxy = new Browser(fixture.baseUrl, { proxyReferrerPolicy: "no-referrer" });
    const { code, verifier } = await linkToCode(fixture, behindProxy, { notice: "accept" });
    await tokensFor(fixture, code, verifier);
    expect(store.allAccounts()).toMatchObject([{ noticeAcceptedBy: "PERSON_SIGN_IN_PAGE" }]);
  });

  it("writes the notice step in the step log by fixed words only", async () => {
    const records: GeminiSignInDiagnostic[] = [];
    const { fixture, store, service } = await start({ diagnostic: (record) => records.push(record) });
    const browser = new Browser(fixture.baseUrl);
    const notice = await begin(browser);
    const accepted = await answer(browser, notice.html, "accept");
    await allowToCode(browser, accepted.html);
    const lines = () => records.map(({ stage, outcome }) => `${stage} ${outcome}`);
    expect(lines()).toEqual([
      "authorization requested",
      "authorization to_interaction",
      "login sent_to_auth0",
      "login signed_in",
      "authorization to_interaction",
      "notice shown",
      "notice accepted",
      "consent shown",
      "consent allowed",
      "authorization code_issued",
    ]);
    // A second link of the same person, whose yes now covers the notice: not needed, and the consent step as before.
    records.length = 0;
    const later = new Browser(fixture.baseUrl);
    await allowToCode(later, (await begin(later)).html);
    expect(lines()).toContain("notice not_needed");
    expect(lines().indexOf("notice not_needed")).toBe(lines().indexOf("consent shown") - 1);
    const text = JSON.stringify(records);
    for (const secret of [PERSON, CLIENT_ID, formOf(notice.html).token!, service.accountKeyForSubject(PERSON),
      RESEARCH_USE_NOTICE_VERSION]) {
      expect(text).not.toContain(secret);
    }
    expect(store.allAccounts()).toHaveLength(1);
  });
});

describe("Gemini's notice step in the server", () => {
  const ENV = {
    ASKRIGOR_GEMINI_OAUTH: "enabled",
    ASKRIGOR_OAUTH_ENABLED: "true",
    ASKRIGOR_OAUTH_RESOURCE_URL: "https://mcp.askrigor.com/mcp",
    ASKRIGOR_OAUTH_ISSUER_URL: AUTH0,
    ASKRIGOR_OAUTH_JWKS_URL: `${AUTH0}.well-known/jwks.json`,
    ASKRIGOR_GEMINI_OAUTH_SECRET: Buffer.alloc(32, 9).toString("base64url"),
    ASKRIGOR_GEMINI_LOGIN_CLIENT_ID: "synthetic-gemini-login-client",
    ASKRIGOR_GEMINI_LOGIN_CLIENT_SECRET: "synthetic-gemini-login-secret",
  };

  async function listen(server: HttpServer): Promise<URL> {
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  }

  /** A notice answer from another site: refused (403) by the step, or not found (404) where there is no step. */
  async function foreignAnswer(base: URL): Promise<number> {
    const response = await fetch(new URL("/oauth/gemini/interaction/someInteraction1/notice", base), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example",
        "sec-fetch-site": "cross-site" },
      body: "decision=accept",
    });
    await response.text();
    return response.status;
  }

  it("is on with the research accounts given, and its address doesn't exist without them", async () => {
    const service = new ResearchContributorAccessService({
      store: new InMemoryResearchContributorAccessStore(), identitySecret: IDENTITY_SECRET });
    for (const notice of [{ access: service, answers: new InMemoryTermsPageAnswerStore() }, undefined]) {
      const signIn = geminiSignInFromEnv(new MemoryGeminiSignInRowStore(), ENV, notice === undefined ? {} : { notice });
      signIn!.stop();
      const base = await listen(createServer((request, response) => {
        void signIn!.routes.dispatch(request, response, { pathname: new URL(request.url!, "http://x").pathname,
          clientIp: "127.0.0.1" }).then((handled) => { if (!handled) response.writeHead(404).end(); });
      }));
      expect(await foreignAnswer(base)).toBe(notice === undefined ? 404 : 403);
    }
  });

  it("is on in the server whenever Gemini's sign-in and the research-access database are configured", async () => {
    for (const [name, value] of Object.entries({
      ...ENV,
      ASKRIGOR_RESEARCH_ACCESS_ENABLED: "true",
      // Never connected to: the request below is refused before anything is read.
      ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL: "postgres://synthetic@127.0.0.1:9/none",
      ASKRIGOR_RESEARCH_IDENTITY_SECRET_BASE64URL: Buffer.alloc(32, 5).toString("base64url"),
    })) vi.stubEnv(name, value);
    const { publicKey } = await generateKeyPair("RS256");
    const base = await listen(createAskRigorHttpServer({
      oauthResourceServer: createJwtOAuthResourceServer({
        resourceUrl: new URL("https://mcp.askrigor.com/mcp"), issuerUrl: new URL(AUTH0),
        jwks: createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "gemini-notice-test" }] }),
        allowedClientIds: ["synthetic-client"], reviewerSubjects: [OWNER],
      }),
      claudeOAuthResourceServer: null,
    }));
    expect(await foreignAnswer(base)).toBe(403);
    expect((await fetch(new URL("/oauth/gemini/interaction/someInteraction1/notice", base))).status).toBe(405);
  });
});
