import { afterEach, describe, expect, it } from "vitest";

import { escapeHtml } from "../apps/research-mcp/src/atlas/page-guard.js";
import { participantKeyFor } from "../apps/research-mcp/src/atlas/participation.js";
import {
  AI_WARNING_LABEL,
  REPORT_CONSENT,
  REPORT_CONTACT_REFUSAL,
  outcomeCounts,
  reportResearchProblems,
  reportResearchSchema,
} from "../apps/research-mcp/src/atlas/report-pages.js";
import { closeAtlasServers, fixture, tokenFor } from "./helpers/atlas-participation-fixture.js";

// Owner answer 229a: "Share what worked for you", a report's page with the research around it and the answers on it,
// and a reader's own reports, over HTTP with the in-memory stores. Every figure, name and address here is invented.

afterEach(closeAtlasServers);

const AUTHOR = "auth0|reports-author";
const READER = "auth0|reports-reader";
const REPORT = {
  problem: "An invented itch", tried: "An invented oat cream", dose: "A thin layer", howUsed: "Twice a day",
  howLong: "Two weeks", whatHappened: "The itch eased within a week.", howLongLasted: "A month so far",
  sideEffects: "", otherChanges: "", displayName: "Invented Reporter", consent: "yes",
};
const RESEARCH = {
  others: [
    { url: "https://forum.example/threads/oat-cream-itch", outcome: "better", said: "Helped within days." },
    { url: "https://www.reddit.com/r/invented/comments/abc123/oat_cream/", outcome: "no_change" },
  ],
  studies: [{ title: "An invented trial of oat cream", year: 2020, source: "PMID: 12345678",
    found: "Itch scores fell more than with the plain cream." }],
  safety: "Rarely, a rash in people allergic to oats.",
  unknown: "Whether it helps for more than a month.",
};

async function shared() {
  const f = await fixture();
  const author = await f.signIn(AUTHOR);
  const form = (await f.get("/atlas/share", author)).body;
  const csrf = tokenFor(form, "/atlas/share");
  return { f, author, form, csrf };
}

