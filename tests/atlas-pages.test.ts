import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  AtlasFindingPromotionRunner,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasPageSource,
  InMemoryAtlasPromotionStore,
  InMemoryAtlasPublicationStore,
  InMemoryAtlasReviewStore,
  PostgresAtlasPageSource,
  RESEARCH_USE_NOTICE_VERSION,
  deterministicUuid,
  prepareAtlasFindingIntent,
  sha256,
  type AtlasPageSource,
  type AtlasPublicationStore,
  type AtlasReviewStore,
} from "@askrigor/evidence-repository";

import {
  AtlasChangeSignal,
  announcingPublicationStore,
  announcingReviewStore,
} from "../apps/research-mcp/src/atlas/change-signal.js";
import { ATLAS_MAP_TOPIC_FINDINGS, NOT_CHECKED_LABEL, sourceIdentifierOf, loadAtlasFindings, loadAtlasMap, loadAtlasSearch,
  loadAtlasTopics, loadAtlasTopic, searchAtlasIndex, searchTextsOf, type AtlasSearchIndex,
  type ShownFinding } from "../apps/research-mcp/src/atlas/page-data.js";
import { ATLAS_CSS, atlasPageProblems, clusterLayout, escapeHtml, findingPath, mapRadius, percent, sourceLink, renderAtlasMap,
  renderAtlasSearch, renderAtlasTopic } from "../apps/research-mcp/src/atlas/pages.js";
import { atlasSearchMatch, atlasSearchQuery, atlasSearchWords, foldAtlasSearchTexts,
  type AtlasSearchText } from "../apps/research-mcp/src/atlas/search.js";
import {
  ATLAS_PAGE_HEADERS,
  AtlasPageCache,
  atlasRouteOf,
  createAtlasPagesHandler,
  createAtlasPagesHandlerFromEnv,
  type AtlasPagesHandler,
  type RenderedAtlasPage,
} from "../apps/research-mcp/src/atlas/pages-http.js";
import { planCardPublication } from "../apps/research-mcp/src/atlas/publication.js";
import { atlasPagesEnabledFromEnv } from "../apps/research-mcp/src/config.js";
import {
  findingsCardDigest,
  findingsCardSchema,
  withoutYouTubeData,
  type StoredFinding,
} from "../apps/research-mcp/src/findings/card.js";
import type { FindingsRecord, FindingsSaveAccount } from "../apps/research-mcp/src/findings/service.js";
import { createTokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import { CARD as HIP_CARD } from "./helpers/findings-fixtures.js";
import { LOW_DOSE_CARD, VELMOR_CARD } from "./helpers/atlas-scenario.js";

// Decision 171, section 4C: the public Atlas pages, rendered on the server from the publications (part B) and the
// accepted findings (phase 2). Everything here is synthetic: Velmor syndrome, zentarine, the trials and their
// identifiers (10.0000/ marks synthetic DOIs) are invented.

const FREE: FindingsSaveAccount = { mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION };
const SAVED_AT = "2026-11-04T09:00:00.000Z";
const CSP = "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; " +
  "base-uri 'none'; object-src 'none'";

/** What no page may ever hold. */
const NEVER = {
  answerQuote: "ANSWERQUOTESENTINEL the answer's own sentence",
  surface: "/mcp/claude",
  model: "Example Model 2026-08-06",
  build: "0123abc",
  ownerReason: "OWNERREASONSENTINEL it overstates the trial",
  heldEmail: "zentarine.trials@example.com",
  rejected: "REJECTEDSENTINEL",
  unpublished: "UNPUBLISHEDSENTINEL",
  pending: "PENDINGSENTINEL",
  cardWording: "CARDWORDINGSENTINEL",
  withdrawnClaim: "WITHDRAWNCLAIMSENTINEL",
  videoFinding: "VIDEOFINDINGSENTINEL",
  olderVideoFinding: "OLDERVIDEOSENTINEL",
  video: "dQw4w9WgXcQ",
  usualAnswer: "USUALANSWERSENTINEL",
  whoElse: "WHOELSESENTINEL",
  whatItChanges: "WHATITCHANGESSENTINEL",
} as const;

function recordOf(card: object, options: { cardNumber?: number; olderFindings?: StoredFinding[] } = {}): FindingsRecord {
  const parsed = findingsCardSchema.parse(card);
  const stored = withoutYouTubeData(parsed);
  return {
    schema: "askrigor.findings-card.v1",
    card: { ...stored.card, findings: [...stored.card.findings, ...(options.olderFindings ?? [])] },
    card_sha256: findingsCardDigest(parsed),
    stamp: {
      saved_at: SAVED_AT,
      askrigor_version: "0.1.0",
      askrigor_build: NEVER.build,
      protocols: [{ name: "HRP", version: "20.6.32", sha256: "a".repeat(64) }],
      tool_catalog_sha256: "c".repeat(64),
      surface: NEVER.surface,
      reported_model_unverified: NEVER.model,
      research: { finalized_at: SAVED_AT, depth: "standard", status: "ready" },
    },
  };
}

/** A card of one finding: VELMOR_CARD's first, with its claim and anything else replaced. */
function oneFindingCard(claim: string, overrides: Record<string, unknown> = {}) {
  return { ...VELMOR_CARD, findings: [{ ...VELMOR_CARD.findings[0]!, claim, ...overrides }] };
}

const MADE_WITH = {
  askrigorVersion: "0.2.0",
  build: "unknown",
  protocols: [{ name: "HRP", version: "20.6.32", sha256: sha256("synthetic-hrp") }],
  depth: "standard",
  status: "complete",
};
const DECIDED_WITH = { askrigorVersion: "0.2.0", build: "unknown", protocols: MADE_WITH.protocols };
const TREMOR = {
  outcome: "tremor score halved", better: "more", option: "zentarine 20 mg", option_events: 30, option_total: 120,
  comparator: "placebo", comparator_events: 18, comparator_total: 120, follow_up: "12 weeks", nnt: 10,
};

/** An accept intent's payload, as the owner's accept_finding records it. */
function acceptPayload(options: {
  wording: string;
  cardWording?: string;
  topicLabel?: string;
  numbers?: unknown[];
  identifiers?: Array<{ scheme: string; value: string }>;
  lead?: boolean;
  certainty?: string;
}) {
  const accepted = sha256(`accepted:${options.wording}`);
  const lead = options.lead === true;
  return {
    schema: "askrigor.atlas-finding-intent.v1",
    kind: "accept",
    entryKind: lead ? "lead" : "finding",
    leadOrigin: lead ? "unverified_finding" : null,
    editedAtAcceptance: options.cardWording !== undefined,
    topic: { key: "velmor-syndrome", label: options.topicLabel ?? "Velmor syndrome (invented)" },
    question: "Does zentarine ease the hand tremor of Velmor syndrome in adults?",
    content: {
      wording: options.wording,
      appliesTo: "Adults with Velmor syndrome",
      certainty: options.certainty ?? "moderate",
      usualAnswer: `${NEVER.usualAnswer} a quick answer calls it gentle.`,
      whyNotUsual: "Quick answers miss the trial's numbers.",
      whatWouldChangeIt: "A second trial of similar size.",
      whoElse: `${NEVER.whoElse} adults weighing zentarine.`,
      whatItChanges: `${NEVER.whatItChanges} the dose matters.`,
      tags: [],
      verifiedBases: lead ? [] : ["full_text_audit"],
      numbers: options.numbers ?? [],
      kind: "effect",
      subject: "zentarine",
      subjectType: "supplement",
      direction: "benefit",
    },
    sources: [{
      kind: "study",
      identifiers: options.identifiers ?? [{ scheme: "doi", value: `10.0000/synthetic-${sha256(options.wording).slice(0, 8)}` }],
      check: {
        provider: "crossref", title: "An invented trial", publishedYear: 2025, retractionStatus: "none_found",
        notices: [], ownerConfirmed: false, envelopeSha256: sha256(`envelope:${options.wording}`),
        checkedAt: "2026-11-04T08:00:00.000Z",
      },
    }],
    wordingKeys: {
      card: options.cardWording === undefined ? accepted : sha256(`card:${options.cardWording}`),
      accepted,
    },
    researchCheckedOn: "2026-11-03",
    madeWith: MADE_WITH,
  };
}

/** The Atlas in memory: publications, the owner's review store, the canonical store and its runner. */
function atlas() {
  const publications = new InMemoryAtlasPublicationStore();
  const review = new InMemoryAtlasReviewStore();
  const canonical = new InMemoryAtlasCanonicalStore();
  let instant = Date.parse("2026-11-04T10:00:00.000Z");
  const tick = () => new Date(instant += 60_000).toISOString();
  const runner = new AtlasFindingPromotionRunner(new InMemoryAtlasPromotionStore(review, canonical), { now: tick });
  let sequence = 0;
  const intentId = () => deterministicUuid(`atlas-pages-test:${sequence++}`);
  const promote = async () => {
    const run = await runner.promoteAccepted();
    expect(run.failed).toEqual([]);
    expect(run.result.status).toBe("promoted");
  };
  /** Accepts a finding into the canonical Atlas; returns its F number. */
  const accept = async (cardNumber: number, payload: ReturnType<typeof acceptPayload>) => {
    const prepared = prepareAtlasFindingIntent(payload);
    const decided = await review.decide({
      cardNumber, itemKind: "finding", itemNumber: 1, decision: payload.entryKind === "lead" ? "accepted_as_lead" : "accepted",
      cardSha256: sha256(`card:${cardNumber}`), ownerReason: null, decidedAt: tick(),
      intent: { intentId: intentId(), ...prepared }, recheckedPublicNumber: null,
    });
    await promote();
    return decided.publicNumber!;
  };
  /** Records and applies a later intent: a link, a withdrawal. */
  const record = async (payload: Record<string, unknown>) => {
    const prepared = prepareAtlasFindingIntent({ schema: "askrigor.atlas-finding-intent.v1", ...payload });
    const intent = prepared.payload;
    if (intent.kind === "accept" || intent.kind === "recheck") throw new Error("not recorded this way");
    await review.recordIntent({
      intentId: intentId(), intentKind: intent.kind, publicNumber: intent.publicNumber, payload: intent,
      payloadSha256: prepared.payloadSha256, ownerReason: null, createdAt: tick(), retryOfIntentId: null,
    });
    await promote();
  };
  /** Publishes a card's eligible findings as the save path does; returns the publications by finding number. */
  const publish = async (cardNumber: number, record: FindingsRecord, store: AtlasPublicationStore = publications) => {
    const plan = planCardPublication({ record, setAside: false, route: { route: "save", account: FREE } });
    expect(plan.problems).toEqual([]);
    const rows = await store.publish({
      cardNumber, cardSha256: record.card_sha256, findings: plan.drafts, publishedAt: tick(), revive: false,
    });
    return { rows, leftOut: plan.leftOut };
  };
  return { publications, review, canonical, tick, accept, record, publish };
}

/**
 * The fixture every page test reads: unreviewed, edited, accepted, contested, lead, held, rejected, unpublished,
 * pending and withdrawn-after-acceptance findings, with what must never show in each.
 */
async function fixture() {
  const store = atlas();
  const p = (rows: Awaited<ReturnType<typeof store.publish>>["rows"], finding = 1) =>
    rows.find(({ findingNumber }) => findingNumber === finding)!.publicationNumber;

  // An unreviewed card of two findings (an effect with numbers, a search that found nothing); its third finding, drawn
  // from a video's comments, never reaches the stored card, and an older stored finding backed by videos is left out.
  const main = await store.publish(4242, recordOf({
    ...VELMOR_CARD,
    findings: [
      { ...VELMOR_CARD.findings[0]!, answer_quote: NEVER.answerQuote },
      VELMOR_CARD.findings[1]!,
      { ...VELMOR_CARD.findings[0]!, claim: `${NEVER.videoFinding} from comments.`, sources: [NEVER.video],
        tags: ["community_checked"] },
    ],
  }, {
    olderFindings: [{ ...recordOf(VELMOR_CARD).card.findings[0]!, claim: `${NEVER.olderVideoFinding} older.`,
      youtube_videos: 2 }],
  }));
  expect(main.leftOut).toEqual([{ findingNumber: 3, reason: "youtube_comments" }]);
  const effect = p(main.rows, 1);
  const nothingFound = p(main.rows, 2);

  // Another topic, unreviewed.
  const hip = p((await store.publish(4300, recordOf(HIP_CARD))).rows);

  // Edited at acceptance: the card's wording is replaced by the owner's.
  const editedCard = await store.publish(4244, recordOf(oneFindingCard(
    `${NEVER.cardWording}: zentarine 20 mg halved the tremor score in 30 of 120 against 18 of 120 on placebo.`)));
  const editedWording = "Accepted wording: in one invented trial, zentarine 20 mg halved the tremor score in 30 of 120 " +
    "against 18 of 120 on placebo over 12 weeks.";
  const editedNumber = await store.accept(4244, acceptPayload({
    wording: editedWording,
    cardWording: "card",
    numbers: [TREMOR],
    identifiers: [{ scheme: "doi", value: "10.0000/synthetic-velmor-a" }, { scheme: "pmid", value: "40123456" }],
  }));
  await store.publications.decide({ cardNumber: 4244, findingNumber: 1, state: "edited", atlasNumber: editedNumber,
    decidedAt: store.tick() });

  // Accepted as the card gives it.
  const lowDose = p((await store.publish(4243, recordOf(LOW_DOSE_CARD))).rows);
  const lowDoseNumber = await store.accept(4243, acceptPayload({
    wording: LOW_DOSE_CARD.findings[0]!.claim, certainty: "low",
    identifiers: [{ scheme: "pmid", value: "40123456" }],
  }));
  await store.publications.decide({ cardNumber: 4243, findingNumber: 1, state: "accepted", atlasNumber: lowDoseNumber,
    decidedAt: store.tick() });

  // The two contradict each other on the dose: both are contested.
  await store.record({ kind: "link", publicNumber: editedNumber, relation: "contradicts", toPublicNumber: lowDoseNumber,
    disagreement: "dose", rationale: "LINKRATIONALESENTINEL the doses differ.", decidedWith: DECIDED_WITH });

  // A lead: reviewed, no verified basis.
  const leadClaim = "LEADCLAIM zentarine may ease the voice tremor, though no trial measured it.";
  const lead = p((await store.publish(4247, recordOf(oneFindingCard(leadClaim)))).rows);
  const leadNumber = await store.accept(4247, acceptPayload({ wording: leadClaim, lead: true }));
  await store.publications.decide({ cardNumber: 4247, findingNumber: 1, state: "accepted", atlasNumber: leadNumber,
    decidedAt: store.tick() });

  // Withdrawn after acceptance, with a public note.
  const withdrawnClaim = `${NEVER.withdrawnClaim} zentarine cured the tremor in every adult.`;
  const withdrawn = p((await store.publish(4246, recordOf(oneFindingCard(withdrawnClaim)))).rows);
  const withdrawnNumber = await store.accept(4246, acceptPayload({ wording: withdrawnClaim }));
  await store.publications.decide({ cardNumber: 4246, findingNumber: 1, state: "accepted", atlasNumber: withdrawnNumber,
    decidedAt: store.tick() });
  await store.record({ kind: "withdraw", publicNumber: withdrawnNumber, version: 1,
    note: "WITHDRAWNNOTE A later audit found the counts were misread.", decidedWith: DECIDED_WITH });

  // Held: its claim holds an email address.
  const heldCard = await store.publish(4248, recordOf(oneFindingCard(`Write to ${NEVER.heldEmail} for the protocol.`)));
  expect(heldCard.rows[0]!.state).toBe("held");
  // Rejected.
  const rejected = p((await store.publish(4249, recordOf(oneFindingCard(`${NEVER.rejected} zentarine claim.`)))).rows);
  await store.publications.decide({ cardNumber: 4249, findingNumber: 1, state: "rejected", atlasNumber: null,
    decidedAt: store.tick() });
  // Unpublished by the owner, with a private reason.
  const unpublished = p((await store.publish(4250, recordOf(oneFindingCard(`${NEVER.unpublished} zentarine claim.`)))).rows);
  await store.publications.withdraw({ reason: "owner_unpublished", publicationNumbers: [unpublished],
    ownerReason: NEVER.ownerReason, withdrawnAt: store.tick() });
  // Accepted, but its F number is not written yet (the promotion timer has not run).
  const pending = p((await store.publish(4251, recordOf(oneFindingCard(`${NEVER.pending} zentarine claim.`)))).rows);
  await store.publications.decide({ cardNumber: 4251, findingNumber: 1, state: "accepted", atlasNumber: "F-1999",
    decidedAt: store.tick() });

  const source = new InMemoryAtlasPageSource({ publications: store.publications, canonical: store.canonical });
  return {
    store,
    source,
    shown: { effect, nothingFound, hip, edited: p(editedCard.rows), lowDose, lead },
    hidden: { held: p(heldCard.rows), rejected, unpublished, pending, withdrawn },
    numbers: { edited: editedNumber, lowDose: lowDoseNumber, lead: leadNumber, withdrawn: withdrawnNumber },
    editedWording,
  };
}

// Serving -----------------------------------------------------------------------------------------------------------

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function serve(handler: AtlasPagesHandler): Promise<string> {
  const server = createAskRigorHttpServer({ publicServerEnabled: false, atlasPagesHandler: handler });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function pages(source: AtlasPageSource, options: Partial<Parameters<typeof createAtlasPagesHandler>[0]> = {}) {
  return createAtlasPagesHandler({ enabled: true, source, signal: new AtlasChangeSignal(), ...options });
}

async function text(base: string, path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, init);
  return { response, body: await response.text() };
}

/** A raw request, for what fetch will not send (a GET with a body). */
function raw(base: string, path: string, headers: Record<string, string>, body?: string) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    const url = new URL(base);
    const outgoing = httpRequest({ host: url.hostname, port: url.port, path, method: "GET", headers }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode!, headers: response.headers }));
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

