import { InMemoryAtlasPageSource, InMemoryAtlasPublicationStore, RESEARCH_USE_NOTICE_VERSION } from "@askrigor/evidence-repository";
import { describe, expect, it } from "vitest";

import { findingsCardDigest } from "../apps/research-mcp/src/findings/card.js";
import { AtlasCardPublisher } from "../apps/research-mcp/src/atlas/publication.js";
import { loadAtlasFinding } from "../apps/research-mcp/src/atlas/page-data.js";
import { renderAtlasFinding } from "../apps/research-mcp/src/atlas/pages.js";
import { atlasPageProblems, namedVideoAnchor } from "../apps/research-mcp/src/atlas/page-guard.js";
import { GitHubFindingsReview } from "../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService, type FindingsRecord, type FindingsSaveAccount } from "../apps/research-mcp/src/findings/service.js";
import { issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { FakeGitHub } from "./helpers/fake-github-findings.js";
import { ACCOUNT_KEY, NOW, SECRET, TARGET, VIDEO, WATCH, videoCard } from "./helpers/named-videos-fixture.js";

async function save(links: string[] | undefined, nv: string[] | undefined,
  account: FindingsSaveAccount = { mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION }) {
  const github = new FakeGitHub();
  const tokenProvider = { getToken: async () => "findings-token-fixture" };
  const queue = new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY });
  const publications = new InMemoryAtlasPublicationStore();
  const service = new FindingsSaveService({ queue, receiptSecret: () => SECRET,
    publisher: new AtlasCardPublisher({ store: publications, now: () => NOW }),
    limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
    protocols: async () => [], version: "0.1.0", build: "0123abc", now: () => NOW });
  const card = videoCard(links);
  const result = await service.save({ findings_card: card, contributor: ACCOUNT_KEY,
    finalization_receipt: issueResearchReceipt("finalization", { status: "ready", target: researchTargetDigest(TARGET),
      findings: findingsCardDigest(card), ...(nv === undefined ? {} : { nv }) }, { secret: SECRET, now: () => NOW }),
  }, { surface: "/mcp", toolCatalogSha256: "c".repeat(64), account });
  expect(result).toMatchObject({ status: "saved" });
  await service.publicationsSettled();
  const body = github.issue(42).body;
  const json = /```json\n([\s\S]*?)\n```/u.exec(body)!;
  const record = JSON.parse(json[1]!) as FindingsRecord;
  const review = new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY });
  return { record, publications, readable: body.slice(0, body.indexOf("## Full record")), review: await review.readCard(42) };
}

describe("saving named video links under the account's consent", () => {
  it("stores a receipt-signed watch link under the current notice and the review reads it back", async () => {
    const result = await save([WATCH], [`1.${VIDEO}`]);
    expect(result.record.card.findings[0]!.named_videos).toEqual([WATCH]);
    expect(result.review).toMatchObject({ status: "found", card: { record: result.record } });
    expect(result.readable.replace(/\\([\\`*_{}\[\]()#+.!|>~-])/gu, "$1"))
      .toContain(`- Videos the person named: ${WATCH}`);
  });

  it("carries a signed video from the real save through publication and the public finding page", async () => {
    const { publications } = await save([WATCH], [`1.${VIDEO}`]);
    const [row] = await publications.inspect({ cardNumbers: [42] });
    expect(row).toBeDefined();
    const source = new InMemoryAtlasPageSource({ publications });
    const model = (await loadAtlasFinding(source, row!.publicationNumber))!;
    expect(model.finding.namedVideos).toEqual([WATCH]);
    const page = renderAtlasFinding(model);
    expect(page).toContain(namedVideoAnchor(WATCH));
    expect(atlasPageProblems(page)).toEqual([]);
  });

  it("stores no link under a free account's uncovered notice", async () => {
    const result = await save([WATCH], [`1.${VIDEO}`], { mode: "FREE_CONTRIBUTOR", noticeVersion: "free-contributor-v5-2026-11-05" });
    expect(result.record.card.findings[0]).not.toHaveProperty("named_videos");
    expect(result.readable).not.toContain("Videos the person named:");
  });

  it("stores no link without nv even under the current notice", async () => {
    const result = await save([WATCH], undefined);
    expect(result.record.card.findings[0]).not.toHaveProperty("named_videos");
    expect(result.readable).not.toContain("Videos the person named:");
  });

  it("allows a paid private save to keep a signed named video", async () => {
    expect((await save([WATCH], [`1.${VIDEO}`], { mode: "PAID_PRIVATE", noticeVersion: null }))
      .record.card.findings[0]!.named_videos).toEqual([WATCH]);
  });

  it("leaves the new readable line out when the finding has no named links", async () => {
    const result = await save(undefined, undefined);
    expect(result.readable).not.toContain("Videos the person named:");
    expect(result.review.status).toBe("found");
  });

  it("keeps a normalized short link readable by the review", async () => {
    const result = await save([`https://youtu.be/${VIDEO}`], [`1.${VIDEO}`]);
    expect(result.record.card.findings[0]!.named_videos).toEqual([WATCH]);
    expect(result.review.status).toBe("found");
  });

  it("keeps a card readable after an unsigned named link is left out", async () => {
    expect((await save([WATCH], undefined)).review.status).toBe("found");
  });

  // Codex's review of 15 November 2026, finding 3: an empty list given and none stored differ, so the record says so.
  it("keeps a card readable when it gave an empty named_videos list", async () => {
    const result = await save([], undefined);
    expect(result.record.card.findings[0]).not.toHaveProperty("named_videos");
    expect(result.record.stored_without).toContain("named_video_links_as_given");
    expect(result.review.status).toBe("found");
  });
});
