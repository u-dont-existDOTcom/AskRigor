import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ATLAS_PUBLICATION_SCHEMA,
  AtlasPublicationError,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasPublicationStore,
  InMemoryAtlasReviewStore,
  PostgresAtlasPublicationStore,
  type AtlasChallengeMark,
  type AtlasPublicationDraft,
  type AtlasPublishedFinding,
} from "@askrigor/evidence-repository";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { AtlasChallengeReview, challengeMarker } from "../apps/research-mcp/src/atlas/challenge-review.js";
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
    const cleared = await store.markChallenges({ publicationNumbers: [shown], mark: null, markedBy: null, at: LATER });
    expect(cleared).toEqual([{ publicationNumber: shown, state: "unreviewed", atlasNumber: null, kept: false, mark: null }]);
    expect((await store.inspectChallenges()).map(({ publicationNumber }) => publicationNumber)).toEqual([kept]);
    expect(store.challengeOf(shown)).toBeNull();
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
  ])("refuses %s, before any write", async (_name, mark) => {
    const { store, shown } = await stored();
    await expect(store.markChallenges({ publicationNumbers: [shown], mark, markedBy: MARKER, at: LATER }))
      .rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(await store.inspectChallenges()).toEqual([]);
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
  ])("refuses %s, changing nothing", async (_name, change) => {
    const { run, store, shown } = await review();
    const result = await run.run({ ...mark([shown]), ...change } as Parameters<AtlasChallengeReview["run"]>[0]);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(await store.inspectChallenges()).toEqual([]);
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
    expect((await call({ action: "clear_challenge", later_inputs: { items: [shown] } })).structuredContent)
      .toMatchObject({ ok: true, outcome: "challenge_cleared" });
    expect((await store.inspectChallenges()).map(({ publicationNumber }) => publicationNumber)).toEqual([kept]);
    // Another login can't mark: the owner's review admits only its reviewer subjects.
    const other = await connect("auth0|someone-else");
    const refused = await call({ action: "mark_challenge", later_inputs: { ...later, items: [shown] } }, other);
    expect(refused.isError).toBe(true);
    expect((await store.inspectChallenges()).map(({ publicationNumber }) => publicationNumber)).toEqual([kept]);
  });
});
