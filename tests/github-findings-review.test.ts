import { describe, expect, it } from "vitest";

import { findingsCardDigest, findingsCardSchema } from "../apps/research-mcp/src/findings/card.js";
import {
  DECISION_MARKER,
  GitHubFindingsReview,
  decisionComment,
  findingsCardNumber,
  findingsCardSha256,
  parseDecisionComment,
  parseFindingsRecordBody,
  reconcileFindingsCard,
  type FindingsCardRead,
  type StoredCardDecision,
} from "../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService } from "../apps/research-mcp/src/findings/service.js";
import { GitHubApiError } from "../apps/research-mcp/src/lessons/github-app.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { LOW_DOSE_CARD, VELMOR_CARD } from "./helpers/atlas-scenario.js";
import { FakeGitHub, FINDINGS_ISSUES_ROOT } from "./helpers/fake-github-findings.js";

// The owner's review of the private findings inbox (Atlas phase 2 design, sections 1, 3 and 7): cards and their later
// saves read exactly as the library wrote them, decision comments with the askrigor-findings-decision marker, the
// reviewed label and closing, and reconciling on the next inspect or list. The cards are the invented Velmor examples.

const SECRET = "github-findings-review-test-secret-0123456789";
const NOW = new Date("2026-11-04T09:00:00.000Z");
const tokenProvider = { getToken: async () => "findings-token-fixture" };

function library(github: FakeGitHub) {
  return new FindingsSaveService({
    receiptSecret: () => SECRET,
    limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
    queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
    protocols: async () => [{ name: "HRP", version: "20.6.31", sha256: "a".repeat(64) }],
    version: "0.1.0",
    build: "0123abc",
    now: () => NOW,
  });
}

async function save(github: FakeGitHub, card: object, contributor: string, bases: string[] = ["full_text_audit"]) {
  const parsed = findingsCardSchema.parse(card);
  return library(github).save({
    findings_card: card,
    contributor,
    finalization_receipt: issueResearchReceipt("finalization", {
      status: "ready", target: contributor.slice(0, 12), findings: findingsCardDigest(parsed), bases, receipts: 3,
    }, { secret: SECRET, now: () => NOW }),
  }, { surface: "/mcp", toolCatalogSha256: "c".repeat(64) });
}

const review = (github: FakeGitHub) =>
  new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY });

async function readFound(github: FakeGitHub, number: number): Promise<FindingsCardRead> {
  const lookup = await review(github).readCard(number);
  if (lookup.status !== "found") throw new Error(`card ${number}: ${lookup.status}`);
  return lookup.card;
}

