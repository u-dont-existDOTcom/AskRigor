import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryAtlasPageSource,
  InMemoryAtlasPublicationStore,
  InMemoryResearchUserCounts,
  RESEARCH_CALL_RECORD_RETENTION_MS,
  researchAccountKeyForSubject,
  type ResearchUserCountsQuery,
  type ResearchUserCountsSource,
} from "@askrigor/evidence-repository";
import { AtlasChangeSignal } from "../apps/research-mcp/src/atlas/change-signal.js";
import { ATLAS_PAGE_HEADERS, atlasRouteOf, createAtlasPagesHandler } from "../apps/research-mcp/src/atlas/pages-http.js";
import { atlasPageProblems } from "../apps/research-mcp/src/atlas/pages.js";
import {
  EMPTY_USER_COUNTS_SVG,
  PublicUserCounts,
  USER_COUNTS_DEADLINE_MS,
  USER_COUNTS_IMAGE_PATH,
  USER_COUNTS_PATH,
  USER_COUNTS_RETRY_MS,
  publicUserCountsFromEnv,
  publicUserCountsModeFromEnv,
  renderUserCountsPage,
  renderUserCountsSvg,
  shownNumber,
  userCountsView,
  type PublicUserCountsMode,
} from "../apps/research-mcp/src/atlas/user-counts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// The public user count (the owner's request of 20 Nov 2026): two numbers from AskRigor's own records, the owner's own
// and test accounts left out, counted once a day, numbers under 10 shown as "fewer than 10", and nothing per person.

const key = (n: number) => n.toString(16).padStart(64, "0");
const OWNER_KEY = key(1);
const DEV_KEY = "abcdef012345".padEnd(64, "9");
const DAY = 24 * 60 * 60 * 1_000;
const AT = new Date("2026-11-21T09:00:00.000Z");
const START_OF_DAY = new Date("2026-11-21T00:00:00.000Z");
const LONG_AGO = new Date("2026-10-01T00:00:00.000Z");

/** A source that counts its reads and answers what the test sets. */
class CountingSource implements ResearchUserCountsSource {
  reads: ResearchUserCountsQuery[] = [];
  answer: () => Promise<{ accounts: number; usedLast7Days: number }> =
    async () => ({ accounts: 12, usedLast7Days: 3 });
  async counts(query: ResearchUserCountsQuery) {
    this.reads.push(query);
    return await this.answer();
  }
}

function counter(mode: PublicUserCountsMode, source: ResearchUserCountsSource | undefined, clock: { now: number },
  ownerAccountKeys: readonly string[] = [OWNER_KEY], deadlineMs?: number) {
  return new PublicUserCounts({
    mode, ownerAccountKeys, devAccountReferences: [DEV_KEY.slice(0, 12)],
    ...(source === undefined ? {} : { source }), now: () => clock.now,
    ...(deadlineMs === undefined ? {} : { deadlineMs }),
  });
}

