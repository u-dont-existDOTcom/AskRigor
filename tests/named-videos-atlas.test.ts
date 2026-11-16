import {
  ATLAS_PUBLICATION_SCHEMA_V2, ATLAS_PUBLICATION_SCHEMA_V3, AtlasFindingPromotionRunner,
  InMemoryAtlasCanonicalStore, InMemoryAtlasPageSource, InMemoryAtlasPromotionStore, InMemoryAtlasPublicationStore,
  InMemoryAtlasReviewStore, atlasPublishedFindingSchema, atlasResearchSchema, deterministicUuid,
  prepareAtlasFindingIntent, sha256, type AtlasResearch,
} from "@askrigor/evidence-repository";
import { describe, expect, it } from "vitest";

import { atlasNearFinder, heldFor } from "../apps/research-mcp/src/askrigor-holds.js";
import { loadAtlasFinding, loadAtlasFindings, loadAtlasHome } from "../apps/research-mcp/src/atlas/page-data.js";
import { atlasPageProblems, namedVideoAnchor } from "../apps/research-mcp/src/atlas/page-guard.js";
import { renderAtlasFinding } from "../apps/research-mcp/src/atlas/pages.js";
import {
  canonicalResearchOf, publishedFindingOf, researchKeeping, withCardContext,
} from "../apps/research-mcp/src/atlas/publication.js";
import { nearIndex, shownFinding } from "./helpers/askrigor-holds-fixture.js";
import { DOI, NOW, OTHER_WATCH, VIDEO, WATCH, videoRecord } from "./helpers/named-videos-fixture.js";

async function pageFixture(options: { claim?: string; links?: string[]; accepted?: boolean; research?: AtlasResearch } = {}) {
  const publications = new InMemoryAtlasPublicationStore();
  const canonical = new InMemoryAtlasCanonicalStore();
  const review = new InMemoryAtlasReviewStore();
  const record = videoRecord(options.links ?? [WATCH]);
  const stored = record.card.findings[0]!;
  const published = withCardContext(publishedFindingOf(record, 1)!, record);
  // Direct publication writes, as the neighbouring stored-text tests use, exercise the read guard too.
  if (options.claim !== undefined) published.claim = options.claim;
  const [row] = await publications.publish({ cardNumber: 4242, cardSha256: record.card_sha256,
    publishedAt: NOW.toISOString(), revive: false,
    findings: [{ findingNumber: 1, state: "unreviewed", atlasNumber: null, heldBecause: null, published }] });
  if (options.accepted) {
    const madeWith = { askrigorVersion: "0.1.0", build: "unknown",
      protocols: [{ name: "HRP", version: "20.6.40", sha256: sha256("synthetic-protocol") }],
      depth: "standard", status: "complete" };
    const content = { wording: stored.claim, appliesTo: stored.applies_to, certainty: stored.certainty,
      usualAnswer: record.card.usual_answer, whyNotUsual: stored.why_not_usual,
      whatWouldChangeIt: stored.what_would_change_it, whoElse: null, whatItChanges: null,
      tags: stored.tags, verifiedBases: ["full_text_audit"], numbers: [], kind: stored.kind, subject: stored.subject,
      subjectType: stored.subject_type, direction: stored.direction,
      ...(options.research === undefined ? {} : { research: options.research }),
    };
    const prepared = prepareAtlasFindingIntent({ schema: "askrigor.atlas-finding-intent.v1", kind: "accept",
      entryKind: "finding", leadOrigin: null, editedAtAcceptance: false, topic: record.card.topic,
      question: record.card.question, content,
      sources: [{ kind: "study", identifiers: [{ scheme: "doi", value: DOI }], check: {
        provider: "crossref", title: "An invented velmorase study", publishedYear: 2025,
        retractionStatus: "none_found", notices: [], ownerConfirmed: false,
        envelopeSha256: sha256("synthetic-envelope"), checkedAt: NOW.toISOString(),
      } }],
      wordingKeys: { card: sha256(stored.claim), accepted: sha256(stored.claim) },
      researchCheckedOn: "2026-11-15", madeWith,
    });
    await review.decide({ cardNumber: 4242, itemKind: "finding", itemNumber: 1, decision: "accepted",
      cardSha256: record.card_sha256, ownerReason: null, decidedAt: NOW.toISOString(),
      intent: { intentId: deterministicUuid("named-videos-accept"), ...prepared }, recheckedPublicNumber: null });
    const runner = new AtlasFindingPromotionRunner(new InMemoryAtlasPromotionStore(review, canonical), { now: () => NOW.toISOString() });
    expect((await runner.promoteAccepted()).failed).toEqual([]);
    await publications.decide({ cardNumber: 4242, findingNumber: 1, state: "accepted", atlasNumber: "F-1001",
      decidedAt: NOW.toISOString() });
  }
  return { source: new InMemoryAtlasPageSource({ publications, canonical }), number: row!.publicationNumber };
}

