import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryAtlasTraditions, PostgresAtlasTraditionStore, AtlasTraditionError,
  InMemoryAtlasPageSource, PostgresAtlasPageSource, type AtlasTraditionLabel,
} from "@askrigor/evidence-repository";
import { AtlasTraditionReview, traditionChangesSchema } from "../apps/research-mcp/src/atlas/traditions-review.js";
import { ATLAS_TRADITIONS } from "../apps/research-mcp/src/atlas/traditions-tree.js";
import { loadAtlasTradition, loadAtlasTraditions, renderAtlasTradition, renderAtlasTraditions }
  from "../apps/research-mcp/src/atlas/traditions-pages.js";
import { loadAtlasFinding } from "../apps/research-mcp/src/atlas/page-data.js";
import { atlasPageProblems, renderAtlasFinding } from "../apps/research-mcp/src/atlas/pages.js";
import { atlasRouteOf } from "../apps/research-mcp/src/atlas/pages-http.js";
import { AtlasReview } from "../apps/research-mcp/src/findings/atlas-review.js";
import { createResearchContributionReviewHandler, researchContributionReviewRuntimeInputSchema }
  from "../apps/research-mcp/src/research-contribution-review-tool.js";
import { announcingTraditionStore, AtlasChangeSignal } from "../apps/research-mcp/src/atlas/change-signal.js";
import { publications } from "./helpers/atlas-participation-fixture.js";

const AT = "2026-11-22T12:00:00.000Z";
const label = (overrides: Partial<AtlasTraditionLabel> = {}): AtlasTraditionLabel => ({
  section: "tcm", tradition: "Synthetic textbook tradition", region: "Invented region", preparation: "leaf tea",
  modern_check: "supports", match: "tested as the tradition uses it", list: "useful", quick_answer_misses: false, ...overrides,
});
const disagreement = { tcm_item: "P-1001", ccm_item: "P-1003", line: "These invented accounts use different doses." };
async function fixture() {
  const store = await publications();
  const traditions = new InMemoryAtlasTraditions();
  const source = new InMemoryAtlasPageSource({ publications: store, traditions });
  await traditions.setTraditions([
    { item: "P-1001", labels: [label()] },
    { item: "P-1002", labels: [label({ list: "untested", modern_check: "not_tested_as_used" })] },
    { item: "P-1003", labels: [label({ quick_answer_misses: true }), label({ section: "ccm", modern_check: "mixed" })] },
  ], [disagreement], AT);
  return { store, traditions, source };
}