describe("what the count counts", () => {
  it("counts active accounts outside the owner's keys and the dev references, and those of them with an answered call in the week before, up to the start of the day", async () => {
    const accounts = [OWNER_KEY, DEV_KEY, key(2), key(3), key(4), key(5)]
      .map((accountKey) => ({ accountKey, status: "ACTIVE" as const, createdAt: LONG_AGO }));
    const calls = [
      { accountKey: OWNER_KEY, receivedAt: new Date(AT.getTime() - DAY), outcome: "answered" as const },
      { accountKey: DEV_KEY, receivedAt: new Date(AT.getTime() - DAY), outcome: "answered" as const },
      { accountKey: key(2), receivedAt: new Date(AT.getTime() - DAY), outcome: "answered" as const },
      { accountKey: key(2), receivedAt: new Date(AT.getTime() - 2 * DAY), outcome: "answered" as const },
      { accountKey: key(3), receivedAt: new Date(AT.getTime() - DAY), outcome: "refused" as const },
      { accountKey: key(4), receivedAt: new Date(AT.getTime() - RESEARCH_CALL_RECORD_RETENTION_MS), outcome: "answered" as const },
      // Answered today, after the start of the day: it waits for tomorrow's count.
      { accountKey: key(5), receivedAt: new Date(START_OF_DAY.getTime() + 1), outcome: "answered" as const },
      // A signed-in caller with no account row, and a revoked account's call: neither counts.
      { accountKey: key(6), receivedAt: new Date(AT.getTime() - DAY), outcome: "answered" as const },
      { accountKey: key(7), receivedAt: new Date(AT.getTime() - DAY), outcome: "answered" as const },
    ];
    const source = new InMemoryResearchUserCounts([...accounts,
      { accountKey: key(7), status: "REVOKED", createdAt: LONG_AGO },
      // Made today: it waits for tomorrow's count.
      { accountKey: key(8), status: "ACTIVE", createdAt: new Date(START_OF_DAY.getTime() + 1) }], calls);
    const upTo = START_OF_DAY;
    expect(await source.counts({ excludedAccountKeys: [OWNER_KEY], excludedReferences: [DEV_KEY.slice(0, 12)], at: AT, upTo }))
      .toEqual({ accounts: 4, usedLast7Days: 1 });
    expect(await source.counts({ excludedAccountKeys: [], excludedReferences: [], at: AT, upTo }))
      .toEqual({ accounts: 6, usedLast7Days: 3 });
    // Malformed exclusions match nothing rather than something.
    expect(await source.counts({ excludedAccountKeys: ["OWNER"], excludedReferences: ["", "abc"], at: AT, upTo }))
      .toEqual({ accounts: 6, usedLast7Days: 3 });
  });
});

describe("what the count shows", () => {
  it("reads its mode from one setting, off unless set to a known value", () => {
    expect(publicUserCountsModeFromEnv(undefined)).toBe("off");
    expect(publicUserCountsModeFromEnv("")).toBe("off");
    expect(publicUserCountsModeFromEnv("yes")).toBe("off");
    expect(publicUserCountsModeFromEnv(" on ")).toBe("on");
    expect(publicUserCountsModeFromEnv("at-10")).toBe("at-10");
  });

  it("shows numbers under 10 as fewer than 10, and 10 and over as they are", () => {
    for (const value of [0, 1, 2, 9]) expect(shownNumber(value)).toEqual({ fewerThan: 10 });
    expect(shownNumber(10)).toEqual({ exact: 10 });
    expect(shownNumber(1234)).toEqual({ exact: 1234 });
  });

  it("shows nothing until 10 accounts in at-10, and the small-number form in on", () => {
    expect(userCountsView("off", { accounts: 50, usedLast7Days: 20 })).toEqual({ state: "off" });
    expect(userCountsView("on", undefined)).toEqual({ state: "unavailable" });
    expect(userCountsView("at-10", { accounts: 9, usedLast7Days: 9 })).toEqual({ state: "not-yet" });
    expect(userCountsView("at-10", { accounts: 10, usedLast7Days: 3 }))
      .toEqual({ state: "shown", accounts: { exact: 10 }, usedLast7Days: { fewerThan: 10 } });
    expect(userCountsView("on", { accounts: 0, usedLast7Days: 0 }))
      .toEqual({ state: "shown", accounts: { fewerThan: 10 }, usedLast7Days: { fewerThan: 10 } });
  });

  it("draws the image's two lines, numbers only, and an empty image when nothing shows", () => {
    const svg = renderUserCountsSvg({ state: "shown", accounts: { exact: 1234 }, usedLast7Days: { fewerThan: 10 } });
    expect(svg).toContain(">AskRigor accounts: </tspan>");
    expect(svg).toContain(">1,234</tspan>");
    expect(svg).toContain(">Used it in the past 7 days: </tspan>");
    expect(svg).toContain(">fewer than 10</tspan>");
    expect(svg).toContain('aria-label="AskRigor accounts: 1,234. Used it in the past 7 days: fewer than 10"');
    expect(svg).not.toMatch(/<script|<style|href|<image|<foreignObject/iu);
    const width = Number(/ width="(\d+)"/u.exec(svg)?.[1]);
    expect(width).toBeGreaterThan(300);
    expect(width).toBeLessThan(420);
    for (const state of ["off", "unavailable", "not-yet"] as const) {
      expect(renderUserCountsSvg({ state })).toBe(EMPTY_USER_COUNTS_SVG);
    }
    expect(EMPTY_USER_COUNTS_SVG).toContain('width="0" height="0"');
  });

  it("writes the text page with the same numbers, how they are counted, and nothing the pages refuse", () => {
    const shown = renderUserCountsPage({ state: "shown", accounts: { exact: 15 }, usedLast7Days: { fewerThan: 10 } });
    expect(atlasPageProblems(shown)).toEqual([]);
    expect(shown).toContain("<dt>AskRigor accounts</dt><dd>15</dd>");
    expect(shown).toContain("<dt>Used it in the past 7 days</dt><dd>fewer than 10</dd>");
    expect(shown).toContain("own accounts and test accounts are left out");
    expect(shown).toContain("It counts accounts, not");
    expect(shown).toContain("as of the start of the day (UTC)");
    expect(shown).toContain("while the count is small it doesn't change\nwhen one person signs up");
    expect(shown).toContain('<link rel="canonical" href="https://askrigor.com/atlas/users">');
    const notYet = renderUserCountsPage({ state: "not-yet" });
    expect(atlasPageProblems(notYet)).toEqual([]);
    expect(notYet).toContain("once there are 10 accounts");
    expect(notYet).not.toContain("<dd>");
  });
});

