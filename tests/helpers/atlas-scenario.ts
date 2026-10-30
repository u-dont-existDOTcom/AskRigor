import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type {
  AtlasFindingPromotionRun,
  AtlasReviewStore,
  AtlasState,
  AtlasStateReader,
} from "@askrigor/evidence-repository";

import { AtlasReview } from "../../apps/research-mcp/src/findings/atlas-review.js";
import { findingsCardDigest, findingsCardSchema } from "../../apps/research-mcp/src/findings/card.js";
import { GitHubFindingsReview } from "../../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService } from "../../apps/research-mcp/src/findings/service.js";
import { AtlasSourceCheckCache } from "../../apps/research-mcp/src/findings/source-checks.js";
import { createResearchContributionReviewHandler } from "../../apps/research-mcp/src/research-contribution-review-tool.js";
import { issueResearchReceipt } from "../../apps/research-mcp/src/research-receipts.js";
import { FakeGitHub } from "./fake-github-findings.js";

// The hermetic Atlas phase 2 scenario (design section 7), on the organization draft's invented example: Velmor
// syndrome, zentarine, both trials and every number are synthetic, and 10.0000/ marks synthetic identifiers. Its cards
// declare Atlas phase 3's fields, which acceptance takes by default and the store keeps (phase 3 design, section 5).
// It runs in process with the real findings library save, real signed receipts, the owner's tool as the connector calls
// it, an in-memory GitHub and a fetch that answers the providers from the recorded fixtures, so no request leaves the
// process. The review store, the canonical reader and the promotion runner are given: in memory
// (tests/atlas-acceptance-end-to-end.test.ts) or PostgreSQL (the Docker acceptance). It needs no test runner.

export interface AtlasScenarioStores {
  /** The review role's five functions. */
  review: AtlasReviewStore;
  /** The canonical Atlas, read-only. */
  reader: AtlasStateReader;
  /** One activation of the timer job's Atlas runner. */
  promote(): Promise<AtlasFindingPromotionRun>;
  /** Every stored canonical Atlas row and every intent row, as text, for the final scan. */
  rows(): Promise<string>;
}

export interface AtlasScenarioReport {
  steps: string[];
  /** What the owner's tool replied, by step, for the caller's own checks. */
  replies: Record<string, { text: string; structured: Record<string, unknown> }>;
  /** The text the scan looked through, and what it looked for. */
  scanned: { characters: number; forbidden: string[] };
}

const SECRET = "atlas-scenario-receipt-secret-0123456789";
const OWNER = "auth0|atlas-scenario-owner";
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const PROTOCOLS = [
  { name: "HRP", version: "20.6.32", sha256: createHash("sha256").update("synthetic-hrp").digest("hex") },
  { name: "Universal Instructions", version: "20.5.40", sha256: createHash("sha256").update("synthetic-ui").digest("hex") },
];
const PROVIDERS = {
  crossref: { mailto: "maintainer@example.test" },
  pubmed: { tool: "askrigor-tests", email: "maintainer@example.test" },
};
const VIDEO = "zentarineV1";
const DOI_A = "10.0000/synthetic-velmor-a";
const DOI_B = "10.0000/synthetic-velmor-b";

const TREMOR = {
  outcome: "tremor score halved", better: "more" as const, option: "zentarine 20 mg", option_events: 30,
  option_total: 120, comparator: "placebo", comparator_events: 18, comparator_total: 120, follow_up: "12 weeks", nnt: 10,
};
const NAUSEA = {
  outcome: "nausea", better: "fewer" as const, option: "zentarine 20 mg", option_events: 12, option_total: 120,
  comparator: "placebo", comparator_events: 6, comparator_total: 120, follow_up: "12 weeks", nnh: 20,
};
const LOW_DOSE = {
  outcome: "tremor score halved", better: "more" as const, option: "zentarine 5 mg", option_events: 20,
  option_total: 100, comparator: "placebo", comparator_events: 19, comparator_total: 100, follow_up: "12 weeks",
};

/** The topic both cards declare (Atlas phase 3). */
export const VELMOR_TOPIC = { key: "velmor-syndrome", label: "Velmor syndrome" };

/**
 * The first card: finding 1 rests on a full-text audit (and audited comments), finding 2 on nothing beyond. Both
 * declare the Atlas fields, as a card saved from this release does: finding 1 an effect with its numbers block,
 * finding 2 a search that found nothing, with the search it made.
 */