describe("named video links through Atlas publication and accepted research", () => {
  it("carries links into a published finding and its version 2 and version 3 card context", () => {
    const record = videoRecord();
    const published = publishedFindingOf(record, 1)!;
    expect(published.named_videos).toEqual([WATCH]);
    expect(atlasPublishedFindingSchema.parse(published).named_videos).toEqual([WATCH]);
    const v2 = withCardContext(published, record);
    expect(v2.schema).toBe(ATLAS_PUBLICATION_SCHEMA_V2);
    expect(atlasPublishedFindingSchema.parse(v2).named_videos).toEqual([WATCH]);
    record.card.findings[0]!.source_reading = [{ source: DOI, read: "full_text_audited" }];
    const v3 = withCardContext(published, record, new Map(), 1);
    expect(v3.schema).toBe(ATLAS_PUBLICATION_SCHEMA_V3);
    expect(atlasPublishedFindingSchema.parse(v3).named_videos).toEqual([WATCH]);
  });

  it.each([
    [`https://youtu.be/${VIDEO}`], [WATCH, OTHER_WATCH, "https://www.youtube.com/watch?v=nvTestC_003", "https://www.youtube.com/watch?v=nvTestD_004"],
    [WATCH, WATCH], [`${WATCH}&t=12`], [],
  ])("refuses invalid published and canonical named links %j", (...links) => {
    // it.each spreads each row; the row itself is the links array.
    const named_videos = links;
    expect(atlasPublishedFindingSchema.safeParse({ ...publishedFindingOf(videoRecord(), 1), named_videos }).success).toBe(false);
    expect(atlasResearchSchema.safeParse({ named_videos }).success).toBe(false);
  });

  it("keeps named links as canonical research even with no other research or retained source", () => {
    const finding = videoRecord().card.findings[0]!;
    expect(canonicalResearchOf(finding, [])).toEqual({ named_videos: [WATCH] });
    expect(canonicalResearchOf(finding, [], [])).toEqual({ named_videos: [WATCH] });
    const research: AtlasResearch = { named_videos: [WATCH],
      source_reading: [{ source: DOI, read: "full_text_audited" }], figure_sources: [DOI] };
    expect(researchKeeping(research, () => false)).toEqual({ named_videos: [WATCH] });
    expect(researchKeeping(research, () => true)).toEqual(research);
  });
});

