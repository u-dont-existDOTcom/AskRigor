import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

// The package the tool imports, so the stores' errors are the classes the tool recognizes.
import {
  AtlasFindingPromotionRunner,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasPromotionStore,
  InMemoryAtlasReviewStore,
  deterministicUuid,
  prepareAtlasFindingIntent,
  sha256,
} from "@askrigor/evidence-repository";

import { AtlasReview, ATLAS_FAILURE_EXPLANATIONS } from "../apps/research-mcp/src/findings/atlas-review.js";
import { findingsCardDigest, findingsCardSchema } from "../apps/research-mcp/src/findings/card.js";
import { GitHubFindingsReview } from "../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService } from "../apps/research-mcp/src/findings/service.js";
import { AtlasSourceCheckCache } from "../apps/research-mcp/src/findings/source-checks.js";
import {
  createResearchContributionReviewHandler,
  researchContributionReviewInputSchema,
  researchContributionReviewOutputSchema,
} from "../apps/research-mcp/src/research-contribution-review-tool.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { LOW_DOSE_CARD, VELMOR_CARD } from "./helpers/atlas-scenario.js";
import { FakeGitHub, FINDINGS_ISSUES_ROOT } from "./helpers/fake-github-findings.js";

// The owner's findings actions on review_research_contribution (Atlas phase 2 design, sections 1, 2 and 7): the short
// call shapes, the input rules, owner authorization on every action, the switch, a strict output that never claims a
// canonical write, and every check that refuses or flags a decision. Hermetic: GitHub is in memory and the providers
// answer from the recorded fixtures. The cards are the organization draft's invented Velmor examples.

const SECRET = "atlas-review-tool-test-secret-0123456789";
const OWNER = "auth0|atlas-review-owner";
const PROTOCOLS = [{ name: "HRP", version: "20.6.31", sha256: sha256("synthetic-hrp") }];
const PROVIDERS = {
  crossref: { mailto: "maintainer@example.test" },
  pubmed: { tool: "askrigor-tests", email: "maintainer@example.test" },
};
const fixture = (path: string) => readFile(new URL(`fixtures/${path}`, import.meta.url), "utf8");

const TREMOR = {
  outcome: "tremor score halved", better: "more", option: "zentarine 20 mg", option_events: 30, option_total: 120,
  comparator: "placebo", comparator_events: 18, comparator_total: 120, follow_up: "12 weeks", nnt: 10,
};
const NAUSEA = {
  outcome: "nausea", better: "fewer", option: "zentarine 20 mg", option_events: 12, option_total: 120,
  comparator: "placebo", comparator_events: 6, comparator_total: 120, follow_up: "12 weeks", nnh: 20,
};
const LOW_DOSE = {
  outcome: "tremor score halved", better: "more", option: "zentarine 5 mg", option_events: 20, option_total: 100,
  comparator: "placebo", comparator_events: 19, comparator_total: 100, follow_up: "12 weeks",
};
/** The low-dose card, cited by its DOI instead of its PMID, so only Crossref is asked. */
const DOI_CARD = {
  ...LOW_DOSE_CARD,
  findings: [{ ...LOW_DOSE_CARD.findings[0]!, sources: ["10.0000/synthetic-velmor-c"] }],
};

type Respond = () => Response | Promise<Response>;

/** The providers answer from the recorded fixtures; a route can be replaced, and anything unrouted gets a 404. */
async function stubProviders(overrides: Record<string, Respond> = {}): Promise<string[]> {
  const work = JSON.parse(await fixture("crossref/work-no-marker.json")) as { message: Record<string, unknown> };
  const crossrefWork = (doi: string) => () => new Response(JSON.stringify({ ...work, message: { ...work.message, DOI: doi } }));
  const retracted = JSON.parse(await fixture("crossref/work-retracted.json")) as { message: Record<string, unknown> };
  const pubmed = await fixture("pubmed/efetch-record.xml");
  const routes: Record<string, Respond> = {
    "crossref 10.0000/synthetic-velmor-a": crossrefWork("10.0000/synthetic-velmor-a"),
    "crossref 10.0000/synthetic-velmor-b": crossrefWork("10.0000/synthetic-velmor-b"),
    "crossref 10.0000/synthetic-velmor-c": crossrefWork("10.0000/synthetic-velmor-c"),
    "crossref 10.1234/recorded.example": crossrefWork("10.1234/recorded.example"),
    "crossref 10.0000/synthetic-retracted": () => new Response(JSON.stringify({
      ...retracted, message: { ...retracted.message, DOI: "10.0000/synthetic-retracted" } })),
    "pubmed 40123456": () => new Response(pubmed),
    ...overrides,
  };
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const key = url.hostname === "api.crossref.org"
      ? `crossref ${decodeURIComponent(url.pathname.replace(/^\/works\//u, ""))}`
      : url.hostname === "eutils.ncbi.nlm.nih.gov" ? `pubmed ${url.searchParams.get("id")}` : `other ${url.hostname}`;
    requests.push(key);
    const respond = routes[key];
    return respond === undefined ? new Response("not routed", { status: 404 }) : respond();
  }));
  return requests;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function owner(subject = OWNER, scopes = ["cases:review"]) {
  return {
    authInfo: {
      token: "synthetic-token",
      clientId: "synthetic-client",
      scopes,
      expiresAt: Math.floor(Date.now() / 1_000) + 600,
      extra: { subject },
    },
  };
}

interface Reply {
  isError: boolean;
  text: string;
  structured: Record<string, any>;
}

