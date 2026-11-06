import type { AddressInfo } from "node:net";

import {
  ATLAS_PUBLICATION_SCHEMA,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasGlanceRows,
  InMemoryAtlasPageSource,
  InMemoryAtlasPublicationStore,
  atlasSearchSchema,
  type AtlasPageReads,
  type AtlasPageReport,
  type AtlasPageSource,
  type AtlasPublicationDraft,
  type AtlasPublishedFinding,
} from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it } from "vitest";

import { AtlasChangeSignal } from "../apps/research-mcp/src/atlas/change-signal.js";
import { loadAtlasChanges } from "../apps/research-mcp/src/atlas/page-data.js";
import { atlasPageProblems } from "../apps/research-mcp/src/atlas/page-guard.js";
import { createAtlasPagesHandler } from "../apps/research-mcp/src/atlas/pages-http.js";
import { publicationHoldReasons } from "../apps/research-mcp/src/atlas/publication.js";
import { renderAtlasOwnReports } from "../apps/research-mcp/src/atlas/report-pages.js";
import { holdsYouTubeReference } from "../apps/research-mcp/src/findings/card.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// The review of #422, fourth round: the pages read a text as a reader sees it, without its format characters, but the
// write-time checks read it raw, so a published claim holding "you", a zero-width space and "tube.com" passed them, and
// every page listing it then answered 503. The checks now read texts alike, and a stored row with a text a page would
// refuse is left out of every page. Velmor syndrome, zentarine and every identifier here are invented.

const AT = "2026-11-06T09:00:00.000Z";
const SMUGGLED = "Zentarine 20 mg eased the tremor, as a talk on you\u200Btube.com described.";
const CLEAN = "Zentarine 10 mg eased the tremor in an invented trial.";
const published = (claim: string, extra: Partial<AtlasPublishedFinding> = {}): AtlasPublishedFinding => ({
  schema: ATLAS_PUBLICATION_SCHEMA, topic: { key: "velmor-syndrome", label: "Velmor syndrome" }, claim,
  certainty: "moderate", applies_to: "Adults with Velmor syndrome", kind: "effect", subject: "zentarine",
  subject_type: "supplement", direction: "benefit", numbers: null, searches: null, sources: ["10.0000/synthetic-velmor-a"],
  why_not_usual: "Quick answers miss the lower dose.", what_would_change_it: "A larger trial.",
  verified_bases: ["full_text_audit"], saved_on: "2026-11-04", askrigor_version: "0.1.0", ...extra,
});
const draft = (n: number, finding: AtlasPublishedFinding): AtlasPublicationDraft =>
  ({ findingNumber: n, state: "unreviewed", atlasNumber: null, heldBecause: null, published: finding });

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(closers.splice(0).map((close) => close())); });

/** The pages over a source, served on a local port: each path's status and body. */
async function pagesOver(source: AtlasPageSource) {
  const handler = createAtlasPagesHandler({ enabled: true, source, signal: new AtlasChangeSignal() });
  const server = createAskRigorHttpServer({ publicServerEnabled: false, atlasPagesHandler: handler });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return async (path: string) => {
    const response = await fetch(`${base}${path}`);
    return { status: response.status, body: await response.text() };
  };
}

async function published2(findings: AtlasPublishedFinding[]) {
  const store = new InMemoryAtlasPublicationStore();
  const rows = await store.publish({ cardNumber: 300, cardSha256: "c".repeat(64), publishedAt: AT, revive: false,
    findings: findings.map((finding, index) => draft(index + 1, finding)) });
  return { store, numbers: rows.map(({ publicationNumber }) => publicationNumber) };
}

/** A page source whose reads are the memory source's, with some replaced. */
const withReads = (source: AtlasPageSource, replaced: (reads: AtlasPageReads) => Partial<AtlasPageReads>): AtlasPageSource =>
  ({ read: (work) => source.read((reads) => work({ ...reads, ...replaced(reads) })) });

