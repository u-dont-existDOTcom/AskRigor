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
import { NOT_CHECKED_LABEL, sourceIdentifierOf } from "../apps/research-mcp/src/atlas/page-data.js";
import { ATLAS_CSS, atlasPageProblems, escapeHtml, percent, sourceLink } from "../apps/research-mcp/src/atlas/pages.js";
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

const FREE: FindingsSaveAccount = { mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION, devAccount: false };
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
      protocols: [{ name: "HRP", version: "20.6.31", sha256: "a".repeat(64) }],
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
  protocols: [{ name: "HRP", version: "20.6.31", sha256: sha256("synthetic-hrp") }],
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
      expect(body, path).not.toMatch(/<script|<form|<iframe|\sstyle=|\son[a-z]+=/iu);
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
    for (const path of ["/atlas/", "/atlas/findings", "/atlas/findings/P-12", "/atlas/findings/p-1001",
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
    expect(select.values).toEqual([null, null, null, "velmor-syndrome", 20]);
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
  });
});