/** The library, GitHub, the stores, the runner and the owner's tool, with one clock. */
function harness(options: { enabled?: boolean; configured?: boolean } = {}) {
  let instant = Date.parse("2026-11-04T09:00:00.000Z");
  const clock = () => new Date(instant);
  const github = new FakeGitHub();
  const tokenProvider = { getToken: async () => "synthetic-findings-token" };
  const library = new FindingsSaveService({
    receiptSecret: () => SECRET,
    limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
    queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
    protocols: async () => PROTOCOLS,
    version: "0.1.0",
    build: "0123abc",
    now: clock,
  });
  const review = new InMemoryAtlasReviewStore();
  const canonical = new InMemoryAtlasCanonicalStore({ now: () => clock().toISOString() });
  const runner = new AtlasFindingPromotionRunner(new InMemoryAtlasPromotionStore(review, canonical),
    { now: () => clock().toISOString() });
  let sequence = 0;
  const atlas = new AtlasReview({
    store: review,
    reader: canonical,
    inbox: new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
    version: "0.1.0",
    build: "0123abc",
    protocols: async () => PROTOCOLS,
    now: clock,
    newIntentId: () => deterministicUuid(`atlas-review-tool-test:${sequence++}`),
    sourceCheckCache: new AtlasSourceCheckCache(),
  });
  const handler = createResearchContributionReviewHandler({
    allowedReviewerSubjects: new Set([OWNER]),
    resourceMetadataUrl: new URL("https://mcp.askrigor.test/.well-known/oauth-protected-resource"),
    atlas: {
      enabled: options.enabled ?? true,
      ...(options.configured === false ? {} : { review: atlas }),
      providers: () => PROVIDERS,
    },
  });
  let contributor = 0;
  return {
    github,
    review,
    canonical,
    later: (minutes: number) => { instant += minutes * 60_000; },
    async call(input: Record<string, unknown>, auth: unknown = owner()): Promise<Reply> {
      const result = await handler(input, auth as never);
      const structured = researchContributionReviewOutputSchema.parse(result.structuredContent) as Record<string, any>;
      expect(structured.canonicalEvidenceChangedByThisCall).toBe(false);
      return {
        isError: result.isError === true,
        text: (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n"),
        structured,
      };
    },
    async save(card: object, bases: string[] = ["full_text_audit"]) {
      contributor += 1;
      const parsed = findingsCardSchema.parse(card);
      // Each save is another person's research thread.
      const key = contributor.toString(16).padStart(64, "0");
      return library.save({
        findings_card: card,
        contributor: key,
        finalization_receipt: issueResearchReceipt("finalization", {
          status: "ready", depth: "standard", target: key.slice(0, 12), findings: findingsCardDigest(parsed), bases,
        }, { secret: SECRET, now: clock }),
      }, { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) });
    },
    async promote() {
      const run = await runner.promoteAccepted();
      return run;
    },
  };
}

type Harness = ReturnType<typeof harness>;

async function inspected(h: Harness, card: string, finding: number): Promise<string> {
  const reply = await h.call({ action: "inspect_finding", card, finding });
  expect(reply.structured.outcome, reply.text).toBe("finding_inspected");
  return reply.structured.card.cardSha256 as string;
}

/** Saves the low-dose card (DOI) as ARF-0042, accepts its finding as F-1001 and promotes it. */
async function acceptedLowDose(h: Harness) {
  await h.save(DOI_CARD);
  const cardSha256 = await inspected(h, "ARF-0042", 1);
  const accepted = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256,
    topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [LOW_DOSE] });
  expect(accepted.structured.outcome, accepted.text).toBe("finding_queued");
  expect((await h.promote()).result.status).toBe("promoted");
  return cardSha256;
}