describe("the write-time checks read a text as a reader sees it", () => {
  it("holds a publication whose text hides a YouTube address, an e-mail address or a card behind a format character", () => {
    expect(publicationHoldReasons(published(SMUGGLED))).toContain("youtube_link");
    expect(publicationHoldReasons(published("Write to velmor\u200B@example.org for the dose."))).toContain("email_address");
    expect(publicationHoldReasons(published("As card ARF-\u20600042 put it."))).toContain("card_reference");
    expect(publicationHoldReasons(published(CLEAN))).toEqual([]);
  });

  it("names a YouTube host hidden by a format character in a card's text, and the canonical store refuses one", () => {
    expect(holdsYouTubeReference("A talk on you\u200Btube.com")).toBe(true);
    expect(holdsYouTubeReference("A talk on you\u00ADtu.be")).toBe(true);
    expect(atlasSearchSchema.safeParse({ database: "pubmed", query: "you\u200Btube.com zentarine" }).success).toBe(false);
    expect(atlasSearchSchema.safeParse({ database: "pubmed", query: "ARF-\u200D1234 zentarine" }).success).toBe(false);
    // The joiners a script needs stay: Persian with its zero-width non-joiner.
    expect(atlasSearchSchema.safeParse({ database: "pubmed", query: "زنتارین می\u200Cگویند" }).success).toBe(true);
  });
});