describe("tradition storage", () => {
  it("replaces or removes every label of named items, leaves others alone and copies returned rows", async () => {
    const { traditions } = await fixture();
    const before = await traditions.listTraditions();
    before.labels[0]!.tradition = "changed outside the store";
    expect((await traditions.listTraditions()).labels[0]!.tradition).toBe("Synthetic textbook tradition");
    await traditions.setTraditions([{ item: "P-1001", labels: [label({ section: "tibetan-medicine" })] }], undefined, AT);
    expect((await traditions.listTraditions()).labels.filter(({ item }) => item === "P-1001").map(({ section }) => section))
      .toEqual(["tibetan-medicine"]);
    await traditions.setTraditions([{ item: "P-1001", labels: [] }], [], AT);
    expect((await traditions.listTraditions()).labels).toHaveLength(3);
    expect((await traditions.listTraditions()).disagreements).toEqual([]);
  });
  it.each([
    [{ item: "R-1001", labels: [label()] }],
    [{ item: "P-1001", labels: [label(), label()] }],
    [{ item: "P-1001", labels: [label({ tradition: "x".repeat(161) })] }],
    [{ item: "P-1001", labels: [label({ region: "x".repeat(81) })] }],
    [{ item: "P-1001", labels: [label({ preparation: "x".repeat(121) })] }],
    [{ item: "P-1001", labels: [label({ match: "x".repeat(121) })] }],
    [{ item: "P-1001", labels: [label({ modern_check: "yes" as never })] }],
    [{ item: "P-1001", labels: [label({ list: "other" as never })] }],
    [{ item: "P-1001", labels: [label({ quick_answer_misses: "true" as never })] }],
    [{ item: "P-1001", labels: [] }, { item: "P-1001", labels: [] }],
  ])("rejects malformed changes atomically (%#)", async (...changes) => {
    const { traditions } = await fixture();
    const before = await traditions.listTraditions();
    await expect(traditions.setTraditions(changes as never, [], AT)).rejects.toBeInstanceOf(AtlasTraditionError);
    expect(await traditions.listTraditions()).toEqual(before);
  });
  it("bounds disagreements and accepts F numbers and Unicode text at its character limits", async () => {
    const traditions = new InMemoryAtlasTraditions();
    await traditions.setTraditions([{ item: "F-8701", labels: [label({ tradition: "𐐀".repeat(160) })] }], undefined, AT);
    await expect(traditions.setTraditions([], [{ ...disagreement, line: "x".repeat(200) }], AT))
      .rejects.toBeInstanceOf(AtlasTraditionError);
    await expect(traditions.setTraditions([], [disagreement, disagreement], AT)).rejects.toBeInstanceOf(AtlasTraditionError);
    await expect(traditions.setTraditions([], [{ ...disagreement, line: "Two\nlines" }], AT)).rejects.toBeInstanceOf(AtlasTraditionError);
    await expect(traditions.setTraditions([], undefined, AT)).rejects.toBeInstanceOf(AtlasTraditionError);
    await expect(traditions.setTraditions([{ item: "P-1001", labels: [] }], undefined, "invalid"))
      .rejects.toBeInstanceOf(AtlasTraditionError);
    expect((await traditions.listTraditions()).labels).toHaveLength(1);
  });
  it("uses parameterized reviewer functions and maps database validation errors", async () => {
    const store = new PostgresAtlasTraditionStore({ connectionString: "postgres://test@127.0.0.1/test" });
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ changed: 1 }] })
      .mockResolvedValueOnce({ rows: [{ traditions: { labels: [], disagreements: [] } }] })
      .mockRejectedValueOnce(new Error("ATLAS_TRADITION_INPUT_INVALID"));
    (store as unknown as { pool: unknown }).pool = { query };
    const changes = [{ item: "P-1001", labels: [label()] }];
    expect(await store.setTraditions(changes, undefined, AT)).toBe(1);
    expect(query.mock.calls[0]).toEqual([
      "SELECT living_evidence.set_atlas_traditions($1::jsonb, $2::jsonb, $3::timestamptz) AS changed",
      [JSON.stringify(changes), null, AT],
    ]);
    expect(await store.listTraditions()).toEqual({ labels: [], disagreements: [] });
    await expect(store.setTraditions(changes, [], AT)).rejects.toBeInstanceOf(AtlasTraditionError);
  });
  it("reads both label tables in the page’s existing read-only snapshot", async () => {
    const source = new PostgresAtlasPageSource({ connectionString: "postgres://test@127.0.0.1/test" });
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("AS traditions")
      ? [{ traditions: { labels: [], disagreements: [] } }] : [] }));
    const release = vi.fn();
    (source as unknown as { pool: unknown }).pool = { connect: async () => ({ query, release }) };
    expect(await source.read((reads) => reads.listTraditions!())).toEqual({ labels: [], disagreements: [] });
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(statements.filter((sql) => sql.includes("atlas_tradition_labels"))).toHaveLength(1);
    expect(statements.find((sql) => sql.includes("atlas_tradition_labels"))).toContain("atlas_tradition_disagreements");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
  it("registers replay-safe migration 0044 and grants its functions only to the reviewer", async () => {
    const sql = await readFile("packages/evidence-repository/migrations/0044_atlas_traditions.sql", "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS atlas_tradition_labels");
    expect(sql).toContain("PRIMARY KEY (item_number, section_key)");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION set_atlas_traditions");
    expect(sql).toContain("SET search_path = __SCHEMA__, pg_catalog, pg_temp");
    expect(sql).toContain("REVOKE ALL ON FUNCTION set_atlas_traditions(jsonb, jsonb, timestamptz) FROM PUBLIC");
    expect(sql).toContain("REVOKE ALL ON FUNCTION inspect_atlas_traditions() FROM PUBLIC");
    expect(await readFile("packages/evidence-repository/src/postgres.ts", "utf8")).toContain('"0044_atlas_traditions"');
    const grants = await readFile("infra/living-evidence-production/provision-research-review-role.sh", "utf8");
    expect(grants).toContain("set_atlas_traditions(jsonb, jsonb, timestamptz)\n  TO askrigor_research_review");
    expect(grants).toContain("inspect_atlas_traditions()\n  TO askrigor_research_review");
  });
});