describe("the findings actions' calls", () => {
  it("takes the phone flow's short calls: inspect, then accept with the hash, the topic and the numbers", async () => {
    await stubProviders();
    const h = harness();
    await h.save(DOI_CARD);
    const inspect = await h.call({ action: "inspect_finding", card: "ARF-0042", finding: 1 });
    expect(inspect.structured).toMatchObject({
      ok: true,
      outcome: "finding_inspected",
      card: { card: "ARF-0042", state: "open", saves: 1, items: [{ item: "finding", number: 1, wouldBecome: "checked",
        bases: ["full_text_audit"], save: "card", decision: null }] },
      checks: { item: "ARF-0042 finding 1", wouldBecome: "checked", community: "none", sourceStatus: "passed",
        sources: [{ source: "10.0000/synthetic-velmor-c", outcome: "checked", provider: "crossref", retraction: "none_found" }],
        numbers: [], privacy: [], problems: [], needsConfirmation: [] },
    });
    const cardSha256 = inspect.structured.card.cardSha256;
    expect(inspect.text).toContain(`cardSha256 ${cardSha256}`);
    const accept = await h.call({ action: "accept_finding", card: "arf-0042", finding: 1, cardSha256,
      topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [LOW_DOSE] });
    expect(accept.isError).toBe(false);
    expect(accept.text).toBe("Accepted ARF-0042 finding 1 as F-1001, a checked finding, filed under Velmor syndrome " +
      "(new topic). The Atlas writer stores it within about 5 minutes; nothing is public until the Atlas pages exist.");
    expect(accept.structured).toMatchObject({
      ok: true, outcome: "finding_queued",
      atlas: { atlasNumber: "F-1001", entryKind: "finding", labelAfter: "checked",
        topic: { key: "velmor-syndrome", label: "Velmor syndrome", isNew: true },
        intent: { kind: "accept", status: "PENDING", failureCode: null } },
    });
    // The intent holds no card reference, hash or quote: the card binding lives on the decision row only.
    const [intent] = await h.review.inspectIntents(["F-1001"]);
    expect(JSON.stringify(intent!.payload)).not.toMatch(/ARF-|answer_quote|cardSha256/u);
    expect(JSON.stringify(intent!.payload)).not.toContain(cardSha256);
    expect(await h.review.inspectCards([42])).toMatchObject([{ decision: "accepted", publicNumber: "F-1001", cardSha256 }]);
    // GitHub shows the decision, and the card, every finding decided, is closed as reviewed.
    expect(h.github.comments.get(42)!.at(-1)!.body).toContain("Finding 1: accepted as F-1001, checked, 4 Nov 2026.");
    expect(h.github.issue(42)).toMatchObject({ state: "closed", state_reason: "completed" });
    // The same accept again records nothing new.
    const again = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256,
      topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [LOW_DOSE] });
    expect(again.structured.outcome).toBe("finding_queued");
    expect(again.text).toMatch(/^ARF-0042 finding 1 was already accepted as F-1001, a checked finding, on 4 Nov 2026; nothing new was recorded\./u);
    expect(await h.review.inspectIntents(null)).toHaveLength(1);
  });

  it("refuses a call without cardSha256, topicKey or numbers, naming the field, and any field its action does not take", async () => {
    const h = harness();
    const base = { action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256: "a".repeat(64),
      topicKey: "velmor-syndrome", numbers: [] };
    for (const field of ["cardSha256", "topicKey", "numbers"] as const) {
      const { [field]: _left, ...without } = base;
      const reply = await h.call(without);
      expect(reply.structured).toMatchObject({ ok: false, error: { code: "invalid_request" } });
      expect(reply.text).toContain(`${field}: accept_finding needs ${field}`);
    }
    for (const input of [
      { action: "list_findings", card: "ARF-0042" },
      { action: "inspect_finding", card: "ARF-0042", atlasNumber: "F-1001" },
      { action: "inspect_finding" },
      { ...base, lead: 1 },
      { ...base, wording: "Edited." },
      { ...base, action: "edit_finding" },
      { action: "edit_finding", atlasNumber: "F-1001", version: 1, wording: "A fix." },
      { action: "reject_finding", card: "ARF-0042", finding: 1 },
      { action: "withdraw_finding", atlasNumber: "F-1001", note: "Wrong." },
      { action: "link_findings", atlasNumber: "F-1001", relation: "contradicts", to: "F-1002" },
      { action: "link_findings", atlasNumber: "F-1001", relation: "same_as", to: "F-1002", rationale: "x", note: "y" },
      { action: "inspect", card: "ARF-0042" },
      { ...base, proposalId: "11111111-1111-4111-8111-111111111111" },
      { ...base, card: "F-1001" },
      { ...base, finding: 6 },
    ]) {
      expect((await h.call(input)).structured.error?.code, JSON.stringify(input)).toBe("invalid_request");
    }
    // The request schema publishes every field flat, for ChatGPT's app.
    expect(researchContributionReviewInputSchema.safeParse({ action: "edit_finding", atlasNumber: "f-1001", version: 2,
      wording: "A fix.", correction: false }).success).toBe(true);
  });

  it("authorizes the owner before any findings action reads or writes anything", async () => {
    const h = harness();
    const fetchSpy = vi.fn(async () => new Response("never", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    const calls: Array<Record<string, unknown>> = [
      { action: "list_findings" },
      { action: "inspect_finding", card: "ARF-0042", finding: 1 },
      { action: "inspect_finding", atlasNumber: "F-1001" },
      { action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256: "a".repeat(64), topicKey: "x", numbers: [] },
      { action: "edit_finding", atlasNumber: "F-1001", version: 1, wording: "A fix.", note: "Corrected." },
      { action: "reject_finding", card: "ARF-0042", lead: 1, reason: "Not general." },
      { action: "withdraw_finding", atlasNumber: "F-1001", version: 1, note: "Wrong." },
      { action: "link_findings", atlasNumber: "F-1001", relation: "same_as", to: "F-1002", rationale: "Same." },
      { action: "edit_finding", atlasNumber: "F-1001", version: 2, eraseWording: true },
      { action: "forget_card", card: "ARF-0042" },
    ];
    for (const input of calls) {
      expect((await h.call(input, {})).structured.error?.code).toBe("authorization_required");
      expect((await h.call(input, owner("auth0|someone-else"))).structured.error?.code).toBe("insufficient_scope");
      expect((await h.call(input, owner(OWNER, ["research:use"]))).structured.error?.code).toBe("insufficient_scope");
    }
    expect(h.github.writes).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers atlas_review_closed while the switch is off, and review_service_unavailable when not configured", async () => {
    const closed = harness({ enabled: false });
    const unconfigured = harness({ configured: false });
    for (const input of [
      { action: "list_findings" },
      { action: "inspect_finding", atlasNumber: "F-1001" },
      { action: "reject_finding", card: "ARF-0042", finding: 1, reason: "Not general." },
      { action: "forget_card", card: "ARF-0042" },
    ]) {
      expect((await closed.call(input)).structured).toMatchObject({ ok: false, error: { code: "atlas_review_closed" } });
      expect((await unconfigured.call(input)).structured.error?.code).toBe("review_service_unavailable");
    }
    // The proposal actions are unaffected by the switch: with no proposal service they answer as before.
    expect((await closed.call({ action: "inspect" })).structured.error?.code).toBe("review_service_unavailable");
    expect(closed.github.writes).toEqual([]);
  });

  it("takes eraseWording and forget_card by their own rules (decision 7), recording nothing for a refused call", async () => {
    await stubProviders();
    const h = harness();
    await acceptedLowDose(h);
    // An erasure alone takes no note or correction; forget_card takes the card and confirm only, never a reason.
    for (const input of [
      { action: "edit_finding", atlasNumber: "F-1001", version: 1, eraseWording: true, note: "Made general." },
      { action: "edit_finding", atlasNumber: "F-1001", version: 1, eraseWording: true, correction: false },
      { action: "edit_finding", atlasNumber: "F-1001", version: 1, eraseWording: false },
      { action: "forget_card" },
      { action: "forget_card", card: "ARF-0042", finding: 1 },
      { action: "forget_card", card: "ARF-0042", reason: "Asked by email." },
      { action: "forget_card", atlasNumber: "F-1001" },
    ]) {
      expect((await h.call(input)).structured.error?.code, JSON.stringify(input)).toBe("invalid_request");
    }
    // A finding not withdrawn yet needs the withdrawal's note, which the erasure then removes.
    const noNote = await h.call({ action: "withdraw_finding", atlasNumber: "F-1001", version: 1, eraseWording: true });
    expect(noNote.structured.error?.code).toBe("invalid_request");
    expect(noNote.text).toContain("F-1001 is not withdrawn yet: withdraw_finding needs its public note");
    // One version has no earlier version to erase.
    const nothing = await h.call({ action: "edit_finding", atlasNumber: "F-1001", version: 1, eraseWording: true });
    expect(nothing.structured).toMatchObject({ ok: false, outcome: "checks_not_passed",
      checks: { problems: [expect.objectContaining({ code: "nothing_changed" })] } });
    expect(await h.review.inspectIntents(null)).toEqual([]);
  });
});

