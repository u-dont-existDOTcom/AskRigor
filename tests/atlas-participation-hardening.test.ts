import { afterEach, describe, expect, it } from "vitest";

import { InMemoryAtlasPageSource } from "@askrigor/evidence-repository";

import { AtlasChangeSignal } from "../apps/research-mcp/src/atlas/change-signal.js";
import {
  CONTACT_REFUSAL,
  commentProblem,
  displayNameProblem,
  participantKeyFor,
} from "../apps/research-mcp/src/atlas/participation.js";
import { atlasPageProblems, escapeHtml } from "../apps/research-mcp/src/atlas/pages.js";
import { ATLAS_CLIENT_IP_HEADER, atlasReaderAddress, createAtlasPagesHandler } from "../apps/research-mcp/src/atlas/pages-http.js";
import { addressLimitKey, createTokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import {
  SUBJECT,
  closeAtlasServers,
  fixture,
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
    const renamed = await f.post("/atlas/account/name", { csrf: tokenFor(page.body, "/atlas/account/name"),
      displayName: "Jane", return: "/atlas/findings/P-1001" }, { cookie: session });
    expect(renamed.status).toBe(303);
    expect(page.body).toContain('action="/atlas/auth/logout"');
    expect(page.body).toContain('action="/atlas/account/delete"');
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

describe("the reader's address behind the apex proxy (review issue 2)", () => {
  const onePage = () => createTokenBucketLimiter({ capacity: 1, refillTokensPerMinute: 0, maxKeys: 100, idleTtlMs: 60_000 });

  it("believes X-AskRigor-Client-IP only on requests for the public origin's host, and counts IPv6 by its /64", async () => {
    const f = await fixture({ rateLimiter: onePage() });
    const publicHost = new URL(f.base).host;
    const page = async (host: string, address: string) => (await rawRequest(f.base, "/atlas/findings/P-1001",
      { headers: { host, [ATLAS_CLIENT_IP_HEADER]: address } })).status;
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

  it("keys a report from a reader who is not signed in by the forwarded address", async () => {
    const f = await fixture();
    await f.store.postComment("e".repeat(64), "P-1001", "A comment.", AT, "Erin");
    const publicHost = new URL(f.base).host;
    const html = (await f.get("/atlas/findings/P-1001")).body;
    const report = async (address: string) => (await rawRequest(f.base, "/atlas/comments/C-1001/report", {
      method: "POST",
      headers: { host: publicHost, origin: f.base, "content-type": "application/x-www-form-urlencoded",
        [ATLAS_CLIENT_IP_HEADER]: address },
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
    const request = (headers: Record<string, string>) => ({ headers }) as never;
    expect(atlasReaderAddress(request({ host: "askrigor.com", [ATLAS_CLIENT_IP_HEADER]: " 203.0.113.9 " }), "askrigor.com",
      "10.0.0.2")).toBe("203.0.113.9");
    expect(atlasReaderAddress(request({ host: "ASKRIGOR.COM", [ATLAS_CLIENT_IP_HEADER]: "::ffff:203.0.113.9" }),
      "askrigor.com", "10.0.0.2")).toBe("203.0.113.9");
    for (const [host, value] of [["mcp.askrigor.com", "203.0.113.9"], ["askrigor.com", "203.0.113.9, 10.0.0.1"],
      ["askrigor.com", "not an address"], ["askrigor.com", "fe80::1%eth0"]] as const) {
      expect(atlasReaderAddress(request({ host, [ATLAS_CLIENT_IP_HEADER]: value }), "askrigor.com", "10.0.0.2"),
        `${host} ${value}`).toBe("10.0.0.2");
    }
    expect(atlasReaderAddress(request({ host: "askrigor.com", [ATLAS_CLIENT_IP_HEADER]: "203.0.113.9" }), null, "10.0.0.2"))
      .toBe("10.0.0.2");
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