function expectPageHeaders(response: Response) {
  expect(ATLAS_PAGE_HEADERS["Content-Security-Policy"]).toBe(CSP);
  expect(response.headers.get("content-security-policy")).toBe(CSP);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("set-cookie")).toBeNull();
}

// Rendering ---------------------------------------------------------------------------------------------------------

describe("the finding pages", () => {
  it("show an unreviewed finding with the exact label, its numbers worked out and its sources as built links", async () => {
    const { source, shown } = await fixture();
    const base = await serve(pages(source));
    const { response, body } = await text(base, `/atlas/findings/${shown.effect}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(body).toContain(`<p class="status-label">${NOT_CHECKED_LABEL}</p>`);
    expect(NOT_CHECKED_LABEL).toBe("Not checked by supervisors yet");
    expect(body).toContain(escapeHtml(VELMOR_CARD.findings[0]!.claim));
    // Each group's count and size, the rates and the numbers needed, worked out from the counts.
    for (const fragment of [
      "<strong>tremor score halved</strong>, over 12 weeks (more is better)",
      "<td>30 of 120</td><td>25%</td>", "<td>18 of 120</td><td>15%</td>",
      "<strong>Number needed to treat: 10</strong>",
      "About 1 in 10 more people had this outcome with zentarine 20 mg than with placebo.",
      "<strong>nausea</strong>, over 12 weeks (fewer is better)",
      "<td>12 of 120</td><td>10%</td>", "<td>6 of 120</td><td>5%</td>",
      "<strong>Number needed to harm: 20</strong>",
    ]) {
      expect(body).toContain(fragment);
    }
    expect(body).toContain("<dt>How sure</dt><dd>Moderate");
    expect(body).toContain("<dt>Whom it applies to</dt><dd>Adults with Velmor syndrome</dd>");
    expect(body).toContain("<dt>Kind</dt><dd>An effect</dd>");
    expect(body).toContain("<dt>Subject</dt><dd>zentarine (supplement)</dd>");
    expect(body).toContain("<dt>Direction</dt><dd>Benefit</dd>");
    expect(body).toContain(escapeHtml(VELMOR_CARD.findings[0]!.why_not_usual));
    expect(body).toContain(escapeHtml(VELMOR_CARD.findings[0]!.what_would_change_it));
    expect(body).toContain('<a href="https://doi.org/10.0000/synthetic-velmor-a">DOI 10.0000/synthetic-velmor-a</a>');
    expect(body).toContain('Saved <time datetime="2026-11-04">4 Nov 2026</time>');
    expect(body).toContain("AskRigor 0.1.0");
    expect(body).toContain('<a href="/atlas/topics/velmor-syndrome">Velmor syndrome</a>');
    expect(body).not.toContain("Atlas number");

    const searched = await text(base, `/atlas/findings/${shown.nothingFound}`);
    expect(searched.body).toContain("What was searched, and found nothing");
    expect(searched.body).toContain("<strong>PubMed</strong>: <code>zentarine voice tremor</code>");
    expect(searched.body).toContain("<dt>Kind</dt><dd>Searched for, nothing found</dd>");
    expect(searched.body).not.toContain("The numbers");
  });

  it("show an accepted or edited finding as its F number's current version, never the card's wording", async () => {
    const { source, shown, numbers, editedWording } = await fixture();
    const base = await serve(pages(source));
    const edited = await text(base, `/atlas/findings/${shown.edited}`);
    expect(edited.response.status).toBe(200);
    expect(edited.body).toContain(escapeHtml(editedWording));
    expect(edited.body).not.toContain(NEVER.cardWording);
    expect(edited.body).not.toContain(NOT_CHECKED_LABEL);
    expect(edited.body).toContain(`Atlas number ${numbers.edited}`);
    expect(edited.body).toMatch(/Checked by supervisors <time datetime="2026-11-04">4 Nov 2026<\/time>/u);
    expect(edited.body).toContain('Research last checked <time datetime="2026-11-03">3 Nov 2026</time>');
    // The canonical version's sources, one family with both its identifiers, and its own numbers and version.
    expect(edited.body).toContain('<a href="https://doi.org/10.0000/synthetic-velmor-a">DOI 10.0000/synthetic-velmor-a</a> · ' +
      '<a href="https://pubmed.ncbi.nlm.nih.gov/40123456/">PMID 40123456</a>');
    expect(edited.body).toContain("<strong>Number needed to treat: 10</strong>");
    expect(edited.body).toContain("AskRigor 0.2.0");
    // The canonical topic, with its accepted label.
    expect(edited.body).toContain('<a href="/atlas/topics/velmor-syndrome">Velmor syndrome (invented)</a>');
    // Contested: it names the other finding, its page and what they disagree on.
    expect(edited.body).toContain('<p class="status-label">Contested</p>');
    expect(edited.body).toContain(`<a href="/atlas/findings/${shown.lowDose}">${shown.lowDose}</a> disagrees with it on the dose.`);
    const lowDose = await text(base, `/atlas/findings/${shown.lowDose}`);
    expect(lowDose.body).toContain(`<a href="/atlas/findings/${shown.edited}">${shown.edited}</a> disagrees with it on the dose.`);
    expect(lowDose.body).toContain("<dt>How sure</dt><dd>Low");

    const lead = await text(base, `/atlas/findings/${shown.lead}`);
    expect(lead.body).toContain('<p class="status-label">Lead</p>');
    expect(lead.body).toContain("kept it as a lead: no verified basis backs it yet.");
    expect(lead.body).toContain(`Atlas number ${numbers.lead}`);
  });

  it("escape every text, and hold no script tag", async () => {
    const store = atlas();
    const claim = `<script>alert("x")</script> & 'zentarine' <b>bold</b>`;
    const { rows } = await store.publish(4400, recordOf({
      ...oneFindingCard(claim, { applies_to: `Adults "quoted" <i>here</i>` }),
      topic: { key: "velmor-syndrome", label: "Velmor <em>syndrome</em>" },
    }));
    const base = await serve(pages(new InMemoryAtlasPageSource({ publications: store.publications })));
    for (const path of ["/atlas", `/atlas/findings/${rows[0]!.publicationNumber}`, "/atlas/topics/velmor-syndrome",
      "/atlas/changes"]) {
      const { body } = await text(base, path);
      expect(body, path).not.toMatch(/<script/iu);
      expect(body, path).not.toContain("<b>bold</b>");
      expect(body, path).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;zentarine&#39; &lt;b&gt;bold&lt;/b&gt;");
      expect(atlasPageProblems(body), path).toEqual([]);
    }
    const page = (await text(base, `/atlas/findings/${rows[0]!.publicationNumber}`)).body;
    expect(page).toContain("Adults &quot;quoted&quot; &lt;i&gt;here&lt;/i&gt;");
    expect(page).toContain("Velmor &lt;em&gt;syndrome&lt;/em&gt;");
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;");
  });

  it("never show held, rejected or withdrawn publications, one whose F number is not written, or a withdrawn finding", async () => {
    const { source, hidden } = await fixture();
    const base = await serve(pages(source));
    for (const [name, number] of Object.entries(hidden)) {
      const { response, body } = await text(base, `/atlas/findings/${number}`);
      expect(response.status, name).toBe(404);
      expect(body, name).toContain("<h1>Not found</h1>");
    }
    const everything = (await Promise.all(["/atlas", "/atlas/topics/velmor-syndrome", "/atlas/changes"]
      .map(async (path) => (await text(base, path)).body))).join("\n");
    for (const absent of [NEVER.heldEmail, NEVER.rejected, NEVER.unpublished, NEVER.pending, NEVER.withdrawnClaim,
      ...Object.values(hidden).map((number) => `/atlas/findings/${number}"`)]) {
      expect(everything).not.toContain(absent);
    }
  });

  it("put none of the forbidden items on any page", async () => {
    const { source, store, shown, hidden } = await fixture();
    const base = await serve(pages(source));
    const paths = ["/atlas", "/atlas/changes", "/atlas/topics/velmor-syndrome", "/atlas/topics/hip-osteoarthritis",
      ...[...Object.values(shown), ...Object.values(hidden)].map((number) => `/atlas/findings/${number}`), "/atlas/nowhere"];
    const digests = store.publications.allRows().flatMap(({ cardSha256 }) => cardSha256 === null ? [] : [cardSha256]);
    for (const path of paths) {
      const { body } = await text(base, path);
      for (const absent of [...Object.values(NEVER), ...digests, "ARF-", "4242", "4244", "answer_quote", "LINKRATIONALESENTINEL"]) {
        expect(body, `${path} holds ${absent}`).not.toContain(absent);
      }
      // No account, contributor, chat, surface, model or YouTube, in any case.
      expect(body, path).not.toMatch(/youtu|claude|chatgpt|\bgpt\b|contributor|account|\bchat\b|model|surface/iu);
      expect(body, path).not.toMatch(/<script|<iframe|\sstyle=|\son[a-z]+=/iu);
      expect(body, path).toContain('method="get" action="/atlas/search"');
      expect(atlasPageProblems(body), path).toEqual([]);
    }
  });
});