describe("when the count is read", () => {
  it("reads once per UTC day, sharing one read between concurrent views, and again the next day", async () => {
    const source = new CountingSource();
    const clock = { now: AT.getTime() };
    const counts = counter("on", source, clock);
    const [first, second] = await Promise.all([counts.view(), counts.view()]);
    expect(first).toEqual({ state: "shown", accounts: { exact: 12 }, usedLast7Days: { fewerThan: 10 } });
    expect(second).toEqual(first);
    clock.now = new Date("2026-11-21T23:59:59.999Z").getTime();
    await counts.view();
    expect(source.reads).toHaveLength(1);
    expect(source.reads[0]).toEqual({ excludedAccountKeys: [OWNER_KEY], excludedReferences: [DEV_KEY.slice(0, 12)], at: AT,
      upTo: START_OF_DAY });
    clock.now = new Date("2026-11-22T00:00:00.000Z").getTime();
    source.answer = async () => ({ accounts: 13, usedLast7Days: 11 });
    expect(await counts.view()).toEqual({ state: "shown", accounts: { exact: 13 }, usedLast7Days: { exact: 11 } });
    expect(source.reads).toHaveLength(2);
    expect(source.reads[1]?.upTo).toEqual(new Date("2026-11-22T00:00:00.000Z"));
  });

  it("gives up on a read that hasn't answered by the deadline, so no request waits on a stalled database", async () => {
    expect(USER_COUNTS_DEADLINE_MS).toBe(3_000);
    const source = new CountingSource();
    source.answer = () => new Promise(() => undefined);
    const clock = { now: AT.getTime() };
    const counts = counter("on", source, clock, [OWNER_KEY], 20);
    const started = Date.now();
    expect(await Promise.all([counts.view(), counts.view()])).toEqual([{ state: "unavailable" }, { state: "unavailable" }]);
    expect(Date.now() - started).toBeLessThan(2_000);
    // The stalled read counts as a failure: no second read for 5 minutes.
    expect(await counts.view()).toEqual({ state: "unavailable" });
    expect(source.reads).toHaveLength(1);
  });

  it("is unavailable after a failed read, and tries again only after 5 minutes", async () => {
    const source = new CountingSource();
    source.answer = async () => {
      throw new Error("DATABASE_DOWN");
    };
    const clock = { now: AT.getTime() };
    const counts = counter("on", source, clock);
    expect(await counts.view()).toEqual({ state: "unavailable" });
    clock.now += USER_COUNTS_RETRY_MS - 1;
    expect(await counts.view()).toEqual({ state: "unavailable" });
    expect(source.reads).toHaveLength(1);
    source.answer = async () => ({ accounts: 2, usedLast7Days: 1 });
    clock.now += 1;
    expect(await counts.view()).toEqual({ state: "shown", accounts: { fewerThan: 10 }, usedLast7Days: { fewerThan: 10 } });
    expect(source.reads).toHaveLength(2);
  });

  it("counts nothing, and reads nothing, without the owner's account to leave out or while off", async () => {
    const source = new CountingSource();
    const clock = { now: AT.getTime() };
    expect(await counter("on", source, clock, []).view()).toEqual({ state: "unavailable" });
    expect(await counter("off", source, clock).view()).toEqual({ state: "off" });
    expect(await counter("on", undefined, clock).view()).toEqual({ state: "unavailable" });
    expect(source.reads).toHaveLength(0);
  });

  it("derives the owner's keys from the owner's logins with the research identity secret, and the dev references", async () => {
    const secret = Buffer.alloc(32, 7);
    const env = {
      ASKRIGOR_PUBLIC_USER_COUNTS: "on",
      ASKRIGOR_RESEARCH_ACCESS_ENABLED: "true",
      ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/db",
      ASKRIGOR_RESEARCH_IDENTITY_SECRET_BASE64URL: secret.toString("base64url"),
      ASKRIGOR_OAUTH_ALLOWED_SUBJECT: "auth0|owner-login",
      ASKRIGOR_ATLAS_OWNER_SUBJECT: "google-oauth2|owner-other-login",
      ASKRIGOR_DEV_ACCOUNT_KEYS: `${DEV_KEY.slice(0, 12)}, not-a-key`,
    };
    const source = new CountingSource();
    await publicUserCountsFromEnv(env, source).view();
    expect(source.reads[0]?.excludedAccountKeys).toEqual([
      researchAccountKeyForSubject(secret, "auth0|owner-login"),
      researchAccountKeyForSubject(secret, "google-oauth2|owner-other-login"),
    ]);
    expect(source.reads[0]?.excludedReferences).toEqual([DEV_KEY.slice(0, 12)]);
    // Without the research access configuration no owner key is derived, so nothing is counted.
    const unconfigured = new CountingSource();
    expect(await publicUserCountsFromEnv({ ASKRIGOR_PUBLIC_USER_COUNTS: "on" }, unconfigured).view())
      .toEqual({ state: "unavailable" });
    expect(unconfigured.reads).toHaveLength(0);
    expect(publicUserCountsFromEnv({}, source).mode).toBe("off");
  });
});

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
});