describe("reading a card and its later saves", () => {
  it("reads a card with its later saves, as the library wrote them, and hashes them", async () => {
    const github = new FakeGitHub();
    await save(github, LOW_DOSE_CARD, "1".repeat(64));
    const first = await readFound(github, 42);
    expect(first).toMatchObject({ number: 42, state: "open", occurrences: [], decisions: [] });
    expect(first.labels).toEqual(["findings-card", "pending-review", "beyond-quick-answer"]);
    expect(first.record.card.findings[0]).toMatchObject({ claim: LOW_DOSE_CARD.findings[0]!.claim,
      verified_bases: ["full_text_audit"] });
    const before = findingsCardSha256(42, first.record, first.occurrences);
    expect(before).toMatch(/^[a-f0-9]{64}$/u);

    // Another person's save of the same question and claims joins the card as an occurrence, which changes the hash.
    await save(github, { ...LOW_DOSE_CARD, findings: [{ ...LOW_DOSE_CARD.findings[0]!, certainty: "moderate" }] },
      "2".repeat(64));
    const second = await readFound(github, 42);
    expect(second.occurrences).toHaveLength(1);
    expect(second.occurrences[0]!.card.findings[0]!.certainty).toBe("moderate");
    expect(findingsCardSha256(42, second.record, second.occurrences)).not.toBe(before);
    // A decision comment, or any other comment, does not.
    github.comments.get(42)!.push({ id: 900, body: "An owner's note." });
    github.comments.get(42)!.push({ id: 901, body: decisionComment({ itemKind: "finding", itemNumber: 1,
      decision: "rejected", publicNumber: null, decidedAt: NOW.toISOString() }) });
    const third = await readFound(github, 42);
    expect(findingsCardSha256(42, third.record, third.occurrences))
      .toBe(findingsCardSha256(42, second.record, second.occurrences));
    expect(third.decisions).toEqual([{ itemKind: "finding", itemNumber: 1, decision: "rejected", publicNumber: null,
      decidedAt: NOW.toISOString() }]);
    // The hash binds the card's number too.
    expect(findingsCardSha256(43, third.record, third.occurrences))
      .not.toBe(findingsCardSha256(42, third.record, third.occurrences));
  });

  it("refuses a record that does not read as the library wrote it", async () => {
    const github = new FakeGitHub();
    await save(github, LOW_DOSE_CARD, "1".repeat(64));
    const original = github.issue(42).body;
    const tampered = (edit: (body: string) => string) => {
      github.issue(42).body = edit(original);
      return review(github).readCard(42);
    };
    // The readable copy above the record is for people; the record is what the review reads.
    const inRecord = (body: string, from: string, to: string) => {
      const start = body.indexOf("## Full record");
      return body.slice(0, start) + body.slice(start).replace(from, to);
    };
    expect((await tampered((body) => body.replace("20 of 100 against 19 of 100", "20 of 100 against 9 of 100")))
      .status).toBe("found");
    // The claim, a source or a tag edited in the record; its JSON broken; a field the library never writes; the save
    // time; the marker itself.
    for (const edit of [
      (body: string) => inRecord(body, "20 of 100 against 19 of 100", "20 of 100 against 9 of 100"),
      (body: string) => body.replace("\"PMID: 40123456\"", "\"PMID: 40123457\""),
      (body: string) => body.replace("\"full_text_read\"", "\"overlooked_study\""),
      (body: string) => body.replace("\"schema\": \"askrigor.findings-card.v1\",", "\"schema\": \"askrigor.findings-card.v1\""),
      (body: string) => body.replace("\"schema\": \"askrigor.findings-card.v1\",",
        "\"schema\": \"askrigor.findings-card.v1\", \"thread\": \"x\","),
      (body: string) => body.replace(/"saved_at": "[^"]+"/u, "\"saved_at\": \"2026-11-05T09:00:00.000Z\""),
      (body: string) => body.replace(/askrigor-findings-card:([A-Za-z0-9_-]+)/u, "askrigor-findings-card:e30"),
    ]) {
      expect(await tampered(edit)).toEqual({ status: "unreadable" });
    }
    // GitHub's editor saving the body with CRLF line breaks changes nothing the record holds.
    expect((await tampered((body) => body.replace(/\n/gu, "\r\n"))).status).toBe("found");
    github.issue(42).body = original;
    expect((await review(github).readCard(42)).status).toBe("found");

    // A tampered later save makes the card unreadable too.
    await save(github, LOW_DOSE_CARD, "2".repeat(64));
    const [occurrence] = github.comments.get(42)!;
    occurrence!.body = occurrence!.body.replace("PMID: 40123456", "PMID: 40123457");
    expect(await review(github).readCard(42)).toEqual({ status: "unreadable" });
  });

  it("reads the save time and question of a card stored without its YouTube data, whose claims it cannot re-hash", () => {
    // A card whose claim held a YouTube link: the library stored its text with a placeholder (stored_without).
    const record = {
      schema: "askrigor.findings-card.v1",
      card: {
        ...findingsCardSchema.parse(VELMOR_CARD),
        findings: [{ ...findingsCardSchema.parse(VELMOR_CARD).findings[0]!, sources: ["10.0000/synthetic-velmor-a"],
          claim: "Zentarine halved the tremor in one invented trial (YouTube video).", youtube_videos: 1 }],
      },
      card_sha256: "d".repeat(64),
      stored_without: ["youtube_video_ids_and_links"],
      stamp: {
        saved_at: NOW.toISOString(), askrigor_version: "0.1.0", askrigor_build: "0123abc", protocols: [],
        tool_catalog_sha256: "c".repeat(64), surface: "/mcp", research: { finalized_at: NOW.toISOString() },
      },
    };
    const marker = Buffer.from(JSON.stringify({ fingerprint: "e".repeat(64), receipt_sha256: "f".repeat(64),
      saved_at: NOW.toISOString() }), "utf8").toString("base64url");
    const body = `## Question\n\nx\n\n## Full record\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n\n` +
      `<!-- askrigor-findings-card:${marker} -->`;
    expect(parseFindingsRecordBody(body, "card")).toMatchObject({ record: { card_sha256: "d".repeat(64) } });
    // Without the placeholder, the fingerprint must match.
    expect(parseFindingsRecordBody(body.replace(" (YouTube video)", ""), "card")).toBe("tampered");
    expect(parseFindingsRecordBody("A comment with no marker.", "card")).toBeUndefined();
  });

  it("finds no card for a missing issue, a pull request or an issue that is not a findings card", async () => {
    const github = new FakeGitHub();
    await save(github, LOW_DOSE_CARD, "1".repeat(64));
    expect(await review(github).readCard(77)).toEqual({ status: "not_found" });
    github.issues.push({ number: 50, title: "A pull request", body: github.issue(42).body, state: "open",
      labels: [{ name: "findings-card" }], pull_request: {} });
    expect(await review(github).readCard(50)).toEqual({ status: "not_found" });
    github.issues.push({ number: 51, title: "An issue", body: "Hello.", state: "open", labels: [] });
    expect(await review(github).readCard(51)).toEqual({ status: "not_found" });
    github.issue(42).labels = [{ name: "pending-review" }];
    expect(await review(github).readCard(42)).toEqual({ status: "not_found" });
  });

  it("throws GitHub's outages as retryable, with no upstream body", async () => {
    const github = new FakeGitHub();
    await save(github, LOW_DOSE_CARD, "1".repeat(64));
    github.failWith = 503;
    const error = await review(github).readCard(42).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ code: "github_service_unavailable", retryable: true });
    expect(String((error as Error).message)).not.toContain("private upstream body");
  });

  it("lists the open cards with their records, and marks one whose record does not read", async () => {
    const github = new FakeGitHub();
    await save(github, LOW_DOSE_CARD, "1".repeat(64));
    await save(github, VELMOR_CARD, "2".repeat(64), ["full_text_audit", "none"]);
    // A card stored without its YouTube data is still bound to its question and claims by the marker's fingerprint.
    const body = github.issue(43).body;
    const start = body.indexOf("## Full record");
    github.issue(43).body = body.slice(0, start) + body.slice(start).replace("halved the tremor score", "cut the tremor score");
    const open = await review(github).openCards();
    expect(open.map(({ number, comments, record }) => [number, comments, record?.card.question ?? null])).toEqual([
      [42, 0, LOW_DOSE_CARD.question],
      [43, 0, null],
    ]);
    expect(findingsCardNumber("arf-0042")).toBe(42);
    expect(findingsCardNumber(" ARF-142 ")).toBe(142);
    for (const value of ["ARF-0", "ARF0042", "F-1001", "ARF-0042x"]) expect(findingsCardNumber(value)).toBeUndefined();
  });
});