describe("the home, topic and changes pages", () => {
  it("lead the home page with recently published, recently checked and contested findings, and no picks yet", async () => {
    const { source, shown } = await fixture();
    const base = await serve(pages(source));
    const { body } = await text(base, "/atlas");
    expect(body).toContain('<h2 id="recently-published">Recently published</h2>');
    expect(body).toContain('<h2 id="recently-checked">Recently checked</h2>');
    expect(body).toContain('<h2 id="contested">Contested</h2>');
    expect(body).toContain("These two checked findings disagree on the dose.");
    expect(body).not.toContain("Most important now");
    const published = body.slice(body.indexOf('id="recently-published"'), body.indexOf('id="recently-checked"'));
    const checked = body.slice(body.indexOf('id="recently-checked"'), body.indexOf('id="contested"'));
    for (const number of [shown.effect, shown.nothingFound, shown.hip, shown.edited, shown.lowDose]) {
      expect(published).toContain(`/atlas/findings/${number}"`);
    }
    expect(published).toContain(`<p class="badge badge-unreviewed">${NOT_CHECKED_LABEL}</p>`);
    for (const number of [shown.edited, shown.lowDose]) expect(checked).toContain(`/atlas/findings/${number}"`);
    for (const number of [shown.effect, shown.hip]) expect(checked).not.toContain(`/atlas/findings/${number}"`);
    // A lead never goes in a lane.
    expect(body).not.toContain(`/atlas/findings/${shown.lead}"`);
  });

  it("list a topic's findings by section, accepted ones under their canonical topic, and 404 an empty topic", async () => {
    const { source, shown } = await fixture();
    const base = await serve(pages(source));
    const velmor = await text(base, "/atlas/topics/velmor-syndrome");
    expect(velmor.response.status).toBe(200);
    expect(velmor.body).toContain("<h1>Velmor syndrome (invented)</h1>");
    const options = velmor.body.slice(velmor.body.indexOf('id="part-options"'), velmor.body.indexOf('id="part-nothing_found"'));
    // Checked findings first, the unreviewed one after them.
    expect(options.indexOf(shown.edited)).toBeGreaterThan(-1);
    expect(options.indexOf(shown.edited)).toBeLessThan(options.indexOf(shown.effect));
    expect(velmor.body.slice(velmor.body.indexOf('id="part-nothing_found"'))).toContain(shown.nothingFound);
    expect(velmor.body.slice(velmor.body.indexOf('id="part-leads"'))).toContain(shown.lead);
    expect(velmor.body).not.toContain(shown.hip);
    const hip = await text(base, "/atlas/topics/hip-osteoarthritis");
    expect(hip.body).toContain("<h1>Hip osteoarthritis</h1>");
    expect(hip.body).toContain(`/atlas/findings/${shown.hip}"`);
    expect(hip.body).not.toContain(shown.effect);
    expect((await text(base, "/atlas/topics/no-such-topic")).response.status).toBe(404);
  });

  it("list what changed, newest first: publications, checks, relabels and a withdrawal with its public note", async () => {
    const { source, shown, numbers } = await fixture();
    const base = await serve(pages(source));
    const { body } = await text(base, "/atlas/changes");
    expect(body).toContain("<h1>What changed</h1>");
    expect(body).toContain("Checked by supervisors");
    expect(body).toContain("Label changed from checked to contested");
    expect(body).toContain(`${numbers.withdrawn} was withdrawn after it was checked, and left these pages.`);
    expect(body).toContain("WITHDRAWNNOTE A later audit found the counts were misread.");
    expect(body).toContain(`/atlas/findings/${shown.effect}"`);
    // Newest first.
    const times = [...body.matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})">/gu)].map((match) => match[1]!);
    expect(times).toEqual([...times].sort().reverse());
  });
});

// Identifiers, numbers and the page check ---------------------------------------------------------------------------

describe("source links and figures", () => {
  it("build each source's link from its identifier alone, and leave out anything that is not one", () => {
    expect(sourceIdentifierOf("10.1002/ART.41142")).toEqual({ scheme: "doi", value: "10.1002/art.41142" });
    expect(sourceIdentifierOf("https://doi.org/10.1002/art.41142")).toEqual({ scheme: "doi", value: "10.1002/art.41142" });
    expect(sourceIdentifierOf("doi: 10.1002/art.41142")).toEqual({ scheme: "doi", value: "10.1002/art.41142" });
    expect(sourceIdentifierOf("PMID: 40123456")).toEqual({ scheme: "pmid", value: "40123456" });
    expect(sourceIdentifierOf("40123456")).toEqual({ scheme: "pmid", value: "40123456" });
    expect(sourceIdentifierOf("pmc7654321")).toEqual({ scheme: "pmcid", value: "PMC7654321" });
    expect(sourceIdentifierOf("nct01234567")).toEqual({ scheme: "nct", value: "NCT01234567" });
    for (const other of [NEVER.video, "https://example.com/paper", "javascript:alert(1)", "12345678901", "", "pmid 0"]) {
      expect(sourceIdentifierOf(other), other).toBeUndefined();
    }
    expect(sourceLink({ scheme: "doi", value: "10.1000/a(b)<c>\"d#e?f" })).toEqual({
      href: "https://doi.org/10.1000/a(b)%3Cc%3E%22d%23e%3Ff",
      text: "DOI 10.1000/a(b)<c>\"d#e?f",
    });
    expect(sourceLink({ scheme: "pmid", value: "40123456" })?.href).toBe("https://pubmed.ncbi.nlm.nih.gov/40123456/");
    expect(sourceLink({ scheme: "pmcid", value: "PMC7654321" })?.href).toBe("https://pmc.ncbi.nlm.nih.gov/articles/PMC7654321/");
    expect(sourceLink({ scheme: "nct", value: "NCT01234567" })?.href).toBe("https://clinicaltrials.gov/study/NCT01234567");
    expect(sourceLink({ scheme: "doi", value: "https://evil.example/10.1000/x" })).toBeUndefined();
    expect(sourceLink({ scheme: "url", value: "https://evil.example" })).toBeUndefined();
  });

  it("work out rates to one decimal, and a number needed to treat or harm by which group did better", async () => {
    expect([percent(30, 120), percent(1, 3), percent(1, 120), percent(0, 50), percent(50, 50)])
      .toEqual(["25%", "33.3%", "0.8%", "0%", "100%"]);
    const store = atlas();
    const { rows } = await store.publish(4500, recordOf(oneFindingCard("Fewer relapses on zentarine in an invented trial.", {
      numbers: [
        { outcome: "relapse", better: "fewer", option: "zentarine", option_events: 18, option_total: 120,
          comparator: "placebo", comparator_events: 30, comparator_total: 120, follow_up: "52 weeks", harms_none_found: true },
        { outcome: "response", better: "more", option: "zentarine", option_events: 20, option_total: 100,
          comparator: "placebo", comparator_events: 20, comparator_total: 100, follow_up: "52 weeks" },
      ],
    })));
    const base = await serve(pages(new InMemoryAtlasPageSource({ publications: store.publications })));
    const { body } = await text(base, `/atlas/findings/${rows[0]!.publicationNumber}`);
    expect(body).toContain("<strong>Number needed to treat: 10</strong>. About 1 in 10 fewer people had this outcome " +
      "with zentarine than with placebo.");
    expect(body).toContain("No harms were found over the same follow-up.");
    expect(body).toContain("The two groups’ rates are the same, so there is no number needed to treat or harm.");
  });

  it("refuse to serve a page that holds a script, a card reference or a YouTube link", () => {
    expect(atlasPageProblems("<p>fine</p>")).toEqual([]);
    expect(atlasPageProblems("<SCRIPT src=x>")).toEqual(["script"]);
    expect(atlasPageProblems("see arf-0042")).toEqual(["card_reference"]);
    expect(atlasPageProblems("https://youtu.be/x and www.youtube.com")).toEqual(["youtube_link"]);
  });
});

// Routes, headers and the switch --------------------------------------------------------------------------------------