describe("review actions", () => {
  it("sets, lists, replaces and removes labels through later inputs and the real Atlas review dispatch", async () => {
    const traditions = new InMemoryAtlasTraditions();
    const review = new AtlasReview({ traditions, now: () => new Date(AT) } as never);
    const handler = createResearchContributionReviewHandler({
      allowedReviewerSubjects: new Set(["owner"]),
      resourceMetadataUrl: new URL("https://example.test/meta"),
      atlas: { enabled: true, review, providers: () => ({}) },
    } as never);
    const auth = { authInfo: { token: "synthetic", clientId: "synthetic", expiresAt: Date.now() / 1000 + 600, scopes: ["cases:review"],
      extra: { subject: "owner" } } };
    const result = await handler({ action: "label_traditions", traditions: [{ item: "P-1001", labels: [label()] }] }, auth as never);
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ ok: true, outcome: "traditions_labeled", traditions: { changed: 1 } });
    const listed = await handler({ action: "list_traditions" }, auth as never);
    expect(listed.structuredContent).toMatchObject({ traditions: { labels: [{ item: "P-1001" }] } });
    await handler({ action: "label_traditions", traditions: [{ item: "P-1001", labels: [] }] }, auth as never);
    expect((await traditions.listTraditions()).labels).toEqual([]);
  });
  it("authorizes both actions before touching storage", async () => {
    const traditions = new InMemoryAtlasTraditions();
    const review = new AtlasReview({ traditions } as never);
    const handler = createResearchContributionReviewHandler({ allowedReviewerSubjects: new Set(["owner"]),
      resourceMetadataUrl: new URL("https://example.test/meta"), atlas: { enabled: true, review, providers: () => ({}) } } as never);
    for (const action of ["label_traditions", "list_traditions"]) for (const auth of [undefined,
      { authInfo: { expiresAt: Date.now() / 1000 + 600, scopes: [], extra: { subject: "owner" } } },
      { authInfo: { expiresAt: Date.now() / 1000 + 600, scopes: ["cases:review"], extra: { subject: "stranger" } } }]) {
      expect((await handler({ action, traditions: [{ item: "P-1001", labels: [label()] }] }, auth as never)).isError).toBe(true);
    }
    expect((await traditions.listTraditions()).labels).toEqual([]);
  });
  it("rejects missing, misplaced, duplicate and unsafe inputs without changing storage", async () => {
    const { traditions } = await fixture();
    const review = new AtlasTraditionReview({ traditions, now: () => new Date(AT) });
    for (const input of [undefined, [], [{ item: "P-1001", labels: [label({ section: "unknown" })] }],
      [{ item: "P-1001", labels: [label({ tradition: "ARF-8888" })] }]]) {
      expect((await review.run({ action: "label_traditions", traditions: input })).ok).toBe(false);
    }
    expect(researchContributionReviewRuntimeInputSchema.safeParse({ action: "list_traditions",
      traditions: [{ item: "P-1001", labels: [] }] }).success).toBe(false);
    expect(researchContributionReviewRuntimeInputSchema.safeParse({ action: "label_traditions" }).success).toBe(false);
    expect(researchContributionReviewRuntimeInputSchema.safeParse({ action: "inspect", traditions: [] }).success).toBe(false);
    expect(researchContributionReviewRuntimeInputSchema.safeParse({ action: "label_traditions", tradition_disagreements: [] }).success).toBe(true);
    expect(traditionChangesSchema.safeParse([{ item: "P-1001", labels: [label(), label()] }]).success).toBe(false);
    expect((await traditions.listTraditions()).labels).toHaveLength(4);
  });
  it("invalidates page caches on writes", async () => {
    const signal = new AtlasChangeSignal(), listener = vi.fn(); signal.subscribe(listener);
    const store = announcingTraditionStore(new InMemoryAtlasTraditions(), signal);
    await store.setTraditions([{ item: "P-1001", labels: [] }], undefined, AT);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("public tradition pages", () => {
  it("shows all four empty sections and valid routes", async () => {
    const source = new InMemoryAtlasPageSource({ publications: await publications() });
    const model = await loadAtlasTraditions(source);
    expect(model.sections.map(({ count }) => count)).toEqual([0, 0, 0, 0]);
    expect(atlasPageProblems(renderAtlasTraditions(model))).toEqual([]);
    for (const section of ATLAS_TRADITIONS) {
      expect(atlasRouteOf(`/atlas/traditions/${section.key}`)).toEqual({ kind: "tradition", sectionKey: section.key });
      const body = renderAtlasTradition((await loadAtlasTradition(source, section.key))!);
      expect(body).toContain(`Tried something from ${section.label}? Tell us what happened.`);
      expect(body).toContain("Nothing here yet.");
      expect(body.includes("Where TCM and CCM disagree")).toBe(["tcm", "ccm"].includes(section.key));
      expect(atlasPageProblems(body)).toEqual([]);
    }
    expect(atlasRouteOf("/atlas/traditions")).toEqual({ kind: "traditions" });
    expect(await loadAtlasTradition(source, "unknown")).toBeUndefined();
  });
  it.each([
    [0, "no findings yet"], [1, "1 finding"], [2, "2 findings"],
  ] as const)("writes index counts in plain words for %i findings", (count, words) => {
    const body = renderAtlasTraditions({ sections: ATLAS_TRADITIONS.map((section) => ({ ...section, count })) });
    for (const section of ATLAS_TRADITIONS) {
      expect(body).toContain(`${section.label}</a>: <span class="meta">${words}</span>`);
    }
    expect(atlasPageProblems(body)).toEqual([]);
  });
  it("counts shown items once per section, puts marked items before stronger items and renders short entries", async () => {
    const { source } = await fixture();
    expect((await loadAtlasTraditions(source)).sections.map(({ count }) => count)).toEqual([0, 0, 3, 1]);
    const model = (await loadAtlasTradition(source, "tcm"))!;
    expect(model.entries.map(({ finding }) => finding.publicationNumber)).toEqual(["P-1003", "P-1001", "P-1002"]);
    const body = renderAtlasTradition(model);
    expect(body.indexOf("People’s reports")).toBeLessThan(body.indexOf("Most useful findings"));
    expect(body.indexOf("Most useful findings")).toBeLessThan(body.indexOf("Most important corrections from modern science"));
    expect(body.indexOf("Most important corrections from modern science")).toBeLessThan(body.indexOf("<h2>Untested</h2>"));
    expect(body).toContain("A quick AI answer misses this");
    expect(body).toContain("25 out of 100 with zentarine 20 mg, against 15 out of 100 with placebo");
    expect(body).toContain("Synthetic textbook tradition, Invented region: leaf tea");
    expect(body).toContain("Modern check: supports it; tested as the tradition uses it");
    expect(body).toContain('href="/atlas/findings/P-1003"');
    expect(body).toContain('href="/atlas/traditions" aria-current="page">Traditions');
  });
  it("uses strength and then newest to break ties in every list", async () => {
    const { source, traditions } = await fixture();
    for (const list of ["useful", "correction", "untested"] as const) {
      await traditions.setTraditions(["P-1001", "P-1002", "P-1003"].map((item) => ({ item, labels: [label({ list })] })), [], AT);
      const model = (await loadAtlasTradition(source, "tcm"))!;
      expect(model.entries[0]!.finding.publicationNumber).toBe("P-1001");
    }
  });
  it("breaks equal-strength ties by date and keeps the red edge on harm entries", async () => {
    const { store, source, traditions } = await fixture();
    const fields = (await store.inspect({ states: ["unreviewed"], limit: 100 })).find((row) => row.publicationNumber === "P-1001")!.published!;
    await store.publish({ cardNumber: 8970, cardSha256: "e".repeat(64), findings: [{ findingNumber: 1,
      state: "unreviewed", atlasNumber: null, heldBecause: null, published: fields }],
      publishedAt: "2026-11-22T12:00:00.000Z", revive: false });
    await traditions.setTraditions([{ item: "P-1004", labels: [label()] }], undefined, AT);
    const useful = (await loadAtlasTradition(source, "tcm"))!.entries.filter(({ label }) => label.list === "useful");
    expect(useful.map(({ finding }) => finding.publicationNumber)).toEqual(["P-1003", "P-1004", "P-1001"]);
    await store.publish({ cardNumber: 8971, cardSha256: "f".repeat(64), findings: [{ findingNumber: 1,
      state: "unreviewed", atlasNumber: null, heldBecause: null, published: { ...fields, kind: "harm", direction: "harm" } }],
      publishedAt: AT, revive: false });
    await traditions.setTraditions([{ item: "P-1005", labels: [label({ list: "correction" })] }], undefined, AT);
    expect(renderAtlasTradition((await loadAtlasTradition(source, "tcm"))!)).toContain('class="finding tradition-harm"');
  });
  it("shows disagreements on both Chinese pages only while both items still show and have their labels", async () => {
    const { source, traditions } = await fixture();
    for (const section of ["tcm", "ccm"]) {
      const body = renderAtlasTradition((await loadAtlasTradition(source, section))!);
      expect(body).toContain(disagreement.line);
      expect(body).toContain('href="/atlas/findings/P-1001"');
      expect(body).toContain('href="/atlas/findings/P-1003"');
    }
    await traditions.setTraditions([{ item: "P-1003", labels: [] }], undefined, AT);
    expect((await loadAtlasTradition(source, "tcm"))!.disagreements).toEqual([]);
  });
  it("leaves kept items off lists and disagreement links, without changing Health placements", async () => {
    const { source, store } = await fixture();
    await store.keep({ publicationNumbers: ["P-1001"], atlasNumbers: [], keep: true, reason: "Synthetic research only", at: AT } as never);
    const model = (await loadAtlasTradition(source, "tcm"))!;
    expect(model.entries.map(({ finding }) => finding.publicationNumber)).not.toContain("P-1001");
    expect(model.disagreements).toEqual([]);
  });
  it("renders lines near a full finding's title once per section, leaving empty parts out", async () => {
    const { source, traditions } = await fixture();
    await traditions.setTraditions([{ item: "P-1001", labels: [label({ region: undefined, preparation: undefined }),
      label({ section: "ccm", tradition: "A synthetic lineage", modern_check: "corrects" })] }], undefined, AT);
    const model = (await loadAtlasFinding(source, "P-1001"))!;
    const body = renderAtlasFinding(model);
    expect(body.match(/class="tradition-line"/gu)).toHaveLength(2);
    expect(body).toContain('<p class="tradition-line">Synthetic textbook tradition</p>');
    expect(body).toContain("Modern check: corrects it: right idea, wrong dose, form or people");
    expect(body.indexOf('class="claim"')).toBeLessThan(body.indexOf('class="tradition-line"'));
    expect(body.indexOf('class="tradition-line"')).toBeLessThan(body.indexOf("The usual answer"));
  });
  it("escapes reviewed text and omits unsafe stored labels or disagreements before the last page guard", async () => {
    const { source, traditions } = await fixture();
    await traditions.setTraditions([{ item: "P-1001", labels: [label({ tradition: '<b>葉</b> & "tea"' })] }], undefined, AT);
    expect(renderAtlasTradition((await loadAtlasTradition(source, "tcm"))!)).toContain("&lt;b&gt;葉&lt;/b&gt; &amp; &quot;tea&quot;");
    await traditions.setTraditions([{ item: "P-1001", labels: [label({ match: "youtu\u200bbe.com" })] }],
      [{ ...disagreement, line: "ARF-8888" }], AT);
    const body = renderAtlasTradition((await loadAtlasTradition(source, "tcm"))!);
    expect(body).not.toContain("ARF-8888");
    expect(atlasPageProblems(body)).toEqual([]);
    expect((await loadAtlasFinding(source, "P-1001"))!.traditions).toEqual([]);
  });
  it("adds a section through the one data list, including validation, counts and its page", async () => {
    vi.resetModules();
    const sections = [...ATLAS_TRADITIONS, { key: "example-system", label: "Example system", description: "A synthetic section." }];
    vi.doMock("../apps/research-mcp/src/atlas/traditions-tree.js", () => ({
      ATLAS_TRADITIONS: sections, traditionSectionOf: (key: string) => sections.find((section) => section.key === key),
      traditionsPath: (key?: string) => key === undefined ? "/atlas/traditions" : `/atlas/traditions/${key}`,
    }));
    try {
      const review = await import("../apps/research-mcp/src/atlas/traditions-review.js");
      const pages = await import("../apps/research-mcp/src/atlas/traditions-pages.js");
      expect(review.traditionChangesSchema.safeParse([{ item: "P-1001", labels: [label({ section: "example-system" })] }]).success).toBe(true);
      const { traditions, source } = await fixture();
      await traditions.setTraditions([{ item: "P-1001", labels: [label({ section: "example-system" })] }], undefined, AT);
      expect((await pages.loadAtlasTraditions(source)).sections.at(-1)).toMatchObject({ key: "example-system", count: 1 });
      expect(pages.renderAtlasTradition((await pages.loadAtlasTradition(source, "example-system"))!)).toContain("A synthetic section.");
    } finally { vi.doUnmock("../apps/research-mcp/src/atlas/traditions-tree.js"); vi.resetModules(); }
  });
});