describe("decisions on the card", () => {
  const decided = (itemNumber: number, decision: StoredCardDecision["decision"], publicNumber: string | null):
    StoredCardDecision => ({ itemKind: "finding", itemNumber, decision, publicNumber, decidedAt: NOW.toISOString() });

  it("writes a decision comment with its marker and no reason, and reads it back", () => {
    const comment = decisionComment({ itemKind: "finding", itemNumber: 1, decision: "accepted",
      publicNumber: "F-1007", decidedAt: NOW.toISOString() });
    expect(comment.split("\n").slice(0, 3)).toEqual(["## Owner's decision", "", "Finding 1: accepted as F-1007, checked, " +
      "4 Nov 2026."]);
    expect(comment).toMatch(new RegExp(`\\n<!-- ${DECISION_MARKER}:[A-Za-z0-9_-]+ -->$`, "u"));
    expect(parseDecisionComment(comment)).toEqual({ itemKind: "finding", itemNumber: 1, decision: "accepted",
      publicNumber: "F-1007", decidedAt: NOW.toISOString() });
    expect(decisionComment({ itemKind: "open_lead", itemNumber: 2, decision: "accepted_as_lead", publicNumber: "F-1008",
      decidedAt: NOW.toISOString() })).toContain("Open lead 2: accepted as F-1008, a lead, 4 Nov 2026.");
    expect(decisionComment(decided(3, "rechecked", "F-1001"))).toContain("Finding 3: a re-check of F-1001, 4 Nov 2026.");
    // A marker whose decision and number disagree is not a decision.
    const forged = comment.replace(/:[A-Za-z0-9_-]+ -->$/u, `:${Buffer.from(JSON.stringify({ item_kind: "finding",
      item_number: 1, decision: "rejected", public_number: "F-1007", decided_at: NOW.toISOString() })).toString("base64url")} -->`);
    expect(parseDecisionComment(forged)).toBeUndefined();
  });

  it("posts each missing decision once, then labels the card reviewed and closes it when every finding is decided", async () => {
    const github = new FakeGitHub();
    await save(github, VELMOR_CARD, "1".repeat(64), ["full_text_audit", "none"]);
    const inbox = review(github);
    let card = await readFound(github, 42);
    const one = [decided(1, "accepted", "F-1001")];
    expect(await reconcileFindingsCard(inbox, { ...card, findings: 2 }, one))
      .toEqual({ posted: 1, reviewed: false, synced: true });
    card = await readFound(github, 42);
    // Matched by its marker, the same decision is not posted again.
    expect(await reconcileFindingsCard(inbox, { ...card, findings: 2 }, one))
      .toEqual({ posted: 0, reviewed: false, synced: true });
    expect(github.issue(42)).toMatchObject({ state: "open" });

    const both = [...one, decided(2, "rejected", null)];
    expect(await reconcileFindingsCard(inbox, { ...card, findings: 2 }, both))
      .toEqual({ posted: 1, reviewed: true, synced: true });
    expect(github.issue(42)).toMatchObject({ state: "closed", state_reason: "completed" });
    expect(github.issue(42).labels.map(({ name }) => name)).toEqual(["findings-card", "beyond-quick-answer", "reviewed"]);
    expect((github.comments.get(42) ?? []).map(({ body }) => body.split("\n")[2])).toEqual([
      "Finding 1: accepted as F-1001, checked, 4 Nov 2026.",
      "Finding 2: rejected, 4 Nov 2026.",
    ]);
    // Read again, the closed and labeled card needs nothing more; an open lead left undecided does not hold it open.
    const writes = github.writes.length;
    card = await readFound(github, 42);
    expect(await reconcileFindingsCard(inbox, { ...card, findings: 2 }, both))
      .toEqual({ posted: 0, reviewed: false, synced: true });
    expect(github.writes).toHaveLength(writes);
  });

  it("leaves what a failed GitHub write did not do to the next inspect or list", async () => {
    const github = new FakeGitHub();
    await save(github, LOW_DOSE_CARD, "1".repeat(64));
    const inbox = review(github);
    const card = await readFound(github, 42);
    const decisions = [decided(1, "accepted", "F-1003")];
    github.failWhen = ({ method, url }) => method === "PATCH" && url === `${FINDINGS_ISSUES_ROOT}/42` ? 502 : undefined;
    expect(await reconcileFindingsCard(inbox, { ...card, findings: 1 }, decisions))
      .toEqual({ posted: 1, reviewed: false, synced: false });
    expect(github.issue(42).state).toBe("open");
    github.failWhen = undefined;
    const again = await readFound(github, 42);
    expect(await reconcileFindingsCard(inbox, { ...again, findings: 1 }, decisions))
      .toEqual({ posted: 0, reviewed: true, synced: true });
    expect(github.issue(42)).toMatchObject({ state: "closed", state_reason: "completed" });
  });
});