describe("the routes", () => {
  it("answer each page and the stylesheet, and 404 every other path under /atlas", async () => {
    const { source, shown } = await fixture();
    const base = await serve(pages(source));
    for (const path of ["/atlas", "/atlas/changes", "/atlas/topics/velmor-syndrome", `/atlas/findings/${shown.effect}`,
      `/atlas/findings/${shown.effect}?utm=1`]) {
      const { response } = await text(base, path);
      expect(response.status, path).toBe(200);
      expectPageHeaders(response);
    }
    const css = await text(base, "/atlas/atlas.css");
    expect(css.response.status).toBe(200);
    expect(css.response.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(css.body).toBe(ATLAS_CSS);
    expect(css.body).toContain("@media (max-width: 40rem)");
    expect(css.body).not.toMatch(/https?:\/\//u);
    expectPageHeaders(css.response);
    for (const path of ["/atlas/", "/atlas/findings/P-12", "/atlas/findings/p-1001",
      "/atlas/findings/F-1001", "/atlas/findings/P-1001/", "/atlas/topics/", "/atlas/topics/Velmor", "/atlas/x",
      "/atlas/atlas.js", "/atlas/changes/new", "/atlas/findings/P-9999"]) {
      const { response, body } = await text(base, path);
      expect(response.status, path).toBe(404);
      expect(body, path).toContain('<a href="/atlas">Go to the Atlas home</a>');
      // An error page has no canonical link, and does not repeat the address it was asked for.
      expect(body, path).not.toContain('rel="canonical"');
      expectPageHeaders(response);
    }
    expect(atlasRouteOf("/atlas")).toEqual({ kind: "home" });
    expect(atlasRouteOf("/atlas/findings/P-1001")).toEqual({ kind: "finding", publicationNumber: "P-1001" });
    expect(atlasRouteOf("/atlas/topics/hip.osteo_arthritis-2")).toEqual({ kind: "topic", topicKey: "hip.osteo_arthritis-2" });
    expect(atlasRouteOf("/atlasx")).toBeUndefined();
  });

  it("carry the pages' headers on every response, set no cookie, and answer HEAD, other methods and bodies", async () => {
    const { source } = await fixture();
    const base = await serve(pages(source));
    const head = await fetch(`${base}/atlas`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expectPageHeaders(head);
    for (const path of ["/atlas", "/atlas/atlas.css"]) {
      const post = await fetch(`${base}${path}`, { method: "POST", body: "x" });
      expect(post.status, path).toBe(405);
      expect(post.headers.get("allow")).toBe("GET, HEAD");
      expectPageHeaders(post);
    }
    const withBody = await raw(base, "/atlas", { "content-length": "4" }, "abcd");
    expect(withBody.status).toBe(400);
    expect(withBody.headers["content-security-policy"]).toBe(CSP);
    // A target the server refuses before routing still gets the pages' headers.
    const refused = await text(base, "/atlas/caf%C3%A9");
    expect(refused.response.status).toBe(404);
    expectPageHeaders(refused.response);
    // Other paths are untouched.
    const other = await fetch(`${base}/atlasx`);
    expect(other.status).toBe(404);
    expect(other.headers.get("content-security-policy")).toBeNull();
  });

  it("answer 404 everywhere under /atlas until ASKRIGOR_ATLAS_PAGES=enabled", async () => {
    expect(atlasPagesEnabledFromEnv("enabled")).toBe(true);
    expect(atlasPagesEnabledFromEnv(" enabled ")).toBe(true);
    for (const value of [undefined, "", "true", "ENABLED", "disabled", "1"]) expect(atlasPagesEnabledFromEnv(value)).toBe(false);
    const { source } = await fixture();
    const off = await serve(createAtlasPagesHandler({ enabled: false, source, signal: new AtlasChangeSignal() }));
    for (const path of ["/atlas", "/atlas/atlas.css", "/atlas/changes", "/atlas/findings/P-1001"]) {
      const { response, body } = await text(off, path);
      expect(response.status, path).toBe(404);
      expect(body).toBe("Not found\n");
      expectPageHeaders(response);
    }
    const fromEnv = await serve(createAtlasPagesHandlerFromEnv({}));
    expect((await text(fromEnv, "/atlas")).response.status).toBe(404);
    // Switched on without the reader's configuration: the pages answer 503, and the server runs on.
    const unconfigured = await serve(createAtlasPagesHandlerFromEnv({ ASKRIGOR_ATLAS_PAGES: "enabled" }));
    const unavailable = await text(unconfigured, "/atlas");
    expect(unavailable.response.status).toBe(503);
    expect(unavailable.body).toContain("The Atlas is unavailable right now");
    expectPageHeaders(unavailable.response);
    expect((await text(unconfigured, "/atlas/atlas.css")).response.status).toBe(200);
    expect((await fetch(`${unconfigured}/healthz`)).status).toBe(200);
  });

  it("answer 503 without caching when the database fails", async () => {
    let fail = true;
    const { source } = await fixture();
    const flaky: AtlasPageSource = { read: (work) => fail ? Promise.reject(new Error("connection refused")) : source.read(work) };
    const base = await serve(pages(flaky));
    const failed = await text(base, "/atlas");
    expect(failed.response.status).toBe(503);
    expect(failed.body).not.toContain("connection refused");
    expectPageHeaders(failed.response);
    fail = false;
    expect((await text(base, "/atlas")).response.status).toBe(200);
  });
});

// The rate limit and the cache ---------------------------------------------------------------------------------------

describe("the rate limit", () => {
  it("limits each address's page requests, as the evidence-gap page does, and never the stylesheet", async () => {
    const { source } = await fixture();
    const rateLimiter = createTokenBucketLimiter({ capacity: 2, refillTokensPerMinute: 0, maxKeys: 10, idleTtlMs: 60_000 });
    const base = await serve(pages(source, { rateLimiter }));
    expect((await text(base, "/atlas")).response.status).toBe(200);
    expect((await text(base, "/atlas/changes")).response.status).toBe(200);
    const limited = await text(base, "/atlas");
    expect(limited.response.status).toBe(429);
    expect(limited.response.headers.get("retry-after")).toBe("60");
    expect(limited.body).toContain("Too many requests");
    expectPageHeaders(limited.response);
    expect((await text(base, "/atlas/atlas.css")).response.status).toBe(200);
    expect(rateLimiter.size).toBe(1);
  });
});

describe("the page cache", () => {
  /** A source that counts each page's snapshot. */
  function counted(source: AtlasPageSource) {
    const counter = { reads: 0 };
    const wrapped: AtlasPageSource = { read: (work) => { counter.reads += 1; return source.read(work); } };
    return { counter, wrapped };
  }

  it("keeps a rendered page for 60 seconds, then renders it again", async () => {
    const { source } = await fixture();
    const { counter, wrapped } = counted(source);
    let now = 1_000_000;
    const base = await serve(pages(wrapped, { now: () => now }));
    await text(base, "/atlas");
    await text(base, "/atlas");
    expect(counter.reads).toBe(1);
    now += 59_000;
    await text(base, "/atlas");
    expect(counter.reads).toBe(1);
    now += 2_000;
    await text(base, "/atlas");
    expect(counter.reads).toBe(2);
  });

  it("drops every page when a publication or an accepted finding changes in this process", async () => {
    const { source, store, shown } = await fixture();
    const { counter, wrapped } = counted(source);
    const signal = new AtlasChangeSignal();
    const base = await serve(pages(wrapped, { signal }));
    expect((await text(base, `/atlas/findings/${shown.effect}`)).response.status).toBe(200);
    expect((await text(base, "/atlas")).body).toContain(`/atlas/findings/${shown.effect}"`);
    expect(counter.reads).toBe(2);
    // The owner unpublishes it through the runtime's store, which announces the write.
    const publications = announcingPublicationStore(store.publications, signal);
    await publications.withdraw({ reason: "owner_unpublished", publicationNumbers: [shown.effect],
      ownerReason: "Private reason.", withdrawnAt: store.tick() });
    expect((await text(base, `/atlas/findings/${shown.effect}`)).response.status).toBe(404);
    expect((await text(base, "/atlas")).body).not.toContain(`/atlas/findings/${shown.effect}"`);
    expect(counter.reads).toBe(4);
    // A save that publishes, and an owner's decision, drop it too.
    await text(base, "/atlas");
    await store.publish(4600, recordOf(oneFindingCard("A newly saved zentarine finding.")), publications);
    expect((await text(base, "/atlas")).body).toContain("A newly saved zentarine finding.");
    const review = announcingReviewStore(store.review, signal);
    await review.forgetCards([4600], store.tick());
    await text(base, "/atlas");
    expect(counter.reads).toBe(6);
  });

  it("is bounded in pages and bytes, renders a path once at a time, and keeps no render begun before a change", async () => {
    const cache = new AtlasPageCache({ ttlMs: 60_000, maxEntries: 2, maxBytes: 1_000 });
    const renders: string[] = [];
    const page = (key: string, html = key) => async (): Promise<RenderedAtlasPage> => {
      renders.push(key);
      return { status: 200, html };
    };
    await cache.get("/a", page("/a"));
    await cache.get("/b", page("/b"));
    await cache.get("/a", page("/a"));
    // /b is now the least recently used, so a third page drops it.
    await cache.get("/c", page("/c"));
    expect(cache.size).toBe(2);
    await cache.get("/a", page("/a"));
    await cache.get("/b", page("/b"));
    expect(renders).toEqual(["/a", "/b", "/c", "/b"]);
    // A page above the bound is served and not kept; pages are dropped until the total fits.
    expect((await cache.get("/big", page("/big", "x".repeat(1_001)))).html).toHaveLength(1_001);
    expect(cache.size).toBe(2);
    await cache.get("/h1", page("/h1", "y".repeat(600)));
    await cache.get("/h2", page("/h2", "z".repeat(600)));
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(600);

    // One render per path at a time.
    let release!: (html: string) => void;
    let slowRenders = 0;
    const slow = () => {
      slowRenders += 1;
      return new Promise<RenderedAtlasPage>((resolve) => {
        release = (html) => resolve({ status: 200, html });
      });
    };
    const first = cache.get("/slow", slow);
    const second = cache.get("/slow", slow);
    release("slow");
    expect(await Promise.all([first, second])).toEqual([{ status: 200, html: "slow" }, { status: 200, html: "slow" }]);
    expect(slowRenders).toBe(1);

    // A render that began before a change answers its own request and is not kept.
    const stale = cache.get("/stale", slow);
    cache.clear();
    release("stale");
    expect(await stale).toEqual({ status: 200, html: "stale" });
    expect(cache.size).toBe(0);
    const again = cache.get("/stale", slow);
    release("again");
    expect(await again).toEqual({ status: 200, html: "again" });
    expect(slowRenders).toBe(3);
    expect(cache.size).toBe(1);
  });

  it("announces only the stores' writes", async () => {
    const signal = new AtlasChangeSignal();
    let announced = 0;
    signal.subscribe(() => { announced += 1; });
    const store = atlas();
    const publications = announcingPublicationStore(store.publications, signal);
    await publications.inspect({});
    expect(announced).toBe(0);
    const record = recordOf(oneFindingCard("An announced zentarine finding."));
    await store.publish(4700, record, publications);
    expect(announced).toBe(1);
    await publications.decide({ cardNumber: 4700, findingNumber: 1, state: "rejected", atlasNumber: null, decidedAt: store.tick() });
    await publications.markEdited("F-1001", store.tick());
    await publications.eraseTexts("F-1001", store.tick());
    await publications.withdraw({ reason: "card_set_aside", cardNumbers: [4700], withdrawnAt: store.tick() });
    expect(announced).toBe(5);
    // A failed write announces too: dropping the cache is never wrong.
    await expect(publications.withdraw({ reason: "card_set_aside", cardNumbers: [], withdrawnAt: store.tick() })).rejects.toThrow();
    expect(announced).toBe(6);
    const review: AtlasReviewStore = announcingReviewStore(store.review, signal);
    await review.inspectCards([4700]);
    await review.inspectIntents(null);
    expect(announced).toBe(6);
    await review.forgetCards([4700], store.tick());
    expect(announced).toBe(7);
    // A listener's failure never reaches the write.
    signal.subscribe(() => { throw new Error("listener"); });
    await publications.withdraw({ reason: "card_set_aside", cardNumbers: [4700], withdrawnAt: store.tick() });
    expect(announced).toBe(8);
  });
});

// PostgreSQL ----------------------------------------------------------------------------------------------------------

describe("the pages' PostgreSQL reads", () => {
  function recorded(rowsFor: (sql: string) => unknown[], failOn?: RegExp) {
    const source = new PostgresAtlasPageSource({ connectionString: "postgres://reader@127.0.0.1/askrigor" });
    const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
    let released = 0;
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        const normalized = sql.replace(/\s+/gu, " ").trim();
        calls.push({ sql: normalized, values });
        if (failOn?.test(normalized) === true) throw new Error("statement failed");
        return { rows: rowsFor(normalized), rowCount: 0 };
      },
      release: () => { released += 1; },
    };
    (source as unknown as { pool: { connect: () => Promise<typeof client> } }).pool = { connect: async () => client };
    return { source, calls, released: () => released };
  }

  const published = {
    schema: "askrigor.atlas-publication.v1", topic: { key: "velmor-syndrome", label: "Velmor syndrome" },
    claim: "An invented claim.", certainty: "moderate", applies_to: "Adults", kind: null, subject: null, subject_type: null,
    direction: null, numbers: null, searches: null, sources: ["10.0000/synthetic-a"], why_not_usual: "Why.",
    what_would_change_it: "What.", verified_bases: [], saved_on: "2026-11-04", askrigor_version: "0.1.0",
  };

  it("read in one read-only snapshot through the reader, selecting no column that names a card or the owner's reasons", async () => {
    const { source, calls, released } = recorded((sql) => sql.includes("FROM atlas_publications") ? [
      { publication_number: "P-1001", state: "unreviewed", atlas_number: null, published_json: published,
        published_at: new Date("2026-11-04T09:00:00Z"), state_changed_at: new Date("2026-11-04T09:00:00Z") },
      // One that does not read as the schema has it is left out.
      { publication_number: "P-1002", state: "unreviewed", atlas_number: null, published_json: { claim: "x" },
        published_at: new Date("2026-11-04T09:00:00Z"), state_changed_at: new Date("2026-11-04T09:00:00Z") },
    ] : []);
    const result = await source.read(async (reads) => ({
      publications: await reads.listPublications({ topicKey: "velmor-syndrome", order: "changed", limit: 20 }),
      findings: await reads.readFindings(["F-1001"]),
      contradictions: await reads.listContradictions(10),
      changes: await reads.listChanges(10),
    }));
    expect(result.publications).toEqual([{
      publicationNumber: "P-1001", state: "unreviewed", atlasNumber: null, published,
      publishedAt: "2026-11-04T09:00:00.000Z", stateChangedAt: "2026-11-04T09:00:00.000Z",
    }]);
    expect(result.findings).toEqual([]);
    expect(calls.slice(0, 3).map(({ sql }) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "SET LOCAL search_path TO living_evidence, public",
      "SET LOCAL TIME ZONE 'UTC'",
    ]);
    expect(calls.at(-1)!.sql).toBe("COMMIT");
    expect(released()).toBe(1);
    const select = calls.find(({ sql }) => sql.includes("FROM atlas_publications"))!;
    expect(select.sql).toMatch(/^SELECT listed\.publication_number, listed\.state, listed\.atlas_number, listed\.published_json, listed\.published_at, listed\.state_changed_at FROM atlas_publications listed WHERE/u);
    expect(select.sql).toContain("ORDER BY listed.state_changed_at DESC");
    expect(select.values).toEqual([null, null, null, "velmor-syndrome", 20, null]);
    await source.read((reads) => reads.listPublications({ before: "P-1001", limit: 20 }));
    const cursorRead = calls.filter(({ sql }) => sql.includes("FROM atlas_publications")).at(-1)!;
    expect(cursorRead.sql).toContain("listed.published_at");
    expect(cursorRead.sql).toContain("substring(anchor.publication_number FROM 3)::bigint");
    expect(cursorRead.values).toEqual([null, null, null, null, 20, "P-1001"]);
    for (const { sql } of calls) {
      expect(sql).not.toMatch(/card_number|card_sha256|owner_reason|held_because|withdrawn_because|finding_number|card_forgotten_at|texts_erased_at|'held'|'rejected'|'withdrawn'/u);
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|nextval)\b|inspect_atlas_publications|atlas_card_decisions|atlas_finding_intents/u);
    }
  });

  it("roll back and release the connection when a read fails, and refuse a query that is not valid", async () => {
    const { source, calls, released } = recorded(() => [], /FROM atlas_finding_changes recorded JOIN/u);
    await expect(source.read((reads) => reads.listChanges(5))).rejects.toThrow("statement failed");
    expect(calls.at(-1)!.sql).toBe("ROLLBACK");
    expect(released()).toBe(1);
    const valid = recorded(() => []);
    await expect(valid.source.read((reads) => reads.listPublications({ limit: 0 }))).rejects.toThrow("ATLAS_PAGE_QUERY_INVALID");
    await expect(valid.source.read((reads) => reads.listPublications({ limit: 5, topicKey: "Not a key" })))
      .rejects.toThrow("ATLAS_PAGE_QUERY_INVALID");
    await expect(valid.source.read((reads) => reads.readFindings(["P-1001"]))).rejects.toThrow("ATLAS_PAGE_QUERY_INVALID");
    await expect(valid.source.read((reads) => reads.listPublications({ before: "P-1001'", limit: 20 })))
      .rejects.toThrow("ATLAS_PAGE_QUERY_INVALID");
  });
});