export const VELMOR_CARD = {
  question: "Does zentarine ease the hand tremor of Velmor syndrome in adults, and what are its side effects?",
  usual_answer: "Zentarine is a gentle supplement that eases the tremor and is well tolerated.",
  findings: [{
    claim: "In one invented trial of 240 adults with Velmor syndrome, zentarine 20 mg halved the tremor score in 30 of " +
      "120 against 18 of 120 on placebo over 12 weeks, a number needed to treat of 10; nausea affected 12 of 120 " +
      "against 6 of 120, a number needed to harm of 20.",
    certainty: "moderate",
    applies_to: "Adults with Velmor syndrome",
    answer_quote: "In the invented trial, zentarine 20 mg halved the tremor score for 1 in 10 more adults than placebo.",
    // A study only: a finding drawn from YouTube comments is left out of the stored card (owner answer 170).
    sources: [DOI_A],
    why_not_usual: "Quick answers call it gentle and miss the trial's numbers, harms included.",
    tags: ["full_text_read"],
    what_would_change_it: "A second trial of similar size with a different result.",
    kind: "effect",
    subject: "zentarine",
    subject_type: "supplement",
    direction: "benefit",
    numbers: [TREMOR, NAUSEA],
  }, {
    claim: "Zentarine may also ease the voice tremor of Velmor syndrome, though no trial measured it.",
    certainty: "very_low",
    applies_to: "Adults with Velmor syndrome and a voice tremor",
    answer_quote: "Whether it helps the voice tremor is untested.",
    sources: [DOI_B],
    why_not_usual: "Quick answers do not tell the hand tremor from the voice tremor.",
    tags: [],
    what_would_change_it: "A trial that measures the voice tremor.",
    kind: "nothing_found",
    subject: "zentarine",
    subject_type: "supplement",
    direction: "descriptive",
    searches: [{ database: "pubmed", query: "zentarine voice tremor" }],
  }],
  public_value: {
    scope: "public",
    who_else: "Adults with Velmor syndrome weighing zentarine",
    what_it_changes: "It gives the trial's numbers, harms included, instead of calling it gentle.",
  },
  topic: VELMOR_TOPIC,
  open_leads: ["Doses above 20 mg"],
};

/** A second card, from another research thread, finding no benefit at a lower dose. */
export const LOW_DOSE_CARD = {
  question: "Does a lower dose of zentarine ease the hand tremor of Velmor syndrome?",
  usual_answer: "Any dose of zentarine eases the tremor.",
  findings: [{
    claim: "In a second invented trial of 200 adults with Velmor syndrome, zentarine 5 mg halved the tremor score in " +
      "20 of 100 against 19 of 100 on placebo over 12 weeks.",
    certainty: "low",
    applies_to: "Adults with Velmor syndrome on 5 mg",
    answer_quote: "At 5 mg, zentarine did no better than placebo in the second trial.",
    sources: ["PMID: 40123456"],
    why_not_usual: "Quick answers treat every dose as the same.",
    tags: ["full_text_read"],
    what_would_change_it: "A trial of 5 mg with a clear benefit.",
    kind: "effect",
    subject: "zentarine",
    subject_type: "supplement",
    direction: "no_effect",
    numbers: [LOW_DOSE],
  }],
  public_value: {
    scope: "public",
    who_else: "Adults with Velmor syndrome offered a low dose",
    what_it_changes: "It shows the low dose may not help, so the dose matters.",
  },
  topic: VELMOR_TOPIC,
  open_leads: [],
};


type Respond = () => Response | Promise<Response>;