describe("the named video exception on public Atlas pages", () => {
  it.each([[WATCH], [WATCH, OTHER_WATCH]])("renders only the exact anchors in a video section for %j", async (...links) => {
    const { source, number } = await pageFixture({ links });
    const model = (await loadAtlasFinding(source, number))!;
    expect(model.finding.namedVideos).toEqual(links);
    const page = renderAtlasFinding(model);
    expect(page).toContain('id="videos"');
    expect(page).toContain(links.length === 1 ? "The video this is about" : "The videos this is about");
    for (const link of links) expect(page).toContain(namedVideoAnchor(link));
    expect(atlasPageProblems(page)).toEqual([]);
  });

  it("renders the exact permitted anchor and refuses a youtu.be address", () => {
    expect(namedVideoAnchor(WATCH)).toBe(`<a class="named-video" href="${WATCH}" rel="noopener nofollow">Watch the video on YouTube</a>`);
    expect(namedVideoAnchor(`https://youtu.be/${VIDEO}`)).toBeUndefined();
  });

  it.each([
    `<a href="${WATCH}">A different link</a>`, `<a href="https://youtu.be/${VIDEO}">Video</a>`,
    "<p>youtube.com</p>", `<a class="named-video" href="${WATCH}" rel="noopener">Watch the video on YouTube</a>`,
    `<a class="named-video" href="${WATCH}&amp;t=1" rel="noopener nofollow">Watch the video on YouTube</a>`,
    `<a class="named-video" href="${WATCH}" rel="noopener nofollow">Different words</a>`,
  ])("still detects other YouTube text or links beside the allowed anchor: %s", async (extra) => {
    const { source, number } = await pageFixture();
    const page = renderAtlasFinding((await loadAtlasFinding(source, number))!);
    expect(atlasPageProblems(`${page}${extra}`)).toContain("youtube_link");
  });

  it("does not allow script or card-reference problems beside an exact named video anchor", () => {
    expect(atlasPageProblems(`${namedVideoAnchor(WATCH)}<script>alert(1)</script> ARF-4242`))
      .toEqual(["script", "card_reference"]);
  });

  it.each([`An invented claim links ${WATCH}.`, "An invented claim says youtube.com."])(
    "leaves a finding with unsafe text out of individual, home and finding-list pages: %s", async (claim) => {
      const { source, number } = await pageFixture({ claim });
      expect(await loadAtlasFinding(source, number)).toBeUndefined();
      expect(JSON.stringify(await loadAtlasHome(source))).not.toContain(claim);
      expect(JSON.stringify(await loadAtlasFindings(source))).not.toContain(claim);
    });

  it("prefers an accepted version's named videos over the publication's", async () => {
    const { source, number } = await pageFixture({ accepted: true, research: { named_videos: [OTHER_WATCH] } });
    const model = (await loadAtlasFinding(source, number))!;
    expect(model.finding.namedVideos).toEqual([OTHER_WATCH]);
    const page = renderAtlasFinding(model);
    expect(page).toContain(namedVideoAnchor(OTHER_WATCH));
    expect(page).not.toContain(WATCH);
    expect(atlasPageProblems(page)).toEqual([]);
  });

  it("falls back to the publication's named video for an accepted version without named videos", async () => {
    const { source, number } = await pageFixture({ accepted: true });
    expect((await loadAtlasFinding(source, number))!.finding.namedVideos).toEqual([WATCH]);
  });

  it("hands named videos and the extra how-to-use sentence over only for a finding that has them", async () => {
    const publications = new InMemoryAtlasPublicationStore();
    const source = new InMemoryAtlasPageSource({ publications });
    const run = async (namedVideos: string[]) => {
      const finding = shownFinding("Invented velmorase chemistry.", { subject: "velmorase", namedVideos });
      const atlas = atlasNearFinder(source, { load: async () => nearIndex(finding) });
      return await heldFor({ atlas, pointers: () => [] }, "velmorase");
    };
    const linked = (await run([WATCH]))!;
    expect(linked.atlas_findings?.[0]?.named_videos).toEqual([WATCH]);
    expect(linked.how_to_use).toContain("A finding that gives named_videos is about those videos, which a person named");
    const unlinked = (await run([]))!;
    expect(unlinked.atlas_findings?.[0]).not.toHaveProperty("named_videos");
    expect(unlinked.how_to_use).not.toContain("named_videos");
  });
});