describe("Atlas navigation (183b)", () => {
  const ids = (body: string) => [...body.matchAll(/class="finding-claim"><a href="\/atlas\/findings\/(P-\d+)"/gu)]
    .map((match) => match[1]);

  it("lists every shown publication and uses the home lane's contested definition", async () => {
    const f = await fixture();
    const base = await serve(pages(f.source));
    const all = await text(base, "/atlas/findings");
    expect(ids(all.body)).toEqual(Object.values(f.shown).sort((a, b) => Number(b.slice(2)) - Number(a.slice(2))));
    expect(all.body).toContain(f.editedWording);
    for (const value of Object.values(NEVER)) expect(all.body).not.toContain(value);
    const checked = await text(base, "/atlas/findings?filter=checked");
    expect(ids(checked.body)).toEqual([f.shown.lead, f.shown.lowDose, f.shown.edited]);
    const unreviewed = await text(base, "/atlas/findings?filter=unreviewed");
    expect(ids(unreviewed.body)).toEqual([f.shown.hip, f.shown.nothingFound, f.shown.effect]);
    expect(unreviewed.body).toContain(NOT_CHECKED_LABEL);
    const contested = await text(base, "/atlas/findings?filter=contested");
    expect(ids(contested.body)).toEqual([f.shown.lowDose, f.shown.edited]);
    const home = await text(base, "/atlas");
    expect(ids(home.body.slice(home.body.indexOf('<h2 id="contested">'))).sort()).toEqual(ids(contested.body).sort());
    expect(ids((await text(base, "/atlas/findings?filter=unknown&before=bad")).body)).toEqual(ids(all.body));
    const topics = await text(base, "/atlas/topics");
    expect(topics.body).toContain('href="/atlas/topics/velmor-syndrome">Velmor syndrome (invented)</a> — 5 findings');
    expect(topics.body).toContain('href="/atlas/topics/hip-osteoarthritis">Hip osteoarthritis</a> — 1 finding');
    expect(topics.body.indexOf('>Hip osteoarthritis</a>')).toBeLessThan(topics.body.indexOf('>Velmor syndrome (invented)</a>'));
  });

  it("pages equal-time publications without skipping or repeating and scans beyond 500 for topics and search", async () => {
    const store = atlas();
    const draft = planCardPublication({ record: recordOf(oneFindingCard("ordinary word")), setAside: false,
      route: { route: "save", account: FREE } }).drafts[0]!;
    for (let index = 0; index < 525; index += 1) {
      await store.publications.publish({ cardNumber: 10_000 + index, cardSha256: sha256(`page:${index}`),
        findings: [{ ...draft, published: { ...draft.published!, claim: index === 0 ? "distant needle" : `ordinary word ${index}`,
          topic: index === 0 ? null : { key: "many", label: "Many findings" } } }],
        publishedAt: SAVED_AT, revive: false });
    }
    const source = new InMemoryAtlasPageSource({ publications: store.publications });
    const first = await loadAtlasFindings(source);
    expect(first.findings).toHaveLength(20);
    expect(first.findings[0]!.publicationNumber).toBe("P-1525");
    expect(first.before).toBe("P-1506");
    const next = await loadAtlasFindings(source, { before: first.before! });
    expect(next.findings[0]!.publicationNumber).toBe("P-1505");
    expect(next.findings.some((finding) => first.findings.some((other) => finding.publicationNumber === other.publicationNumber)))
      .toBe(false);
    const last = await loadAtlasFindings(source, { before: "P-1006" });
    expect(last.findings).toHaveLength(5);
    expect(last.before).toBeNull();
    const topics = await loadAtlasTopics(source);
    expect(topics).toEqual({ topics: [{ key: "many", label: "Many findings", count: 524 }], withoutTopic: 1 });
    const found = await loadAtlasSearch(source, { search: atlasSearchQuery("distant needle").query! });
    expect(found.results.map(({ finding }) => finding.publicationNumber)).toEqual(["P-1001"]);
    expect(found.total).toBe(1);
    const base = await serve(pages(source));
    const all = await text(base, "/atlas/findings");
    expect(all.body).toContain('rel="next" href="/atlas/findings?filter=all&amp;before=P-1506"');
    const second = await text(base, "/atlas/findings?filter=unreviewed&before=P-1506");
    expect(ids(second.body)[0]).toBe("P-1505");
    expect(second.body).toContain('filter=unreviewed&amp;before=P-1486');
    const search = await text(base, "/atlas/search?q=ordinary");
    expect(search.body).toContain("524 findings match, page 1 of 27.");
    const older = /rel="next" href="([^"]+)"/u.exec(search.body)![1]!.replace(/&amp;/gu, "&");
    expect(older).toMatch(/&page=2$/u);
    const nextResults = await text(base, older);
    expect(ids(nextResults.body)[0]).toBe("P-1505");
    expect(nextResults.body).toContain('rel="prev" href="/atlas/search?q=%6f%72%64%69%6e%61%72%79"');
    expect(ids((await text(base, "/atlas/search?q=ordinary&page=27")).body)).toEqual(["P-1005", "P-1004", "P-1003", "P-1002"]);
    expect((await text(base, "/atlas/topics")).body).toContain("1 finding has no topic (older cards)");
  });

  it("matches Unicode words in each public field, with full case folding and accents", async () => {
    expect(atlasSearchWords("ÉCOLE, Straße; ΜΆΪΟΣ/ς　ЯБЛОКО。研究、東京！किताब")).toEqual([
      "ecole", "strasse", "μαιοσ", "σ", "яблоко", "研究", "東京", "किताब",
    ]);
    expect(atlasSearchWords("ﬃ ＣＡＦÉ e\u0301" )).toEqual(["ffi", "cafe", "e"]);
    expect(atlasSearchQuery("x".repeat(300)).query).not.toBeNull();
    expect(atlasSearchQuery(Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ")).query).not.toBeNull();
    const f = await fixture();
    const p = await f.store.publish(9990, recordOf(oneFindingCard("École Straße ΜΆΪΟΣ ЯБЛОКО 研究、東京", {
      subject: "Café", applies_to: "ДЕТИ",
    })));
    const base = await serve(pages(f.source));
    for (const query of ["ecole STRASSE", "μαϊοσ яблоко", "研究 東京", "cafe дети", "hand adults", "velmor"]) {
      const result = await text(base, `/atlas/search?q=${encodeURIComponent(query)}`);
      expect(result.response.status, query).toBe(200);
      expect(ids(result.body).length, query).toBeGreaterThan(0);
      if (query !== "hand adults" && query !== "velmor") expect(ids(result.body)).toContain(p.rows[0]!.publicationNumber);
    }
    // Part of a longer word matches too (plan 2026-11-02), after whole-word matches.
    expect(ids((await text(base, "/atlas/search?q=ecol")).body)).toEqual([p.rows[0]!.publicationNumber]);
    expect(ids((await text(base, "/atlas/search?q=ecole%20absent")).body)).toEqual([]);
    // Matching canonical questions does not fall back to the private card or stale edited wording.
    expect(ids((await text(base, "/atlas/search?q=hand")).body)).toContain(f.shown.edited);
    expect(ids((await text(base, `/atlas/search?q=${NEVER.cardWording}`)).body)).toEqual([]);
    const main = await text(base, "/atlas/search?q=zentarine");
    for (const id of Object.values(f.hidden)) expect(ids(main.body)).not.toContain(id);
  });

  it("handles empty, long, too-many-word and hostile queries as escaped forms, without retaining them", async () => {
    const f = await fixture();
    let reads = 0;
    const source: AtlasPageSource = { read: async (work) => { reads += 1; return f.source.read(work); } };
    const base = await serve(pages(source));
    for (const query of ["", "  ...　", "x".repeat(301), Array.from({ length: 21 }, (_, index) => `w${index}`).join(" ")]) {
      const page = await text(base, `/atlas/search?q=${encodeURIComponent(query)}`);
      expect(page.response.status).toBe(200);
      expect(page.body).toContain('role="status"');
      expect(page.body).not.toContain("x".repeat(301));
    }
    expect(reads).toBe(0);
    const hostile = '<script>alert("x")</script> \' ARF-1234 youtube.com';
    const page = await text(base, `/atlas/search?q=${encodeURIComponent(hostile)}`);
    expect(page.response.status).toBe(200);
    expect(page.body).toContain("&#60;&#115;&#99;&#114;&#105;&#112;&#116;&#62;");
    expect(page.body).toContain("&#34;");
    expect(page.body).toContain("&#39;");
    expect(page.body).not.toMatch(/<script|\son[a-z]+=|<iframe/iu);
    expect(atlasPageProblems(page.body)).toEqual([]);
    expect(page.response.headers.get("cache-control")).toBe("private, no-store");
    expect(page.response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.response.headers.getSetCookie()).toEqual([]);
    // Page 2 renders a pager link back, with the query as percent-encoded bytes only.
    const pageTwo = await text(base, `/atlas/search?q=${encodeURIComponent(hostile)}&page=2`);
    expect(pageTwo.body).toMatch(/<a rel="prev" href="\/atlas\/search\?q=(?:%[0-9a-f]{2})+">Previous results<\/a>/u);
    expect(pageTwo.body).not.toMatch(/<script|\son[a-z]+=|<iframe/iu);
    expect(atlasPageProblems(pageTwo.body)).toEqual([]);
    // Searches match against the findings' public text, read once and kept like a page; the query is never kept.
    await text(base, `/atlas/search?q=${encodeURIComponent(hostile)}`);
    expect(reads).toBe(1);
  });

  it("keys cached lists by the bounded filter and cursor, never by unrelated parameters, and invalidates them", async () => {
    const f = await fixture();
    let reads = 0;
    const source: AtlasPageSource = { read: async (work) => { reads += 1; return f.source.read(work); } };
    const signal = new AtlasChangeSignal();
    const base = await serve(pages(source, { signal, cache: { maxEntries: 2 } }));
    await text(base, "/atlas/findings");
    await text(base, "/atlas/findings?filter=nonsense&unused=anything");
    expect(reads).toBe(1);
    await text(base, "/atlas/findings?filter=checked");
    await text(base, "/atlas/findings?filter=checked&before=P-1004");
    expect(reads).toBe(3);
    await text(base, "/atlas/findings"); // Evicted by the existing cache limit.
    expect(reads).toBe(4);
    await text(base, "/atlas/topics");
    await text(base, "/atlas/topics?unused=anything");
    expect(reads).toBe(5);
    signal.announce();
    await text(base, "/atlas/topics");
    expect(reads).toBe(6);
  });

  it("puts navigation and a labelled GET search on every page, with HEAD, the unchanged CSP and rate limits", async () => {
    const f = await fixture();
    const base = await serve(pages(f.source));
    for (const path of ["/atlas", "/atlas/changes", "/atlas/findings", "/atlas/topics", "/atlas/map", "/atlas/search?q=velmor",
      "/atlas/topics/velmor-syndrome", `/atlas/findings/${f.shown.edited}`, "/atlas/unknown"]) {
      const page = await text(base, path);
      const header = page.body.slice(page.body.indexOf("<header"), page.body.indexOf("</header>"));
      expect(header).toMatch(/href="\/atlas\/findings"(?: aria-current="page")?>All findings<\/a>/u);
      expect(header).toMatch(/href="\/atlas\/topics"(?: aria-current="page")?>Topics<\/a>/u);
      expect(header).toMatch(/href="\/atlas\/map"(?: aria-current="page")?>Findings map<\/a>/u);
      expect(header).toContain('role="search" method="get" action="/atlas/search"');
      expect(header).toContain('<label for="atlas-header-query">Search findings</label>');
      expect(page.response.headers.get("content-security-policy")).toBe(CSP);
      expect(page.body).not.toMatch(/<script|\son[a-z]+=|\sstyle=|<foreignObject/iu);
      const head = await text(base, path, { method: "HEAD" });
      expect(head.response.status).toBe(page.response.status);
      expect(head.body).toBe("");
      expect(head.response.headers.get("content-security-policy")).toBe(CSP);
    }
    const limited = await serve(pages(f.source, { rateLimiter: createTokenBucketLimiter({
      capacity: 1, refillTokensPerMinute: 0, maxKeys: 2, idleTtlMs: 60_000,
    }) }));
    expect((await text(limited, "/atlas/search?q=velmor")).response.status).toBe(200);
    expect((await text(limited, "/atlas/findings")).response.status).toBe(429);
    for (const path of ["/atlas/findings", "/atlas/topics", "/atlas/map", "/atlas/search"]) {
      expect((await text(base, path, { method: "POST" })).response.status).toBe(405);
    }
  });

  it("draws questions, certainty groups, all four links and open leads, with the same linked text below", async () => {
    const f = await fixture();
    await f.store.publish(9992, recordOf(oneFindingCard("Another checked finding.")));
    const extra = await f.store.accept(9992, acceptPayload({ wording: "Another checked finding." }));
    await f.store.publications.decide({ cardNumber: 9992, findingNumber: 1, state: "accepted", atlasNumber: extra,
      decidedAt: f.store.tick() });
    await f.store.publish(9993, recordOf(oneFindingCard("An earlier checked finding.")));
    const earlier = await f.store.accept(9993, acceptPayload({ wording: "An earlier checked finding." }));
    await f.store.publications.decide({ cardNumber: 9993, findingNumber: 1, state: "accepted", atlasNumber: earlier,
      decidedAt: f.store.tick() });
    for (const [from, relation, to] of [[f.numbers.edited, "same_as", extra],
      [extra, "narrows", f.numbers.lowDose], [f.numbers.edited, "replaces", earlier]] as const) {
      await f.store.record({ kind: "link", publicNumber: from, relation, toPublicNumber: to,
        disagreement: null, rationale: "PRIVATERATIONALE", decidedWith: DECIDED_WITH });
    }
    const model = (await loadAtlasTopic(f.source, "velmor-syndrome"))!;
    expect(model.connections.map(({ relation }) => relation).sort()).toEqual(["contradicts", "narrows", "replaces", "same_as"]);
    const body = renderAtlasTopic(model);
    const svg = body.slice(body.indexOf("<svg"), body.lastIndexOf("</svg>") + 6);
    const alternative = body.slice(body.indexOf('<h3 id="map-text">'), body.indexOf('<section aria-labelledby="part-'));
    for (const relation of ["same as", "narrows", "contradicts", "replaces"]) {
      expect(svg).toContain(relation);
      expect(alternative).toContain(relation);
    }
    expect(svg).toContain('class="map-edge"');
    expect(svg).toContain("Not checked yet");
    expect(svg).toContain("Open leads");
    expect(svg).toContain("Q1: Does zentarine ease the hand tremor");
    expect(alternative).toContain("Does zentarine ease the hand tremor");
    expect(alternative).toContain("Certainty: Moderate");
    expect(body).not.toContain("PRIVATERATIONALE");
    for (const finding of model.sections.flatMap(({ findings }) => findings)) {
      expect(svg).toContain(`href="/atlas/findings/${finding.publicationNumber}"`);
      expect(alternative).toContain(`href="/atlas/findings/${finding.publicationNumber}"`);
    }
  });

  it("keeps empty and single-finding maps simple and bounds each SVG for many findings", async () => {
    const f = await fixture();
    const single = (await loadAtlasTopic(f.source, "hip-osteoarthritis"))!;
    const one = renderAtlasTopic(single);
    expect(one.match(/<svg /gu)).toHaveLength(1);
    expect(one).toContain("Question not recorded");
    const empty = renderAtlasTopic({ ...single, sections: [], connections: [] });
    expect(empty).toContain('aria-label="No findings yet"');
    const seed = single.sections[0]!.findings[0]!;
    const findings: ShownFinding[] = Array.from({ length: 200 }, (_, index) => ({ ...seed,
      publicationNumber: `P-${2000 + index}`, claim: `Finding ${index} <tag> & quoted`, question: `Question ${index} <&>?`,
    }));
    const many = renderAtlasTopic({ ...single, sections: [{ id: "other", heading: "Other findings", findings }] });
    expect(many.match(/<svg /gu)).toHaveLength(34);
    for (const panel of many.matchAll(/<svg [\s\S]*?<\/svg>/gu)) {
      expect((panel[0].match(/class="map-node"/gu) ?? []).length).toBeLessThanOrEqual(12);
      expect(Number(/height="(\d+)"/u.exec(panel[0])![1])).toBeLessThanOrEqual(1121);
    }
    expect(many).toContain("Question 199 &lt;&amp;&gt;?");
    expect(many).toContain("Finding 199 &lt;tag&gt; &amp; quoted");
    expect(atlasPageProblems(many)).toEqual([]);
    expect(many).not.toMatch(/<script|<foreignObject|\son[a-z]+=|\sstyle=/iu);
  });

  it("includes incoming links from other topics in their original direction, but no withdrawn endpoint", async () => {
    const f = await fixture();
    const published = await f.store.publish(9994, recordOf(oneFindingCard("An outside-topic finding.")));
    const external = await f.store.accept(9994, { ...acceptPayload({ wording: "An outside-topic finding." }),
      topic: { key: "outside", label: "Outside topic" } });
    await f.store.publications.decide({ cardNumber: 9994, findingNumber: 1, state: "accepted", atlasNumber: external,
      decidedAt: f.store.tick() });
    await f.store.record({ kind: "link", publicNumber: external, relation: "narrows", toPublicNumber: f.numbers.edited,
      disagreement: null, rationale: "Private rationale.", decidedWith: DECIDED_WITH });
    const topic = (await loadAtlasTopic(f.source, "velmor-syndrome"))!;
    expect(topic.connections).toContainEqual({
      from: { atlasNumber: external, publicationNumber: published.rows[0]!.publicationNumber },
      to: { atlasNumber: f.numbers.edited, publicationNumber: f.shown.edited }, relation: "narrows",
    });
    expect(topic.connections.filter(({ relation }) => relation === "contradicts")).toHaveLength(1);
    await f.store.record({ kind: "withdraw", publicNumber: external, version: 1,
      note: "Withdrawn outside-topic finding.", decidedWith: DECIDED_WITH });
    const after = (await loadAtlasTopic(f.source, "velmor-syndrome"))!;
    expect(after.connections.some(({ from, to }) => from.atlasNumber === external || to.atlasNumber === external)).toBe(false);
  });
});


