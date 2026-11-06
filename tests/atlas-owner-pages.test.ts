import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AtlasPagePublication, AtlasPageSource } from "@askrigor/evidence-repository";

import { commentMapsFileSchema, type CommentMap } from "../apps/research-mcp/src/atlas/comment-map-pages.js";
import {
  OWNER_GITHUB_PAGES,
  ownerPageProblems,
  readPrivateCommentMaps,
  renderAtlasOwnerPages,
} from "../apps/research-mcp/src/atlas/owner-pages.js";
import { ATLAS_PAGE_HEADERS, atlasOwnerFromEnv, atlasRouteOf } from "../apps/research-mcp/src/atlas/pages-http.js";
import { PRIVATE_PAGES_PATH, atlasPageProblems } from "../apps/research-mcp/src/atlas/pages.js";
import {
  ATLAS_SESSION_COOKIE, newSession, participantKeyFor, sealSession,
} from "../apps/research-mcp/src/atlas/participation.js";
import {
  OTHER_SUBJECT, OWNER, SUBJECT, bytes, closeAtlasServers, expectPageHeaders, fixture,
} from "./helpers/atlas-participation-fixture.js";

/** The pages' own headers, but the owner's page sends no referrer at all. */
function expectOwnerPageHeaders(response: Response) {
  for (const [name, value] of Object.entries(ATLAS_PAGE_HEADERS)) {
    expect(response.headers.get(name), name).toBe(name === "Referrer-Policy" ? "no-referrer" : value);
  }
}

/** A page source that returns what no store would: every publication's claim naming a YouTube address. */
const leakingYouTube = (source: AtlasPageSource): AtlasPageSource => ({
  read: (work) => source.read((reads) => work(new Proxy(reads, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      if (property !== "listPublications") return value.bind(target);
      return async (...args: unknown[]) => ((await value.apply(target, args)) as AtlasPagePublication[]).map((row) =>
        row.published === null ? row : { ...row, published: { ...row.published,
          claim: `${row.published.claim} Watch it at youtube.com/watch?v=Qz7Kp2Wm9Xa.` } });
    },
  }))),
});

// The owner's private page on the Atlas (the owner, 5 Nov 2026: "i don't see my private pages, they don't show on my
// askrigor home page"). Every video ID, channel, method and count here is invented, and checked against the owner's
// private maps file to match none of its maps.

const temporary: string[] = [];
afterEach(async () => {
  await closeAtlasServers();
  while (temporary.length > 0) await rm(temporary.pop()!, { recursive: true, force: true });
});

const map = (overrides: Partial<CommentMap> & Pick<CommentMap, "video_id" | "label" | "problem" | "tried" | "outcomes">):
  CommentMap => ({
  channel: "An invented physio channel",
  mapped_on: "2026-11-04",
  corpus: 643,
  sampled: 643,
  sample: "all",
  left_out: { promotion: 1, joke: 0 },
  better_reports_lasted: { immediate: 4, days: 3, weeks: 2, months: 2, years: 0, not_stated: 5 },
  harm_kinds: [],
  leads: [],
  ...overrides,
});
const MAPS = [
  map({ video_id: "Qz7Kp2Wm9Xa", label: "An invented knee routine", problem: "Invented knee ache", tried: 41,
    outcomes: { better: 29, no_change: 6, worse: 4, mixed: 2 }, corpus: 1873, sampled: 412, sample: "lowest_hash",
    left_out: { promotion: 3, joke: 2 },
    better_reports_lasted: { immediate: 7, days: 5, weeks: 4, months: 3, years: 1, not_stated: 9 },
    harm_kinds: [{ kind: "sore calves (invented)", people: 4 }],
    leads: [{ method: "an invented ankle circle", people: 5, outcomes: { better: 3, no_change: 1, worse: 1, mixed: 0 },
      helped_more_than_video: 1, helped_after_video_failed: 0 }] }),
  map({ video_id: "Lr4Tn8Vb3Yc", label: "Another invented knee routine", problem: "Invented knee ache", tried: 31,
    outcomes: { better: 26, no_change: 3, worse: 1, mixed: 1 }, channel: "Another invented channel" }),
  map({ video_id: "Hj6Fd1Sg5Ue", label: "An invented wrist stretch", problem: "Invented wrist ache", tried: 9,
    outcomes: { better: 5, no_change: 2, worse: 1, mixed: 1 }, corpus: 509, sampled: 509 }),
];
const FILE = { schema: "askrigor.comment-maps.v1", maps: MAPS };