describe("what binds a decision to the card the owner inspected", () => {
  it("refuses a stale hash, a later save, a missing card or item, and a decision already made", async () => {
    await stubProviders();
    const h = harness();
    await h.save(VELMOR_CARD, ["full_text_audit.comment_audit", "none"]);
    const cardSha256 = await inspected(h, "ARF-0042", 2);
    const accept = (input: Record<string, unknown> = {}) => h.call({ action: "accept_finding", card: "ARF-0042",
      finding: 2, cardSha256, topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [], ...input });
    expect((await accept({ cardSha256: "b".repeat(64) })).structured.error?.code).toBe("card_changed");
    expect((await h.call({ action: "inspect_finding", card: "ARF-0077" })).structured.error?.code).toBe("card_not_found");
    expect((await accept({ finding: 5 })).structured.error?.code).toBe("item_not_found");
    expect((await accept({ finding: undefined, lead: 3 })).structured.error?.code).toBe("item_not_found");

    // Another person's save of the same question and claims joins the card: the hash the owner saw no longer holds.
    await h.save({ ...VELMOR_CARD, findings: VELMOR_CARD.findings.map((finding) => ({ ...finding, certainty: "low" })) },
      ["none", "none"]);
    const changed = await accept();
    expect(changed.structured.error?.code).toBe("card_changed");
    expect(changed.text).toContain("changed since it was inspected");
    const fresh = await inspected(h, "ARF-0042", 2);
    const lead = await accept({ cardSha256: fresh });
    expect(lead.text).toMatch(/^Accepted ARF-0042 finding 2 as a lead, F-1001: it has no verified basis\. Filed under Velmor syndrome \(new topic\)\./u);
    expect(lead.structured.atlas).toMatchObject({ entryKind: "lead", labelAfter: "lead" });

    // A decision is final: rejecting the accepted item, or accepting it with other wording, conflicts.
    const conflict = await h.call({ action: "reject_finding", card: "ARF-0042", finding: 2, reason: "Changed my mind." });
    expect(conflict.structured.error?.code).toBe("decision_conflict");
    const edit = await h.call({ action: "edit_finding", card: "ARF-0042", finding: 2, cardSha256: fresh,
      topicKey: "velmor-syndrome", numbers: [], wording: "Zentarine may ease the voice tremor too." });
    expect(edit.structured.error?.code).toBe("decision_conflict");
    expect(edit.text).toContain("use edit_finding with atlasNumber F-1001");
    // A tampered record cannot be reviewed.
    const issue = h.github.issue(42);
    issue.body = issue.body.replace(/"saved_at": "[^"]+"/u, "\"saved_at\": \"2026-01-01T00:00:00.000Z\"");
    expect((await h.call({ action: "inspect_finding", card: "ARF-0042" })).structured.error?.code).toBe("card_not_found");
  });

  it("rejects an item with the owner's private reason, and posts no reason to GitHub", async () => {
    await stubProviders();
    const h = harness();
    await h.save(VELMOR_CARD, ["full_text_audit.comment_audit", "none"]);
    const reply = await h.call({ action: "reject_finding", card: "ARF-0042", finding: 2,
      reason: "Too speculative for the Atlas." });
    expect(reply.structured).toMatchObject({ ok: true, outcome: "finding_rejected" });
    expect(reply.text).toBe("Rejected ARF-0042 finding 2; nothing from it is written to the Atlas, and your reason " +
      "stays private, on the decision.");
    expect(await h.review.inspectCards([42])).toMatchObject([{ itemNumber: 2, decision: "rejected",
      ownerReason: "Too speculative for the Atlas.", publicNumber: null, intent: null }]);
    const comments = h.github.comments.get(42)!.map(({ body }) => body);
    expect(comments.at(-1)).toContain("Finding 2: rejected, 4 Nov 2026.");
    expect(comments.join("\n")).not.toContain("speculative");
    expect(await h.review.inspectIntents(null)).toEqual([]);
    // Rejecting it again records nothing new; the card stays open until finding 1 has a decision.
    expect((await h.call({ action: "reject_finding", card: "ARF-0042", finding: 2, reason: "Again." })).text)
      .toMatch(/^ARF-0042 finding 2 was already rejected on 4 Nov 2026/u);
    expect(h.github.issue(42).state).toBe("open");
    // An open lead can be accepted as a lead, with no sources or numbers.
    const cardSha256 = await inspected(h, "ARF-0042", 1);
    const lead = await h.call({ action: "accept_finding", card: "ARF-0042", lead: 1, cardSha256,
      topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [] });
    expect(lead.text).toMatch(/^Accepted ARF-0042 open lead 1 as a lead, F-1001: an open lead of the card\./u);
    const [intent] = await h.review.inspectIntents(["F-1001"]);
    expect(intent!.payload).toMatchObject({ entryKind: "lead", leadOrigin: "open_lead", sources: [],
      content: { wording: "Doses above 20 mg", certainty: null, numbers: [], tags: [] } });
  });
});