/** Every provider request answered from the recorded fixtures by what it asks for; anything else gets a 404. */
async function providerFetch(): Promise<typeof fetch> {
  const fixture = (path: string) => readFile(new URL(`../fixtures/${path}`, import.meta.url), "utf8");
  const work = JSON.parse(await fixture("crossref/work-no-marker.json")) as { message: Record<string, unknown> };
  const crossrefWork = (doi: string, title: string) =>
    JSON.stringify({ ...work, message: { ...work.message, DOI: doi, title: [title] } });
  const pubmed = await fixture("pubmed/efetch-record.xml");
  const routes: Record<string, Respond> = {
    [`crossref ${DOI_A}`]: () => new Response(crossrefWork(DOI_A, "An invented trial of zentarine in Velmor syndrome")),
    [`crossref ${DOI_B}`]: () => new Response(crossrefWork(DOI_B, "An invented case series of zentarine")),
    "crossref 10.1234/recorded.example": () => new Response(crossrefWork("10.1234/recorded.example",
      "Recorded effects of an example intervention")),
    "pubmed 40123456": () => new Response(pubmed),
  };
  return async (input) => {
    const url = new URL(String(input));
    const key = url.hostname === "api.crossref.org"
      ? `crossref ${decodeURIComponent(url.pathname.replace(/^\/works\//u, ""))}`
      : url.hostname === "eutils.ncbi.nlm.nih.gov" ? `pubmed ${url.searchParams.get("id")}` : `other ${url.hostname}`;
    const respond = routes[key];
    return respond === undefined ? new Response("not routed", { status: 404 }) : respond();
  };
}

/**
 * Runs the scenario; it throws at the first step that does not hold. The stores are made with the scenario's clock, so
 * the runner records each promotion at or after the decision it applies, as the intents' time check requires.
 */
