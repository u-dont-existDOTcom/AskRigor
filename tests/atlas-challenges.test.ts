import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ATLAS_PUBLICATION_SCHEMA,
  ATLAS_PUBLICATION_SCHEMA_V3,
  AtlasPublicationError,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasGlanceRows,
  InMemoryAtlasPageSource,
  InMemoryAtlasPublicationStore,
  InMemoryAtlasReviewStore,
  PostgresAtlasPublicationStore,
  type AtlasChallengeMark,
  type AtlasPagePublication,
  type AtlasPageSource,
  type AtlasPublicationDraft,
  type AtlasPublishedFinding,
} from "@askrigor/evidence-repository";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { AtlasChallengeReview, challengeMarker } from "../apps/research-mcp/src/atlas/challenge-review.js";
import { atlasPageProblems, opensYouTube } from "../apps/research-mcp/src/atlas/page-guard.js";
import { loadAtlasSubcategory, renderAtlasSubcategory } from "../apps/research-mcp/src/atlas/health-pages.js";
import { loadAtlasFinding } from "../apps/research-mcp/src/atlas/page-data.js";
import { renderAtlasFinding } from "../apps/research-mcp/src/atlas/pages.js";
import { AtlasReview } from "../apps/research-mcp/src/findings/atlas-review.js";
import { laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import { createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// The owner, 6 Nov 2026: "we should also have a section for results that challenge mainstream consensus even if it's
// available with a standard ai answer". A publication can carry a challenge mark: the usual view, its source, the
// quick-answer test's verdict, who marked it and when. Velmor syndrome, zentarine and every identifier here are invented.

const AT = "2026-11-06T09:00:00.000Z";
const LATER = "2026-11-06T10:00:00.000Z";
const OWNER = "auth0|owner";
const MARKER = challengeMarker(OWNER);
const MARK: AtlasChallengeMark = {
  usualView: "Most guidelines advise zentarine at 40 mg a day for every adult with Velmor syndrome.",
  sourceUrl: "https://guidelines.example.org/velmor-syndrome/2025",
  sourceLabel: "Invented Velmor Society guideline (2025)",
  verdict: "fail",
};

// Texts that need the zero-width non-joiner or joiner (the review of #422, third round): "most guidelines say ... 40
// milligrams a day" in Persian, a Hindi label with a joined conjunct, and a woman health worker emoji.
const JOINED = {
  persian: "بیشتر راهنماها می\u200Cگویند زنتارین ۴۰ میلی\u200Cگرم در روز.",
  hindi: "भारतीय दिशानिर्देश क्\u200Dष (2025)",
  emoji: "Doctors \u{1F469}\u200D\u2695\uFE0F advise zentarine at 40 mg.",
};

const published = (claim: string): AtlasPublishedFinding => ({
  schema: ATLAS_PUBLICATION_SCHEMA,
  topic: { key: "velmor-syndrome", label: "Velmor syndrome" },
  claim,
  certainty: "moderate",
  applies_to: "Adults with Velmor syndrome",
  kind: "effect",
  subject: "zentarine",
  subject_type: "supplement",
  direction: "benefit",
  numbers: null,
  searches: null,
  sources: ["10.0000/synthetic-velmor-a"],
  why_not_usual: "Quick answers miss the lower dose the trials used.",
  what_would_change_it: "A larger trial at the lower dose.",
  verified_bases: ["full_text_audit"],
  saved_on: "2026-11-04",
  askrigor_version: "0.1.0",
});
const draft = (findingNumber: number, overrides: Partial<AtlasPublicationDraft> = {}): AtlasPublicationDraft => ({
  findingNumber, state: "unreviewed", atlasNumber: null, heldBecause: null,
  published: published(`Finding ${findingNumber}: zentarine 20 mg eased the tremor in an invented trial.`),
  ...overrides,
});

/** Publishes one card of three findings: two shown and one held; the third is then rejected. */
async function stored() {
  const store = new InMemoryAtlasPublicationStore();
  const rows = await store.publish({ cardNumber: 300, cardSha256: "c".repeat(64), publishedAt: AT, revive: false,
    findings: [draft(1), draft(2), draft(3, { state: "held", heldBecause: ["email_address"] })] });
  const [shown, kept, held] = rows.map(({ publicationNumber }) => publicationNumber) as [string, string, string];
  await store.keep({ publicationNumbers: [kept], atlasNumbers: [], keep: true, reason: "owner answer 240a", at: AT });
  return { store, shown, kept, held };
}

describe("the challenge mark in the publications store", () => {
  it("marks shown and kept publications, keeps who and when, lists them, and clears them", async () => {
    const { store, shown, kept } = await stored();
    const marked = await store.markChallenges({ publicationNumbers: [shown, kept], mark: MARK, markedBy: MARKER, at: LATER });
    expect(marked).toEqual([
      { publicationNumber: shown, state: "unreviewed", atlasNumber: null, kept: false,
        mark: { ...MARK, markedBy: MARKER, markedAt: LATER } },
      { publicationNumber: kept, state: "unreviewed", atlasNumber: null, kept: true,
        mark: { ...MARK, markedBy: MARKER, markedAt: LATER } },
    ]);
    // Marking shows nothing: the kept one stays kept.
    expect(store.isKept(kept)).toBe(true);
    expect(store.challengeOf(shown)).toEqual(MARK);
    expect((await store.inspectChallenges()).map(({ publicationNumber }) => publicationNumber)).toEqual([shown, kept]);
    const cleared = await store.markChallenges({ publicationNumbers: [kept], mark: null, markedBy: null, at: LATER });
    expect(cleared).toEqual([{ publicationNumber: kept, state: "unreviewed", atlasNumber: null, kept: true, mark: null }]);
    expect((await store.inspectChallenges()).map(({ publicationNumber }) => publicationNumber)).toEqual([shown]);
    expect(store.challengeOf(kept)).toBeNull();
  });

  // R8 (the review of #422): a finding shown only for its challenge, with the verdict headline or fail, would say a quick
  // AI answer misses it once its mark went. Its mark stays while it shows; kept first, or a pass, it clears.
  it.each(["fail", "headline"] as const)("keeps a shown %s's mark until it is kept, and clears a pass's", async (verdict) => {
    const { store, shown } = await stored();
    await store.markChallenges({ publicationNumbers: [shown], mark: { ...MARK, verdict }, markedBy: MARKER, at: LATER });
    await expect(store.markChallenges({ publicationNumbers: [shown], mark: null, markedBy: null, at: LATER }))
      .rejects.toMatchObject({ code: "NOT_CLEARABLE" });
    expect(store.challengeOf(shown)).toEqual({ ...MARK, verdict });
    await store.keep({ publicationNumbers: [shown], atlasNumbers: [], keep: true, reason: "owner answer 240a", at: LATER });
    expect(await store.markChallenges({ publicationNumbers: [shown], mark: null, markedBy: null, at: LATER }))
      .toMatchObject([{ publicationNumber: shown, mark: null }]);
    const passing = await stored();
    await passing.store.markChallenges({ publicationNumbers: [passing.shown], mark: { ...MARK, verdict: "pass" },
      markedBy: MARKER, at: LATER });
    expect(await passing.store.markChallenges({ publicationNumbers: [passing.shown], mark: null, markedBy: null, at: LATER }))
      .toMatchObject([{ publicationNumber: passing.shown, mark: null }]);
  });

  it("refuses a held, rejected or withdrawn publication, changing nothing, and clears any", async () => {
    const { store, shown, held } = await stored();
    await expect(store.markChallenges({ publicationNumbers: [shown, held], mark: MARK, markedBy: MARKER, at: LATER }))
      .rejects.toMatchObject({ code: "NOT_MARKABLE" });
    expect(await store.inspectChallenges()).toEqual([]);
    await store.decide({ cardNumber: 300, findingNumber: 1, state: "rejected", atlasNumber: null, decidedAt: LATER });
    await expect(store.markChallenges({ publicationNumbers: [shown], mark: MARK, markedBy: MARKER, at: LATER }))
      .rejects.toMatchObject({ code: "NOT_MARKABLE" });
    expect(await store.markChallenges({ publicationNumbers: [held], mark: null, markedBy: null, at: LATER }))
      .toMatchObject([{ publicationNumber: held, mark: null }]);
  });

  it.each([
    ["an http link", { ...MARK, sourceUrl: "http://guidelines.example.org/velmor" }],
    ["a link that isn't one", { ...MARK, sourceUrl: "guidelines.example.org/velmor" }],
    ["a usual view of two lines", { ...MARK, usualView: "One line.\nAnother line." }],
    ["a usual view too long", { ...MARK, usualView: "x".repeat(301) }],
    ["an untrimmed label", { ...MARK, sourceLabel: " Invented guideline " }],
    ["another verdict", { ...MARK, verdict: "passed" as AtlasChallengeMark["verdict"] }],
    // R7 (the review of #422): text-direction controls and zero-width characters, which can show what a text doesn't hold.
    ["a right-to-left override", { ...MARK, usualView: "Guidelines advise writing to \u202Egro.elpmaxe@namrevo\u202C first." }],
    ["an isolate in the label", { ...MARK, sourceLabel: "Invented guideline \u2066moc.ebutuoy\u2069 (2025)" }],
    ["a zero-width space", { ...MARK, usualView: "Guidelines advise you\u200Btube.com videos." }],
    ["a left-to-right mark", { ...MARK, sourceLabel: "Invented\u200E guideline" }],
    ["an Arabic letter mark", { ...MARK, usualView: "Guidelines advise\u061C zentarine." }],
    ["a byte-order mark in the link", { ...MARK, sourceUrl: "https://guidelines.example.org/\uFEFFvelmor" }],
  ])("refuses %s, before any write", async (_name, mark) => {
    const { store, shown } = await stored();
    await expect(store.markChallenges({ publicationNumbers: [shown], mark, markedBy: MARKER, at: LATER }))
      .rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(await store.inspectChallenges()).toEqual([]);
  });

  // The review of #422, third round: the zero-width non-joiner and joiner that Persian, the Indian scripts and emoji
  // sequences need are taken in the usual view and its label; the link and every other format character stay refused.
  it("takes the joiners Persian, Hindi and emoji sequences need, and reads them back as written", async () => {
    const { store, shown } = await stored();
    const joined = { ...MARK, usualView: JOINED.persian, sourceLabel: JOINED.hindi };
    expect(await store.markChallenges({ publicationNumbers: [shown], mark: joined, markedBy: MARKER, at: LATER }))
      .toMatchObject([{ publicationNumber: shown, mark: { usualView: JOINED.persian, sourceLabel: JOINED.hindi } }]);
    const emoji = { ...MARK, usualView: JOINED.emoji };
    expect(await store.markChallenges({ publicationNumbers: [shown], mark: emoji, markedBy: MARKER, at: LATER }))
      .toMatchObject([{ mark: { usualView: JOINED.emoji } }]);
    await expect(store.markChallenges({ publicationNumbers: [shown], at: LATER, markedBy: MARKER,
      mark: { ...MARK, sourceUrl: "https://guidelines.example.org/velmor\u200D2025" } })).rejects.toMatchObject({ code: "INPUT_INVALID" });
  });

  it("refuses a mark without who marked it, a marker that isn't a digest, and an F number", async () => {
    const { store, shown } = await stored();
    for (const change of [
      { publicationNumbers: [shown], mark: MARK, markedBy: null, at: LATER },
      { publicationNumbers: [shown], mark: MARK, markedBy: OWNER, at: LATER },
      { publicationNumbers: [shown], mark: null, markedBy: MARKER, at: LATER },
      { publicationNumbers: ["F-1001"], mark: MARK, markedBy: MARKER, at: LATER },
      { publicationNumbers: [], mark: MARK, markedBy: MARKER, at: LATER },
    ]) {
      await expect(store.markChallenges(change)).rejects.toBeInstanceOf(AtlasPublicationError);
    }
  });

  it("calls migration 0030's two functions in PostgreSQL, and reads each row back strictly", async () => {
    const row = { mark_publication_number: "P-1001", mark_state: "unreviewed", mark_atlas_number: null, mark_kept: false,
      mark_usual_view: MARK.usualView, mark_source_url: MARK.sourceUrl, mark_source_label: MARK.sourceLabel,
      mark_verdict: MARK.verdict, mark_marked_by: MARKER, mark_marked_at: new Date(LATER) };
    const recorded = (rows: unknown[]) => {
      const store = new PostgresAtlasPublicationStore({ connectionString: "postgres://review@127.0.0.1/askrigor" });
      const calls: Array<{ sql: string; values: unknown[] }> = [];
      (store as unknown as { pool: { query: unknown } }).pool = {
        query: async (sql: string, values: unknown[]) => {
          calls.push({ sql: sql.replace(/\s+/gu, " ").trim(), values });
          return { rows };
        },
      };
      return { store, calls };
    };
    const { store, calls } = recorded([row]);
    expect(await store.markChallenges({ publicationNumbers: ["P-1001"], mark: MARK, markedBy: MARKER, at: LATER }))
      .toEqual([{ publicationNumber: "P-1001", state: "unreviewed", atlasNumber: null, kept: false,
        mark: { ...MARK, markedBy: MARKER, markedAt: LATER } }]);
    expect(calls[0]!.sql).toBe("SELECT * FROM living_evidence.mark_atlas_challenges($1::text[], $2::text, $3::text, " +
      "$4::text, $5::text, $6::text, $7::timestamptz)");
    expect(calls[0]!.values).toEqual([["P-1001"], MARK.usualView, MARK.sourceUrl, MARK.sourceLabel, "fail", MARKER, LATER]);
    await store.markChallenges({ publicationNumbers: ["P-1001"], mark: null, markedBy: null, at: LATER });
    expect(calls[1]!.values).toEqual([["P-1001"], null, null, null, null, null, LATER]);
    await store.inspectChallenges();
    expect(calls[2]!.sql).toBe("SELECT * FROM living_evidence.inspect_atlas_challenges()");
    for (const { sql } of calls) expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b|FROM living_evidence\.atlas_publications\b/u);
    // A row that doesn't read as migration 0030 holds it is refused; the functions' refusal is the store's error.
    await expect(recorded([{ ...row, mark_source_url: "http://x.example.org" }]).store.inspectChallenges())
      .rejects.toBeInstanceOf(AtlasPublicationError);
    const failing = new PostgresAtlasPublicationStore({ connectionString: "postgres://review@127.0.0.1/askrigor" });
    (failing as unknown as { pool: { query: unknown } }).pool = {
      query: async () => { throw new Error("ATLAS_PUBLICATION_NOT_MARKABLE"); },
    };
    await expect(failing.markChallenges({ publicationNumbers: ["P-1001"], mark: MARK, markedBy: MARKER, at: LATER }))
      .rejects.toMatchObject({ code: "NOT_MARKABLE" });
  });
});

describe("mark_challenge, clear_challenge and list_challenges", () => {
  const review = async () => {
    const { store, shown, kept, held } = await stored();
    return { store, shown, kept, held,
      run: new AtlasChallengeReview({ publications: store, now: () => new Date(LATER) }) };
  };
  const mark = (items: string[]) => ({ action: "mark_challenge" as const, items, usual_view: MARK.usualView,
    usual_view_source_url: MARK.sourceUrl, usual_view_source_label: MARK.sourceLabel,
    quick_answer_verdict: MARK.verdict, reviewer: OWNER });

  it("keeps who marked it only as the reviewer login's digest", async () => {
    expect(MARKER).toMatch(/^reviewer:[0-9a-f]{16}$/u);
    expect(MARKER).not.toContain(OWNER);
    expect(challengeMarker("auth0|another")).not.toBe(MARKER);
    const { run, shown } = await review();
    const marked = await run.run(mark([shown.toLowerCase()]));
    expect(marked).toMatchObject({ ok: true, outcome: "challenge_marked", challenges: { items: [{ publication: shown,
      usualView: MARK.usualView, usualViewSourceUrl: MARK.sourceUrl, usualViewSourceLabel: MARK.sourceLabel,
      quickAnswerVerdict: "fail", markedBy: MARKER, markedOn: "2026-11-06", kept: false }] } });
    expect(marked.text).toContain("Marking shows nothing");
    expect(JSON.stringify(marked)).not.toContain(OWNER);
  });

  it("lists every marked publication, kept or shown, and clears them", async () => {
    const { run, shown, kept } = await review();
    await run.run(mark([shown, kept]));
    const listed = await run.run({ action: "list_challenges" });
    expect(listed.challenges!.items.map(({ publication, kept: isKept }) => [publication, isKept]))
      .toEqual([[shown, false], [kept, true]]);
    expect(await run.run({ action: "clear_challenge", items: [kept] }))
      .toMatchObject({ ok: true, outcome: "challenge_cleared", challenges: { items: [{ publication: kept, usualView: null }] } });
    expect((await run.run({ action: "list_challenges" })).challenges!.items.map(({ publication }) => publication))
      .toEqual([shown]);
    expect((await run.run({ action: "list_challenges", items: [shown] })).ok).toBe(false);
  });

  it.each([
    ["no items", { items: [] }],
    ["an F number", { items: ["F-1001"] }],
    ["no verdict", { quick_answer_verdict: undefined }],
    ["no source link", { usual_view_source_url: undefined }],
    ["an http link", { usual_view_source_url: "http://guidelines.example.org/velmor" }],
    ["a YouTube link", { usual_view_source_url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }],
    ["contact details", { usual_view: "Most guidelines advise writing to velmor@example.org first." }],
    ["a card reference", { usual_view_source_label: "As card ARF-0042 put it" }],
    ["a usual view of two lines", { usual_view: "One line.\nAnother." }],
    ["no reviewer", { reviewer: undefined }],
    // R7: an address written reversed under a right-to-left override, which displays as an address.
    ["a reversed address under an override", { usual_view: "Guidelines advise writing to \u202Egro.elpmaxe@namrevo\u202C first." }],
    ["a reversed YouTube host in the label", { usual_view_source_label: "Invented guideline \u202Emoc.ebutuoy\u202C (2025)" }],
    // A joiner is taken (the third round), but never hides what the pages don't show: each text is read without it.
    ["a zero-width joiner hiding a YouTube address", { usual_view: "Guidelines advise you\u200Dtube.com videos." }],
    ["a zero-width non-joiner hiding an e-mail address", { usual_view: "Guidelines advise writing to velmor\u200C@example.org." }],
    ["a zero-width joiner hiding a card reference", { usual_view_source_label: "As card ARF-\u200D0042 put it" }],
    ["a zero-width space", { usual_view: "Guidelines advise zentarine\u200B at 40 mg." }],
    ["a word joiner", { usual_view_source_label: "Invented\u2060guideline" }],
    // R6: links a browser opens as YouTube, whatever their words.
    ["a percent-encoded full stop in the host", { usual_view_source_url: "https://youtube%2Ecom/watch?v=aaaaaaaaaaa" }],
    ["full-width letters in the host", { usual_view_source_url: "https://ｙｏｕｔｕｂｅ.com/watch?v=aaaaaaaaaaa" }],
    ["a YouTube subdomain", { usual_view_source_url: "https://m.youtube.com/watch?v=aaaaaaaaaaa" }],
    ["youtu.be", { usual_view_source_url: "https://youtu.be/aaaaaaaaaaa" }],
    ["youtube-nocookie.com", { usual_view_source_url: "https://www.youtube-nocookie.com/embed/aaaaaaaaaaa" }],
    // The third round: YouTube's older embedded player's host.
    ["youtube.googleapis.com", { usual_view_source_url: "https://youtube.googleapis.com/v/aaaaaaaaaaa" }],
  ])("refuses %s, changing nothing", async (_name, change) => {
    const { run, store, shown } = await review();
    const result = await run.run({ ...mark([shown]), ...change } as Parameters<AtlasChallengeReview["run"]>[0]);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(await store.inspectChallenges()).toEqual([]);
  });

  it.each([
    ["a Persian usual view with its zero-width non-joiners", { usual_view: JOINED.persian }],
    ["a Hindi label with a zero-width joiner", { usual_view_source_label: JOINED.hindi }],
    ["an emoji sequence joined by a zero-width joiner", { usual_view: JOINED.emoji }],
  ])("takes %s, as written, and shows it on the finding's page", async (_name, change) => {
    const { run, store, shown } = await review();
    const result = await run.run({ ...mark([shown]), ...change } as Parameters<AtlasChallengeReview["run"]>[0]);
    expect(result.ok).toBe(true);
    const written = Object.values(change)[0]!;
    expect([store.challengeOf(shown)?.usualView, store.challengeOf(shown)?.sourceLabel]).toContain(written);
    const source = new InMemoryAtlasPageSource({ publications: store, canonical: new InMemoryAtlasCanonicalStore() });
    // The page writes the usual view without its closing full stop.
    expect(renderAtlasFinding((await loadAtlasFinding(source, shown))!)).toContain(written.replace(/\.$/u, ""));
  });

  it("shows the mark's texts escaped, and its link as a browser opens it, with no markup of its own", async () => {
    const { run, store, shown } = await review();
    const link = "https://guidelines.example.org/a\"onmouseover=\"alert(1)'<x>";
    expect((await run.run({ ...mark([shown]), usual_view: "Guidelines <b>advise</b> \"40 mg\" & <img src=x onerror=alert(1)>",
      usual_view_source_label: "Label <i>x</i> 'q'", usual_view_source_url: link })).ok).toBe(true);
    const source = new InMemoryAtlasPageSource({ publications: store, canonical: new InMemoryAtlasCanonicalStore() });
    const page = renderAtlasFinding((await loadAtlasFinding(source, shown))!);
    expect(page).not.toContain("<img");
    expect(page).not.toContain("<b>advise");
    expect(page).not.toContain("<i>x");
    expect(page).toContain(`href="${new URL(link).href.replace(/&/gu, "&amp;").replace(/'/gu, "&#39;")}"`);
    expect(page).not.toContain("onmouseover=\"");
  });

  // The review of #422's samples: real guidelines' and journals' addresses pass the refusals, and a phone number doesn't.
  it.each([
    "https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063",
    "https://academic.oup.com/eurheartj/article/44/38/3627/7246292",
    "https://pubmed.ncbi.nlm.nih.gov/31415926/",
    "https://www.nice.org.uk/guidance/ng202",
    "https://jcsm.aasm.org/doi/10.5664/jcsm.7640",
    "https://www.acpjournals.org/doi/10.7326/M23-1234",
    "https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD001106.pub4/full",
    "https://doi.org/10.1016/S0140-6736(23)01234-5",
    "https://www.who.int/publications/i/item/9789240034228",
    "https://www.ncbi.nlm.nih.gov/books/NBK558906/",
  ])("takes the guideline link %s", async (link) => {
    const { run, store, shown } = await review();
    expect((await run.run({ ...mark([shown]), usual_view_source_url: link,
      usual_view: "Guidelines advise CPAP every night for an AHI of 15 or more (2019 statement, page 1234-5678)." })).ok)
      .toBe(true);
    expect(store.challengeOf(shown)?.sourceUrl).toBe(new URL(link).href);
  });

  it("refuses a phone number in the label", async () => {
    const { run, store, shown } = await review();
    expect((await run.run({ ...mark([shown]),
      usual_view_source_label: "AASM clinical practice guideline (2019), call 1-800-555-0199" })).ok).toBe(false);
    expect(await store.inspectChallenges()).toEqual([]);
  });

  it("keeps a link as a browser opens it", async () => {
    const { run, store, shown } = await review();
    expect((await run.run({ ...mark([shown]), usual_view_source_url: "https://Guidelines.Example.org/velmor%2Dsyndrome" }))
      .ok).toBe(true);
    expect(store.challengeOf(shown)?.sourceUrl).toBe(new URL("https://Guidelines.Example.org/velmor%2Dsyndrome").href);
  });

  it("refuses to clear a finding shown for its challenge, naming it and what to do first (R8)", async () => {
    const { run, store, shown, kept } = await review();
    await run.run(mark([shown, kept]));
    const refused = await run.run({ action: "clear_challenge", items: [shown, kept] });
    expect(refused).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(refused.text).toBe(`${shown} shows unreviewed only because it challenges the usual view, with the ` +
      "quick-answer verdict headline or fail, so its mark stays while it shows: without it, its page would say a quick " +
      "AI answer misses it. Keep it for research first (keep_for_research), then clear its mark; nothing was changed.");
    expect((await store.inspectChallenges()).map(({ publicationNumber }) => publicationNumber)).toEqual([shown, kept]);
  });

  it("refuses a held publication, and a mark's texts on clear_challenge", async () => {
    const { run, store, shown, held } = await review();
    const refused = await run.run(mark([shown, held]));
    expect(refused).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(refused.text).toContain("can't be marked");
    expect(await store.inspectChallenges()).toEqual([]);
    expect((await run.run({ action: "clear_challenge", items: [shown], usual_view: MARK.usualView })).ok).toBe(false);
  });
});

// Through the tool, over HTTP with the owner's reviewer login, as the connector sends it: the actions are in the
// runtime enum only and their inputs in later_inputs, so the published tool list stays as it is (owner answer 189a).
describe("through review_research_contribution", () => {
  const resource = new URL("https://mcp.askrigor.example/mcp");
  const issuerUrl = new URL("https://identity.askrigor.example/");
  const servers: HttpServer[] = [];
  const clients: Client[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it("marks, lists and clears with later_inputs, for the reviewer login alone", async () => {
    expect(laterInputNames("review_research_contribution")).toEqual(expect.arrayContaining(["items", "usual_view",
      "usual_view_source_url", "usual_view_source_label", "quick_answer_verdict"]));
    const { store, shown, kept } = await stored();
    const atlas = new AtlasReview({
      store: new InMemoryAtlasReviewStore(), reader: new InMemoryAtlasCanonicalStore(), inbox: {} as never,
      version: "0.1.0", build: "unknown", protocols: async () => [], now: () => new Date(LATER), publications: store,
    });
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "atlas-challenges-test-key" };
    const server = createAskRigorHttpServer({
      publicServerEnabled: true,
      oauthResourceServer: createJwtOAuthResourceServer({ resourceUrl: resource, issuerUrl,
        jwks: createLocalJWKSet({ keys: [jwk] }), allowedClientIds: ["chatgpt-client"], reviewerSubjects: [OWNER] }),
      atlasReview: atlas,
      atlasReviewEnabled: true,
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const connect = async (subject: string) => {
      const token = await new SignJWT({ iss: issuerUrl.href, aud: resource.href, exp: Math.floor(Date.now() / 1_000) + 300,
        client_id: "chatgpt-client", scope: "cases:review", sub: subject })
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(privateKey);
      const client = new Client({ name: "atlas-challenges-test", version: "1.0.0" });
      clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", base),
        { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
      return client;
    };
    const owner = await connect(OWNER);
    const call = (args: Record<string, unknown>, client = owner) =>
      client.callTool({ name: "review_research_contribution", arguments: args });
    const later = { items: [shown, kept], usual_view: MARK.usualView, usual_view_source_url: MARK.sourceUrl,
      usual_view_source_label: MARK.sourceLabel, quick_answer_verdict: "headline" };
    const marked = await call({ action: "mark_challenge", later_inputs: later });
    expect(marked.isError).not.toBe(true);
    expect(marked.structuredContent).toMatchObject({ ok: true, outcome: "challenge_marked",
      challenges: { items: [{ publication: shown, quickAnswerVerdict: "headline", markedBy: MARKER },
        { publication: kept, kept: true, markedBy: MARKER }] } });
    expect(JSON.stringify(marked)).not.toContain(OWNER);
    expect(store.isKept(kept)).toBe(true);
    const listed = await call({ action: "list_challenges" });
    expect((listed.structuredContent as { challenges: { items: unknown[] } }).challenges.items).toHaveLength(2);
    // The mark's inputs go only with mark_challenge.
    const misplaced = await call({ action: "keep_for_research", reason: "owner answer 240a",
      later_inputs: { items: [shown], usual_view: MARK.usualView } });
    expect(misplaced.isError).toBe(true);
    expect(JSON.stringify(misplaced.content)).toContain("keep_for_research does not take usual_view");
    // Shown for its challenge (a headline), its mark stays while it shows (R8); the kept one's clears.
    const stays = await call({ action: "clear_challenge", later_inputs: { items: [shown] } });
    expect(stays.isError).toBe(true);
    expect(JSON.stringify(stays.content)).toContain("Keep it for research first (keep_for_research)");
    expect((await call({ action: "clear_challenge", later_inputs: { items: [kept] } })).structuredContent)
      .toMatchObject({ ok: true, outcome: "challenge_cleared" });
    expect((await store.inspectChallenges()).map(({ publicationNumber }) => publicationNumber)).toEqual([shown]);
    // Another login can't mark: the owner's review admits only its reviewer subjects.
    const other = await connect("auth0|someone-else");
    const refused = await call({ action: "mark_challenge", later_inputs: { ...later, items: [kept] } }, other);
    expect(refused.isError).toBe(true);
    expect((await store.inspectChallenges()).map(({ publicationNumber }) => publicationNumber)).toEqual([shown]);
  });
});

// R6 (the review of #422): the pages' last check reads where each of a page's links goes, as a browser opens it.
describe("the page guard and YouTube hosts", () => {
  it.each([
    ["https://youtube%2Ecom/watch?v=aaaaaaaaaaa", true],
    ["https://ｙｏｕｔｕｂｅ.com/watch?v=aaaaaaaaaaa", true],
    ["https://m.youtube.com/watch?v=aaaaaaaaaaa", true],
    ["https://youtu.be/aaaaaaaaaaa", true],
    ["https://www.youtube-nocookie.com/embed/aaaaaaaaaaa", true],
    ["https://youtube.googleapis.com/v/aaaaaaaaaaa", true],
    ["https://www.youtube.googleapis.com/v/aaaaaaaaaaa", true],
    ["https://you\u200Dtube.com/watch?v=aaaaaaaaaaa", true],
    ["https://guidelines.example.org/youtube-policy", false],
    ["https://storage.googleapis.com/a-bucket/youtube.googleapis.txt", false],
    ["/atlas/findings/P-1001", false],
  ])("reads %s", (link, youtube) => {
    expect(opensYouTube(link)).toBe(youtube);
    const page = `<p><a href="${link.replace(/&/gu, "&amp;")}">a source</a></p>`;
    expect(atlasPageProblems(page).includes("youtube_link")).toBe(youtube);
  });

  it("reads a host, not words: another site whose name ends in youtube.com opens no YouTube page", () => {
    expect(opensYouTube("https://notyoutube.com/watch")).toBe(false);
    expect(opensYouTube("https://notyoutube.googleapis.com/v/aaaaaaaaaaa")).toBe(false);
  });

  it("reads a page as a reader sees it: a format character hides no YouTube address, no card and no script", () => {
    expect(atlasPageProblems("<p>Watch you\u200Dtube.com/watch?v=aaaaaaaaaaa</p>")).toEqual(["youtube_link"]);
    expect(atlasPageProblems("<p>As card ARF-\u200B0042 put it</p>")).toEqual(["card_reference"]);
    expect(atlasPageProblems("<p>بیشتر راهنماها می\u200Cگویند</p>")).toEqual([]);
  });

  // A limit, stated: only the host a link names is read, never where it leads.
  it("doesn't follow a link shortener", () => {
    expect(opensYouTube("https://bit.ly/3abcdEf")).toBe(false);
  });
});

// F (the review of #422, third round): a stored link a page would write, and that opens YouTube by its host, is left out
// of the page, as a link whose words would stop it already was, so that no one stored link stops the whole page; the
// page's last check stays. Rows like these were stored before youtube.googleapis.com was read as YouTube.
describe("stored links a page leaves out", () => {
  const YOUTUBE_EMBED = "https://youtube.googleapis.com/t/123";

  it("leaves out a forum thread whose host serves YouTube, and serves the page with the other thread", async () => {
    const { store, shown } = await stored();
    const memory = new InMemoryAtlasPageSource({ publications: store, canonical: new InMemoryAtlasCanonicalStore() });
    // A page source returning a version 3 row whose forum signal holds that link, which no store takes today.
    const source: AtlasPageSource = { read: (work) => memory.read((reads) => work({ ...reads,
      listPublications: async (query) => (await reads.listPublications(query)).map((row): AtlasPagePublication =>
        row.published === null ? row : { ...row, published: { ...row.published, schema: ATLAS_PUBLICATION_SCHEMA_V3,
          forum_signal: { communities: ["r/inventedvelmor"], threads_read: 2,
            threads: ["https://www.reddit.com/comments/abc123/", YOUTUBE_EMBED],
            people: { better: 3, no_change: 1, worse: 0, mixed: 0 }, report_quality: { detailed: 1, measured: 1, bare: 2 },
            studies: "support_not_located" } } }) })) };
    const page = renderAtlasFinding((await loadAtlasFinding(source, shown))!);
    expect(page).toContain('href="https://www.reddit.com/comments/abc123/"');
    expect(page).not.toContain("googleapis");
    expect(atlasPageProblems(page)).toEqual([]);
  });

  it("leaves out a glance row with a source whose host serves YouTube, and shows the others", async () => {
    const glance = new InMemoryAtlasGlanceRows();
    const row = { categoryKey: "health", subcategoryKey: "gut-health", rowClass: "practitioner" as const,
      what: "An invented surgeon's published series for an invented fistula", result: "783 of 875 healed",
      comparison: null, followUp: null, limits: "No matched comparison.", namesAPerson: false };
    const ids = [
      await glance.propose({ ...row, sources: ["https://journal.example/articles/invented-series"] }, AT),
      await glance.propose({ ...row, what: "Another invented series", sources: ["PMID: 12345678", YOUTUBE_EMBED] }, AT),
    ];
    for (const id of ids) await glance.setState(id, "shown", AT);
    const source = new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore(), glance });
    const page = renderAtlasSubcategory((await loadAtlasSubcategory(source, "gut-health"))!);
    expect(page).toContain("An invented surgeon");
    expect(page).not.toContain("Another invented series");
    expect(page).not.toContain("googleapis");
    expect(atlasPageProblems(page)).toEqual([]);
  });
});