describe("the checks before acceptance", () => {
  it("names each problem with the numbers, the privacy screen, the topic and community evidence, and records nothing", async () => {
    await stubProviders();
    const h = harness();
    await h.save(VELMOR_CARD, ["full_text_audit.comment_audit", "none"]);
    const cardSha256 = await inspected(h, "ARF-0042", 1);
    const accept = (input: Record<string, unknown>) => h.call({ action: "accept_finding", card: "ARF-0042", finding: 1,
      cardSha256, topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [TREMOR, NAUSEA], ...input });
    const wrong = await accept({ numbers: [{ ...TREMOR, nnt: 9 }, NAUSEA] });
    expect(wrong.structured).toMatchObject({ ok: false, outcome: "checks_not_passed" });
    expect(wrong.structured.checks.numbers.map(({ at, code }: { at: string; code: string }) => `${at} ${code}`))
      .toEqual(["numbers[0] not_reciprocal_rounded_up", "numbers[0] number_needed_not_shown"]);
    expect(wrong.text).toContain("which rounds up to 10");
    expect(wrong.isError).toBe(false);
    expect((await accept({ numbers: [TREMOR] })).structured.checks.numbers.map(({ code }: { code: string }) => code))
      .toEqual(["harms_missing"]);
    expect((await accept({ topicLabel: undefined })).structured.checks.problems)
      .toEqual([expect.objectContaining({ code: "topic_label_missing" })]);
    const privacy = await accept({ topicLabel: "My Velmor diagnosis, see ARF-0042" });
    expect(privacy.structured.checks.privacy).toEqual(expect.arrayContaining([
      { field: "topicLabel", reasonCode: "card_reference" },
    ]));
    // Edited wording passes the same screen.
    const edited = await h.call({ action: "edit_finding", card: "ARF-0042", finding: 1, cardSha256,
      topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [],
      wording: "I was diagnosed with Velmor syndrome and zentarine helped me." });
    expect(edited.structured.checks.privacy).toEqual([{ field: "wording", reasonCode: "personal_narrative" }]);
    // A finding whose only kept source is the audited comments' video is held under 4a.
    await h.save({ ...LOW_DOSE_CARD, question: "Does zentarine help in daily life?",
      findings: [{ ...LOW_DOSE_CARD.findings[0]!, sources: ["zentarineV1"], tags: ["community_checked"] }] },
      ["comment_audit"]);
    const communitySha = await inspected(h, "ARF-0043", 1);
    const held = await h.call({ action: "accept_finding", card: "ARF-0043", finding: 1, cardSha256: communitySha,
      topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [LOW_DOSE] });
    expect(held.structured.checks).toMatchObject({ community: "community_only", wouldBecome: "community_only",
      problems: [expect.objectContaining({ code: "community_only" })] });
    expect(await h.review.inspectIntents(null)).toEqual([]);
    expect(await h.review.inspectCards([42, 43])).toEqual([]);
  });

  it("refuses a source no provider has, and waits on one that cannot be reached, recording nothing", async () => {
    await stubProviders({ "crossref 10.0000/synthetic-velmor-c": () => { throw new TypeError("fetch failed"); } });
    const h = harness();
    await h.save(DOI_CARD);
    const inspect = await h.call({ action: "inspect_finding", card: "ARF-0042", finding: 1 });
    expect(inspect.structured.checks).toMatchObject({ sourceStatus: "try_again_later",
      sources: [{ outcome: "unavailable", errorCode: expect.stringMatching(/^crossref_/u) }] });
    const cardSha256 = inspect.structured.card.cardSha256;
    const accept = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256,
      topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [LOW_DOSE] });
    expect(accept.structured).toMatchObject({ ok: false, outcome: "try_again_later", retry: { reason: "provider_unavailable" } });
    expect(accept.isError).toBe(false);
    expect(accept.text).toContain("Try again in a few minutes; nothing was recorded.");

    await stubProviders({ "crossref 10.0000/synthetic-velmor-c": () => new Response("missing", { status: 404 }) });
    const refused = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256,
      topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [LOW_DOSE] });
    expect(refused.structured).toMatchObject({ outcome: "checks_not_passed", checks: { sourceStatus: "refused",
      problems: [expect.objectContaining({ code: "source_refused" })] } });
    expect(await h.review.inspectIntents(null)).toEqual([]);
  });

  it("asks the owner to confirm a retracted source, then binds it as context only", async () => {
    await stubProviders();
    const h = harness();
    await h.save({ ...DOI_CARD, findings: [{ ...DOI_CARD.findings[0]!,
      sources: ["10.0000/synthetic-velmor-c", "10.0000/synthetic-retracted"] }] });
    const cardSha256 = await inspected(h, "ARF-0042", 1);
    const accept = { action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256, topicKey: "velmor-syndrome",
      topicLabel: "Velmor syndrome", numbers: [LOW_DOSE] };
    const flagged = await h.call(accept);
    expect(flagged.structured).toMatchObject({ ok: false, outcome: "needs_confirmation",
      checks: { needsConfirmation: ["10.0000/synthetic-retracted is retracted, so it would be bound as context only, " +
        "never as support"] } });
    expect(flagged.text).toContain("send the same call with confirm: true");
    expect((await h.call({ ...accept, confirm: true })).structured.outcome).toBe("finding_queued");
    expect((await h.promote()).result.status).toBe("promoted");
    const bindings = h.canonical.snapshot().bindings.map(({ locator, polarity, capabilityCeiling }) =>
      [locator, polarity, capabilityCeiling]);
    expect(bindings).toEqual([
      ["doi:10.0000/synthetic-velmor-c", "supports", "can_support"],
      ["doi:10.0000/synthetic-retracted", "context_only", "cannot_support"],
    ]);
    expect(h.canonical.snapshot().sourceChecks.map(({ check }) => [check.retractionStatus, check.ownerConfirmed]))
      .toEqual([["none_found", false], ["retracted", true]]);
  });

  it("records a later card with the same question and claim as a re-check of the stored finding", async () => {
    await stubProviders();
    const h = harness();
    await acceptedLowDose(h);
    // The card is closed, so the same findings from someone else start a new card.
    await h.save(DOI_CARD, ["bounded_absence"]);
    const inspect = await h.call({ action: "inspect_finding", card: "ARF-0043", finding: 1 });
    expect(inspect.structured.checks).toMatchObject({ wouldBecome: "recheck", recheckOf: "F-1001" });
    expect(inspect.text).toContain("would be a re-check of F-1001");
    const recheck = await h.call({ action: "accept_finding", card: "ARF-0043", finding: 1,
      cardSha256: inspect.structured.card.cardSha256, topicKey: "velmor-syndrome", numbers: [] });
    expect(recheck.text).toMatch(/^Recorded ARF-0043 finding 1 as a re-check of F-1001, with the research of 2026-11-04, which brings a verified basis \(bounded_absence\)\./u);
    expect(await h.review.inspectCards([43])).toMatchObject([{ decision: "rechecked", publicNumber: "F-1001" }]);
    expect((await h.promote()).result.status).toBe("promoted");
    expect(h.canonical.snapshot().changes.map(({ changeKind }) => changeKind)).toEqual(["accepted", "rechecked"]);
    // Editing a re-check's wording would make a second finding of the same claim: it is refused.
    await h.save(DOI_CARD, ["full_text_audit"]);
    const third = await inspected(h, "ARF-0044", 1);
    const edit = await h.call({ action: "edit_finding", card: "ARF-0044", finding: 1, cardSha256: third,
      topicKey: "velmor-syndrome", numbers: [], appliesTo: "Adults" });
    expect(edit.structured.error?.code).toBe("decision_conflict");
  });

  it("accepts with the owner's wording before acceptance, and keeps its card wording key", async () => {
    await stubProviders();
    const h = harness();
    await h.save(DOI_CARD);
    const cardSha256 = await inspected(h, "ARF-0042", 1);
    const wording = "In a second invented trial, zentarine 5 mg halved the tremor score in 20 of 100 against 19 of 100 " +
      "on placebo over 12 weeks.";
    const reply = await h.call({ action: "edit_finding", card: "ARF-0042", finding: 1, cardSha256,
      topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [LOW_DOSE], wording });
    expect(reply.text).toContain("a checked finding with your wording");
    const [intent] = await h.review.inspectIntents(["F-1001"]);
    const payload = intent!.payload as { editedAtAcceptance: boolean; content: { wording: string };
      wordingKeys: { card: string; accepted: string } };
    expect(payload.editedAtAcceptance).toBe(true);
    expect(payload.content.wording).toBe(wording);
    expect(payload.wordingKeys.card).not.toBe(payload.wordingKeys.accepted);
  });
});