describe("sharing what worked for you (owner answer 229a)", () => {
  it("asks a signed-out reader to sign in, and shows a signed-in one the form with the consent line", async () => {
    const f = await fixture();
    const signedOut = await f.get("/atlas/share");
    expect(signedOut.response.status).toBe(200);
    expect(signedOut.body).toContain("Sign in with your AskRigor account to send a report.");
    const { form } = await shared();
    expect(form).toContain("<h1>Share what worked for you</h1>");
    expect(form).toContain(REPORT_CONSENT);
    expect(form).toContain('content="noindex"');
  });

  it("receives a report privately; refuses contact details, links and a missing consent", async () => {
    const { f, author, csrf } = await shared();
    for (const [change, refusal] of [
      [{ whatHappened: "Write to invented@example.com for more." }, REPORT_CONTACT_REFUSAL],
      [{ howUsed: "See https://shop.example/cream" }, REPORT_CONTACT_REFUSAL],
      [{ consent: "" }, "Tick the box to say the report may be published."],
      [{ problem: "" }, "Fill in “The problem” first."],
    ] as const) {
      const refused = await f.post("/atlas/share", { ...REPORT, ...change, csrf }, { cookie: author });
      expect(refused.status).toBe(422);
      expect(await refused.text()).toContain(escapeHtml(refusal));
    }
    expect(await f.reports.inspectReports("received", undefined, 20)).toEqual([]);
    const sent = await f.post("/atlas/share", { ...REPORT, csrf }, { cookie: author });
    expect(sent.status).toBe(200);
    expect(await sent.text()).toContain("Your report R-1001 is received.");
    const [received] = await f.reports.inspectReports("received", undefined, 20);
    expect(received).toMatchObject({ publicId: "R-1001", door: "form", text: { problem: REPORT.problem,
      displayName: "Invented Reporter", sideEffects: null } });
    // Private until the check: no page yet.
    expect((await f.get("/atlas/reports/R-1001")).response.status).toBe(404);
    // A form from elsewhere, or with a stale token, sends nothing.
    expect((await f.post("/atlas/share", { ...REPORT, csrf }, { cookie: author, origin: "https://elsewhere.example" })).status)
      .toBe(403);
    expect((await f.post("/atlas/share", { ...REPORT, csrf: "stale" }, { cookie: author })).status).toBe(403);
  });

  it("shows a published report with its AI warning and research, and counts other people's answers", async () => {
    const { f, author, csrf } = await shared();
    await f.post("/atlas/share", { ...REPORT, csrf }, { cookie: author });
    await f.reports.decideReport({ publicId: "R-1001", verdict: "publish_with_warning", aiWarning: "An invented caution.",
      reason: null, research: RESEARCH, categoryKey: "health", subcategoryKey: "skin-hair-and-nails", at: new Date().toISOString() });
    const page = await f.get("/atlas/reports/R-1001");
    expect(page.response.status).toBe(200);
    expect(page.body).toContain(`<strong>${AI_WARNING_LABEL}:</strong> An invented caution.`);
    expect(page.body).toContain("<h1>An invented oat cream for An invented itch</h1>");
    expect(page.body).toContain("2 people: 1 better, 1 no change, 0 worse, 0 mixed, each counted once.");
    expect(page.body).toContain('href="https://pubmed.ncbi.nlm.nih.gov/12345678/"');
    expect(page.body).toContain('content="noindex"');
    expect(page.body).toContain("to say whether it worked for you.");
    expect((await f.get("/atlas/health/skin-hair-and-nails")).body).toContain('<a href="/atlas/reports/R-1001">');

    // Its author sees no answer buttons; another reader answers, changes it and takes it back.
    const own = (await f.get("/atlas/reports/R-1001", author)).body;
    expect(own).not.toContain("It worked for me too</button>");
    const reader = await f.signIn(READER);
    const readerPage = (await f.get("/atlas/reports/R-1001", reader)).body;
    const token = tokenFor(readerPage, "/atlas/reports/R-1001/answer");
    const answered = await f.post("/atlas/reports/R-1001/answer", { answer: "worked", csrf: token }, { cookie: reader });
    expect(answered.status).toBe(303);
    expect(answered.headers.get("location")).toBe("/atlas/reports/R-1001?done=answered#answers");
    expect((await f.get("/atlas/reports/R-1001", reader)).body).toContain("1 person said it worked for them too");
    const ownToken = tokenFor(readerPage, "/atlas/reports/R-1001/answer");
    expect((await f.post("/atlas/reports/R-1001/answer", { answer: "worked", csrf: ownToken }, { cookie: author })).status)
      .toBe(403);
  });

  it("lists a reader's own reports, takes one down, and deletes the rest with everything else", async () => {
    const { f, author, csrf } = await shared();
    await f.post("/atlas/share", { ...REPORT, csrf }, { cookie: author });
    await f.post("/atlas/share", { ...REPORT, tried: "A second invented cream", csrf }, { cookie: author });
    const list = (await f.get("/atlas/account/reports", author)).body;
    expect(list).toContain("Waiting for the AI check");
    const token = tokenFor(list, "/atlas/account/reports/R-1001/delete");
    const down = await f.post("/atlas/account/reports/R-1001/delete", { csrf: token }, { cookie: author });
    expect(down.status).toBe(303);
    expect((await f.reports.inspectReports("received", undefined, 20)).map(({ publicId }) => publicId)).toEqual(["R-1002"]);
    // Someone else's take-down form for it finds nothing of theirs.
    const reader = await f.signIn(READER);
    const readerList = (await f.get("/atlas/account/reports", reader)).body;
    expect(readerList).toContain("You haven’t sent a report.");
    const account = (await f.get("/atlas/account", author)).body;
    const forget = await f.post("/atlas/account/delete", { confirm: "yes", csrf: tokenFor(account, "/atlas/account/delete") },
      { cookie: author });
    expect(forget.status).toBe(303);
    expect(await f.reports.inspectReports("received", undefined, 20)).toEqual([]);
    expect(participantKeyFor(f.settings, AUTHOR)).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe("the research around a report (owner answer 229a)", () => {
  it("counts people by outcome and checks every link and source exactly", () => {
    const research = reportResearchSchema.parse(RESEARCH);
    expect(reportResearchProblems(research)).toEqual([]);
    expect(outcomeCounts(research)).toEqual({ better: 1, no_change: 1, worse: 0, mixed: 0, people: 2 });
    const bad = reportResearchSchema.parse({ ...RESEARCH,
      others: [{ url: "https://www.youtube.com/watch?v=invented0001", outcome: "better" },
        { url: "http://forum.example/plain", outcome: "worse" }, { url: "https://user:pass@forum.example/x", outcome: "mixed" }],
      studies: [{ ...RESEARCH.studies[0]!, source: "an invented journal, 2020" }] });
    expect(reportResearchProblems(bad)).toEqual([
      "others[0].url is YouTube, which the Atlas never links",
      "others[1].url is not a plain https address",
      "others[2].url is not a plain https address",
      "studies[0].source is not a PMID, PMCID, DOI or NCT number",
    ]);
  });
});