// Full-text search and the findings map (plan docs/superpowers/plans/2026-11-02-atlas-full-text-search-and-findings-map.md)

describe("full-text search", () => {
  const ids = (body: string) => [...body.matchAll(/class="finding-claim"><a href="\/atlas\/findings\/(P-\d+)"/gu)]
    .map((match) => match[1]);
  const q = (words: string) => atlasSearchQuery(words).query!;
  const wording = (text: string, rest: AtlasSearchText[] = []): AtlasSearchText[] => [{ field: "wording", text }, ...rest];
  const rank = (words: string, texts: AtlasSearchText[]) => atlasSearchMatch(q(words), texts)?.rank;

  it("matches inside longer words in any script, and a single letter or digit only on its own", () => {
    // Every example is synthetic; the words are examples, not a list the search holds.
    expect(rank("vitamin d", wording("Vitamin D3 lowered falls."))).toBe(0);
    expect(rank("vitamin d", wording("Vitamin B12 deficiency is common."))).toBeUndefined();
    expect(rank("vitamin", wording("Vitamins A and E."))).toBe(1);
    expect(rank("omega 3", wording("Omega-3 fatty acids."))).toBe(0);
    expect(rank("3", wording("30 of 120 adults."))).toBeUndefined();
    expect(rank("strasse", wording("Straße"))).toBe(0);
    expect(rank("ΒΙΤΑΜΙΝΗ", wording("η βιταμίνη D"))).toBe(0);
    expect(rank("витамин", wording("Витамины D и кальций"))).toBe(1);
    expect(rank("فيتامين", wording("فيتامين د يقلل السقوط"))).toBe(0);
    expect(rank("किताब", wording("यह किताब है"))).toBe(0);
    // Scripts written without spaces: a word inside a run, one character of a script without capitals, and a Latin
    // letter standing on its own among them (which also ends the run before it).
    expect(rank("维生素", wording("维生素D可以降低骨折风险"))).toBe(0);
    expect(rank("骨折", wording("维生素D可以降低骨折风险"))).toBe(1);
    expect(rank("维生素 d", wording("维生素D可以降低骨折风险"))).toBeDefined();
    expect(rank("铁", wording("补铁剂"))).toBe(1);
    expect(rank("ビタミン", wording("ビタミンDは転倒を減らした"))).toBeDefined();
    expect(rank("วิตามิน", wording("วิตามินดีช่วยลดการหกล้ม"))).toBe(1);
    expect(rank("ecole", wording("L'ÉCOLE"))).toBe(0);
    expect(rank("l", wording("L'ÉCOLE"))).toBe(0);
  });

  it("keeps short words and numbers precise: no number inside a longer one, no two-letter word inside a longer word", () => {
    // Every example is synthetic; the words are examples, not a list the search holds.
    expect(rank("50 mg", wording("500 mg of an invented option eased it."))).toBeUndefined();
    expect(atlasSearchMatch(q("50 mg"), wording("An invented option eased it.", [{ field: "numbers", text: "50 mg\nplacebo" }])))
      .toEqual({ rank: 2, asTyped: true, foundIn: ["numbers"] });
    expect(atlasSearchMatch(q("12 weeks"), wording("Over weeks of use.", [{ field: "sources", text: "PMID 40123456" },
      { field: "number", text: "P-1012\nF-1120" }]))).toBeUndefined();
    expect(rank("2026", wording("In 20261 invented trials."))).toBeUndefined();
    expect(rank("ms fatigue", wording("Fatigue symptoms eased."))).toBeUndefined();
    expect(atlasSearchMatch(q("MS fatigue"), wording("Fatigue eased.", [{ field: "applies_to", text: "Adults with MS" }])))
      .toEqual({ rank: 2, asTyped: false, foundIn: ["wording", "applies_to"] });
    expect(rank("ED", wording("Treated adults improved."))).toBeUndefined();
    expect(rank("ED", wording("Adults with ED improved."))).toBe(0);
    expect(rank("d3", wording("Vitamin D30 is invented."))).toBeUndefined();
    expect(rank("b12", wording("Vitamin B12 deficiency."))).toBe(0);
    // Three letters, or a script without capitals, may still sit inside a longer word.
    expect(rank("flu", wording("Influenza vaccines."))).toBe(1);
    expect(rank("铁", wording("补铁剂"))).toBe(1);
  });

  it("folds accents but keeps the marks that tell words apart", () => {
    expect(rank("cafe", wording("Café au lait"))).toBe(0);
    expect(rank("ไข้", wording("ไข่ไก่"))).toBeUndefined();
    expect(rank("ไข่", wording("ไข่ไก่"))).toBe(1);
    expect(rank("コーヒー", wording("コピーした資料"))).toBeUndefined();
    expect(rank("コピー", wording("コピーした資料"))).toBe(1);
  });

  it("needs every word somewhere, ranks the wording first and whole words before parts, and says where it found them", () => {
    const texts = wording("Zentarine halved the tremor score.", [
      { field: "why_not_usual", text: "Quick answers call it gentle." },
      { field: "sources", text: "PMID 40123456" },
    ]);
    expect(atlasSearchMatch(q("gentle"), texts)).toEqual({ rank: 2, asTyped: true, foundIn: ["why_not_usual"] });
    expect(atlasSearchMatch(q("tremor gentle"), texts)).toEqual({ rank: 2, asTyped: false, foundIn: ["wording", "why_not_usual"] });
    expect(atlasSearchMatch(q("gent"), texts)).toEqual({ rank: 3, asTyped: true, foundIn: ["why_not_usual"] });
    expect(atlasSearchMatch(q("score 40123456"), wording("A score.", [{ field: "sources", text: "PMID 401234567 and 40123456" }])))
      .toEqual({ rank: 2, asTyped: false, foundIn: ["wording", "sources"] });
    expect(atlasSearchMatch(q("nausea weeks"), wording("A claim.", [{ field: "numbers", text: "nausea\n12 weeks" }])))
      .toEqual({ rank: 2, asTyped: false, foundIn: ["numbers"] });
    expect(atlasSearchMatch(q("PMID  40123456"), texts)).toEqual({ rank: 2, asTyped: true, foundIn: ["sources"] });
    expect(atlasSearchMatch(q("40123456 pmid"), texts)).toEqual({ rank: 2, asTyped: false, foundIn: ["sources"] });
    expect(atlasSearchMatch(q("zentarine score"), texts)).toEqual({ rank: 0, asTyped: false, foundIn: ["wording"] });
    expect(atlasSearchMatch(q("zentar tremor"), texts)).toEqual({ rank: 1, asTyped: false, foundIn: ["wording"] });
    for (const quoted of ['"tremor score"', "«tremor score»", "„tremor score“", "「tremor score」"]) {
      expect(atlasSearchMatch(q(quoted), texts), quoted).toEqual({ rank: 0, asTyped: true, foundIn: ["wording"] });
    }
    expect(atlasSearchMatch(q("score tremor"), texts)).toEqual({ rank: 0, asTyped: false, foundIn: ["wording"] });
    expect(atlasSearchMatch(q("tremor absent"), texts)).toBeUndefined();
  });

  it("reads every text a finding's page shows and nothing it hides", async () => {
    const f = await fixture();
    const found = async (words: string) => (await loadAtlasSearch(f.source, { search: q(words) })).results
      .map(({ finding, foundIn }) => ({ number: finding.publicationNumber, foundIn }));
    // Further down the page: why it isn't the usual answer, what would change it, the numbers, the searches, sources.
    expect(await found("gentle")).toEqual([{ number: f.shown.effect, foundIn: ["why_not_usual"] }]);
    expect(await found("nausea")).toEqual([{ number: f.shown.effect, foundIn: ["wording"] }]);
    expect((await found("similar size")).map(({ number }) => number).sort())
      .toEqual([f.shown.edited, f.shown.effect, f.shown.lowDose, f.shown.lead].sort());
    // Both hold every word whole in their wording; the one whose search holds the words as typed comes first. "Found
    // in" names, for each word, the first part of the page where it matches best.
    expect(await found("zentarine voice tremor")).toEqual([
      { number: f.shown.nothingFound, foundIn: ["wording"] },
      { number: f.shown.lead, foundIn: ["wording"] },
    ]);
    expect((await found("pmid 40123456")).map(({ number }) => number).sort()).toEqual([f.shown.edited, f.shown.lowDose].sort());
    expect(await found(f.numbers.lowDose)).toEqual([{ number: f.shown.lowDose, foundIn: ["number"] }]);
    // P-1003 is two words, which an F number's digits can share; the number as typed comes first.
    expect((await found(f.shown.hip))[0]).toEqual({ number: f.shown.hip, foundIn: ["number"] });
    // Never a label the pages add, the card's or version's hidden texts, or a publication that does not show.
    expect(await found("moderate")).toEqual([]);
    for (const hidden of [NEVER.usualAnswer, NEVER.whoElse, NEVER.whatItChanges, NEVER.cardWording, NEVER.answerQuote,
      NEVER.videoFinding, NEVER.olderVideoFinding, NEVER.rejected, NEVER.unpublished, NEVER.pending, NEVER.withdrawnClaim,
      "LINKRATIONALESENTINEL", "WITHDRAWNNOTE", "zentarine.trials"]) {
      expect(await found(hidden), hidden).toEqual([]);
    }
    const edited = (await loadAtlasFindings(f.source)).findings.find(({ publicationNumber }) => publicationNumber === f.shown.edited)!;
    expect(searchTextsOf(edited).map(({ field }) => field)).toEqual(["wording", "question", "applies_to", "subject", "topic",
      "why_not_usual", "what_would_change_it", "numbers", "sources", "number"]);
    expect(searchTextsOf(edited).find(({ field }) => field === "sources")!.text)
      .toBe("DOI 10.0000/synthetic-velmor-a\nPMID 40123456");
  });

  it("reads only text the pages show: each part of a finding's search text is on its page, the question on its topic's", async () => {
    const f = await fixture();
    const base = await serve(pages(f.source));
    for (const finding of (await loadAtlasFindings(f.source)).findings) {
      const page = (await text(base, findingPath(finding.publicationNumber))).body;
      const topic = finding.topic === null ? "" : (await text(base, `/atlas/topics/${finding.topic.key}`)).body;
      for (const { field, text: value } of searchTextsOf(finding)) {
        for (const line of value.split("\n")) {
          expect(field === "question" ? topic : page, `${finding.publicationNumber} ${field}: ${line}`).toContain(escapeHtml(line));
        }
      }
    }
  });

  it("lists at most 100 pages of 20, says so, and never offers a page past them", async () => {
    const seed = (await loadAtlasFindings((await fixture()).source)).findings[0]!;
    const index: AtlasSearchIndex = { bytes: 0, entries: Array.from({ length: 2_050 }, (_, number) => ({
      finding: { ...seed, publicationNumber: `P-${10_000 - number}` },
      texts: foldAtlasSearchTexts([{ field: "wording", text: `An invented common finding ${number}.` }]),
    })) };
    const last = searchAtlasIndex(index, { search: q("common"), page: 100 });
    expect(last).toMatchObject({ total: 2_050, page: 100, pages: 100 });
    expect(last.results.map(({ finding }) => finding.publicationNumber)).toEqual(
      Array.from({ length: 20 }, (_, offset) => `P-${10_000 - 1_980 - offset}`));
    expect(() => searchAtlasIndex(index, { search: q("common"), page: 101 })).toThrow("ATLAS_SEARCH_PAGE_INVALID");
    const body = renderAtlasSearch({ text: "common", message: null, results: last });
    expect(body).toContain("2,050 findings match; the first 2,000 are listed, page 100 of 100. Add words to narrow the search.");
    expect(body).not.toContain('rel="next"');
    expect(body).toContain('<a rel="prev" href="/atlas/search?q=%63%6f%6d%6d%6f%6e&amp;page=99">Previous results</a>');
    const first = renderAtlasSearch({ text: "common", message: null, results: searchAtlasIndex(index, { search: q("common") }) });
    expect(first).toContain("page 1 of 100.");
    expect(first).toContain('<a rel="next" href="/atlas/search?q=%63%6f%6d%6d%6f%6e&amp;page=2">Next results</a>');
  });

  it("matches against the findings' text kept like a page: one read until a change or 60 seconds, within its size bound", async () => {
    const f = await fixture();
    let reads = 0;
    const source: AtlasPageSource = { read: async (work) => { reads += 1; return f.source.read(work); } };
    const signal = new AtlasChangeSignal();
    let now = Date.parse(SAVED_AT);
    const base = await serve(pages(source, { signal, now: () => now }));
    await Promise.all([text(base, "/atlas/search?q=zentarine"), text(base, "/atlas/search?q=placebo&page=2")]);
    expect(reads).toBe(1);
    now += 59_000;
    expect(ids((await text(base, "/atlas/search?q=gentle")).body)).toEqual([f.shown.effect]);
    expect(reads).toBe(1);
    now += 2_000;
    await text(base, "/atlas/search?q=zentarine");
    expect(reads).toBe(2);
    signal.announce();
    await text(base, "/atlas/search?q=zentarine");
    expect(reads).toBe(3);
    const uncached = await serve(pages(source, { searchIndex: { maxBytes: 0 } }));
    await text(uncached, "/atlas/search?q=zentarine");
    await text(uncached, "/atlas/search?q=zentarine");
    expect(reads).toBe(5);
  });

  it("puts wording matches first, whole words before parts and newer before older, and pages by number", async () => {
    const store = atlas();
    const publish = async (cardNumber: number, claim: string, why = "Quick answers miss it.") =>
      (await store.publish(cardNumber, recordOf(oneFindingCard(claim, { why_not_usual: why })))).rows[0]!.publicationNumber;
    const elsewherePart = await publish(7001, "A finding about sleep.", "Magnesiumcitrat is what was sold.");
    const wordingWhole = await publish(7002, "Magnesium eased cramps in one invented trial.");
    const elsewhereWhole = await publish(7003, "A finding about cramps.", "Quick answers forget magnesium.");
    const wordingPart = await publish(7004, "Magnesiumcitrat eased cramps in one invented trial.");
    const newerWordingWhole = await publish(7005, "Magnesium did nothing for sleep in one invented trial.");
    const source = new InMemoryAtlasPageSource({ publications: store.publications });
    const results = await loadAtlasSearch(source, { search: q("magnesium") });
    expect(results.results.map(({ finding }) => finding.publicationNumber))
      .toEqual([newerWordingWhole, wordingWhole, wordingPart, elsewhereWhole, elsewherePart]);
    expect(results).toMatchObject({ total: 5, page: 1, pages: 1 });
    await expect(loadAtlasSearch(source, { search: q("magnesium"), page: 0 })).rejects.toThrow("ATLAS_SEARCH_PAGE_INVALID");
    await expect(loadAtlasSearch(source, { search: q("magnesium"), page: 101 })).rejects.toThrow("ATLAS_SEARCH_PAGE_INVALID");
    const base = await serve(pages(source));
    const page = await text(base, "/atlas/search?q=magnesium");
    expect(page.body).toContain('<p role="status">5 findings match.</p>');
    expect(page.body).toContain("Found in the wording.");
    expect(page.body).toContain("Found in why it isn’t the usual answer.");
    expect(page.body).not.toContain('rel="next"');
    expect(page.body).toContain("Search reads each finding’s whole text");
    expect(page.body).toContain("(for example, the D in vitamin D, MS or D3) counts only where it stands on its own, and a " +
      "number never counts inside a longer number (for example, 50 doesn’t find 500).");
    for (const odd of ["0", "abc", "101", "1e2", "-1", "2.5"]) {
      expect((await text(base, `/atlas/search?q=magnesium&page=${odd}`)).body).toContain("5 findings match.");
    }
    const beyond = await text(base, "/atlas/search?q=magnesium&page=3");
    expect(beyond.body).toContain("There are no results on this page.");
    expect(beyond.body).toContain('rel="prev" href="/atlas/search?q=%6d%61%67%6e%65%73%69%75%6d"');
    expect(beyond.response.headers.get("cache-control")).toBe("private, no-store");
    expect((await text(base, "/atlas/search?q=absentword")).body).toContain('<p role="status">No findings match these words.</p>');
  });
});