describe("changes to an accepted finding", () => {
  it("corrects a finding by its latest version, waits while a change is queued, and refuses a stale version", async () => {
    await stubProviders();
    const h = harness();
    await acceptedLowDose(h);
    const fix = { action: "edit_finding", atlasNumber: "F-1001", version: 1,
      appliesTo: "Adults with Velmor syndrome taking 5 mg", note: "It applies to the 5 mg dose only." };
    expect((await h.call({ ...fix, version: 2 })).structured.error?.code).toBe("version_stale");
    const queued = await h.call(fix);
    expect(queued.structured).toMatchObject({ ok: true, outcome: "finding_queued",
      atlas: { atlasNumber: "F-1001", version: 1, intent: { kind: "revise", status: "PENDING" } } });
    expect(queued.text).toBe("Queued a correction of F-1001: version 2, with your note, which the Atlas dates. The " +
      "Atlas writer stores it within about 5 minutes.");
    // The same correction again is the one queued; another change waits until it is stored.
    expect((await h.call(fix)).text).toContain("already waits for the Atlas writer; nothing new was recorded");
    expect((await h.call({ action: "withdraw_finding", atlasNumber: "F-1001", version: 1, note: "Wrong." })).structured)
      .toMatchObject({ ok: false, outcome: "try_again_later", retry: { reason: "writer_pending" } });
    expect((await h.call({ ...fix, appliesTo: "Adults", note: "Broader." })).structured.outcome).toBe("try_again_later");
    expect((await h.promote()).result.status).toBe("promoted");
    const stored = await h.call({ action: "inspect_finding", atlasNumber: "F-1001" });
    expect(stored.structured.atlas).toMatchObject({ version: 2, label: "checked" });
    expect(h.canonical.snapshot().changes.at(-1)).toMatchObject({ changeKind: "corrected",
      publicNote: "It applies to the 5 mg dose only." });
    // Nothing changed is not a new version; a wording fix needs no note.
    expect((await h.call({ ...fix, version: 2 })).structured.checks.problems)
      .toEqual([expect.objectContaining({ code: "nothing_changed" })]);
    const wordingFix = await h.call({ action: "edit_finding", card: "ARF-0042", finding: 1, version: 2,
      whyNotUsual: "Quick answers treat every dose of zentarine as the same.", correction: false });
    expect(wordingFix.text).toMatch(/^Queued a wording fix of F-1001: version 3\./u);
  });

  it("withdraws a finding, which returns the finding it contradicted to checked", async () => {
    await stubProviders();
    const h = harness();
    await acceptedLowDose(h);
    await h.save(VELMOR_CARD, ["full_text_audit", "none"]);
    const cardSha256 = await inspected(h, "ARF-0043", 1);
    await h.call({ action: "accept_finding", card: "ARF-0043", finding: 1, cardSha256, topicKey: "velmor-syndrome",
      numbers: [TREMOR, NAUSEA], confirm: true });
    expect((await h.promote()).result.status).toBe("promoted");
    const link = await h.call({ action: "link_findings", atlasNumber: "F-1001", relation: "contradicts", to: "F-1002",
      disagreement: "dose", rationale: "The invented trials used 5 mg and 20 mg." });
    expect(link.text).toBe("Queued the link F-1001 contradicts F-1002 (they disagree on dose). Once the Atlas writer " +
      "stores it, within about 5 minutes, F-1001 and F-1002 both read as contested.");
    expect((await h.promote()).result.status).toBe("promoted");
    const withdraw = await h.call({ action: "withdraw_finding", atlasNumber: "F-1002", version: 1,
      note: "The invented trial was retracted." });
    expect(withdraw.text).toBe("Queued the withdrawal of F-1002: version 2 marks it withdrawn, with your note, which " +
      "the Atlas dates. Then F-1001 returns to checked. The Atlas writer stores it within about 5 minutes.");
    expect((await h.promote()).result.status).toBe("promoted");
    expect((await h.call({ action: "inspect_finding", atlasNumber: "F-1001" })).structured.atlas.label).toBe("checked");
    expect((await h.call({ action: "inspect_finding", atlasNumber: "F-1002" })).structured.atlas.label).toBe("withdrawn");
    expect((await h.call({ action: "withdraw_finding", atlasNumber: "F-1002", version: 2, note: "Again." }))
      .structured.error?.code).toBe("decision_conflict");
    expect((await h.call({ action: "withdraw_finding", atlasNumber: "F-1999", version: 1, note: "No such." }))
      .structured.error?.code).toBe("finding_not_found");
  });

  it("names a link's problems with the code the writer would record, and withdraws a link", async () => {
    await stubProviders();
    const h = harness();
    await acceptedLowDose(h);
    await h.save(VELMOR_CARD, ["full_text_audit", "none"]);
    const cardSha256 = await inspected(h, "ARF-0043", 2);
    await h.call({ action: "accept_finding", card: "ARF-0043", finding: 2, cardSha256, topicKey: "velmor-syndrome",
      numbers: [] });
    expect((await h.promote()).result.status).toBe("promoted");
    // F-1002 is a lead: it takes no part in same_as.
    const lead = await h.call({ action: "link_findings", atlasNumber: "F-1001", relation: "same_as", to: "F-1002",
      rationale: "The same claim." });
    expect(lead.structured).toMatchObject({ ok: false, outcome: "checks_not_passed",
      checks: { links: [{ code: "lead_in_link", writerCode: "ATLAS_LINK_LEAD" }] } });
    expect(lead.text).toContain("(the writer would record ATLAS_LINK_LEAD)");
    // As the older side of replaces, a lead may take part; then the pair is taken.
    const replaces = await h.call({ action: "link_findings", atlasNumber: "F-1001", relation: "replaces", to: "F-1002",
      rationale: "The trial supersedes the untested claim." });
    expect(replaces.structured.outcome, replaces.text).toBe("finding_queued");
    expect((await h.promote()).result.status).toBe("promoted");
    const taken = await h.call({ action: "link_findings", atlasNumber: "F-1002", relation: "narrows", to: "F-1001",
      rationale: "Narrower." });
    expect(taken.structured.checks.links).toEqual([expect.objectContaining({ code: "lead_in_link" }),
      expect.objectContaining({ code: "pair_already_linked", writerCode: "ATLAS_LINK_PAIR_TAKEN" })]);
    const unlink = await h.call({ action: "link_findings", atlasNumber: "F-1002", relation: "unlink", to: "F-1001",
      note: "The two concern different tremors." });
    expect(unlink.text).toMatch(/^Queued the withdrawal of the link F-1001 replaces F-1002\./u);
    expect((await h.promote()).result.status).toBe("promoted");
    const again = await h.call({ action: "link_findings", atlasNumber: "F-1001", relation: "replaces", to: "F-1002",
      rationale: "Again." });
    expect(again.structured.checks.links).toEqual([expect.objectContaining({ code: "link_stored_before",
      writerCode: "ATLAS_LINK_ALREADY_RECORDED" })]);
  });
});

