import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EARLIER_RESEARCH_USE_NOTICE_VERSIONS,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchAccountKeyForSubject,
  researchAccountReference,
} from "@askrigor/evidence-repository";

import {
  atlasFeatureRows,
  atlasServerFeaturesFromEnv,
  noticeWords,
  type AtlasFeatureRow,
  type AtlasFeaturesRuntime,
  type AtlasResearchAccount,
  type AtlasServerFeatures,
} from "../apps/research-mcp/src/atlas/account-features.js";
import { atlasParticipationFromEnv } from "../apps/research-mcp/src/atlas/pages-http.js";
import { atlasPageProblems } from "../apps/research-mcp/src/atlas/pages.js";
import {
  ATLAS_SESSION_COOKIE,
  newSession,
  participantKeyFor,
  sealSession,
} from "../apps/research-mcp/src/atlas/participation.js";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  ISSUER,
  OTHER_SUBJECT,
  OWNER,
  SUBJECT,
  bytes,
  closeAtlasServers,
  expectPageHeaders,
  fixture,
} from "./helpers/atlas-participation-fixture.js";

// The owner, 5 Nov 2026: "i should be able to see all of the features i'm using on the askrigor accounts page". The
// signed-in reader's AskRigor features on /atlas/account: their research account, read by the key their session carries
// through the research access service, and the server's features from a fixed snapshot. Everything is synthetic.

afterEach(closeAtlasServers);

const NOW = "2026-11-05T09:00:00.000Z";
const IDS = ["research-access", "plain-answer-note", "findings-cards", "detailed-lesson-reports", "forums", "video-search",
  "video-scout", "video-reading", "owner-library", "sharing", "meaning-judge"];

/** Every server feature set up, with room left in this month's AI budget and in today's video time. */
const SERVER: AtlasServerFeatures = {
  redditReader: true,
  youtube: true,
  gemini: true,
  aiBudgetLeftNanoUsd: 30_000_000_000,
  videoSecondsLeft: 20_000,
  meaningJudge: { on: true, dailyCapUsd: 3 },
  ownerLibrary: true,
  sharedAnswers: true,
  findingsLibrary: true,
};

const agreement = (noticeVersion: string = RESEARCH_USE_NOTICE_VERSION) => ({
  noticeVersion,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
}) as const;

/** A page's text as a reader sees it: no markup, entities read back, blank lines dropped. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/gu, "").replace(/&#39;/gu, "'").replace(/&quot;/gu, "\"").replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">").replace(/&amp;/gu, "&").split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
}

/** The features section of an account page: from its heading to the end of the page's main content. */
const section = (body: string) => body.includes('<h2 id="features">')
  ? body.slice(body.indexOf('<h2 id="features">'), body.indexOf("</main>")) : "";