async function mapsFile(content: unknown = FILE): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "askrigor-owner-maps-"));
  temporary.push(folder);
  const path = join(folder, "comment-maps.json");
  await writeFile(path, typeof content === "string" ? content : JSON.stringify(content), { mode: 0o600 });
  return path;
}

const header = (body: string) => body.slice(body.indexOf("<header"), body.indexOf("</header>") + "</header>".length);

const YOUTUBE = /youtube(?:-nocookie)?\.com|youtu\.be/iu;

describe("the route", () => {
  it("exists only while sign-in is on, under the account pages", () => {
    expect(PRIVATE_PAGES_PATH).toBe("/atlas/account/private");
    expect(atlasRouteOf(PRIVATE_PAGES_PATH)).toBeUndefined();
    expect(atlasRouteOf(PRIVATE_PAGES_PATH, true)).toEqual({ kind: "private-pages" });
  });

  it("answers 404 while sign-in is off, as every account page does", async () => {
    const f = await fixture({ participation: false });
    for (const method of ["GET", "HEAD"]) expect((await fetch(`${f.base}${PRIVATE_PAGES_PATH}`, { method })).status).toBe(404);
  });
});

describe("who sees it", () => {
  it("asks a reader who isn't signed in to sign in, as the account pages do, and says nothing of what is there", async () => {
    const f = await fixture({ owner: { commentMapsFile: await mapsFile() } });
    const page = await f.get(PRIVATE_PAGES_PATH);
    expect(page.response.status).toBe(200);
    expect(page.body).toContain("Sign in with your AskRigor account to see this page.");
    expect(page.body).toContain(`href="${f.base}/atlas/auth/login?return=${encodeURIComponent(PRIVATE_PAGES_PATH)}"`);
    expect(page.body).toContain('<meta name="robots" content="noindex">');
    expect(page.body).not.toMatch(/private pages|comment map|github|invented/iu);
    expect(page.body).not.toMatch(YOUTUBE);
    // The account pages' own prompt, with their headers (the review of #418, finding 2): no-referrer is the owner's page's.
    const other = await f.get("/atlas/account/comments");
    expect(other.response.status).toBe(200);
    for (const name of ["cache-control", "vary", "x-robots-tag", "referrer-policy", "content-type"]) {
      expect(page.response.headers.get(name), name).toBe(other.response.headers.get(name));
    }
    expect(page.response.headers.get("cache-control")).toBe("private, no-store");
    expectPageHeaders(page.response);
  });

  it("answers anyone else signed in as an address with no page would: 404, the same page", async () => {
    const f = await fixture({ owner: { commentMapsFile: await mapsFile() } });
    const session = await f.signIn(SUBJECT);
    const private_ = await f.get(PRIVATE_PAGES_PATH, session);
    const nowhere = await f.get("/atlas/account/nothing-here", session);
    expect(private_.response.status).toBe(404);
    expect(private_.body).toBe(nowhere.body);
    for (const name of ["cache-control", "vary", "x-robots-tag", "referrer-policy", "content-type"]) {
      expect(private_.response.headers.get(name), name).toBe(nowhere.response.headers.get(name));
    }
    expect(private_.body).not.toMatch(/private pages|comment map|github|invented/iu);
    // Nor does any page of theirs link it.
    for (const path of ["/atlas", "/atlas/account", "/atlas/findings/P-1001", "/atlas/account/comments"]) {
      const page = await f.get(path, session);
      expect(page.body, path).not.toContain(PRIVATE_PAGES_PATH);
      expect(page.body, path).not.toContain("Your private pages");
    }
    // An Atlas with no owner configured has no one to show it to.
    const g = await fixture({ owner: false });
    expect((await g.get(PRIVATE_PAGES_PATH, await g.signIn(OWNER))).response.status).toBe(404);
  });

  it("shows the owner, signed in through the same login, the page, never cached and kept out of search engines", async () => {
    const f = await fixture({ owner: { commentMapsFile: await mapsFile() } });
    const session = await f.signIn(OWNER);
    const page = await f.get(PRIVATE_PAGES_PATH, session);
    expect(page.response.status).toBe(200);
    expect(page.body).toContain("<h1>Your private pages</h1>");
    for (const { href } of OWNER_GITHUB_PAGES) expect(page.body).toContain(`<a href="${href}">`);
    expect(OWNER_GITHUB_PAGES.map(({ href }) => href)).toEqual([
      "https://github.com/u-dont-existDOTcom/owner-pages/blob/main/askrigor/OWNER-QUESTIONS.md",
      "https://github.com/u-dont-existDOTcom/owner-pages/blob/main/askrigor/atlas-forum-and-site-2026-11-05.md",
      "https://github.com/u-dont-existDOTcom/owner-pages/blob/main/askrigor/comment-maps-2026-10-31.md",
    ]);
    // The maps, each with its video's link, on this page alone.
    expect(page.body).toContain('<a href="https://www.youtube.com/watch?v=Qz7Kp2Wm9Xa">the video</a>');
    expect(page.body.match(/youtube\.com\/watch\?v=/gu)).toHaveLength(3);
    expect(page.body).toContain("41 people said they did the video’s method, in 412 comments read of 1,873");
    expect(page.body).toContain('<h3 id="by-problem">By problem</h3>');
    expect(page.body).toContain('<h4 id="map-1-title">An invented knee routine</h4>');
    expect(page.body).toContain("from the 3 maps installed on the server. Only you can open this page");
    expect(page.body).not.toContain("None of it is on askrigor.com");
    expect(page.body).toContain('<meta name="robots" content="noindex">');
    expect(page.body).toContain('<meta name="referrer" content="no-referrer">');
    expect(page.body).not.toContain('rel="canonical"');
    expect(header(page.body)).toContain(`<a href="${PRIVATE_PAGES_PATH}" aria-current="page">Your private pages</a>`);
    expect(page.response.headers.get("cache-control")).toBe("private, no-store");
    expect(page.response.headers.get("vary")).toBe("Cookie");
    expect(page.response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(page.response.headers.get("referrer-policy")).toBe("no-referrer");
    expectOwnerPageHeaders(page.response);
    const head = await fetch(`${f.base}${PRIVATE_PAGES_PATH}`, { method: "HEAD", headers: { cookie: session } });
    expect(head.status).toBe(200);
    expect(head.headers.get("cache-control")).toBe("private, no-store");
    expect(await head.text()).toBe("");
    // The owner's session is the owner's because its subject's participant key is the owner's.
    expect(participantKeyFor(f.settings, OWNER)).not.toBe(participantKeyFor(f.settings, SUBJECT));
  });

  it("links the page from the owner's header on every page and from the account page, and only for the owner", async () => {
    const f = await fixture();
    const session = await f.signIn(OWNER);
    for (const path of ["/atlas", "/atlas/changes", "/atlas/findings/P-1001", "/atlas/account", "/atlas/account/comments"]) {
      const page = await f.get(path, session);
      expect(header(page.body), path).toContain(`<a href="${PRIVATE_PAGES_PATH}">Your private pages</a>`);
      expect(page.response.headers.get("cache-control"), path).toBe("private, no-store");
    }
    expect((await f.get("/atlas/account", session)).body)
      .toContain(`<p><a href="${PRIVATE_PAGES_PATH}">Your private pages</a>: your comment maps, and your pages on GitHub.`);
    // The shared cache never keeps it: the same pages signed out don't link it.
    for (const path of ["/atlas", "/atlas/changes", "/atlas/findings/P-1001"]) {
      expect((await f.get(path)).body, path).not.toContain(PRIVATE_PAGES_PATH);
    }
  });

  it("takes the owner's other login when it is named too", async () => {
    const f = await fixture({ owner: { subjects: [OWNER, OTHER_SUBJECT] } });
    expect((await f.get(PRIVATE_PAGES_PATH, await f.signIn(OTHER_SUBJECT))).response.status).toBe(200);
    expect((await f.get(PRIVATE_PAGES_PATH, await f.signIn(OWNER))).response.status).toBe(200);
    expect((await f.get(PRIVATE_PAGES_PATH, await f.signIn(SUBJECT))).response.status).toBe(404);
  });
});

describe("the maps file", () => {
  it("is read for each request, and says plainly when there are no maps or they can't be read", async () => {
    const path = await mapsFile();
    const f = await fixture({ owner: { commentMapsFile: path } });
    const session = await f.signIn(OWNER);
    expect((await f.get(PRIVATE_PAGES_PATH, session)).body).toContain("An invented wrist stretch");
    await writeFile(path, JSON.stringify({ ...FILE, maps: MAPS.slice(0, 1) }));
    const fewer = (await f.get(PRIVATE_PAGES_PATH, session)).body;
    expect(fewer).not.toContain("An invented wrist stretch");
    expect(fewer).toContain("from the 1 map installed on the server");
    const none = "No comment maps are installed on the server yet.";
    const unreadable = "The comment maps file on the server can’t be read, so no map is shown.";
    const folder = await mkdtemp(join(tmpdir(), "askrigor-owner-maps-"));
    temporary.push(folder);
    await mkdir(join(folder, "a-folder"));
    for (const [file, line] of [
      [undefined, none],
      [join(folder, "missing.json"), none],
      [await mapsFile("{ not json"), unreadable],
      [await mapsFile({ schema: "askrigor.comment-maps.v1", maps: [] }), unreadable],
      [await mapsFile({ ...FILE, maps: [{ ...MAPS[0], comment_text: "a commenter's words" }] }), unreadable],
      ["comment-maps.json", unreadable],
      [join(folder, "a-folder"), unreadable],
    ] as const) {
      const g = await fixture({ owner: file === undefined ? {} : { commentMapsFile: file } });
      const page = await g.get(PRIVATE_PAGES_PATH, await g.signIn(OWNER));
      expect(page.response.status, String(file)).toBe(200);
      expect(page.body, String(file)).toContain(line);
      expect(page.body, String(file)).toContain(OWNER_GITHUB_PAGES[0].href);
      expect(page.body, String(file)).not.toMatch(YOUTUBE);
    }
  });

  it("refuses YouTube text other than a map's own video link, a script or a card's reference: the page shows no map", async () => {
    for (const label of ["See youtube.com/@someone for more", "Like ARF-1234 said", "Watch on youtu.be/Qz7Kp2Wm9Xa"]) {
      const f = await fixture({ owner: { commentMapsFile: await mapsFile({ ...FILE, maps: [{ ...MAPS[0], label }] }) } });
      const page = await f.get(PRIVATE_PAGES_PATH, await f.signIn(OWNER));
      expect(page.response.status, label).toBe(200);
      expect(page.body, label).toContain("The comment maps file on the server can’t be read, so no map is shown.");
      expect(page.body, label).not.toMatch(YOUTUBE);
      expect(page.body, label).not.toContain("ARF-1234");
    }
  });

  // The review of #418 (finding 1): a FIFO at the path is opened without waiting and refused before any read, so it
  // can't hold a thread of the pool.
  it("refuses a FIFO at the path at once, without waiting for a writer", async (context) => {
    const folder = await mkdtemp(join(tmpdir(), "askrigor-owner-maps-"));
    temporary.push(folder);
    const fifo = join(folder, "comment-maps.json");
    // Skipped where mkfifo isn't there (Windows).
    try {
      execFileSync("mkfifo", [fifo], { stdio: "ignore" });
    } catch {
      context.skip();
      return;
    }
    const started = Date.now();
    expect(await readPrivateCommentMaps(fifo)).toEqual({ state: "unreadable" });
    expect(Date.now() - started).toBeLessThan(2_000);
    const f = await fixture({ owner: { commentMapsFile: fifo } });
    const page = await f.get(PRIVATE_PAGES_PATH, await f.signIn(OWNER));
    expect(page.response.status).toBe(200);
    expect(page.body).toContain("The comment maps file on the server can’t be read, so no map is shown.");
  }, 10_000);

  it("reads none, a missing file, a folder and a relative path without throwing", async () => {
    expect(await readPrivateCommentMaps(undefined)).toEqual({ state: "none" });
    expect(await readPrivateCommentMaps(join(tmpdir(), "askrigor-no-such-maps-file.json"))).toEqual({ state: "none" });
    expect(await readPrivateCommentMaps(tmpdir())).toEqual({ state: "unreadable" });
    expect(await readPrivateCommentMaps("comment-maps.json")).toEqual({ state: "unreadable" });
    expect(await readPrivateCommentMaps(await mapsFile())).toMatchObject({ state: "installed", file: { maps: { length: 3 } } });
  });
});

// The review of #418 (finding 3): the owner's page reads no Atlas data, so it answers while the page reader is unset,
// with its own sign-in and owner checks; every other page answers 503 then.
describe("without the page reader", () => {
  it("still answers the owner's page, and its checks, while every other page is unavailable", async () => {
    const f = await fixture({ owner: { commentMapsFile: await mapsFile() }, noSource: true });
    expect((await f.get("/atlas")).response.status).toBe(503);
    // Signing in needs the reader too, so these sessions are ones made before it went away.
    const session = (subject: string) => `${ATLAS_SESSION_COOKIE}=${sealSession(f.settings,
      newSession(participantKeyFor(f.settings, subject), new Date()))}`;
    expect((await f.get(PRIVATE_PAGES_PATH)).body).toContain("Sign in with your AskRigor account to see this page.");
    expect((await f.get(PRIVATE_PAGES_PATH, session(SUBJECT))).response.status).toBe(404);
    const owner = await f.get(PRIVATE_PAGES_PATH, session(OWNER));
    expect(owner.response.status).toBe(200);
    expect(owner.body).toContain("An invented knee routine");
  });
});

describe("the last check", () => {
  const owner = { signInHref: "/atlas/auth/login", viewer: { displayName: null, owner: true } };
  const rendered = renderAtlasOwnerPages({ maps: { state: "installed", file: commentMapsFileSchema.parse(FILE) },
    readOn: "2026-11-05" }, owner);

  it("still refuses the owner page as every public page is checked: its video links are the one exception", () => {
    expect(atlasPageProblems(rendered)).toEqual(["youtube_link"]);
    expect(ownerPageProblems(rendered)).toEqual([]);
    expect(ownerPageProblems(`${rendered}<p>youtube.com</p>`)).toEqual(["youtube_link"]);
    expect(ownerPageProblems(`${rendered}<a href="https://www.youtube.com/watch?v=Qz7Kp2Wm9Xa&list=x">`)).toEqual(["youtube_link"]);
    expect(ownerPageProblems(`${rendered}<script>`)).toEqual(["script"]);
    expect(ownerPageProblems(`${rendered}ARF-1234`)).toEqual(["card_reference"]);
  });

  it("keeps refusing YouTube text on every public route, for the owner too", async () => {
    const f = await fixture({ owner: { commentMapsFile: await mapsFile() } });
    const readers = [undefined, await f.signIn(SUBJECT), await f.signIn(OWNER)];
    for (const cookie of readers) {
      for (const path of ["/atlas", "/atlas/comment-maps", "/atlas/findings/P-1001", "/atlas/account"]) {
        const page = await f.get(path, cookie);
        expect(page.response.status, path).toBe(200);
        expect(page.body, path).not.toMatch(YOUTUBE);
        expect(atlasPageProblems(page.body), path).toEqual([]);
      }
    }
    // An address that puts YouTube's host on a page (in its sign-in link) is refused, as before.
    expect((await f.get("/atlas/topics/youtube.com")).response.status).toBe(503);
    // A page whose data, against every store's rule, holds a YouTube address is refused to everyone, the owner too,
    // while the owner's own page, which reads none of it, is served.
    const leaking = await fixture({ owner: { commentMapsFile: await mapsFile() }, wrapSource: leakingYouTube });
    const sessions = [undefined, await leaking.signIn(SUBJECT), await leaking.signIn(OWNER)];
    for (const cookie of sessions) {
      for (const path of ["/atlas/findings/P-1001", "/atlas"]) {
        const page = await leaking.get(path, cookie);
        expect(page.response.status, `${path} ${cookie === undefined ? "signed out" : "signed in"}`).toBe(503);
        expect(page.body).not.toMatch(YOUTUBE);
      }
    }
    expect((await leaking.get(PRIVATE_PAGES_PATH, sessions[2])).response.status).toBe(200);
  });
});

describe("the owner from the environment", () => {
  const settings = { publicOrigin: "https://askrigor.example", sessionKey: bytes(7), participantSecret: bytes(9),
    identitySecret: bytes(11) };

  it("is the connector's owner subject, and another login of the owner's when one is named", () => {
    expect(atlasOwnerFromEnv({}, settings)).toBeUndefined();
    expect(atlasOwnerFromEnv({ ASKRIGOR_OAUTH_ALLOWED_SUBJECT: OWNER }, settings))
      .toEqual({ participantKeys: new Set([participantKeyFor(settings, OWNER)]) });
    expect(atlasOwnerFromEnv({ ASKRIGOR_OAUTH_ALLOWED_SUBJECT: OWNER, ASKRIGOR_ATLAS_OWNER_SUBJECT: OTHER_SUBJECT,
      ASKRIGOR_PRIVATE_COMMENT_MAPS_FILE: " /var/lib/askrigor-private-comment-maps/comment-maps.json " }, settings))
      .toEqual({ participantKeys: new Set([participantKeyFor(settings, OWNER), participantKeyFor(settings, OTHER_SUBJECT)]),
        commentMapsFile: "/var/lib/askrigor-private-comment-maps/comment-maps.json" });
    expect(atlasOwnerFromEnv({ ASKRIGOR_ATLAS_OWNER_SUBJECT: OTHER_SUBJECT }, settings))
      .toEqual({ participantKeys: new Set([participantKeyFor(settings, OTHER_SUBJECT)]) });
    // A value that isn't a subject names no one.
    for (const subject of ["", " auth0|owner", "auth0|owner name", "x".repeat(513)]) {
      expect(atlasOwnerFromEnv({ ASKRIGOR_OAUTH_ALLOWED_SUBJECT: subject }, settings), JSON.stringify(subject)).toBeUndefined();
    }
  });
});