describe("list_findings", () => {
  it("lists the cards beyond a quick answer first, then the oldest, with what each undecided item would become", async () => {
    await stubProviders();
    const h = harness();
    await h.save(DOI_CARD, ["none"]);
    h.later(1);
    await h.save(VELMOR_CARD, ["full_text_audit.comment_audit", "none"]);
    const listed = await h.call({ action: "list_findings" });
    expect(listed.structured.findings).toMatchObject({ refused: [], waitingForWriter: 0, nextCursor: null,
      unreadableCards: [] });
    expect(listed.structured.findings.cards.map(({ card, beyondQuickAnswer, publicValue }: Record<string, unknown>) =>
      [card, beyondQuickAnswer, publicValue])).toEqual([["ARF-0043", true, "public"], ["ARF-0042", false, "public"]]);
    expect(listed.structured.findings.cards[0].items.map(({ item, number, wouldBecome }: Record<string, unknown>) =>
      `${item} ${number} ${wouldBecome}`)).toEqual(["finding 1 checked", "finding 2 lead", "lead 1 lead"]);
    expect(listed.structured.findings.cards[1].items).toEqual([{ item: "finding", number: 1,
      text: DOI_CARD.findings[0]!.claim, certainty: "low", wouldBecome: "lead", recheckOf: null }]);
    expect(listed.text.split("\n")[0]).toBe(`ARF-0043 (beyond a quick answer), saved 2026-11-04: ${VELMOR_CARD.question}`);
    // A decided item leaves its card's list.
    await h.call({ action: "reject_finding", card: "ARF-0043", lead: 1, reason: "Too vague." });
    expect((await h.call({ action: "list_findings" })).structured.findings.cards[0].items
      .map(({ item }: { item: string }) => item)).toEqual(["finding", "finding"]);
  });

  it("joins a source to the study record the Atlas already holds, with that record's kind", async () => {
    await stubProviders();
    const h = harness();
    // Another writer stored the paper as a review: a new study record of it would conflict, so the review's is used.
    h.canonical.seedSourceFamily({ familyId: deterministicUuid("seeded-review"), sourceKind: "review",
      identityHash: sha256("seeded"), displayTitle: "A review", identifiers: [{ scheme: "doi", value: "10.0000/synthetic-velmor-c" }] });
    await acceptedLowDose(h);
    expect(h.canonical.snapshot().sourceFamilies.map(({ sourceKind, displayTitle }) => [sourceKind, displayTitle]))
      .toEqual([["review", "A review"]]);
    expect(h.canonical.snapshot().bindings.map(({ locator }) => locator)).toEqual(["doi:10.0000/synthetic-velmor-c"]);
  });

  it("pages ten cards at a time, and shows a card's undecided items only", async () => {
    await stubProviders();
    const h = harness();
    for (let index = 0; index < 11; index += 1) {
      h.later(1);
      await h.save({ ...DOI_CARD, question: `Does zentarine help case ${index + 1}?` }, ["none"]);
    }
    const first = await h.call({ action: "list_findings" });
    expect(first.structured.findings.cards).toHaveLength(10);
    expect(first.structured.findings.cards[0].card).toBe("ARF-0042");
    const cursor = first.structured.findings.nextCursor;
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(first.text).toContain("More cards wait: call list_findings with the nextCursor.");
    const second = await h.call({ action: "list_findings", cursor });
    expect(second.structured.findings.cards.map(({ card }: { card: string }) => card)).toEqual(["ARF-0052"]);
    expect(second.structured.findings.nextCursor).toBeNull();
    expect((await h.call({ action: "list_findings", cursor: "bm90LWEtY3Vyc29y" })).structured.error?.code)
      .toBe("invalid_request");
  });

  it("names an intent the writer refused, with its code in plain words", async () => {
    await stubProviders();
    const h = harness();
    await acceptedLowDose(h);
    // The owner withdraws F-1001 at version 1 while a correction makes version 2 first: the withdrawal is refused.
    await h.call({ action: "edit_finding", atlasNumber: "F-1001", version: 1, appliesTo: "Adults on 5 mg",
      note: "It applies to 5 mg only." });
    const stale = prepareAtlasFindingIntent({ schema: "askrigor.atlas-finding-intent.v1", kind: "withdraw",
      publicNumber: "F-1001", version: 1, note: "Withdrawn.",
      decidedWith: { askrigorVersion: "0.1.0", build: "0123abc", protocols: PROTOCOLS } });
    await h.review.recordIntent({
      intentId: deterministicUuid("stale-withdrawal"), intentKind: "withdraw", publicNumber: "F-1001",
      payload: stale.payload, payloadSha256: stale.payloadSha256, ownerReason: null,
      createdAt: "2026-11-04T10:00:00.000Z", retryOfIntentId: null,
    });
    const run = await h.promote();
    expect(run.result.status).toBe("promoted");
    const refused = await h.promote();
    expect(refused.failed.map(({ failureCode }) => failureCode)).toEqual(["ATLAS_VERSION_STALE"]);
    const listed = await h.call({ action: "list_findings" });
    expect(listed.structured.findings.refused).toEqual([expect.objectContaining({ atlasNumber: "F-1001",
      kind: "withdraw", failureCode: "ATLAS_VERSION_STALE", explanation: ATLAS_FAILURE_EXPLANATIONS.ATLAS_VERSION_STALE })]);
    expect(listed.text.split("\n")[0]).toBe("The Atlas writer refused F-1001's withdraw with ATLAS_VERSION_STALE: the " +
      "version sent was not the finding's latest; inspect it again and send its latest version.");
    const inspect = await h.call({ action: "inspect_finding", atlasNumber: "F-1001" });
    expect(inspect.text).toContain("Refused by the writer: withdraw (ATLAS_VERSION_STALE:");
    // The owner sends the withdrawal again with the latest version: it is the refused one's retry, and leaves the list.
    const retry = await h.call({ action: "withdraw_finding", atlasNumber: "F-1001", version: 2, note: "Withdrawn." });
    expect(retry.structured.outcome).toBe("finding_queued");
    expect((await h.call({ action: "list_findings" })).structured.findings.refused).toEqual([]);
  });

  it("posts a decision GitHub missed on the next inspect", async () => {
    await stubProviders();
    const h = harness();
    await h.save(VELMOR_CARD, ["full_text_audit", "none"]);
    const cardSha256 = await inspected(h, "ARF-0042", 2);
    h.github.failWhen = ({ method, url }) => method === "POST" && url === `${FINDINGS_ISSUES_ROOT}/42/comments` ? 502 : undefined;
    const accepted = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 2, cardSha256,
      topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome", numbers: [] });
    expect(accepted.structured.outcome).toBe("finding_queued");
    expect(accepted.text).toContain("GitHub was not updated yet; the next list or inspect posts the decision to the card.");
    expect(h.github.comments.get(42) ?? []).toEqual([]);
    h.github.failWhen = undefined;
    const inspect = await h.call({ action: "inspect_finding", card: "ARF-0042" });
    expect(inspect.structured.card.githubSynced).toBe(true);
    expect(h.github.comments.get(42)!.map(({ body }) => body.split("\n")[2]))
      .toEqual(["Finding 2: accepted as F-1001, a lead, 4 Nov 2026."]);
    await h.call({ action: "inspect_finding", card: "ARF-0042" });
    expect(h.github.comments.get(42)).toHaveLength(1);
  });
});