async function serve(userCounts?: PublicUserCounts): Promise<string> {
  const handler = createAtlasPagesHandler({
    enabled: true,
    source: new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore() }),
    signal: new AtlasChangeSignal(),
    ...(userCounts === undefined ? {} : { userCounts }),
  });
  const server = createAskRigorHttpServer({ publicServerEnabled: false, atlasPagesHandler: handler });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("the count's two addresses", () => {
  it("route the page and the image, and nothing below them", () => {
    expect(atlasRouteOf(USER_COUNTS_PATH)).toEqual({ kind: "users" });
    expect(atlasRouteOf(USER_COUNTS_IMAGE_PATH)).toEqual({ kind: "users-image" });
    expect(atlasRouteOf(`${USER_COUNTS_PATH}/`)).toBeUndefined();
  });

  it("serve the image with the pages' headers, kept an hour, and the page with the same numbers", async () => {
    const source = new CountingSource();
    const base = await serve(counter("on", source, { now: AT.getTime() }));
    const image = await fetch(`${base}${USER_COUNTS_IMAGE_PATH}`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(image.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(image.headers.get("content-security-policy")).toBe(ATLAS_PAGE_HEADERS["Content-Security-Policy"]);
    expect(image.headers.get("set-cookie")).toBeNull();
    expect(await image.text()).toContain(">12</tspan>");
    const head = await fetch(`${base}${USER_COUNTS_IMAGE_PATH}`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect((await fetch(`${base}${USER_COUNTS_IMAGE_PATH}`, { method: "POST" })).status).toBe(405);
    const page = await fetch(`${base}${USER_COUNTS_PATH}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("set-cookie")).toBeNull();
    const body = await page.text();
    expect(body).toContain("<dt>AskRigor accounts</dt><dd>12</dd>");
    expect(body).toContain("<dt>Used it in the past 7 days</dt><dd>fewer than 10</dd>");
    expect((await fetch(`${base}${USER_COUNTS_PATH}`, { method: "POST" })).status).toBe(405);
    // One read for all of it: the day's count.
    expect(source.reads).toHaveLength(1);
  });

  it("answer an empty image and a not-found page while off, and when no count is configured", async () => {
    for (const userCounts of [undefined, counter("off", new CountingSource(), { now: AT.getTime() })]) {
      const base = await serve(userCounts);
      const image = await fetch(`${base}${USER_COUNTS_IMAGE_PATH}`);
      expect(image.status).toBe(200);
      expect(await image.text()).toBe(EMPTY_USER_COUNTS_SVG);
      expect((await fetch(`${base}${USER_COUNTS_PATH}`)).status).toBe(404);
    }
  });

  it("answer an empty image and the unavailable page when the count can't be read", async () => {
    const source = new CountingSource();
    source.answer = async () => {
      throw new Error("DATABASE_DOWN");
    };
    const base = await serve(counter("on", source, { now: AT.getTime() }));
    expect(await (await fetch(`${base}${USER_COUNTS_IMAGE_PATH}`)).text()).toBe(EMPTY_USER_COUNTS_SVG);
    expect((await fetch(`${base}${USER_COUNTS_PATH}`)).status).toBe(503);
  });

  it("show nothing on the image and say when it will show, below 10 accounts in at-10", async () => {
    const source = new CountingSource();
    source.answer = async () => ({ accounts: 0, usedLast7Days: 0 });
    const base = await serve(counter("at-10", source, { now: AT.getTime() }));
    expect(await (await fetch(`${base}${USER_COUNTS_IMAGE_PATH}`)).text()).toBe(EMPTY_USER_COUNTS_SVG);
    const page = await fetch(`${base}${USER_COUNTS_PATH}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("once there are 10 accounts");
  });

  it("answer an empty image, not an error, while the Atlas pages are off, since the home page always shows it", async () => {
    const handler = createAtlasPagesHandler({ enabled: false });
    const server = createAskRigorHttpServer({ publicServerEnabled: false, atlasPagesHandler: handler });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closers.push(() => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const image = await fetch(`${base}${USER_COUNTS_IMAGE_PATH}`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(await image.text()).toBe(EMPTY_USER_COUNTS_SVG);
    expect((await fetch(`${base}${USER_COUNTS_PATH}`)).status).toBe(404);
  });

  it("keep the image outside the pages' rate limit, which every home page view would otherwise spend", async () => {
    const base = await serve(counter("on", new CountingSource(), { now: AT.getTime() }));
    const statuses = new Set<number>();
    for (let index = 0; index < 70; index += 1) {
      statuses.add((await fetch(`${base}${USER_COUNTS_IMAGE_PATH}`)).status);
    }
    expect([...statuses]).toEqual([200]);
  });
});
