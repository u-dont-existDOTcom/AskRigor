import { describe, expect, it, vi } from "vitest";

import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_CHANGES,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchUseNoticeCovered,
  type ResearchUseAccountRecord,
} from "@askrigor/evidence-repository";

import { loadAtlasAccountFeatures, type AtlasServerFeatures } from "../apps/research-mcp/src/atlas/account-features.js";
import { accountPublicationProblems } from "../apps/research-mcp/src/atlas/publication.js";
import { noticeAcceptanceSentence } from "../apps/research-mcp/src/research-contributor-access-tool.js";

// The owner, 6 November 2026: a new notice version asks again only when it collects or publishes more than the version
// a person accepted; one that changes only its wording carries their earlier yes forward. No real version is
// wording-only yet, so this file stands one in: the current notice (version 5) declared as changing only wording since
// version 4, in the one module that declares materiality, which the package and the connector both read.
vi.mock("../packages/evidence-repository/dist/research-use-notice-changes.js", () => ({
  RESEARCH_USE_NOTICE_CHANGES: Object.freeze([
    { version: "free-contributor-v1-2026-09-01", material: true, change: "Synthetic: the first notice." },
    { version: "free-contributor-v2-2026-09-30", material: true, change: "Synthetic: cards saved." },
    { version: "free-contributor-v3-2026-10-22", material: true, change: "Synthetic: accepted findings published." },
    { version: "free-contributor-v4-2026-10-25", material: true, change: "Synthetic: cards published on save." },
    { version: "free-contributor-v5-2026-11-05", material: false, change: "Synthetic: only the wording changed." },
  ]),
}));

const IDENTITY_SECRET = new TextEncoder().encode("synthetic-notice-carry-forward-secret-at-least-32-bytes");
const OWNER = "auth0|synthetic-owner-login";
const PERSON = "auth0|synthetic-other-person";
const NOW = "2026-11-07T10:00:00.000Z";
const LATER = "2026-11-07T11:00:00.000Z";
const V3 = "free-contributor-v3-2026-10-22";
const V4 = "free-contributor-v4-2026-10-25";

function accountUnder(service: ResearchContributorAccessService, subject: string, noticeVersion: string): ResearchUseAccountRecord {
  return {
    accountKey: service.accountKeyForSubject(subject), status: "ACTIVE", mode: "FREE_CONTRIBUTOR",
    noticeVersion: noticeVersion as never,
    agreement: {
      noticeVersion, eligibleDeidentifiedResearchContributionRequired: true, prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true, paidPrivateAlternativeAcknowledged: true,
    } as never,
    activatedAt: NOW, revokedAt: null, createdAt: NOW, updatedAt: NOW, noticeAcceptedBy: "PERSON",
  };
}

describe("a wording-only notice carries an earlier yes forward", () => {
  it("reads the stand-in declaration", () => {
    expect(RESEARCH_USE_NOTICE_CHANGES.at(-1)).toMatchObject({ version: RESEARCH_USE_NOTICE_VERSION, material: false });
    expect(researchUseNoticeCovered(V4)).toBe(true);
    expect(researchUseNoticeCovered(V3)).toBe(false);
  });

  it("keeps the yes a person gave to version 4, unchanged in the record, and says it carries forward", async () => {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({
      store, identitySecret: IDENTITY_SECRET, now: () => LATER, ownerSubjects: new Set([OWNER]),
    });
    await store.saveAccount(accountUnder(service, PERSON, V4));
    const view = await service.inspect(PERSON);
    expect(view).toMatchObject({
      status: "ACTIVE", mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      acceptance: { noticeVersion: V4, acceptedAt: NOW, acceptedBy: "PERSON", current: "carried_forward" },
    });
    await expect(service.requireActive(PERSON)).resolves.toBe("FREE_CONTRIBUTOR");
    // Nothing is written: the record still says what the person accepted, when and how.
    expect(store.allAccounts()[0]).toMatchObject({ noticeVersion: V4, updatedAt: NOW, noticeAcceptedBy: "PERSON" });
    expect(noticeAcceptanceSentence(view.acceptance)).toBe(` This account's yes to notice ${V4} carries forward to ` +
      `${RESEARCH_USE_NOTICE_VERSION}, which changed only wording.`);
    // Its cards publish on save, as under the notice it accepted.
    expect(accountPublicationProblems({ mode: "FREE_CONTRIBUTOR", noticeVersion: V4 })).toEqual([]);
    expect(accountPublicationProblems({ mode: "FREE_CONTRIBUTOR", noticeVersion: V3 })).toEqual(["notice_not_current"]);
  });

  it("asks again a person whose yes predates a material version", async () => {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET, now: () => LATER });
    await store.saveAccount(accountUnder(service, PERSON, V3));
    expect(await service.inspect(PERSON)).toMatchObject({ status: "UNENROLLED" });
    await expect(service.requireActive(PERSON)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
  });

  it("carries the owner's own yes forward too, with no standing acceptance written", async () => {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({
      store, identitySecret: IDENTITY_SECRET, now: () => LATER, ownerSubjects: new Set([OWNER]),
    });
    await store.saveAccount(accountUnder(service, OWNER, V4));
    expect((await service.inspect(OWNER)).acceptance).toEqual({
      noticeVersion: V4, acceptedAt: NOW, acceptedBy: "PERSON", current: "carried_forward",
    });
    expect(store.allAccounts()[0]).toMatchObject({ noticeVersion: V4, updatedAt: NOW, noticeAcceptedBy: "PERSON" });
  });

  it("says so on the Atlas account page", async () => {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET, now: () => LATER });
    await store.saveAccount(accountUnder(service, PERSON, V4));
    const server: AtlasServerFeatures = {
      redditReader: true, youtube: true, gemini: true, aiBudgetLeftNanoUsd: 30_000_000_000, videoSecondsLeft: 20_000,
      meaningJudge: { on: false, dailyCapUsd: null }, ownerLibrary: true, sharedAnswers: true, findingsLibrary: true,
    };
    const features = await loadAtlasAccountFeatures({
      research: service, server: async () => server, ownerAccountKeys: new Set(), devAccountKeys: () => new Set(),
    }, service.accountKeyForSubject(PERSON), new Date(LATER));
    expect(features.state).toBe("shown");
    const row = features.state === "shown" ? features.rows.find(({ id }) => id === "research-access") : undefined;
    expect(row?.forYou).toBe("Free contributor use, under the free-use notice you accepted: version 4, of 25 Oct 2026. " +
      "The notice has changed only in wording since, so your yes carries forward to version 5, of 5 Nov 2026.");
  });
});