/** One feature as the page writes it: its name, On or Off, and its three lines. */
function featureOf(body: string, id: string): { on: string; forYou: string; whoPays: string; limit: string } {
  const at = body.indexOf(`id="feature-${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  const item = body.slice(at, body.indexOf("</li>", at));
  const dd = [...item.matchAll(/<dd>([\s\S]*?)<\/dd>/gu)].map((match) => textOf(match[1]!));
  return { on: textOf(/<p class="badge[^"]*">([^<]*)<\/p>/u.exec(item)![1]!), forYou: dd[0]!, whoPays: dd[1]!, limit: dd[2]! };
}

/** The Atlas with the features runtime over an in-memory research access service, which records every account read. */
async function atlas(options: { server?: AtlasServerFeatures; dev?: string[]; failing?: boolean } = {}) {
  const store = new InMemoryResearchContributorAccessStore();
  const clock = { now: NOW };
  // The fixture's identity secret, so the key a sign-in seals is the key the service derives.
  const service = new ResearchContributorAccessService({ store, identitySecret: bytes(11), now: () => clock.now });
  const reads: string[] = [];
  const features: AtlasFeaturesRuntime = {
    research: {
      inspectByAccountKey: async (accountKey) => {
        reads.push(accountKey);
        if (options.failing === true) throw new Error("synthetic database outage");
        return await service.inspectByAccountKey(accountKey);
      },
      activeAccountByKey: async (accountKey) => {
        reads.push(accountKey);
        return await service.activeAccountByKey(accountKey);
      },
    },
    server: async () => options.server ?? SERVER,
    ownerAccountKeys: new Set([service.accountKeyForSubject(OWNER)]),
    devAccountKeys: () => new Set((options.dev ?? []).map((subject) =>
      researchAccountReference(service.accountKeyForSubject(subject)))),
  };
  const f = await fixture({ features });
  expect(f.settings.identitySecret).toEqual(bytes(11));
  const grant = (subject: string, expiresAt: string) => store.grantPrivateEntitlement({
    entitlementId: "88888888-8888-4888-a888-888888888888", accountKey: service.accountKeyForSubject(subject),
    status: "ACTIVE", source: "OWNER_GRANTED", externalReferenceSha256: null, grantedAt: "2026-11-01T00:00:00.000Z",
    expiresAt, revokedAt: null,
  });
  return { f, store, service, reads, clock, grant };
}

describe("Your AskRigor features on the account page", () => {
  it("lists a free contributor's features, each on or off with who pays and its limit, to them alone", async () => {
    const { f, service, reads } = await atlas();
    await service.acceptFreeContributor(SUBJECT, agreement());
    const signedOut = await f.get("/atlas/account");
    expect(signedOut.body).not.toContain("Your AskRigor features");
    expect(signedOut.body).not.toContain("feature-");
    expect(reads).toEqual([]);

    const session = await f.signIn();
    const { response, body } = await f.get("/atlas/account", session);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expectPageHeaders(response);
    expect(atlasPageProblems(body)).toEqual([]);
    // The account's own key is read, twice (inspect, then the active account's switches), and no other.
    const accountKey = service.accountKeyForSubject(SUBJECT);
    expect(reads).toEqual([accountKey, accountKey]);
    expect([...body.matchAll(/id="feature-([a-z-]+)"/gu)].map((match) => match[1])).toEqual(IDS);
    expect(textOf(section(body))).toContain("How AskRigor stands for the account you signed in with: whether each " +
      "feature is on for you, who pays\nfor it and its limit.");
    // Nothing that identifies the account is written on the page.
    for (const absent of [accountKey, researchAccountReference(accountKey), participantKeyFor(f.settings, SUBJECT), SUBJECT,
      RESEARCH_USE_NOTICE_VERSION]) {
      expect(body).not.toContain(absent);
    }

    expect(featureOf(body, "research-access")).toEqual({
      on: "On",
      forYou: "Free contributor use, under the free-use notice you accepted: version 4, of 25 Oct 2026.",
      whoPays: "No one pays money: free use is reciprocal. What AskRigor learns from your research is saved for its " +
        "research library, and your findings cards are published in the Atlas.",
      limit: "AskRigor sets no limit on your research; some features below have limits of their own.",
    });
    expect(featureOf(body, "plain-answer-note")).toMatchObject({ on: "On", forYou: expect.stringContaining(
      "the checked answer ends with a note comparing the two."), limit: "A plain answer holds at most 1,500 characters " +
      "and 5 claims, each at most 250 characters." });
    expect(featureOf(body, "findings-cards")).toMatchObject({ on: "On", forYou: expect.stringContaining(
      "Only the owner's dev accounts can turn this off."), whoPays: "No one.",
    limit: "AskRigor saves at most 20 findings cards an hour and 100 a day, from everyone together." });
    expect(featureOf(body, "detailed-lesson-reports")).toMatchObject({ on: "Off", forYou: "Off, as by default: a lesson " +
      "you send AskRigor about what went wrong carries no detailed report. Your AI can turn them on when you ask." });
    expect(featureOf(body, "forums")).toMatchObject({ on: "On", limit: "The Reddit reader takes one request at a time, " +
      "and a Reddit search returns up to 25 threads a page." });
    expect(featureOf(body, "video-search")).toMatchObject({ on: "On",
      whoPays: "No one: Google gives AskRigor a free daily quota." });
    expect(featureOf(body, "video-scout")).toEqual({
      on: "On",
      forYou: "Your AI can ask Gemini, Google's AI, to search the web for YouTube videos on a question described in " +
        "general terms, without personal details.",
      whoPays: "No one: AskRigor runs Gemini only on a key with no billing.",
      limit: "AskRigor's AI budget: $50 a month, for everyone together, and each search sets aside $1 of it. Not used up " +
        "this month.",
    });
    expect(featureOf(body, "video-reading")).toMatchObject({ on: "On", limit: "8 hours of video a day, for everyone " +
      "together; each reading counts the whole video, and the day starts again at midnight Pacific time. Not used up today." });
    expect(featureOf(body, "owner-library")).toMatchObject({ on: "On", forYou: expect.stringContaining(
      "but only a paper that is public in another way"), whoPays: "No one: AskRigor uses only the library's free PDF route." });
    expect(featureOf(body, "sharing")).toMatchObject({ on: "On", limit: "20 a day from your account. Each copy is kept " +
      "apart from your account and never made public, for 90 days; the code you get deletes it sooner." });
    expect(featureOf(body, "meaning-judge")).toEqual({
      on: "Off",
      forYou: "It runs only for the owner's dev accounts.",
      whoPays: "AskRigor's owner, from their monthly Claude API credits.",
      limit: "At most $3 a day.",
    });
  });

  it("shows nothing about another account, and the other account its own", async () => {
    const { f, service, reads, grant } = await atlas({ dev: [OTHER_SUBJECT] });
    await service.acceptFreeContributor(SUBJECT, agreement());
    grant(OTHER_SUBJECT, "2026-12-01T00:00:00.000Z");
    await service.activatePaidPrivate(OTHER_SUBJECT);
    await service.setDetailedLessonReports(OTHER_SUBJECT, true);

    const mine = (await f.get("/atlas/account", await f.signIn(SUBJECT))).body;
    expect(new Set(reads)).toEqual(new Set([service.accountKeyForSubject(SUBJECT)]));
    expect(textOf(section(mine))).not.toMatch(/Paid private use:|Your account is one of the owner's dev accounts/u);
    expect(featureOf(mine, "detailed-lesson-reports").on).toBe("Off");
    expect(featureOf(mine, "meaning-judge").forYou).toBe("It runs only for the owner's dev accounts.");

    reads.length = 0;
    const theirs = (await f.get("/atlas/account", await f.signIn(OTHER_SUBJECT))).body;
    expect(new Set(reads)).toEqual(new Set([service.accountKeyForSubject(OTHER_SUBJECT)]));
    expect(featureOf(theirs, "research-access")).toMatchObject({ on: "On", forYou: "Paid private use: AskRigor saves " +
      "research findings or lesson feedback only when you accept saving them, answer by answer.",
    whoPays: "Your paid private entitlement covers it. AskRigor doesn't sell one online yet." });
    expect(featureOf(theirs, "findings-cards").forYou).toBe("Only with your yes: after the final check, your AI asks you " +
      "before an answer's findings card is saved.");
    expect(featureOf(theirs, "detailed-lesson-reports").on).toBe("On");
    expect(featureOf(theirs, "meaning-judge")).toMatchObject({ on: "On", forYou: expect.stringContaining(
      "Your account is one of the owner's dev accounts: once a final check passes, Claude") });
    expect(theirs).not.toContain("Free contributor use, under");
  });

  it("words each state of research access as inspect reports it, and what needs it", async () => {
    const { f, service, store, clock, grant } = await atlas();
    const session = await f.signIn();
    const page = async () => (await f.get("/atlas/account", session)).body;
    // Every feature between research access and the meaning judge needs research access.
    const needsAccess = (body: string) => IDS.slice(1, -1).map((id) => featureOf(body, id))
      .filter((feature) => feature.forYou === "It needs research access, above.").length;

    let body = await page();
    expect(featureOf(body, "research-access")).toMatchObject({ on: "Off", forYou: "Not chosen yet, or AskRigor's free-use " +
      "notice changed since you accepted it. Before research, your AI app shows you the current notice (version 4, of " +
      "25 Oct 2026) and asks you to choose free contributor use or paid private use." });
    expect(needsAccess(body)).toBe(9);
    expect(featureOf(body, "meaning-judge").forYou).toBe("It runs only for the owner's dev accounts.");

    // A free account under an earlier notice is unenrolled until it accepts the current one, as inspect says.
    const accountKey = service.accountKeyForSubject(SUBJECT);
    await store.saveAccount({ accountKey, status: "ACTIVE", mode: "FREE_CONTRIBUTOR",
      noticeVersion: EARLIER_RESEARCH_USE_NOTICE_VERSIONS[2], agreement: agreement(EARLIER_RESEARCH_USE_NOTICE_VERSIONS[2]),
      activatedAt: NOW, revokedAt: null, createdAt: NOW, updatedAt: NOW });
    expect(featureOf(await page(), "research-access").forYou).toMatch(/^Not chosen yet, or AskRigor's free-use notice changed/u);

    await service.revoke(SUBJECT);
    body = await page();
    expect(featureOf(body, "research-access")).toMatchObject({ on: "Off", forYou: "You turned research access off. " +
      "Before you research again, your AI app asks you to choose free contributor use, under the free-use notice " +
      "(version 4, of 25 Oct 2026), or paid private use." });
    expect(needsAccess(body)).toBe(9);

    grant(SUBJECT, "2026-11-06T00:00:00.000Z");
    await service.activatePaidPrivate(SUBJECT);
    expect(featureOf(await page(), "research-access").on).toBe("On");
    // Inspect still says active once the entitlement lapses; the research tools refuse, and so does this page.
    clock.now = "2026-11-07T00:00:00.000Z";
    body = await page();
    expect(featureOf(body, "research-access")).toMatchObject({ on: "Off", forYou: "Your paid private entitlement is no " +
      "longer active, so AskRigor's research tools don't run for you. Your AI app can offer you free contributor use " +
      "instead." });
    expect(needsAccess(body)).toBe(9);
  });

  it("asks a session from before sessions carried the account key to sign in again, and reads no account", async () => {
    const { f, service, reads } = await atlas();
    await service.acceptFreeContributor(SUBJECT, agreement());
    const older = `${ATLAS_SESSION_COOKIE}=${sealSession(f.settings, newSession(participantKeyFor(f.settings, SUBJECT),
      new Date()))}`;
    const { response, body } = await f.get("/atlas/account", older);
    expect(response.status).toBe(200);
    expect(body).toContain("You are signed in with your AskRigor account.");
    expect(textOf(section(body))).toBe("Your AskRigor features\nTo see your AskRigor features here, sign in again.\n" +
      "Sign in again");
    expect(section(body)).toContain(`<a href="${f.base}/atlas/auth/login?return=%2Fatlas%2Faccount">Sign in again</a>`);
    expect(reads).toEqual([]);
    expect(featureOf((await f.get("/atlas/account", await f.signIn())).body, "research-access").on).toBe("On");
  });

  it("keeps the account page when the research account can't be read", async () => {
    const { f, service } = await atlas({ failing: true });
    await service.acceptFreeContributor(SUBJECT, agreement());
    const { response, body } = await f.get("/atlas/account", await f.signIn());
    expect(response.status).toBe(200);
    expect(textOf(section(body))).toBe("Your AskRigor features\nAskRigor couldn't read your features just now. Reload the " +
      "page to try again.");
    expect(body).toContain('action="/atlas/account/delete"');
    expect(body).not.toContain("feature-");
  });
});

describe("the features' words", () => {
  const FREE: AtlasResearchAccount = {
    status: "ACTIVE", mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION, entitlementLapsed: false,
    settings: { plainAnswerNote: true, detailedLessonReports: false, findingsSave: true }, devAccount: false, owner: false,
  };
  const rows = (account: Partial<AtlasResearchAccount>, server: Partial<AtlasServerFeatures> = {}) =>
    new Map(atlasFeatureRows({ ...FREE, ...account }, { ...SERVER, ...server }, new Date(NOW)).map((row) => [row.id, row]));
  const row = (map: Map<string, AtlasFeatureRow>, id: string) => map.get(id)!;

  it("reads the notice version as a date and a number", () => {
    expect(noticeWords(RESEARCH_USE_NOTICE_VERSION)).toBe("version 4, of 25 Oct 2026");
    expect(noticeWords("free-contributor-v12-2027-01-09")).toBe("version 12, of 9 Jan 2027");
    expect(noticeWords("free-contributor-v5-2027-13-01")).toBe("the current version");
    expect(noticeWords("another-notice")).toBe("the current version");
  });

  it("says when a server feature is not set up, closed, used up or unreadable", () => {
    const off = rows({}, { redditReader: false, youtube: false, gemini: false, aiBudgetLeftNanoUsd: null,
      videoSecondsLeft: null, meaningJudge: { on: false, dailyCapUsd: null }, ownerLibrary: false, sharedAnswers: false,
      findingsLibrary: false });
    expect(row(off, "forums")).toMatchObject({ on: true, forYou: "Your AI can read public forum pages. AskRigor's Reddit " +
      "reader isn't set up on this server, so Reddit stays with your AI's own search.", limit: "No limit of its own." });
    for (const id of ["video-search", "owner-library", "sharing"]) {
      expect(row(off, id), id).toMatchObject({ on: false, forYou: "Not set up on this server." });
    }
    for (const id of ["video-scout", "video-reading"]) {
      expect(row(off, id), id).toMatchObject({ on: false, forYou: "Not set up on this server: AskRigor runs Gemini only " +
        "on a key with no billing." });
      expect(row(off, id).limit, id).not.toMatch(/used up|couldn't read/u);
    }
    expect(row(off, "findings-cards")).toMatchObject({ on: false, forYou: "AskRigor's findings library is closed on this " +
      "server, so no findings card is saved." });
    expect(row(off, "meaning-judge")).toMatchObject({ on: false, forYou: "Switched off on this server. When it is on, it " +
      "runs only for the owner's dev accounts.", limit: "Nothing is spent while it is off." });

    // A scout sets aside $1: less than that left is the month used up, until the first of the next UTC month.
    const spent = rows({}, { aiBudgetLeftNanoUsd: 999_999_999, videoSecondsLeft: 0 });
    expect(row(spent, "video-scout").limit).toMatch(/ Used up this month: no search can start until 1 Dec 2026\.$/u);
    expect(row(spent, "video-reading").limit).toMatch(/ Used up today\.$/u);
    expect(row(rows({}, { aiBudgetLeftNanoUsd: 1_000_000_000 }), "video-scout").limit).toMatch(/ Not used up this month\.$/u);
    expect(atlasFeatureRows(FREE, { ...SERVER, aiBudgetLeftNanoUsd: 0 }, new Date("2026-12-31T23:59:59.000Z"))
      .find(({ id }) => id === "video-scout")!.limit).toMatch(/until 1 Jan 2027\.$/u);
    const unread = rows({}, { aiBudgetLeftNanoUsd: null, videoSecondsLeft: null });
    expect(row(unread, "video-scout").limit).toMatch(/ AskRigor couldn't read how much of it is used this month\.$/u);
    expect(row(unread, "video-reading").limit).toMatch(/ AskRigor couldn't read how much is used today\.$/u);
  });

  it("words the owner's library, a dev account's switches and the meaning judge for whom they serve", () => {
    expect(row(rows({ owner: true }), "owner-library").forYou).toBe("You are AskRigor's owner: when no open copy of a " +
      "paper is found, AskRigor gets it from your library.");
    const dev = rows({ devAccount: true }, { meaningJudge: { on: true, dailyCapUsd: 2.5 } });
    expect(row(dev, "meaning-judge")).toMatchObject({ on: true, limit: "At most $2.50 a day." });
    expect(row(dev, "findings-cards").forYou).toMatch(/As one of the owner's dev accounts, yours can have your AI turn this off, for regression runs\.$/u);
    const savingOff = { settings: { ...FREE.settings!, findingsSave: false } };
    expect(row(rows({ ...savingOff, devAccount: true }), "findings-cards")).toMatchObject({ on: false, forYou: "Turned off " +
      "for your account, for regression runs: the final check still checks each findings card, but saves none. Your AI " +
      "can turn it back on." });
    expect(row(rows(savingOff), "findings-cards").forYou).toMatch(/Ask AskRigor's owner to turn it back on\.$/u);
    const noteOff = rows({ settings: { ...FREE.settings!, plainAnswerNote: false, detailedLessonReports: true } });
    expect(row(noteOff, "plain-answer-note")).toMatchObject({ on: false, forYou: expect.stringContaining(
      "but the checked answer doesn't end with the note comparing the two.") });
    expect(row(noteOff, "detailed-lesson-reports")).toMatchObject({ on: true, forYou: "A lesson you send AskRigor about " +
      "what went wrong may carry a detailed report, which your AI shows you with the lesson before asking you to send it." });
    // A dev account without research access gets no judge: the final check needs research access.
    expect(row(rows({ devAccount: true, status: "REVOKED", mode: null, settings: null }), "meaning-judge"))
      .toMatchObject({ on: false, forYou: "It needs research access, above." });
  });
});

describe("the features from the server's settings", () => {
  it("builds the runtime with the connector's service and the owner's account key, or makes its own service", () => {
    const secret = (fill: number) => Buffer.from(bytes(fill)).toString("base64url");
    const env = {
      ASKRIGOR_ATLAS_PARTICIPATION: "enabled",
      ASKRIGOR_ATLAS_SESSION_KEY_BASE64URL: secret(1),
      ASKRIGOR_ATLAS_PARTICIPANT_SECRET_BASE64URL: secret(2),
      ASKRIGOR_RESEARCH_ACCESS_ENABLED: "true",
      ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL: "postgres://access@127.0.0.1:5432/askrigor_living_evidence",
      ASKRIGOR_RESEARCH_IDENTITY_SECRET_BASE64URL: secret(3),
      ASKRIGOR_ATLAS_AUTH0_CLIENT_ID: CLIENT_ID,
      ASKRIGOR_ATLAS_AUTH0_CLIENT_SECRET: CLIENT_SECRET,
      ASKRIGOR_OAUTH_ISSUER_URL: ISSUER,
      ASKRIGOR_OAUTH_JWKS_URL: `${ISSUER}.well-known/jwks.json`,
    };
    const research = { inspectByAccountKey: async () => { throw new Error("unused"); },
      activeAccountByKey: async () => { throw new Error("unused"); } };
    const shared = atlasParticipationFromEnv(env, { researchAccess: research, ownerSubjects: new Set([OWNER, " bad"]) });
    expect(shared?.features?.research).toBe(research);
    expect(shared?.features?.ownerAccountKeys).toEqual(new Set([researchAccountKeyForSubject(bytes(3), OWNER)]));
    const own = atlasParticipationFromEnv(env);
    expect(own?.features?.research).toBeInstanceOf(ResearchContributorAccessService);
    expect(own?.features?.ownerAccountKeys.size).toBe(0);
  });

  it("reads whether each feature is set up and what the ledgers leave, never a secret's value", async () => {
    const directory = await mkdtemp(join(tmpdir(), "askrigor-account-features-"));
    try {
      const secrets = {
        YOUTUBE_API_KEY: "synthetic-youtube-key-0123456789",
        ASKRIGOR_GEMINI_API_KEY: "synthetic-gemini-key-0123456789",
        ASKRIGOR_FINALIZATION_SIGNING_SECRET: "synthetic-finalization-secret-0123456789abcdef",
        ASKRIGOR_INFOACCESS_TOKEN: "synthetic-infoaccess-token-0123456789",
      };
      const env = {
        ...secrets,
        ASKRIGOR_GEMINI_BILLING: "none",
        ASKRIGOR_AI_BUDGET_LEDGER: join(directory, "ai-budget.json"),
        ASKRIGOR_AI_MONTHLY_BUDGET_USD: "50.00",
        ASKRIGOR_INFOACCESS_URL: "https://library.example/mcp",
        ASKRIGOR_REDDIT_READER_SSH_TARGET: "reader@reader.example",
        ASKRIGOR_REDDIT_READER_KEY_FILE: "/run/secrets/synthetic-reader-key",
        ASKRIGOR_REDDIT_READER_KNOWN_HOSTS_FILE: "/run/secrets/synthetic-known-hosts",
        ASKRIGOR_FINDINGS_LIBRARY: "enabled",
      };
      const month = new Date().toISOString().slice(0, 7);
      await writeFile(join(directory, "ai-budget.json"), `${JSON.stringify({ schema_version: 1, utc_month: month,
        monthly_limit_nano_usd: 50_000_000_000, charged_nano_usd: 49_250_000_000, updated_at: new Date().toISOString() })}\n`,
      { mode: 0o600 });
      const features = await atlasServerFeaturesFromEnv(env)();
      expect(features).toEqual({
        redditReader: true, youtube: true, gemini: true, aiBudgetLeftNanoUsd: 750_000_000,
        // No video ledger yet: the whole day is left.
        videoSecondsLeft: 28_800,
        // The process's own judge and shared answers, which these tests' environment leaves off.
        meaningJudge: { on: false, dailyCapUsd: null }, ownerLibrary: true, sharedAnswers: false, findingsLibrary: true,
      });
      for (const value of Object.values(secrets)) expect(JSON.stringify(features)).not.toContain(value);

      // Without the no-billing declaration Gemini is off, and its ledgers are not read.
      expect(await atlasServerFeaturesFromEnv({ ...env, ASKRIGOR_GEMINI_BILLING: "paid" })()).toMatchObject({
        gemini: false, aiBudgetLeftNanoUsd: null, videoSecondsLeft: null });
      expect(await atlasServerFeaturesFromEnv({})()).toEqual({ redditReader: false, youtube: false, gemini: false,
        aiBudgetLeftNanoUsd: null, videoSecondsLeft: null, meaningJudge: { on: false, dailyCapUsd: null },
        ownerLibrary: false, sharedAnswers: false, findingsLibrary: false });
      // A ledger in an unsafe place cannot be read: null, and the page says so.
      expect(await atlasServerFeaturesFromEnv({ ...env, ASKRIGOR_AI_BUDGET_LEDGER: "relative/ai-budget.json" })())
        .toMatchObject({ gemini: true, aiBudgetLeftNanoUsd: null, videoSecondsLeft: null });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
