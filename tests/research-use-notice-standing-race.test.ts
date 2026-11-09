import { describe, expect, it } from "vitest";

import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  type ResearchUseAccountRecord,
} from "@askrigor/evidence-repository";

// The review of 7 Nov 2026: the owner's standing acceptance of a new notice read the row, then wrote it back with no
// condition, so a revoke or a switch to paid private landing in between was undone. It is now saved only onto the row
// as it was read. Every subject and time here is invented.

const IDENTITY_SECRET = new TextEncoder().encode("synthetic-standing-race-secret-at-least-32-bytes");
const OWNER = "auth0|synthetic-owner-login";
const NOW = "2026-11-07T10:00:00.000Z";
const LATER = "2026-11-07T11:00:00.000Z";
// A version a later material one replaced, so the owner's yes to it no longer covers the current notice.
const V4 = "free-contributor-v4-2026-10-25";

/** A store that lets one other write land between the service's read and its guarded save. */
class RacingStore extends InMemoryResearchContributorAccessStore {
  race: (() => Promise<void>) | undefined;
  guardedSaves = 0;

  override async saveAccountIfUnchanged(record: ResearchUseAccountRecord, read: ResearchUseAccountRecord): Promise<boolean> {
    this.guardedSaves += 1;
    const race = this.race;
    this.race = undefined;
    if (race !== undefined) await race();
    return await super.saveAccountIfUnchanged(record, read);
  }
}

function ownerRow(service: ResearchContributorAccessService): ResearchUseAccountRecord {
  return {
    accountKey: service.accountKeyForSubject(OWNER), status: "ACTIVE", mode: "FREE_CONTRIBUTOR",
    noticeVersion: V4 as never,
    agreement: {
      noticeVersion: V4, eligibleDeidentifiedResearchContributionRequired: true, prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true, paidPrivateAlternativeAcknowledged: true,
    } as never,
    activatedAt: NOW, revokedAt: null, createdAt: NOW, updatedAt: NOW, noticeAcceptedBy: "PERSON",
  };
}

function setUp() {
  const store = new RacingStore();
  const service = new ResearchContributorAccessService({
    store, identitySecret: IDENTITY_SECRET, now: () => LATER, ownerSubjects: new Set([OWNER]),
  });
  return { store, service };
}

describe("the owner's standing acceptance of a new notice", () => {
  it("is saved when nothing changed the row in between", async () => {
    const { store, service } = setUp();
    await store.saveAccount(ownerRow(service));
    expect(await service.requireActive(OWNER)).toBe("FREE_CONTRIBUTOR");
    expect(await store.getAccount(service.accountKeyForSubject(OWNER))).toMatchObject({
      status: "ACTIVE", noticeVersion: RESEARCH_USE_NOTICE_VERSION, noticeAcceptedBy: "OWNER_STANDING_INSTRUCTION_2026_11_06",
      activatedAt: LATER,
    });
  });

  it("never undoes a revoke that lands between the read and the save", async () => {
    const { store, service } = setUp();
    await store.saveAccount(ownerRow(service));
    store.race = async () => { await service.revoke(OWNER); };
    await expect(service.requireActive(OWNER)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REVOKED" });
    expect(await store.getAccount(service.accountKeyForSubject(OWNER))).toMatchObject({ status: "REVOKED", mode: null });
  });

  it("reads the row again when it changed but still needs the acceptance, and accepts then", async () => {
    const { store, service } = setUp();
    await store.saveAccount(ownerRow(service));
    store.race = async () => { await store.saveAccount({ ...ownerRow(service), updatedAt: "2026-11-07T10:30:00.000Z" }); };
    expect(await service.requireActive(OWNER)).toBe("FREE_CONTRIBUTOR");
    expect(store.guardedSaves).toBe(2);
    expect((await store.getAccount(service.accountKeyForSubject(OWNER)))?.noticeVersion).toBe(RESEARCH_USE_NOTICE_VERSION);
  });

  it("gives up after a second change, and asks rather than accepting onto a row it hasn't read", async () => {
    const { store, service } = setUp();
    await store.saveAccount(ownerRow(service));
    let changes = 0;
    const change = async () => {
      changes += 1;
      await store.saveAccount({ ...ownerRow(service), updatedAt: `2026-11-07T10:3${changes}:00.000Z` });
      store.race = changes < 2 ? change : undefined;
    };
    store.race = change;
    await expect(service.requireActive(OWNER)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    expect((await store.getAccount(service.accountKeyForSubject(OWNER)))?.noticeVersion).toBe(V4);
  });
});
