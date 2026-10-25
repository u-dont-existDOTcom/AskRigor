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
import { createAtlasPagesHandler } from "../apps/research-mcp/src/atlas/pages-http.js";
import {
  SUBJECT,
  closeAtlasServers,
  fixture,
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