export async function runAtlasScenario(
  makeStores: (clock: () => Date) => AtlasScenarioStores,
): Promise<AtlasScenarioReport> {
  let instant = Date.parse("2026-11-04T09:00:00.000Z");
  const clock = () => new Date(instant);
  const later = (minutes: number) => { instant += minutes * 60_000; };
  const stores = makeStores(clock);
  const github = new FakeGitHub();
  const repository = DEFAULT_FINDINGS_REPOSITORY;
  const tokenProvider = { getToken: async () => "synthetic-findings-token" };
  const library = new FindingsSaveService({
    receiptSecret: () => SECRET,
    limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
    queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository }),
    protocols: async () => PROTOCOLS,
    version: "0.1.0",
    build: "0123abc",
    now: clock,
  });
  let intentSequence = 0;
  const atlas = new AtlasReview({
    store: stores.review,
    reader: stores.reader,
    inbox: new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository }),
    version: "0.1.0",
    build: "0123abc",
    protocols: async () => PROTOCOLS,
    now: clock,
    newIntentId: () => {
      intentSequence += 1;
      return `00000000-0000-4000-8000-${String(intentSequence).padStart(12, "0")}`;
    },
    sourceCheckCache: new AtlasSourceCheckCache(),
  });
  const handler = createResearchContributionReviewHandler({
    allowedReviewerSubjects: new Set([OWNER]),
    atlas: { enabled: true, review: atlas, providers: () => PROVIDERS },
  });
  const owner = {
    authInfo: {
      token: "synthetic-owner-token",
      clientId: "synthetic-client",
      scopes: ["cases:review"],
      expiresAt: Math.floor(Date.now() / 1_000) + 600,
      extra: { subject: OWNER },
    },
  };
  const report: AtlasScenarioReport = { steps: [], replies: {}, scanned: { characters: 0, forbidden: [] } };
  const call = async (step: string, input: Record<string, unknown>) => {
    const result = await handler(input, owner);
    const structured = result.structuredContent as Record<string, unknown>;
    const text = (result.content as Array<{ text: string }>).map(({ text: line }) => line).join("\n");
    assert.equal(structured.canonicalEvidenceChangedByThisCall, false, `${step}: no call writes canonical evidence`);
    report.replies[step] = { text, structured };
    return { text, structured };
  };
  const promote = async (step: string, atlasNumber: string) => {
    const run = await stores.promote();
    assert.deepEqual(run.failed, [], `${step}: the writer refused nothing`);
    assert.equal(run.result.status, "promoted", `${step}: one intent promoted`);
    assert.equal(run.result.status === "promoted" && run.result.receipt.publicNumber, atlasNumber, `${step}: ${atlasNumber}`);
  };
  const save = async (card: object, contributor: string, target: string, bases: string[]) => {
    const parsed = findingsCardSchema.parse(card);
    return library.save({
      findings_card: card,
      contributor,
      finalization_receipt: issueResearchReceipt("finalization", {
        status: "ready_with_limits", community: "researched", receipts: 5, videos: 1, depth: "standard", target,
        coverage: "none", open_leads: parsed.open_leads.length, validated: 1, leads: 0, limits: 1, unverified: 0,
        findings: findingsCardDigest(parsed), bases,
      }, { secret: SECRET, now: clock }),
    }, { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) });
  };
  const original = globalThis.fetch;
  globalThis.fetch = await providerFetch();
  try {
    // 1. A free contributor's checked card is saved for review.
    const savedA = await save(VELMOR_CARD, ALICE, "0123456789ab", ["full_text_audit", "none"]);
    assert.deepEqual(savedA, { status: "saved", retryable: false, card_id: "ARF-0042", occurrence_count: 1 });
    report.steps.push("saved ARF-0042");

    // 2. List, inspect, accept and promote finding 1: a checked finding, its study bound by DOI.
    const listed = await call("list", { action: "list_findings" });
    assert.equal(listed.structured.outcome, "findings_listed");
    assert.deepEqual((listed.structured.findings as { cards: Array<{ items: unknown[] }> }).cards[0]!.items, [
      { item: "finding", number: 1, text: VELMOR_CARD.findings[0]!.claim.slice(0, 159) + "…", certainty: "moderate",
        kind: "effect", wouldBecome: "checked", recheckOf: null },
      { item: "finding", number: 2, text: VELMOR_CARD.findings[1]!.claim, certainty: "very_low", kind: "nothing_found",
        wouldBecome: "lead", recheckOf: null },
      { item: "lead", number: 1, text: "Doses above 20 mg", certainty: null, kind: null, wouldBecome: "lead",
        recheckOf: null },
    ]);
    const inspected = await call("inspect 1", { action: "inspect_finding", card: "arf-0042", finding: 1 });
    assert.equal(inspected.structured.outcome, "finding_inspected");
    const cardSha256 = (inspected.structured.card as { cardSha256: string }).cardSha256;
    assert.match(cardSha256, /^[a-f0-9]{64}$/u);
    // A finding drawn from YouTube comments is no longer stored (owner answer 170), so no confirmation under 4a is asked;
    // that check stays for cards stored before (atlas-acceptance-checks.test.ts).
    assert.deepEqual((inspected.structured.checks as Record<string, unknown>).community, "none");
    // Atlas phase 3: the card's topic, numbers block, kind, subject, subject type and direction, by default.
    const accept1 = { action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256 };
    const accepted1 = await call("accept 1", accept1);
    assert.equal(accepted1.structured.outcome, "finding_queued");
    assert.ok(accepted1.text.startsWith("Accepted ARF-0042 finding 1 as F-1001, a checked finding, of kind effect, " +
      "direction benefit, about zentarine (supplement), filed under Velmor syndrome (new topic), the card's topic. The " +
      "Atlas writer stores it within about 5 minutes; nothing is public until the Atlas pages exist."), accepted1.text);
    later(5);
    await promote("promote F-1001", "F-1001");
    const f1001 = await call("inspect F-1001", { action: "inspect_finding", atlasNumber: "F-1001" });
    assert.deepEqual(pick(f1001.structured.atlas, ["atlasNumber", "entryKind", "label", "version"]),
      { atlasNumber: "F-1001", entryKind: "finding", label: "checked", version: 1 });
    const stored = finding(await stores.reader.readAtlasState({ publicNumbers: ["F-1001"] }), "F-1001");
    assert.deepEqual(stored.versions[0]!.bindings.map(({ locator, polarity }) => [locator, polarity]),
      [[`doi:${DOI_A}`, "supports"]]);
    assert.deepEqual(stored.versions[0]!.content.tags, ["full_text_read"], "community_checked is never stored (4a)");
    assert.deepEqual(stored.versions[0]!.content.verifiedBases, ["full_text_audit"], "comment_audit is no basis (2a)");
    assert.deepEqual(pick(stored.versions[0]!.content, ["kind", "subject", "subjectType", "direction", "numbers"]), {
      kind: "effect", subject: "zentarine", subjectType: "supplement", direction: "benefit", numbers: [TREMOR, NAUSEA],
    }, "the card's fields and numbers block are stored (Atlas phase 3)");
    report.steps.push("accepted and promoted F-1001, checked, bound by DOI");

    // 3. Finding 2 has no verified basis: a lead. Every finding then has a decision, so the card is closed as reviewed.
    const accepted2 = await call("accept 2", { action: "accept_finding", card: "ARF-0042", finding: 2, cardSha256 });
    assert.ok(accepted2.text.startsWith("Accepted ARF-0042 finding 2 as a lead, F-1002, of kind nothing_found, " +
      "direction descriptive, about zentarine (supplement), with 1 search that found nothing: it has no verified basis."),
      accepted2.text);
    later(5);
    await promote("promote F-1002", "F-1002");
    const f1002 = finding(await stores.reader.readAtlasState({ publicNumbers: ["F-1002"] }), "F-1002");
    assert.deepEqual(f1002.versions[0]!.content.searchScope, [{ database: "pubmed", query: "zentarine voice tremor" }],
      "a search that found nothing keeps the search it made");
    const card42 = github.issue(42);
    assert.equal(card42.state, "closed");
    assert.equal(card42.state_reason, "completed");
    assert.deepEqual(card42.labels.map(({ name }) => name), ["findings-card", "beyond-quick-answer", "reviewed"]);
    assert.deepEqual((github.comments.get(42) ?? []).map(({ body }) => body.split("\n")[2]), [
      "Finding 1: accepted as F-1001, checked, 4 Nov 2026.",
      "Finding 2: accepted as F-1002, a lead, 4 Nov 2026.",
    ]);
    report.steps.push("accepted F-1002 as a lead; ARF-0042 closed as reviewed");

    // 4. A second card finds no benefit at a lower dose: accepted, linked as contradicting F-1001; both are contested.
    later(60);
    const savedB = await save(LOW_DOSE_CARD, BOB, "ba9876543210", ["full_text_audit"]);
    assert.equal(savedB.card_id, "ARF-0043");
    const inspectedB = await call("inspect B", { action: "inspect_finding", card: "ARF-0043", finding: 1 });
    const cardB = (inspectedB.structured.card as { cardSha256: string }).cardSha256;
    const acceptedB = await call("accept B", { action: "accept_finding", card: "ARF-0043", finding: 1,
      cardSha256: cardB });
    assert.ok(acceptedB.text.startsWith("Accepted ARF-0043 finding 1 as F-1003, a checked finding, of kind effect, " +
      "direction no_effect, about zentarine (supplement), filed under Velmor syndrome, the card's topic."),
      acceptedB.text);
    later(5);
    await promote("promote F-1003", "F-1003");
    const f1003 = finding(await stores.reader.readAtlasState({ publicNumbers: ["F-1003"] }), "F-1003");
    assert.deepEqual(f1003.versions[0]!.bindings.map(({ locator }) => locator), ["doi:10.1234/recorded.example"],
      "the PMID's paper is bound with the DOI PubMed lists");
    const linked = await call("link", { action: "link_findings", atlasNumber: "F-1003", relation: "contradicts",
      to: "F-1001", disagreement: "dose", rationale: "The two invented trials used 5 mg and 20 mg." });
    assert.equal(linked.structured.outcome, "finding_queued");
    later(5);
    await promote("promote the link", "F-1003");
    for (const number of ["F-1001", "F-1003"]) {
      const contested = await call(`inspect ${number} contested`, { action: "inspect_finding", atlasNumber: number });
      assert.equal(pick(contested.structured.atlas, ["label"]).label, "contested", `${number} is contested`);
    }
    report.steps.push("accepted F-1003 and linked it as contradicting F-1001: both contested");

    // 5. A correction of F-1001: version 2, with a dated note.
    const corrected = await call("correct F-1001", {
      action: "edit_finding", atlasNumber: "F-1001", version: 1,
      wording: VELMOR_CARD.findings[0]!.claim.replace("nausea affected 12 of 120 against 6 of 120, a number needed " +
        "to harm of 20", "nausea affected 13 of 120 against 6 of 120, a number needed to harm of 18"),
      numbers: [TREMOR, { ...NAUSEA, option_events: 13, nnh: 18 }],
      note: "The invented trial report gives 13 cases of nausea on zentarine, not 12.",
    });
    assert.equal(corrected.structured.outcome, "finding_queued", corrected.text);
    later(5);
    await promote("promote the correction", "F-1001");
    const f1001v2 = await call("inspect F-1001 v2", { action: "inspect_finding", atlasNumber: "F-1001" });
    assert.deepEqual(pick(f1001v2.structured.atlas, ["version", "label", "kind", "direction"]),
      { version: 2, label: "contested", kind: "effect", direction: "benefit" }, "the correction keeps the fields");
    report.steps.push("corrected F-1001 to version 2 with a dated note");

    // What the final scan looks for, read from the cards before the first one is forgotten and deleted.
    const markers = [...github.issues.map(({ body }) => body),
      ...[...github.comments.values()].flat().map(({ body }) => body)]
      .flatMap((body) => [...body.matchAll(/<!-- askrigor-findings-(?:card|occurrence):([A-Za-z0-9_-]+) -->/gu)])
      .map(([, encoded]) => JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8")) as Record<string, string>);
    const records = github.issues.map(({ body }) => /(`{3,})json\n([\s\S]*?)\n\1/u.exec(body)![2]!)
      .map((json) => JSON.parse(json) as { card_sha256: string });

    // 6. The first card's contributor asks for it to be deleted (decision 7): forget_card removes its decisions and
    // strips it on GitHub, the owner deletes the issue, and a second call finds GitHub answering 410. F-1001 and
    // F-1002, accepted from it, stay while they are valid.
    later(60);
    const forgetting = await call("forget ARF-0042", { action: "forget_card", card: "arf-0042" });
    assert.equal(forgetting.structured.outcome, "card_forget_waiting_for_owner", forgetting.text);
    const forgotten = forgetting.structured.forget as {
      findingsOnlyFromThese: string[];
      decisionsRemoved: number;
      cards: Array<{ card: string; github: string; url: string }>;
    };
    assert.deepEqual(forgotten.findingsOnlyFromThese, ["F-1001", "F-1002"]);
    assert.equal(forgotten.decisionsRemoved, 2);
    assert.deepEqual(forgotten.cards.map(({ card, github: state }) => [card, state]), [["ARF-0042", "stripped"]]);
    assert.deepEqual(await stores.review.inspectCards([42]), [], "the card's decision rows are deleted");
    const stripped = github.issue(42);
    assert.deepEqual(
      { state: stripped.state, reason: stripped.state_reason, labels: stripped.labels, locked: stripped.locked,
        comments: github.comments.get(42) ?? [] },
      { state: "closed", reason: "not_planned", labels: [], locked: true, comments: [] },
    );
    assert.ok(!/zentarine|Velmor|askrigor-findings-card/u.test(`${stripped.title}\n${stripped.body}`),
      "the tombstone holds no wording and no card marker");
    github.deleteIssue(42);
    const gone = await call("forget ARF-0042 again", { action: "forget_card", card: "ARF-0042" });
    assert.equal(gone.structured.outcome, "card_forgotten", gone.text);
    const kept = await call("inspect F-1001 after the forget", { action: "inspect_finding", atlasNumber: "F-1001" });
    assert.deepEqual(pick(kept.structured.atlas, ["version", "label"]), { version: 2, label: "contested" });
    report.steps.push("forgot ARF-0042: its decisions removed, its issue stripped, then deleted; F-1001 stays");

    // 7. Nothing canonical or queued names a card, a thread, a fingerprint, a receipt, a card hash, an answer quote or
    // a video.
    const forbidden = [
      "ARF-", "arf-",
      ...markers.flatMap(({ thread, fingerprint, receipt_sha256: receipt }) => [thread!, fingerprint!, receipt!]),
      ...records.map(({ card_sha256: digest }) => digest),
      cardSha256, cardB,
      ...[...VELMOR_CARD.findings, ...LOW_DOSE_CARD.findings].map(({ answer_quote: quote }) => quote),
      VIDEO, "youtube", "YouTube",
    ];
    const rows = await stores.rows();
    for (const value of forbidden) assert.ok(!rows.includes(value), `a stored row holds ${value}`);
    report.scanned = { characters: rows.length, forbidden };
    report.steps.push("no stored row names a card, thread, fingerprint, receipt, card hash, answer quote or video");

    const final = await call("list at the end", { action: "list_findings" });
    assert.deepEqual((final.structured.findings as { cards: unknown[] }).cards, []);
    return report;
  } finally {
    globalThis.fetch = original;
  }
}

function finding(state: AtlasState, publicNumber: string) {
  const found = state.findings.find((candidate) => candidate.publicNumber === publicNumber);
  assert.ok(found !== undefined, `${publicNumber} is stored`);
  return found;
}

function pick(value: unknown, keys: string[]): Record<string, unknown> {
  const record = value as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}
