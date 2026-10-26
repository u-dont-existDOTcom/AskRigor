import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryAtlasPageSource,
  InMemoryAtlasParticipation,
  atlasCommenterTag,
  atlasSessionKeyHash,
} from "@askrigor/evidence-repository";

import { AtlasChangeSignal } from "../apps/research-mcp/src/atlas/change-signal.js";
import {
  ATLAS_LOGIN_COOKIE,
  ATLAS_SESSION_COOKIE,
  CONTACT_REFUSAL,
  commentProblem,
  csrfToken,
  displayNameProblem,
  openSession,
  participantKeyFor,
} from "../apps/research-mcp/src/atlas/participation.js";
import { atlasPageProblems, escapeHtml } from "../apps/research-mcp/src/atlas/pages.js";
import {
  ATLAS_CLIENT_IP_HEADER,
  ATLAS_PROXY_SECRET_HEADER,
  AtlasPageCache,
  atlasReaderAddress,
  commentCursor,
  createAtlasPagesHandler,
} from "../apps/research-mcp/src/atlas/pages-http.js";
import { addressLimitKey, createTokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import {
  SUBJECT,
  closeAtlasServers,
  cookiePart,
  fixture,
  publications,
  rawRequest,
  serve,
  tokenFor,
} from "./helpers/atlas-participation-fixture.js";

// The independent security review of decision 171's parts D and E (25 October 2026): each confirmed exploit, as a test
// that failed before its fix. Everything is synthetic and in memory.

afterEach(closeAtlasServers);

const AT = "2026-11-05T09:00:00.000Z";
const keyOf = (index: number) => index.toString(16).padStart(64, "0");
const reverse = (text: string) => [...text].reverse().join("");

describe("what the page's last check refuses never reaches a page (review issue 1)", () => {
  it("refuses a comment, a display name or a draft the last check would refuse, with a 422 that echoes none of it", async () => {
    const f = await fixture();
    const session = await f.signIn();
    const page = (await f.get("/atlas/findings/P-1001", session)).body;
    const csrf = tokenFor(page, "/atlas/findings/P-1001/comments");
    for (const body of ["The talk is on YOUTU.BE if anyone wants it.", "the youtu.bed study", "Youtube.Community thread"]) {
      const refused = await f.post("/atlas/findings/P-1001/comments", { csrf, displayName: "Alice", body }, { cookie: session });
      expect(refused.status, body).toBe(422);
      const html = await refused.text();
      expect(html, body).toContain(escapeHtml(CONTACT_REFUSAL));
      expect(atlasPageProblems(html), body).toEqual([]);
    }
    const card = await f.post("/atlas/findings/P-1001/comments", { csrf, displayName: "Carol", body: "Like ARF-1234 said" },
      { cookie: session });
    expect(card.status).toBe(422);
    expect(await card.text()).not.toContain("ARF-1234");
    const name = await f.post("/atlas/findings/P-1001/comments", { csrf, displayName: "youtube.community",
      body: "Plain comment." }, { cookie: session });
    expect(name.status).toBe(422);
    expect(atlasPageProblems(await name.text())).toEqual([]);
    expect(f.store.snapshot().comments).toEqual([]);
    for (const path of ["/atlas/findings/P-1001", "/atlas/findings/P-1002"]) {
      expect((await f.get(path)).response.status, path).toBe(200);
      expect((await f.get(path, session)).response.status, path).toBe(200);
    }
  });

  it("leaves out a stored comment or name the last check would refuse, so the page and its owner's forms still work", async () => {
    const f = await fixture();
    const session = await f.signIn();
    const key = participantKeyFor(f.settings, SUBJECT);
    // Rows the store holds whatever their text: the page check is the web layer's.
    await f.store.postComment(key, "P-1001", "Plain comment.", AT, "youtube.community");
    await f.store.postComment(keyOf(2), "P-1001", "See YOUTU.BE for the talk.", AT, "Bob");
    await f.store.postComment(keyOf(3), "P-1001", "A fine comment.", AT, "Carol");
    const anonymous = await f.get("/atlas/findings/P-1001");
    expect(anonymous.response.status).toBe(200);
    expect(anonymous.body).toContain("A fine comment.");
    expect(anonymous.body).not.toMatch(/youtu\.?be|ARF-\d/iu);
    // The person whose name trips the check sees their page, and can rename, sign out and delete everything.
    const page = await f.get("/atlas/findings/P-1001", session);
    expect(page.response.status).toBe(200);
    expect(atlasPageProblems(page.body)).toEqual([]);
    const account = await f.get("/atlas/account", session);
    expect(account.response.status).toBe(200);
    expect(atlasPageProblems(account.body)).toEqual([]);
    expect(account.body).not.toContain("youtube.community");
    expect(account.body).toContain('action="/atlas/auth/logout"');
    expect(account.body).toContain('action="/atlas/account/delete"');
    const renamed = await f.post("/atlas/account/name", { csrf: tokenFor(account.body, "/atlas/account/name"),
      displayName: "Jane", return: "/atlas/findings/P-1001" }, { cookie: session });
    expect(renamed.status).toBe(303);
  });

  it("leaves out a home page pick whose reason the last check would refuse", async () => {
    const f = await fixture();
    await f.store.setHomePicks([{ publicationNumber: "P-1001", reason: "The talk is on YOUTU.BE." },
      { publicationNumber: "P-1003", reason: "A lower dose may not help." }], AT);
    const base = await serve(createAtlasPagesHandler({ enabled: true, signal: new AtlasChangeSignal(),
      source: new InMemoryAtlasPageSource({ publications: f.publications, participation: f.store }) }));
    const home = await fetch(`${base}/atlas`);
    expect(home.status).toBe(200);
    const body = await home.text();
    expect(body).toContain("Why it is here: A lower dose may not help.");
    expect(atlasPageProblems(body)).toEqual([]);
  });
});

describe("the contact-details and links check (review issue 3)", () => {
  it("refuses text-direction controls, which can show reversed text as an address, in comments and names", () => {
    for (const text of [
      `Mail me: ‮${reverse("jane@example.com")}‬`,
      `‮${reverse("https://scam-pharmacy.example.com")}`,
      `‮${reverse("@jane_doe")}`,
      `A plain sentence with an isolate ⁦inside⁩.`,
      `Marks ‎ and ‏ and ؜.`,
    ]) {
      expect(commentProblem(text), JSON.stringify(text)).toBeDefined();
      expect(displayNameProblem(text.slice(0, 40)), JSON.stringify(text)).toBeDefined();
    }
    // Joiners stay: emoji sequences and Persian words need them.
    for (const text of ["\u{1F469}‍⚕️", "می‌خواهم"]) {
      expect(commentProblem(text), JSON.stringify(text)).toBeUndefined();
      expect(displayNameProblem(text), JSON.stringify(text)).toBeUndefined();
    }
  });

  it("reads a domain under any top-level domain of the root zone, in any case", () => {
    for (const text of ["Order at PHARMA-DEALS.TO", "order at pharma-deals.icu", "See Example.DE", "CHEAP-PILLS.RU",
      "cheap-pills.icu", "best-clinic.Pharmacy", "Visit example.xn--p1ai"]) {
      expect(commentProblem(text), text).toMatch(/^Comments can't include contact details or links\./u);
    }
    // Ordinary abbreviations stay out.
    for (const text of ["e.g. this", "i.e. that", "M.Sc and B.Sc", "Fig.3 shows it", "approx. 12.5 mg"]) {
      expect(commentProblem(text), text).toBeUndefined();
    }
  });
});

describe("the reader's address behind the apex proxy (review issue 2, follow-up item 7)", () => {
  const onePage = () => createTokenBucketLimiter({ capacity: 1, refillTokensPerMinute: 0, maxKeys: 100, idleTtlMs: 60_000 });
  const SECRET = Buffer.from(new Uint8Array(32).fill(5)).toString("base64url");

  it("believes X-AskRigor-Client-IP only on requests for the public origin's host, and counts IPv6 by its /64", async () => {
    const f = await fixture({ rateLimiter: onePage(), proxySecret: SECRET });
    const publicHost = new URL(f.base).host;
    const page = async (host: string, address: string) => (await rawRequest(f.base, "/atlas/findings/P-1001",
      { headers: { host, [ATLAS_CLIENT_IP_HEADER]: address, [ATLAS_PROXY_SECRET_HEADER]: SECRET } })).status;
    expect(await page(publicHost, "203.0.113.1")).toBe(200);
    expect(await page(publicHost, "203.0.113.1")).toBe(429);
    expect(await page(publicHost, "203.0.113.2")).toBe(200);
    expect(await page(publicHost, "2001:db8:0:1::1")).toBe(200);
    expect(await page(publicHost, "2001:db8:0:1:ffff:ffff:ffff:2")).toBe(429);
    expect(await page(publicHost, "2001:db8:0:2::1")).toBe(200);
    // A request that reached the server under another name (mcp.askrigor.com directly) cannot choose its address: the
    // connection's counts, whatever the header says.
    expect(await page("mcp.askrigor.example", "198.51.100.1")).toBe(200);
    expect(await page("mcp.askrigor.example", "198.51.100.2")).toBe(429);
  });

  it("believes it only with the proxy's secret, and never when no secret is configured", async () => {
    const f = await fixture({ rateLimiter: onePage(), proxySecret: SECRET });
    const publicHost = new URL(f.base).host;
    const page = async (address: string, secret?: string) => (await rawRequest(f.base, "/atlas/findings/P-1001",
      { headers: { host: publicHost, [ATLAS_CLIENT_IP_HEADER]: address,
        ...(secret === undefined ? {} : { [ATLAS_PROXY_SECRET_HEADER]: secret }) } })).status;
    // Without the secret, or with another, each request counts as the connection's address: one page in all.
    expect(await page("203.0.113.11")).toBe(200);
    expect(await page("203.0.113.12", "x".repeat(43))).toBe(429);
    expect(await page("203.0.113.13", `${SECRET}x`)).toBe(429);
    expect(await page("203.0.113.14", SECRET)).toBe(200);
    const unset = await fixture({ rateLimiter: onePage() });
    const unsetHost = new URL(unset.base).host;
    const unsetPage = async (address: string) => (await rawRequest(unset.base, "/atlas/findings/P-1001",
      { headers: { host: unsetHost, [ATLAS_CLIENT_IP_HEADER]: address, [ATLAS_PROXY_SECRET_HEADER]: SECRET } })).status;
    expect(await unsetPage("203.0.113.21")).toBe(200);
    expect(await unsetPage("203.0.113.22")).toBe(429);
  });

  it("keys a report from a reader who is not signed in by the forwarded address", async () => {
    const f = await fixture({ proxySecret: SECRET });
    await f.store.postComment("e".repeat(64), "P-1001", "A comment.", AT, "Erin");
    const publicHost = new URL(f.base).host;
    const html = (await f.get("/atlas/findings/P-1001")).body;
    const report = async (address: string) => (await rawRequest(f.base, "/atlas/comments/C-1001/report", {
      method: "POST",
      headers: { host: publicHost, origin: f.base, "content-type": "application/x-www-form-urlencoded",
        [ATLAS_CLIENT_IP_HEADER]: address, [ATLAS_PROXY_SECRET_HEADER]: SECRET },
      body: new URLSearchParams({ csrf: tokenFor(html, "/atlas/comments/C-1001/report"), return: "/atlas/findings/P-1001" })
        .toString(),
    })).status;
    expect(await report("203.0.113.7")).toBe(303);
    expect(await report("203.0.113.8")).toBe(303);
    expect(await report("203.0.113.7")).toBe(303);
    expect((await f.store.inspectComments({ reportedOnly: true, limit: 5 }))[0]!.reportCount).toBe(2);
    expect(JSON.stringify(f.store.snapshot())).not.toMatch(/203\.0\.113/u);
  });

  it("reads the forwarded address exactly, falling back to the connection's", () => {
    const request = (headers: Record<string, string>) => ({ headers: { [ATLAS_PROXY_SECRET_HEADER]: SECRET, ...headers } }) as never;
    expect(atlasReaderAddress(request({ host: "askrigor.com", [ATLAS_CLIENT_IP_HEADER]: " 203.0.113.9 " }), "askrigor.com",
      "10.0.0.2", SECRET)).toBe("203.0.113.9");
    expect(atlasReaderAddress(request({ host: "ASKRIGOR.COM", [ATLAS_CLIENT_IP_HEADER]: "::ffff:203.0.113.9" }),
      "askrigor.com", "10.0.0.2", SECRET)).toBe("203.0.113.9");
    for (const [host, value] of [["mcp.askrigor.com", "203.0.113.9"], ["askrigor.com", "203.0.113.9, 10.0.0.1"],
      ["askrigor.com", "not an address"], ["askrigor.com", "fe80::1%eth0"]] as const) {
      expect(atlasReaderAddress(request({ host, [ATLAS_CLIENT_IP_HEADER]: value }), "askrigor.com", "10.0.0.2", SECRET),
        `${host} ${value}`).toBe("10.0.0.2");
    }
    expect(atlasReaderAddress(request({ host: "askrigor.com", [ATLAS_CLIENT_IP_HEADER]: "203.0.113.9" }), null, "10.0.0.2",
      SECRET)).toBe("10.0.0.2");
    // Without the secret configured, or without it on the request, the connection's address.
    expect(atlasReaderAddress(request({ host: "askrigor.com", [ATLAS_CLIENT_IP_HEADER]: "203.0.113.9" }), "askrigor.com",
      "10.0.0.2")).toBe("10.0.0.2");
    expect(atlasReaderAddress({ headers: { host: "askrigor.com", [ATLAS_CLIENT_IP_HEADER]: "203.0.113.9" } } as never,
      "askrigor.com", "10.0.0.2", SECRET)).toBe("10.0.0.2");
  });

  it("counts an IPv6 address by its /64 and an IPv4 address as it is", () => {
    expect(addressLimitKey("203.0.113.9")).toBe("203.0.113.9");
    expect(addressLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(addressLimitKey("2001:db8:0:1:2:3:4:5")).toBe("2001:db8:0:1::/64");
    expect(addressLimitKey("2001:DB8:0:1::ffff")).toBe("2001:db8:0:1::/64");
    expect(addressLimitKey("::1")).toBe("0:0:0:0::/64");
    expect(addressLimitKey("64:ff9b::192.0.2.1")).toBe("64:ff9b:0:0::/64");
    expect(addressLimitKey("unknown")).toBe("unknown");
  });
});

describe("signing in (review issue 5)", () => {
  it("refuses a replayed callback without asking the tenant again", async () => {
    const f = await fixture();
    const login = await f.get("/atlas/auth/login?return=/atlas/findings/P-1001");
    const location = new URL(login.response.headers.get("location")!);
    const loginCookie = cookiePart(login.response, ATLAS_LOGIN_COOKIE)!;
    f.tenant.next = { ...f.tenant.next, nonce: location.searchParams.get("nonce")! };
    const callback = `/atlas/auth/callback?code=synthetic-code&state=${location.searchParams.get("state")}`;
    expect((await f.get(callback, loginCookie)).response.status).toBe(303);
    expect(f.tenant.requests).toHaveLength(1);
    for (const code of ["again", "and-again"]) {
      const replay = await f.get(callback.replace("synthetic-code", code), loginCookie);
      expect(replay.response.status, code).toBe(400);
    }
    expect(f.tenant.requests).toHaveLength(1);
  });

  it("ends every session at sign-out everywhere, and after deleting everything", async () => {
    const f = await fixture();
    const first = await f.signIn();
    const second = await f.signIn();
    const page = (await f.get("/atlas/account", first)).body;
    const out = await f.post("/atlas/auth/logout-everywhere", { csrf: tokenFor(page, "/atlas/auth/logout-everywhere"),
      return: "/atlas/findings/P-1001" }, { cookie: first });
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe("/atlas/findings/P-1001?done=signed-out-everywhere");
    expect(out.headers.getSetCookie()).toEqual([`${ATLAS_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`]);
    // The other browser's session is over too: its page shows the sign-in link and clears its cookie, and its forms are
    // refused with a page that links to signing in.
    const elsewhere = await f.get("/atlas/findings/P-1001", second);
    expect(elsewhere.body).not.toContain('action="/atlas/findings/P-1001/vote"');
    expect(elsewhere.response.headers.getSetCookie()[0]).toContain(`${ATLAS_SESSION_COOKIE}=; Path=/; Max-Age=0`);
    const vote = await f.post("/atlas/findings/P-1001/vote", { csrf: csrfToken(f.settings,
      openSession(f.settings, second.slice(second.indexOf("=") + 1), new Date())!, "vote:P-1001"), vote: "agree" },
    { cookie: second });
    expect(vote.status).toBe(403);
    expect(await vote.text()).toContain("Sign in with your AskRigor account");
    expect(f.store.snapshot().votes).toBe(0);
    // Ended by a hash of the key, never the key itself; a later sign-in is current.
    const key = participantKeyFor(f.settings, SUBJECT);
    expect(f.store.snapshot().sessionEnds).toEqual([atlasSessionKeyHash(key)]);
    expect(JSON.stringify(f.store.snapshot().sessionEnds)).not.toContain(key);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const third = await f.signIn();
    const fresh = (await f.get("/atlas/findings/P-1001", third)).body;
    expect(fresh).toContain('action="/atlas/findings/P-1001/vote"');
    // Deleting everything ends this session as well.
    const account = (await f.get("/atlas/account", third)).body;
    const forgotten = await f.post("/atlas/account/delete", { csrf: tokenFor(account, "/atlas/account/delete"), confirm: "yes",
      return: "/atlas/findings/P-1001" }, { cookie: third });
    expect(forgotten.headers.getSetCookie()[0]).toContain(`${ATLAS_SESSION_COOKIE}=; Path=/; Max-Age=0`);
    const after = await f.post("/atlas/findings/P-1001/vote", { csrf: tokenFor(fresh, "/atlas/findings/P-1001/vote"),
      vote: "agree" }, { cookie: third });
    expect(after.status).toBe(403);
  });

  it("keeps an end of sessions for the 30 days a session lasts, then deletes it", async () => {
    const store = new InMemoryAtlasParticipation(await publications());
    const key = "a".repeat(64);
    const signedIn = "2026-11-05T09:00:00.000Z";
    expect(await store.sessionCurrent(key, signedIn, "2026-11-05T10:00:00.000Z")).toBe(true);
    await store.endSessions(key, "2026-11-05T10:00:00.000Z");
    expect(await store.sessionCurrent(key, signedIn, "2026-11-05T10:00:01.000Z")).toBe(false);
    expect(await store.sessionCurrent(key, "2026-11-05T10:00:02.000Z", "2026-11-05T10:00:03.000Z")).toBe(true);
    expect(store.snapshot().sessionEnds).toHaveLength(1);
    expect(await store.sessionCurrent(key, signedIn, "2026-12-05T10:00:01.000Z")).toBe(true);
    expect(store.snapshot().sessionEnds).toEqual([]);
  });
});

describe("the session cookie (review issue 6)", () => {
  it("is a __Host- cookie on /, and a request carrying two of them is signed out", async () => {
    const f = await fixture();
    const session = await f.signIn();
    expect(session.startsWith(`${ATLAS_SESSION_COOKIE}=`)).toBe(true);
    const page = (await f.get("/atlas/findings/P-1001", session)).body;
    const csrf = tokenFor(page, "/atlas/findings/P-1001/vote");
    // A sibling subdomain could plant a second cookie of the same name with a longer path: then no session is read.
    const planted = `${ATLAS_SESSION_COOKIE}=v1.planted; ${session}`;
    expect((await f.get("/atlas/findings/P-1001", planted)).body).not.toContain('action="/atlas/findings/P-1001/vote"');
    const refused = await f.post("/atlas/findings/P-1001/vote", { csrf, vote: "agree" }, { cookie: planted });
    expect(refused.status).toBe(403);
    expect(f.store.snapshot().votes).toBe(0);
    expect((await f.post("/atlas/findings/P-1001/vote", { csrf, vote: "agree" }, { cookie: session })).status).toBe(303);
  });
});

describe("display names (review issue 7)", () => {
  it("refuses AskRigor's own name as a word, in any case or width, with marks or a zero, and spares other words", () => {
    for (const name of ["AskRigor", "askrigor", "ASKRIGOR team", "Ask Rigor", "Ask-Rigour", "the AskRigor bot",
      "\uFF21\uFF53\uFF4B\uFF32\uFF49\uFF47\uFF4F\uFF52", "AskRig0r", "AskRig\u00F6r", "AskRigo\u0308r", "AskRigour",
      "AskRig\u00F8r"]) {
      expect(displayNameProblem(name), name).toBe("Display names can't use AskRigor's name.");
    }
    for (const name of ["Task Rigor", "Mask Rigour", "Rigorous Ann", "Askrigorous", "Ask me", "Rigor"]) {
      expect(displayNameProblem(name), name).toBeUndefined();
    }
  });

  it("shows a mark after each name that links one person's comments under one name only (review follow-up, item 1)",
    async () => {
      const f = await fixture();
      // The store is written to directly here, so the pages' cache is told of each change.
      const marksOf = async (name: string) => { f.signal.announce(); return marksIn(name); };
      const marksIn = async (name: string) => [...(await f.get("/atlas/findings/P-1001")).body.matchAll(
        new RegExp(`<strong><bdi>${name}</bdi></strong> <span class="marker"[^>]*>#([a-f0-9]{6})</span>`, "gu"))]
        .map((match) => match[1]!);
      await f.store.postComment(keyOf(21), "P-1001", "First Jane.", AT, "Jane");
      await f.store.postComment(keyOf(22), "P-1001", "Second Jane.", AT, "Jane");
      await f.store.postComment(keyOf(21), "P-1001", "First Jane again.", AT, "Jane");
      const janes = await marksOf("Jane");
      expect(janes).toHaveLength(3);
      // Newest first: the first Jane twice (same mark), the second Jane once (another mark).
      expect(janes[0]).toBe(janes[2]);
      expect(janes[1]).not.toBe(janes[0]);
      // A new name makes a new mark: the comments under each name do not link to each other.
      await f.store.setDisplayName(keyOf(21), "J. Doe", AT);
      await f.store.postComment(keyOf(21), "P-1001", "Under the new name.", AT);
      const renamed = await marksOf("J. Doe");
      expect(renamed).toHaveLength(1);
      expect(janes).not.toContain(renamed[0]);
      // Deleting everything draws a new salt: coming back under the old name gives a new mark.
      await f.store.forgetParticipant(keyOf(21), AT);
      await f.store.postComment(keyOf(21), "P-1001", "Back again.", AT, "Jane");
      const back = await marksOf("Jane");
      expect(back).toHaveLength(2);
      expect(back[0]).not.toBe(janes[0]);
      const body = (await f.get("/atlas/findings/P-1001")).body;
      expect(body).not.toContain(keyOf(21));
      expect(body).not.toContain(atlasCommenterTag(keyOf(21)));
    });
});

describe("page size (review issues 8 and 9)", () => {
  it("shows the newest comments first and caps what one page renders, linking to older ones", async () => {
    const f = await fixture();
    for (let index = 0; index < 200; index += 1) {
      await f.store.postComment(keyOf(index + 10), "P-1001", "\"".repeat(2_000), AT, `N${index}`);
    }
    await f.store.postComment(keyOf(9), "P-1001", "The newest comment.", AT, "Newest");
    const page = await f.get("/atlas/findings/P-1001");
    expect(page.response.status).toBe(200);
    expect(Buffer.byteLength(page.body)).toBeLessThan(200_000);
    expect(page.body.indexOf("The newest comment.")).toBeGreaterThan(-1);
    expect(page.body.indexOf("The newest comment.")).toBeLessThan(page.body.indexOf("&quot;&quot;"));
    const older = /href="(\/atlas\/findings\/P-1001\?before=C-\d+)"/u.exec(page.body);
    expect(older).not.toBeNull();
    const next = await f.get(older![1]!);
    expect(next.response.status).toBe(200);
    expect(next.body).not.toContain("The newest comment.");
  });

  it("does not cache a page that answered 404, so missing paths cannot crowd real pages out", async () => {
    const cache = new AtlasPageCache({ ttlMs: 60_000, maxEntries: 2, maxBytes: 1_000_000 });
    let renders = 0;
    const missing = async () => { renders += 1; return { status: 404 as const, html: "<p>Not found</p>" }; };
    await cache.get("/atlas/findings/P-9999", missing);
    await cache.get("/atlas/findings/P-9999", missing);
    expect(renders).toBe(2);
    expect(cache.size).toBe(0);
    let found = 0;
    const page = async () => { found += 1; return { status: 200 as const, html: "<p>A page</p>" }; };
    await cache.get("/atlas", page);
    await cache.get("/atlas", page);
    expect(found).toBe(1);
  });
});

describe("a reader's own comments (review issue 8)", () => {
  it("lists every comment of theirs, hidden, beyond a page or on a finding that left the pages, each deletable", async () => {
    const f = await fixture();
    const session = await f.signIn();
    const key = participantKeyFor(f.settings, SUBJECT);
    const first = await f.store.postComment(key, "P-1001", "Kept on the pages.", AT, "Jane");
    const hidden = await f.store.postComment(key, "P-1002", "Hidden by the owner.", AT, "Jane");
    await f.store.moderateComment(hidden, "hide", AT);
    const gone = await f.store.postComment(key, "P-1003", "On a finding that left.", AT, "Jane");
    await f.publications.withdraw({ reason: "owner_unpublished", publicationNumbers: ["P-1003"], ownerReason: "No.",
      withdrawnAt: AT });
    for (let index = 0; index < 60; index += 1) await f.store.postComment(key, "P-1001", `Later comment ${index}.`, AT, "Jane");
    await f.store.postComment(keyOf(31), "P-1001", "Someone else's.", AT, "Ann");

    const page = await f.get("/atlas/account/comments", session);
    expect(page.response.status).toBe(200);
    expect(page.response.headers.get("cache-control")).toBe("private, no-store");
    expect(page.body).toContain("Later comment 59.");
    expect(page.body).not.toContain("Someone else&#39;s.");
    const older = /href="(\/atlas\/account\/comments\?before=C-\d+)"/u.exec(page.body);
    expect(older).not.toBeNull();
    const rest = (await f.get(older![1]!, session)).body;
    expect(rest).toContain("Hidden by the owner.");
    expect(rest).toContain("hidden by AskRigor");
    expect(rest).toContain("on P-1003, no longer on the pages");
    expect(rest).toContain(`<a href="/atlas/findings/P-1001">P-1001</a>`);
    for (const id of [first, hidden, gone]) {
      const deleted = await f.post(`/atlas/comments/${id}/delete`, { csrf: tokenFor(rest, `/atlas/comments/${id}/delete`),
        return: "/atlas/account/comments" }, { cookie: session });
      expect(deleted.status, id).toBe(303);
      expect(deleted.headers.get("location")).toBe("/atlas/account/comments?done=deleted#comments");
    }
    const left = f.store.snapshot().comments.map(({ body }) => body);
    expect(left).not.toContain("Kept on the pages.");
    expect(left).not.toContain("Hidden by the owner.");
    expect(left).not.toContain("On a finding that left.");
    expect(left).toContain("Someone else's.");
    // Not signed in: a page that links to signing in, and nothing of anyone's comments.
    const anonymous = await f.get("/atlas/account/comments");
    expect(anonymous.response.status).toBe(200);
    expect(anonymous.body).toContain(`${f.base}/atlas/auth/login?return=%2Fatlas%2Faccount%2Fcomments`);
    expect(anonymous.body).not.toContain("Later comment");
    // The finding page links to the account controls for a signed-in reader.
    expect((await f.get("/atlas/findings/P-1001", session)).body)
      .toContain('<a href="/atlas/account">Your account</a>');
  });
});

describe("when the session check cannot reach the database (review follow-up, item 3)", () => {
  it("shows a page as to a reader who is not signed in, keeps the cookie, and refuses a form with nothing changed", async () => {
    let failing = false;
    const f = await fixture({ wrapStore: (store) => ({
      ...store,
      inspectParticipant: (key) => store.inspectParticipant(key),
      setDisplayName: (key, name, at) => store.setDisplayName(key, name, at),
      setVote: (key, publication, vote, at) => store.setVote(key, publication, vote, at),
      postComment: (key, publication, body, at, name) => store.postComment(key, publication, body, at, name),
      deleteComment: (key, id) => store.deleteComment(key, id),
      reportComment: (reporter, id, at) => store.reportComment(reporter, id, at),
      forgetParticipant: (key, at) => store.forgetParticipant(key, at),
      endSessions: (key, at) => store.endSessions(key, at),
      sessionCurrent: async (key, signedInAt, at) => {
        if (failing) throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
        return await store.sessionCurrent(key, signedInAt, at);
      },
    }) });
    const session = await f.signIn();
    const signedIn = (await f.get("/atlas/findings/P-1001", session)).body;
    const csrf = tokenFor(signedIn, "/atlas/findings/P-1001/vote");
    failing = true;
    for (const path of ["/atlas", "/atlas/changes", "/atlas/topics/velmor-syndrome", "/atlas/findings/P-1001", "/atlas/account"]) {
      const page = await f.get(path, session);
      expect(page.response.status, path).toBe(200);
      expect(page.body).toContain("/atlas/auth/login?return=");
      expect(page.body).not.toContain('action="/atlas/findings/P-1001/vote"');
      expect(page.response.headers.getSetCookie()).toEqual([]);
    }
    const vote = await f.post("/atlas/findings/P-1001/vote", { csrf, vote: "agree" }, { cookie: session });
    expect(vote.status).toBe(503);
    expect(f.store.snapshot().votes).toBe(0);
    failing = false;
    expect((await f.get("/atlas/findings/P-1001", session)).body).toContain('action="/atlas/findings/P-1001/vote"');
  });
});

describe("an older-comments cursor (review follow-up, item 5)", () => {
  it("ignores a cursor that does not parse or is out of range, showing the newest comments", async () => {
    const f = await fixture();
    const session = await f.signIn();
    await f.store.postComment(keyOf(41), "P-1001", "The newest comment.", AT, "Ann");
    for (const before of ["C-9999999999999999", "C-99999999999999999999", "C-0001", "1001", "C-1001x", "P-1001"]) {
      for (const cookie of [undefined, session]) {
        const page = await f.get(`/atlas/findings/P-1001?before=${encodeURIComponent(before)}`, cookie);
        expect(page.response.status, `${before} ${cookie === undefined ? "anonymous" : "signed in"}`).toBe(200);
        expect(page.body, before).toContain("The newest comment.");
      }
      expect((await f.get(`/atlas/account/comments?before=${encodeURIComponent(before)}`, session)).response.status, before)
        .toBe(200);
    }
    expect(commentCursor("C-1234")).toBe(1_234);
    expect(commentCursor("C-9007199254740991")).toBe(9_007_199_254_740_991);
    expect(commentCursor("C-9007199254740993")).toBeUndefined();
    expect(commentCursor(null)).toBeUndefined();
  });
});

describe("a reader's own votes (review follow-up, item 6)", () => {
  it("lists every vote of theirs on the account page, on findings that left the pages too, each withdrawable", async () => {
    const f = await fixture();
    const session = await f.signIn();
    const key = participantKeyFor(f.settings, SUBJECT);
    await f.store.setVote(key, "P-1001", "agree", AT);
    await f.store.setVote(key, "P-1003", "disagree", AT);
    await f.store.setVote(keyOf(51), "P-1003", "agree", AT);
    await f.publications.withdraw({ reason: "owner_unpublished", publicationNumbers: ["P-1003"], ownerReason: "No.",
      withdrawnAt: AT });
    const page = (await f.get("/atlas/account/comments", session)).body;
    expect(page).toContain("<h2 id=\"votes\">Your votes</h2>");
    expect(page).toContain("P-1003, no longer on the pages · disagree");
    expect(page).toContain('<a href="/atlas/findings/P-1001">P-1001</a> · agree');
    expect(page.indexOf('id="vote-P-1003"')).toBeLessThan(page.indexOf('id="vote-P-1001"'));
    const withdrawn = await f.post("/atlas/findings/P-1003/vote", { csrf: tokenFor(page, "/atlas/findings/P-1003/vote"),
      vote: "clear", return: "/atlas/account/comments" }, { cookie: session });
    expect(withdrawn.status).toBe(303);
    expect(withdrawn.headers.get("location")).toBe("/atlas/account/comments?done=vote-cleared#votes");
    expect(f.store.ownVotes(key, undefined, 10).map(({ publicationNumber }) => publicationNumber)).toEqual(["P-1001"]);
    // Another reader's vote on the same finding stays.
    expect(f.store.ownVotes(keyOf(51), undefined, 10)).toHaveLength(1);
    const after = (await f.get("/atlas/account/comments?done=vote-cleared", session)).body;
    expect(after).toContain("Your vote is withdrawn.");
    expect(after).not.toContain('id="vote-P-1003"');
    // A vote withdrawn from its finding page still returns to the finding.
    const findingPage = (await f.get("/atlas/findings/P-1001", session)).body;
    const fromFinding = await f.post("/atlas/findings/P-1001/vote", { csrf: tokenFor(findingPage, "/atlas/findings/P-1001/vote"),
      vote: "clear", return: "/atlas/findings/P-1001" }, { cookie: session });
    expect(fromFinding.headers.get("location")).toBe("/atlas/findings/P-1001?done=vote-cleared#votes");
  });
});