describe("the findings map", () => {
  const ON = new Date("2026-11-05T00:00:00.000Z");
  const numbersOf = (model: Awaited<ReturnType<typeof loadAtlasMap>>) => model.topics.map((topic) => ({
    topic: topic.topic?.key ?? null, count: topic.count,
    findings: topic.findings.map(({ finding, points }) => [finding.publicationNumber, points.total]),
  }));

  it("groups shown findings by topic with the stated points, leaving out leads and anything hidden", async () => {
    const f = await fixture();
    const model = await loadAtlasMap(f.source, ON);
    expect(model.newSince).toBe("2026-10-06");
    // Points: checked 2, certainty (high 2, moderate 1), counted results 1, two or more sources 1, new 1.
    expect(numbersOf(model)).toEqual([
      { topic: "velmor-syndrome", count: 4, findings: [[f.shown.edited, 5], [f.shown.lowDose, 3], [f.shown.effect, 3],
        [f.shown.nothingFound, 1]] },
      { topic: "hip-osteoarthritis", count: 1, findings: [[f.shown.hip, 2]] },
    ]);
    expect(model.topics[0]!.topic!.label).toBe("Velmor syndrome (invented)");
    expect(model.topics[0]!.findings[0]!.points).toEqual({ checked: 2, certainty: 1, numbers: 1, sources: 0, recent: 1, total: 5 });
    // Later, nothing is new.
    expect(numbersOf(await loadAtlasMap(f.source, new Date("2026-12-31T00:00:00.000Z")))[0]!.findings)
      .toEqual([[f.shown.edited, 4], [f.shown.lowDose, 2], [f.shown.effect, 2], [f.shown.nothingFound, 0]]);
  });

  it("leaves out a superseded finding and draws an F number shown by two publications once, by the newer", async () => {
    const f = await fixture();
    const earlier = (await f.store.publish(9996, recordOf(oneFindingCard("An earlier checked finding.")))).rows[0]!
      .publicationNumber;
    const earlierNumber = await f.store.accept(9996, acceptPayload({ wording: "An earlier checked finding." }));
    await f.store.publications.decide({ cardNumber: 9996, findingNumber: 1, state: "accepted", atlasNumber: earlierNumber,
      decidedAt: f.store.tick() });
    await f.store.record({ kind: "link", publicNumber: f.numbers.edited, relation: "replaces", toPublicNumber: earlierNumber,
      disagreement: null, rationale: "PRIVATERATIONALE", decidedWith: DECIDED_WITH });
    const again = (await f.store.publish(9997, recordOf(oneFindingCard("The low dose, checked again.")))).rows[0]!
      .publicationNumber;
    await f.store.publications.decide({ cardNumber: 9997, findingNumber: 1, state: "accepted", atlasNumber: f.numbers.lowDose,
      decidedAt: f.store.tick() });
    const listed = (await loadAtlasFindings(f.source)).findings;
    expect(listed.find(({ publicationNumber }) => publicationNumber === earlier)!.status.kind).toBe("superseded");
    expect(listed.filter(({ status }) => status.kind !== "unreviewed" && status.atlasNumber === f.numbers.lowDose)
      .map(({ publicationNumber }) => publicationNumber)).toEqual([again, f.shown.lowDose]);
    const drawn = (await loadAtlasMap(f.source, ON)).topics.flatMap(({ findings }) =>
      findings.map(({ finding }) => finding.publicationNumber));
    expect(drawn).not.toContain(earlier);
    expect(drawn).not.toContain(f.shown.lowDose);
    expect(drawn).toContain(again);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it("orders topics by size with findings without a topic last, and caps each topic's circles", async () => {
    const store = atlas();
    const draft = planCardPublication({ record: recordOf(oneFindingCard("one finding")), setAside: false,
      route: { route: "save", account: FREE } }).drafts[0]!;
    const add = async (index: number, topic: { key: string; label: string } | null, sources = ["10.0000/synthetic-a"]) =>
      store.publications.publish({ cardNumber: 20_000 + index, cardSha256: sha256(`map:${index}`), findings: [{ ...draft,
        published: { ...draft.published!, claim: `Map finding ${index}.`, topic, sources } }], publishedAt: SAVED_AT, revive: false });
    for (let index = 0; index < ATLAS_MAP_TOPIC_FINDINGS + 1; index += 1) await add(index, { key: "big", label: "Big topic" });
    await add(100, null, ["10.0000/synthetic-a", "PMID: 40123456"]);
    await add(101, { key: "small", label: "A small topic" });
    await add(102, { key: "other", label: "Another small topic" });
    const model = await loadAtlasMap(new InMemoryAtlasPageSource({ publications: store.publications }), ON);
    expect(model.topics.map(({ topic, count, findings }) => [topic?.key ?? null, count, findings.length])).toEqual([
      ["big", 61, 60], ["small", 1, 1], ["other", 1, 1], [null, 1, 1],
    ]);
    expect(model.topics[3]!.findings[0]!.points).toMatchObject({ sources: 1 });
    const body = renderAtlasMap(model);
    expect(body).toContain("61 findings, 60 on the map: 60 not checked by supervisors yet.");
    expect(body).toContain('<a href="/atlas/topics/big">See all 61 on the topic’s page</a>');
    expect(body).toContain('<h3 id="map-topic-4"><a href="/atlas/findings">No topic (older cards)</a></h3>');
    for (const panel of body.matchAll(/<svg class="map-cluster"[\s\S]*?<\/svg>/gu)) {
      const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/u.exec(panel[0])!.map(Number);
      for (const circle of panel[0].matchAll(/<circle class="map-mark[^"]*" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/gu)) {
        const [x, y, r] = circle.slice(1).map(Number) as [number, number, number];
        expect(x - r).toBeGreaterThanOrEqual(0);
        expect(y - r).toBeGreaterThanOrEqual(0);
        expect(x + r).toBeLessThanOrEqual(width!);
        expect(y + r).toBeLessThanOrEqual(height!);
      }
    }
  });

  it("lays out clusters deterministically, without overlaps, inside their extent", () => {
    for (const radii of [[mapRadius(0)], [mapRadius(7), mapRadius(0)],
      Array.from({ length: 60 }, (_, index) => mapRadius((index * 7) % 8))]) {
      const layout = clusterLayout(radii);
      expect(clusterLayout(radii)).toEqual(layout);
      expect(layout.centres[0]).toEqual({ x: 0, y: 0 });
      layout.centres.forEach((centre, index) => {
        expect(Math.hypot(centre.x, centre.y) + radii[index]!).toBeLessThanOrEqual(layout.extent + 1e-9);
        for (let other = 0; other < index; other += 1) {
          expect(Math.hypot(centre.x - layout.centres[other]!.x, centre.y - layout.centres[other]!.y))
            .toBeGreaterThanOrEqual(radii[index]! + radii[other]! + 4);
        }
      });
    }
    expect([0, 1, 7].map(mapRadius)).toEqual([8, 11.3, 22.6]);
  });

  it("states its rule and status in words, with every circle a link and the same links in the list", async () => {
    const f = await fixture();
    const body = renderAtlasMap(await loadAtlasMap(f.source, ON));
    for (const words of ["2 if supervisors checked it;", "2 if AskRigor rated it high certainty, 1 if moderate;",
      "1 if its page shows counted results for each group;", "1 if its page links to two or more sources;",
      "1 if it was published or checked in the last 30 days.",
      "The map is not a ranking of treatments and not a recommendation.",
      "Nothing in the rule depends on what a finding says", "nothing here is medical advice",
      `${NOT_CHECKED_LABEL}</li>`, "Checked by supervisors</li>", "Contested: another checked finding disagrees</li>",
      '<a href="#map-rule">How the map is drawn</a> · <a href="#map-list">Skip the map and read it as a list</a>',
      "A bigger circle is a finding the Atlas holds more about, not a treatment that works better.",
      "4 findings: 2 contested, 2 not checked by supervisors yet.",
      "On the map: 5 points (checked by supervisors +2, moderate certainty +1, counted results +1, new in the last 30 days +1).",
      "On the map: 1 point (new in the last 30 days +1)."]) {
      expect(body, words).toContain(words);
    }
    const map = body.slice(body.indexOf('<h2 id="map-topics">'), body.indexOf('<h2 id="map-list">'));
    const list = body.slice(body.indexOf('<h2 id="map-list">'));
    const links = (html: string) => [...html.matchAll(/href="\/atlas\/findings\/(P-\d+)"/gu)].map((match) => match[1]);
    expect(links(map)).toEqual([f.shown.edited, f.shown.lowDose, f.shown.effect, f.shown.nothingFound, f.shown.hip]);
    expect(links(list)).toEqual(links(map));
    expect(map).toContain('role="group" aria-labelledby="map-topic-1"');
    expect(map).toContain(`<title>${f.shown.effect}: ${escapeHtml(VELMOR_CARD.findings[0]!.claim)} (${NOT_CHECKED_LABEL}; 3 points)</title>`);
    expect(map).toMatch(/<title>P-\d+: [^<]+ \(Contested; 5 points\)<\/title>/u);
    expect(map).toContain('class="map-mark map-unreviewed"');
    expect(map).toContain('class="map-mark map-contested"');
    expect(map).toContain('class="map-hole"');
    expect(body).not.toContain(f.shown.lead);
    for (const value of Object.values(NEVER)) expect(body).not.toContain(value);
    expect(body).not.toMatch(/<script|<foreignObject|\son[a-z]+=|\sstyle=/iu);
    expect(atlasPageProblems(body)).toEqual([]);
    const ids = [...body.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const empty = renderAtlasMap({ topics: [], newSince: "2026-10-06" });
    expect(empty).toContain("<p>Nothing is published yet.</p>");
    expect(empty).toContain("The map is not a ranking of treatments and not a recommendation.");
    expect(ATLAS_CSS).toContain(".map-unreviewed { fill: var(--unreviewed-surface); stroke: var(--unreviewed);");
  });

  it("is served like the other pages: one route, the page policy, HEAD, the cache and its invalidation", async () => {
    const f = await fixture();
    expect(atlasRouteOf("/atlas/map")).toEqual({ kind: "map" });
    expect(atlasRouteOf("/atlas/map/extra")).toBeUndefined();
    let reads = 0;
    const source: AtlasPageSource = { read: async (work) => { reads += 1; return f.source.read(work); } };
    const signal = new AtlasChangeSignal();
    const base = await serve(pages(source, { signal, now: () => ON.getTime() }));
    const page = await text(base, "/atlas/map");
    expect(page.response.status).toBe(200);
    expectPageHeaders(page.response);
    expect(page.body).toContain('<a href="/atlas/map" aria-current="page">Findings map</a>');
    expect(page.body).toContain('<link rel="canonical" href="https://askrigor.com/atlas/map">');
    expect(page.body).toContain("On the map: 5 points");
    await text(base, "/atlas/map?unused=anything");
    expect(reads).toBe(1);
    signal.announce();
    await text(base, "/atlas/map");
    expect(reads).toBe(2);
    const head = await text(base, "/atlas/map", { method: "HEAD" });
    expect(head.response.status).toBe(200);
    expect(head.body).toBe("");
    expect((await text(base, "/atlas")).body).toContain('<a href="/atlas/map">See every finding on the findings map</a>');
    expect((await text(base, "/atlas/topics")).body).toContain('<a href="/atlas/map">See the topics on the findings map</a>');
  });
});