describe("a stored row a page would refuse is left out, and every page serves", () => {
  const LISTS = ["/atlas", "/atlas/findings", "/atlas/topics/velmor-syndrome", "/atlas/map", "/atlas/search?q=zentarine",
    "/atlas/health", "/atlas/topics", "/atlas/changes", "/atlas/challenges"];

  it("leaves a finding whose claim hides a YouTube address out of every page, its own answering 404", async () => {
    const { store, numbers: [smuggled, clean] } = await published2([published(SMUGGLED), published(CLEAN)]);
    const get = await pagesOver(new InMemoryAtlasPageSource({ publications: store, canonical: new InMemoryAtlasCanonicalStore() }));
    for (const path of LISTS) {
      const page = await get(path);
      expect(page.status, path).toBe(200);
      expect(page.body, path).not.toContain("tube.com");
    }
    expect((await get("/atlas/findings")).body).toContain("Zentarine 10 mg eased the tremor");
    expect((await get(`/atlas/findings/${smuggled}`)).status).toBe(404);
    expect((await get(`/atlas/findings/${clean}`)).status).toBe(200);
  });

  it("serves pages holding Persian, Hindi and emoji text with their joiners", async () => {
    const { store, numbers: [shown] } = await published2([published(
      "در یک کارآزمایی ساختگی، زنتارین ۲۰ میلی\u200Cگرم لرزش را کاهش داد؛ परीक्षण में क्\u200Dष \u{1F469}\u200D\u2695\uFE0F ने 20 मिग्रा दिया।",
      { applies_to: "بزرگسالان مبتلا به سندرم ولمور", why_not_usual: "پاسخ\u200Cهای سریع دوز کمتر را نمی\u200Cبینند." })]);
    const get = await pagesOver(new InMemoryAtlasPageSource({ publications: store, canonical: new InMemoryAtlasCanonicalStore() }));
    for (const path of [...LISTS, `/atlas/findings/${shown}`]) expect((await get(path)).status, path).toBe(200);
    expect((await get(`/atlas/findings/${shown}`)).body).toContain("میلی\u200Cگرم");
  });

  it("leaves a change whose public note hides a YouTube address off the changes page", async () => {
    const { store } = await published2([published(CLEAN)]);
    await store.decide({ cardNumber: 300, findingNumber: 1, state: "accepted", atlasNumber: "F-1001", decidedAt: AT });
    const memory = new InMemoryAtlasPageSource({ publications: store, canonical: new InMemoryAtlasCanonicalStore() });
    const withdrawn = (publicNote: string) => withReads(memory, () => ({
      listChanges: async () => [{ atlasNumber: "F-1001", kind: "withdrawn" as const, labelBefore: "checked" as const,
        labelAfter: "withdrawn" as const, publicNote, decidedAt: AT }],
    }));
    const notes = async (publicNote: string) => (await loadAtlasChanges(withdrawn(publicNote))).entries
      .filter(({ kind }) => kind === "withdrawn").map(({ note }) => note);
    expect(await notes("Withdrawn: the trial was retracted.")).toEqual(["Withdrawn: the trial was retracted."]);
    expect(await notes("Withdrawn: see you\u200Btube.com.")).toEqual([]);
  });

  it("answers 404 for a report whose words hide a YouTube address, and leaves it off its problem's page", async () => {
    const report = (publicId: string, tried: string, research: Record<string, unknown> | null = null): AtlasPageReport => ({
      publicId, displayName: null, research, aiWarning: null, publishedAt: AT, answers: { worked: 0, didNot: 0 }, viewer: null,
      text: { problem: "Invented gut ache", tried, dose: null, howUsed: null, howLong: null, whatHappened: "It eased.",
        howLongLasted: null, sideEffects: null, otherChanges: null },
    });
    const reports = [report("R-1001", "A routine from you\u200Btube.com"), report("R-1002", "Peppermint tea"),
      report("R-1003", "Warm water", { others: [{ url: "https://youtube.googleapis.com/v/aaaaaaaaaaa", outcome: "better" },
        { url: "https://forum.example.org/t/123", outcome: "better", said: "It eased the ache." }],
        studies: [], safety: null, unknown: null })];
    const source = withReads(new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore() }), () => ({
      readReport: async (publicId: string) => reports.find((entry) => entry.publicId === publicId) ?? null,
      listReports: async () => reports,
      listPlacements: async () => reports.map(({ publicId }) =>
        ({ itemNumber: publicId, categoryKey: "health", subcategoryKey: "gut-health" })),
    }));
    const get = await pagesOver(source);
    expect((await get("/atlas/reports/R-1001")).status).toBe(404);
    expect((await get("/atlas/reports/R-1002")).status).toBe(200);
    // Another report whose link opens YouTube by its host is left out of the research, which still shows the rest.
    const research = await get("/atlas/reports/R-1003");
    expect(research.status).toBe(200);
    expect(research.body).toContain("forum.example.org");
    expect(research.body).not.toContain("googleapis");
    expect(research.body).not.toContain("isn’t done yet");
    const problem = await get("/atlas/health/gut-health");
    expect(problem.status).toBe(200);
    expect(problem.body).toContain("Peppermint tea");
    expect(problem.body).not.toContain("tube.com");
  });

  it("leaves a glance row whose text hides a YouTube address off its problem's page", async () => {
    const glance = new InMemoryAtlasGlanceRows();
    const row = { categoryKey: "health", subcategoryKey: "gut-health", rowClass: "practitioner" as const,
      result: "783 of 875 healed", comparison: null, followUp: null, limits: "No matched comparison.",
      sources: ["PMID: 12345678"], namesAPerson: false };
    for (const what of ["An invented surgeon's series", "A series shown on you\u200Btube.com"]) {
      await glance.setState(await glance.propose({ ...row, what }, AT), "shown", AT);
    }
    const get = await pagesOver(new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore(), glance }));
    const page = await get("/atlas/health/gut-health");
    expect(page.status).toBe(200);
    expect(page.body).toContain("An invented surgeon");
    expect(page.body).not.toContain("tube.com");
  });

  it("names your own report by its number when its words would stop the page, keeping its take-down", () => {
    const page = renderAtlasOwnReports([{ publicId: "R-1001", problem: "Invented gut ache",
      tried: "A routine from you\u200Btube.com", state: "published", holdReason: null, refuseReason: null, receivedAt: AT }],
    () => "token");
    expect(atlasPageProblems(page)).toEqual([]);
    expect(page).toContain("R-1001");
    expect(page).toContain("Take it down");
  });
});
