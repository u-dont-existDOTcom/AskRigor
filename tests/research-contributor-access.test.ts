import { createManageResearchAccessHandler, manageResearchAccessInputSchema, planBuildingLine, waitForPendingMenuChoices }
  from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { ASKED_REQUEST, MENU_PLACEHOLDERS, RESEARCH_MENU_SHAPE, STEER_PROGRESS, STEER_REPLAN, STEER_REGISTER, CHATGPT_PLAN_ENDING } from "../apps/research-mcp/src/research-steering.js";
import { withLaterInputs } from "../apps/research-mcp/src/later-inputs.js";
import { clientResultBytes } from "../apps/research-mcp/src/tool-result.js";
import { MCP_RESULT_MAX_BYTES } from "../apps/research-mcp/src/config.js";
import type { ResearchPlanner } from "../apps/research-mcp/src/research-planner.js";
import { describe, expect, it } from "vitest";

import {
  deterministicUuid,
  EARLIER_RESEARCH_USE_NOTICE_VERSIONS,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  DEFAULT_RESEARCH_STEERING,
  ResearchAccessError,
  ResearchContributorAccessService,
  PAID_PRIVATE_MAP_ONLY,
  RESEARCH_MAP_CONSENT,
  sha256,
  researchAccountReference,
  type ContributionPrivacyBoundary,
  type LivingEvidenceContribution,
  type ResearchFrontierContribution,
} from "../packages/evidence-repository/src/index.js";

const IDENTITY_SECRET = new TextEncoder().encode(
  "synthetic-research-identity-secret-with-at-least-thirty-two-bytes",
);
const SUBJECT = "auth0|synthetic-free-user";
const NOW = "2026-09-01T01:00:00.000Z";
const PRIVACY_BOUNDARY: ContributionPrivacyBoundary = {
  rawChatPersisted: false,
  promptPersisted: false,
  accountIdentityInPayload: false,
  privateHealthNarrativePersisted: false,
  uploadContentPersisted: false,
  rawSourceContentPersisted: false,
  rawProviderResponsePersisted: false,
  communityDataPersisted: false,
};

function agreement() {
  return {
    noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    eligibleDeidentifiedResearchContributionRequired: true,
    prohibitedPrivateAndRawContentExcluded: true,
    proposalReviewAndNoAuthorityAcknowledged: true,
    paidPrivateAlternativeAcknowledged: true,
  } as const;
}

function fixture() {
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({
    store,
    identitySecret: IDENTITY_SECRET,
    now: () => NOW,
    randomUuid: () => "99999999-9999-4999-a999-999999999999",
  });
  return { store, service };
}

describe("research contributor access", () => {
  it("reads an account by the key derived from its subject, as the Atlas account page does", async () => {
    const { store, service } = fixture();
    const accountKey = service.accountKeyForSubject(SUBJECT);
    await expect(service.inspectByAccountKey(accountKey)).resolves.toEqual(await service.inspect(SUBJECT));
    await service.acceptFreeContributor(SUBJECT, agreement());
    await service.setDetailedLessonReports(SUBJECT, true);
    await expect(service.inspectByAccountKey(accountKey)).resolves.toEqual(await service.inspect(SUBJECT));
    await expect(service.activeAccountByKey(accountKey)).resolves.toEqual(await service.activeAccount(SUBJECT));
    await expect(service.activeAccountByKey(accountKey)).resolves.toMatchObject({
      mode: "FREE_CONTRIBUTOR", detailedLessonReports: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    });
    // Only a key AskRigor derives is read: never a subject, nor a key in another form.
    for (const refused of [SUBJECT, accountKey.toUpperCase(), accountKey.slice(1), `${accountKey} `]) {
      await expect(service.inspectByAccountKey(refused)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      await expect(service.activeAccountByKey(refused)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    }
    expect(store.allAccounts()).toHaveLength(1);
  });

  it("publishes the exact choice before enrollment and stores only a keyed identity", async () => {
    const { store, service } = fixture();

    await expect(service.inspect(SUBJECT)).resolves.toMatchObject({
      status: "UNENROLLED",
      mode: null,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      notice: RESEARCH_USE_NOTICE,
      paidCheckoutAvailable: false,
    });
    const active = await service.acceptFreeContributor(SUBJECT, agreement());
    expect(active).toMatchObject({
      status: "ACTIVE",
      mode: "FREE_CONTRIBUTOR",
      contributionRequired: true,
      paidCheckoutAvailable: false,
    });

    const records = store.allAccounts();
    expect(records).toHaveLength(1);
    expect(records[0]!.accountKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(records)).not.toContain(SUBJECT);
    expect(records[0]!.agreement).toEqual(agreement());
  });

  it("rejects ambiguous or incomplete free-contributor agreement", async () => {
    const { store, service } = fixture();

    await expect(service.acceptFreeContributor(SUBJECT, {
      ...agreement(),
      eligibleDeidentifiedResearchContributionRequired: false,
    })).rejects.toThrow();
    expect(store.allAccounts()).toHaveLength(0);
  });

  it("preserves a partial formal frontier as a pending, non-authoritative proposal", async () => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());
    const payload = partialFrontier();

    const inserted = await service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload,
    });
    expect(inserted.status).toBe("inserted");
    expect(inserted.record).toMatchObject({
      proposalKind: "RESEARCH_FRONTIER",
      partial: true,
      status: "PENDING_REVIEW",
    });
    expect(store.allProposals()).toHaveLength(1);
    expect(JSON.stringify(store.allProposals()[0]!.payload)).not.toContain(SUBJECT);

    const replay = await service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload,
    });
    expect(replay.status).toBe("idempotent_replay");
    expect(replay.record.proposalId).toBe(inserted.record.proposalId);
    expect(store.allProposals()).toHaveLength(1);
  });

  it("accepts complete source-bound analysis but rejects topic-only and community analysis", async () => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());
    const sourceAnalysis = completeSourceAnalysis();

    const inserted = await service.submitProposal(SUBJECT, {
      proposalKind: "SOURCE_ANALYSIS",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: sourceAnalysis,
    });
    expect(inserted.record.partial).toBe(false);
    expect(inserted.record.status).toBe("PENDING_REVIEW");

    const topicOnly = structuredClone(sourceAnalysis);
    topicOnly.source = null;
    topicOnly.analysis.analysisKind = "topic_synthesis";
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "SOURCE_ANALYSIS",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: topicOnly,
    })).rejects.toMatchObject({ code: "CONTRIBUTION_PRIVACY_REJECTED" });

    const community = completeSourceAnalysis();
    community.source!.identifiers = [{
      scheme: "url",
      value: "https://www.youtube.com/watch?v=synthetic",
    }];
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "SOURCE_ANALYSIS",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: community,
    })).rejects.toMatchObject({ code: "CONTRIBUTION_PRIVACY_REJECTED" });

    expect(store.allProposals()).toHaveLength(1);
  });

  it.each(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"] as const)(
    "rejects sandbox identifier values in %s before persistence, regardless of scheme case or identifier label",
    async (proposalKind) => {
      const { store, service } = fixture();
      await service.acceptFreeContributor(SUBJECT, agreement());
      for (const value of ["sandbox:/mnt/data/report.json", "SaNdBoX:/mnt/data/report.json", "SANDBOX:report.json"]) {
        for (const scheme of ["url", "other"] as const) {
          const submission = service.submitProposal(SUBJECT, {
            proposalKind,
            privacyBoundary: PRIVACY_BOUNDARY,
            payload: contributionWithIdentifier(proposalKind, scheme, value),
          });
          await expect(submission).rejects.toBeInstanceOf(ResearchAccessError);
          // Owner question 127: the rejection names the rule and the exact identifier, never the link.
          await expect(submission).rejects.toMatchObject({
            name: "Error",
            code: "CONTRIBUTION_PRIVACY_REJECTED",
            total: 1,
            problems: [{
              path: proposalKind === "SOURCE_ANALYSIS"
                ? "payload.source.identifiers[1].value"
                : "payload.frontier.candidateVersions[0].identifiers[1].value",
              rule: "sandbox_locator",
              expected: expect.stringContaining("a sandbox: link points into another session and can never be opened"),
            }],
          });
          const rejection = await submission.catch((error: unknown) => error);
          expect(`${(rejection as Error).message}${JSON.stringify(rejection)}`).not.toContain(value.slice(8));
        }
      }
      expect(store.allProposals()).toHaveLength(0);
    },
  );

  it.each(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"] as const)(
    "accepts an ordinary HTTPS identifier in %s, even when sandbox: appears later in the URL",
    async (proposalKind) => {
      const { store, service } = fixture();
      await service.acceptFreeContributor(SUBJECT, agreement());
      await expect(service.submitProposal(SUBJECT, {
        proposalKind,
        privacyBoundary: PRIVACY_BOUNDARY,
        payload: contributionWithIdentifier(proposalKind, "url", "https://example.org/study/sandbox:report.json"),
      })).resolves.toMatchObject({ status: "inserted", record: { status: "PENDING_REVIEW", proposalKind } });
      expect(store.allProposals()).toHaveLength(1);
    },
  );

  it("rejects prohibited keys and obvious contact details before persistence", async () => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());

    const prohibited = partialFrontier() as unknown as Record<string, unknown>;
    prohibited.rawChat = "private conversation";
    const rejection = await service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: prohibited,
    }).catch((error: unknown) => error);
    // Owner question 127: every problem, the prohibited key first; the key and its value are not repeated.
    expect(rejection).toMatchObject({
      code: "CONTRIBUTION_PRIVACY_REJECTED",
      problems: [
        { path: "payload.*", rule: "prohibited_key" },
        { path: "payload", rule: "unknown_keys" },
      ],
    });
    expect(`${(rejection as Error).message}${JSON.stringify(rejection)}`).not.toMatch(/rawChat|private conversation/u);

    const contact = partialFrontier();
    contact.question.normalizedQuestion =
      "Please identify records for private.person@example.com";
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: contact,
    })).rejects.toMatchObject({ code: "CONTRIBUTION_PRIVACY_REJECTED" });
    expect(store.allProposals()).toHaveLength(0);
  });

  it("fails paid-private mode closed without an entitlement and never contributes with one", async () => {
    const { store, service } = fixture();
    await expect(service.activatePaidPrivate(SUBJECT)).rejects.toMatchObject({
      code: "PAID_PRIVATE_ENTITLEMENT_REQUIRED",
    });

    const accountKey = service.accountKeyForSubject(SUBJECT);
    store.grantPrivateEntitlement({
      entitlementId: "88888888-8888-4888-a888-888888888888",
      accountKey,
      status: "ACTIVE",
      source: "OWNER_GRANTED",
      externalReferenceSha256: null,
      grantedAt: "2026-08-31T00:00:00.000Z",
      expiresAt: "2026-09-02T00:00:00.000Z",
      revokedAt: null,
    });
    const active = await service.activatePaidPrivate(SUBJECT);
    expect(active).toMatchObject({
      status: "ACTIVE",
      mode: "PAID_PRIVATE",
      contributionRequired: false,
      privateEntitlementRequired: true,
      paidCheckoutAvailable: false,
    });
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: partialFrontier(),
    })).rejects.toMatchObject({ code: "PAID_PRIVATE_DOES_NOT_CONTRIBUTE", message: PAID_PRIVATE_MAP_ONLY });
    expect(store.allProposals()).toHaveLength(0);

    // Owner answer 143a: only this research's map, with the user's yes and the receipt of the check that offered it,
    // which the caller checked; the consent alone, or a receipt the caller did not check, files nothing.
    const receipt = "rr1~finalization~map=offered~1~synthetic";
    const consented = {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: partialFrontier(),
      userConsent: RESEARCH_MAP_CONSENT,
      finalizationReceipt: receipt,
    };
    await expect(service.submitProposal(SUBJECT, consented)).rejects.toMatchObject({
      code: "PAID_PRIVATE_DOES_NOT_CONTRIBUTE",
    });
    await expect(service.submitProposal(SUBJECT, consented, {
      paidPrivateConsent: { receiptSha256: sha256("another receipt") },
    })).rejects.toMatchObject({ code: "PAID_PRIVATE_DOES_NOT_CONTRIBUTE" });
    // A paid private account files a map, never an analysis or a topic link, even with a checked consent.
    await expect(service.submitProposal(SUBJECT, { ...consented, proposalKind: "SOURCE_ANALYSIS" }, {
      paidPrivateConsent: { receiptSha256: sha256(receipt) },
    })).rejects.toMatchObject({ code: "PAID_PRIVATE_DOES_NOT_CONTRIBUTE" });
    expect(store.allProposals()).toHaveLength(0);
    const filed = await service.submitProposal(SUBJECT, consented, {
      paidPrivateConsent: { receiptSha256: sha256(receipt) },
    });
    expect(filed.status).toBe("inserted");
    expect(filed.record.consentReceiptSha256).toBe(sha256(receipt));
    expect(store.allProposals()).toHaveLength(1);
  });

  // Owner answer 307b (15 November 2026): word for word as the owner chose it, the second sentence now ends "never
  // YouTube comments." and a new sentence follows it, "A card may link a video that a person named." (a YouTube video
  // the asker, someone reporting what worked for them, or AskRigor's owner named; videos AskRigor itself finds through
  // YouTube's search stay out, and cards still hold no YouTube comments). All other sentences stay as in v5 (owner
  // answer 253a), and every earlier account accepts v6 before free research.
  it("pins the sixth free contributor notice, word for word, after the five earlier versions", () => {
    expect(RESEARCH_USE_NOTICE_VERSION).toBe("free-contributor-v6-2026-11-15");
    expect(EARLIER_RESEARCH_USE_NOTICE_VERSIONS).toEqual([
      "free-contributor-v1-2026-09-01",
      "free-contributor-v2-2026-09-30",
      "free-contributor-v3-2026-10-22",
      "free-contributor-v4-2026-10-25",
      "free-contributor-v5-2026-11-05",
    ]);
    expect(RESEARCH_USE_NOTICE).toBe([
      "Free AskRigor use is reciprocal: what AskRigor learns from your research is saved for its research library.",
      "That includes deidentified structured research progress and, for each finished research answer whose " +
        "findings would help other people, a findings card: the question in general terms, the main findings and " +
        "how certain they are, the public studies behind them, and what public online communities reported, " +
        "summarized without their posts or names: the communities, counts of what people reported, and links to the " +
        "forum threads AskRigor read, never YouTube comments.",
      "A card may link a video that a person named.",
      "AskRigor never saves raw chat, prompts, identity or contact details, private health narratives, uploads, or " +
        "raw source or provider bodies.",
      "Saved research is reviewed and does not become evidence, conclusions, or scientific authority merely because " +
        "it was saved or repeated.",
      "Your findings cards are published in AskRigor's public Atlas as soon as they are saved, written without you and marked \"Not checked by supervisors yet\" until AskRigor's owner has reviewed them, and people who sign in can vote and comment on them.",
      "If you ask to delete a findings card, everything that ties it to you is removed, and the card leaves the Atlas unless AskRigor's owner has already accepted its findings; no reason is needed.",
      "An accepted finding stays while it is valid: it is corrected or taken down when someone shows it is wrong, " +
        "and rewritten or removed if it could identify anyone.",
      "Paid private access saves research findings or lesson feedback only when you accept saving them for that " +
        "answer, and requires an active verified entitlement.",
    ].join(" "));
  });

  it.each(EARLIER_RESEARCH_USE_NOTICE_VERSIONS)("asks a free account that accepted %s to accept the current notice", async (earlier) => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());
    const [account] = store.allAccounts();
    await store.saveAccount({ ...account!, noticeVersion: earlier, agreement: { ...agreement(), noticeVersion: earlier } });

    await expect(service.inspect(SUBJECT)).resolves.toMatchObject({
      status: "UNENROLLED",
      mode: null,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      notice: RESEARCH_USE_NOTICE,
    });
    await expect(service.requireActive(SUBJECT)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    await expect(service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: partialFrontier(),
    })).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    // Only the current notice can be accepted.
    await expect(service.acceptFreeContributor(SUBJECT, { ...agreement(), noticeVersion: earlier })).rejects.toThrow();

    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.requireActive(SUBJECT)).resolves.toBe("FREE_CONTRIBUTOR");
    expect(store.allAccounts()[0]).toMatchObject({ noticeVersion: RESEARCH_USE_NOTICE_VERSION });
  });

  it("blocks all later use after revocation", async () => {
    const { store, service } = fixture();
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.requireActive(SUBJECT)).resolves.toBe("FREE_CONTRIBUTOR");
    await service.submitProposal(SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: partialFrontier(),
    });

    const revoked = await service.revoke(SUBJECT);
    expect(revoked.status).toBe("REVOKED");
    expect(store.allProposals()).toMatchObject([{
      status: "WITHDRAWN",
      reviewReason: "contributor_access_revoked",
    }]);
    await expect(service.requireActive(SUBJECT)).rejects.toMatchObject({
      code: "RESEARCH_ACCESS_REVOKED",
    });
  });

  // Owner answer 140b (2026-10-20): the plain-answer note is a stored choice, on by default.
  it("stores the plain-answer note setting, on by default, which saving or revoking the account leaves as it is", async () => {
    const { store, service } = fixture();
    await expect(service.setPlainAnswerNote(SUBJECT, false)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    expect(store.allAccounts()).toEqual([]);
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toEqual({
      mode: "FREE_CONTRIBUTOR", plainAnswerNote: true, detailedLessonReports: false, findingsSave: true,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION, steering: DEFAULT_RESEARCH_STEERING,
    });
    await expect(service.setPlainAnswerNote(SUBJECT, false)).resolves.toBe(false);
    await expect(service.activeAccount(SUBJECT)).resolves.toEqual({
      mode: "FREE_CONTRIBUTOR", plainAnswerNote: false, detailedLessonReports: false, findingsSave: true,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION, steering: DEFAULT_RESEARCH_STEERING,
    });
    // Accepting again saves the account row anew; the choice is the account's, not the agreement's.
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: false });
    await service.revoke(SUBJECT);
    await expect(service.setPlainAnswerNote(SUBJECT, true)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REVOKED" });
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: false });
    await service.setPlainAnswerNote(SUBJECT, true);
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: true });
    // Only the choice is kept: no text field joins the account row (how the notice was accepted is the row's own).
    expect(Object.keys(store.allAccounts()[0]!).sort()).toEqual([
      "accountKey", "activatedAt", "agreement", "createdAt", "mode", "noticeAcceptedBy", "noticeVersion",
      "plainAnswerNote", "revokedAt", "status", "updatedAt"
    ]);
  });

  // Owner question 154 (2026-10-21): detailed lesson reports are a stored choice, off by default, that the user turns on.
  it("stores the detailed lesson reports setting, off by default, which saving or revoking the account leaves as it is", async () => {
    const { store, service } = fixture();
    await expect(service.setDetailedLessonReports(SUBJECT, true)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    expect(store.allAccounts()).toEqual([]);
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ detailedLessonReports: false });
    await expect(service.setDetailedLessonReports(SUBJECT, true)).resolves.toBe(true);
    await expect(service.activeAccount(SUBJECT)).resolves.toEqual({
      mode: "FREE_CONTRIBUTOR", plainAnswerNote: true, detailedLessonReports: true, findingsSave: true,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION, steering: DEFAULT_RESEARCH_STEERING,
    });
    // Each setting changes only itself.
    await service.setPlainAnswerNote(SUBJECT, false);
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: false, detailedLessonReports: true });
    // Accepting again saves the account row anew; the choice is the account's, not the agreement's.
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ detailedLessonReports: true });
    await service.revoke(SUBJECT);
    await expect(service.setDetailedLessonReports(SUBJECT, false)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REVOKED" });
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ detailedLessonReports: true });
    await expect(service.setDetailedLessonReports(SUBJECT, false)).resolves.toBe(false);
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ plainAnswerNote: false, detailedLessonReports: false });
    // Only the choice is kept: no report or text field joins the account row.
    expect(Object.keys(store.allAccounts()[0]!).sort()).toEqual([
      "accountKey", "activatedAt", "agreement", "createdAt", "detailedLessonReports", "mode", "noticeAcceptedBy",
      "noticeVersion", "plainAnswerNote", "revokedAt", "status", "updatedAt"
    ]);
  });

  it("stores findings-card saving on by default, preserves it through save and revocation, and changes only itself", async () => {
    const { store, service } = fixture();
    await expect(service.setFindingsSave(SUBJECT, false)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    expect(store.allAccounts()).toEqual([]);
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ findingsSave: true });
    await service.setPlainAnswerNote(SUBJECT, false);
    await service.setDetailedLessonReports(SUBJECT, true);
    await expect(service.setFindingsSave(SUBJECT, false)).resolves.toBe(false);
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({
      findingsSave: false, plainAnswerNote: false, detailedLessonReports: true,
    });
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ findingsSave: false });
    await service.revoke(SUBJECT);
    await expect(service.setFindingsSave(SUBJECT, true)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REVOKED" });
    await service.acceptFreeContributor(SUBJECT, agreement());
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({ findingsSave: false });
    await expect(service.setFindingsSave(SUBJECT, true)).resolves.toBe(true);
    await expect(service.activeAccount(SUBJECT)).resolves.toMatchObject({
      findingsSave: true, plainAnswerNote: false, detailedLessonReports: true,
    });
    expect(Object.keys(store.allAccounts()[0]!).sort()).toEqual([
      "accountKey", "activatedAt", "agreement", "createdAt", "detailedLessonReports", "findingsSave", "mode",
      "noticeAcceptedBy", "noticeVersion", "plainAnswerNote", "revokedAt", "status", "updatedAt",
    ]);
  });

  it("rejects identity secrets that cannot protect a stable OAuth subject", () => {
    expect(() => new ResearchContributorAccessService({
      store: new InMemoryResearchContributorAccessStore(),
      identitySecret: new Uint8Array(31),
    })).toThrow("RESEARCH_IDENTITY_SECRET_TOO_SHORT");
  });
});

function partialFrontier(): ResearchFrontierContribution {
  const base = "synthetic:contributor-frontier";
  const query = "prolactinoma spontaneous remission formal evidence";
  const laneId = deterministicUuid(`${base}:lane`);
  const passId = deterministicUuid(`${base}:pass`);
  return {
    schemaVersion: 1,
    idempotencyKey: "synthetic:contributor-frontier:partial",
    contributionId: deterministicUuid(`${base}:contribution`),
    persistenceBoundary: {
      rawSourceContentPersisted: false,
      rawProviderResponsePersisted: false,
      personalDataPersisted: false,
      communityDataPersisted: false,
    },
    run: {
      runId: deterministicUuid(`${base}:run`),
      runKind: "live_research",
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:01:00.000Z",
      protocolManifests: [{
        name: "Synthetic protocol",
        version: "1",
        revisionDate: "2026-09-01",
        sha256: "1".repeat(64),
      }],
      provenanceNote: "Synthetic deidentified formal-source frontier.",
    },
    topic: {
      topicId: deterministicUuid(`${base}:topic`),
      canonicalKey: "prolactinoma.spontaneous-remission",
      label: "Prolactinoma spontaneous remission",
    },
    question: {
      questionId: deterministicUuid(`${base}:question`),
      normalizedQuestion: "What precedes spontaneous prolactinoma remission?",
      dimensions: {
        population: "People with documented prolactinoma",
        programOrExposure: "Biological or environmental transition",
        comparator: "Similar non-remission cases",
        outcome: "Treatment-free remission or regression",
        horizon: null,
        setting: null,
      },
    },
    frontier: {
      frontierId: deterministicUuid(`${base}:frontier`),
      lanes: [{
        laneId,
        canonicalKey: "pubmed.formal",
        sourceClass: "study",
        provider: "pubmed",
        label: "PubMed formal evidence",
      }],
      passes: [{
        passId,
        laneId,
        deidentifiedQuery: query,
        declaredQuerySha256: sha256(query),
        executedAt: "2026-09-01T00:00:30.000Z",
        coverageBasis: "provider_unspecified",
        requestedWindow: null,
        confirmedWindow: null,
        coverageRelation: "unscoped",
        deltaFromPassId: null,
        status: "partial",
        accessStatus: "partial",
        exhausted: false,
        retrievedCandidateCount: 0,
        screenedCandidateCount: 0,
        selectedCandidateCount: 0,
        nextCapability: "Continue the formal PubMed search.",
        blockedReasonCode: null,
        receiptSha256: sha256("synthetic partial receipt"),
        limitations: ["The corpus is partial and remains eligible for bounded review."],
      }],
      candidateVersions: [],
      trailVersions: [{
        trailId: deterministicUuid(`${base}:trail`),
        versionId: deterministicUuid(`${base}:trail-version`),
        trailKind: "unattempted_search",
        laneId,
        targetWindow: null,
        description: "Continue discovery for formal comparison cohorts.",
        rationale: "The initial pass stopped before exhaustion.",
        priority: "high",
        state: "ready",
        nextCapability: "Continue the PubMed search and screen new candidates.",
        blockedReasonCode: null,
        resolutionNote: null,
        previousVersionId: null,
      }],
    },
  };
}

function contributionWithIdentifier(
  kind: "RESEARCH_FRONTIER" | "SOURCE_ANALYSIS",
  scheme: "url" | "other",
  value: string,
): ResearchFrontierContribution | LivingEvidenceContribution {
  if (kind === "SOURCE_ANALYSIS") {
    const payload = completeSourceAnalysis();
    payload.source!.identifiers.push({ scheme, value });
    return payload;
  }
  const payload = partialFrontier();
  payload.frontier.candidateVersions.push({
    candidateId: deterministicUuid("synthetic:contributor-frontier:candidate"),
    versionId: deterministicUuid("synthetic:contributor-frontier:candidate-version"),
    observedInPassId: payload.frontier.passes[0]!.passId,
    candidateKind: "study",
    identifiers: [{ scheme: "doi", value: "10.0000/synthetic.1" }, { scheme, value }],
    displayTitle: "Synthetic formal study",
    publicationDate: null,
    decision: "deferred",
    decisionReason: "Full-text review remains open.",
    relevanceSummary: "Synthetic candidate for source-linked analysis.",
    sourceFamilyId: null,
    previousVersionId: null,
  });
  payload.frontier.passes[0]!.retrievedCandidateCount = 1;
  payload.frontier.passes[0]!.screenedCandidateCount = 1;
  return payload;
}

function completeSourceAnalysis(): LivingEvidenceContribution {
  const content = "# Synthetic source analysis\nThe report preserves a complete performed method analysis for a formal study fixture.\n";
  return {
    schemaVersion: 1,
    idempotencyKey: "synthetic:contributor-source-analysis:complete",
    run: {
      runId: "11111111-1111-4111-a111-111111111111",
      runKind: "live_research",
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:01:00.000Z",
      protocolManifests: [{
        name: "Synthetic protocol",
        version: "1",
        revisionDate: "2026-09-01",
        sha256: "2".repeat(64),
      }],
      provenanceNote: "Synthetic formal study analysis.",
    },
    topic: {
      topicId: "22222222-2222-4222-a222-222222222222",
      canonicalKey: "prolactinoma.synthetic-study",
      label: "Synthetic prolactinoma study",
    },
    source: {
      familyId: "33333333-3333-4333-a333-333333333333",
      versionId: "44444444-4444-4444-a444-444444444444",
      sourceKind: "study",
      identityHash: "3".repeat(64),
      displayTitle: "Synthetic formal prolactinoma study",
      identifiers: [{ scheme: "doi", value: "10.0000/synthetic.1" }],
      sourceContentSha256: "4".repeat(64),
      accessStatus: "complete",
      retrievedAt: "2026-09-01T00:00:10.000Z",
      sourceLocator: "Synthetic full-text fixture",
      rawContentPersisted: false,
    },
    analysis: {
      analysisId: "55555555-5555-4555-a555-555555555555",
      versionId: "66666666-6666-4666-a666-666666666666",
      analysisKind: "study_method_audit",
      relationship: "initial",
      previousVersionId: null,
      captureStatus: "complete_performed_analysis",
      authoredAt: "2026-09-01T00:01:00.000Z",
      coverageStatement: "Complete synthetic performed analysis.",
      declaredWholeTextSha256: sha256(content),
      sections: [{
        ordinal: 0,
        sectionKey: "000-synthetic-source-analysis",
        title: "Synthetic source analysis",
        content,
      }],
      domains: [],
      claimCapabilities: [],
      futureAnalysisItems: [],
    },
    receipts: [],
  };
}

// Part A: use the real runtime handler with local fakes; no provider or network calls.
describe("the first line and menu outline (22 Nov 2026)", () => {
  const plain = { researchTarget: "Whether the proposed method works", text: "It may work.", claims: ["It may work."] };
  async function accessTool(mode: "ordinary" | "planned" | "failed" | "paused" | "aside" = "ordinary", accepted = true) {
    const { service } = fixture();
    if (accepted) await service.acceptFreeContributor(SUBJECT, agreement());
    const task = { task: "Read the original study", kind: "full_text" as const, could_change: "conclusion" as const };
    const planner: ResearchPlanner = {
      enabled: true, dailyCapUsd: 1, accountDailyCalls: 10,
      ...(mode === "paused" ? { pausedUntil: () => Date.now() + 60_000 } : {}),
      plan: async () => ({ planning: mode === "failed" ? { status: "skipped", reason: "error" } :
        { status: "planned", plan: { about: "The method and its nearest alternative.", steering_choice: "none",
          tasks: [task], searches: 1, lane: mode === "aside" ? "aside" : "research", goOn: false } },
      cached: false, costUsd: 0, milliseconds: 1 }),
    };
    const handler = createManageResearchAccessHandler({ service,
      plainAnswer: { sign: () => "rr1~synthetic-plain-answer-receipt" },
      researchPlanner: () => mode === "ordinary" ? undefined : planner,
      devAccountKeys: () => new Set(mode === "ordinary" ? [] : [researchAccountReference(service.accountKeyForSubject(SUBJECT))]),
    });
    const { execute } = withLaterInputs("manage_research_access", manageResearchAccessInputSchema, handler);
    const call = (input: Record<string, unknown>, chatGpt = false) => execute(input, {
      ...(chatGpt ? { _meta: { "openai/test": true } } : {}),
      authInfo: { token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject: SUBJECT } },
    });
    return { call, service };
  }
  const words = (result: Awaited<ReturnType<Awaited<ReturnType<typeof accessTool>>["call"]>>) =>
    result.content.map(block => block.type === "text" ? block.text : "").join("\n");
  it("keeps both first-line instructions verbatim", () => {
    expect(planBuildingLine(true)).toBe("If this inspect starts research on a question of theirs, then before your next call, tell the person in one line, in their language: you are building the research plan, about a minute; then you will show it and say whether you are waiting for their choice or starting, and how they can change it.");
    expect(planBuildingLine(false)).toBe("If this inspect starts research on a question of theirs, then before your next call, tell the person in one line, in their language: you are taking a first look to build the research plan, a few minutes; then you will show it and say whether you are waiting for their choice or starting, and how they can change it.");
  });
  it.each(["ordinary", "planned", "paused"] as const)("appends the correct first line on %s", async mode => {
    const { call } = await accessTool(mode);
    const result = await call({ action: "inspect" });
    const line = planBuildingLine(mode === "planned");
    expect(words(result)).toContain(line);
    expect(result.structuredContent?.next_step).toContain(line);
    if (mode === "planned") expect(result.structuredContent?.next_step).toBe(`${ASKED_REQUEST} ${line}`);
  });
  it.each(["ordinary", "planned"] as const)("omits the first line for ChatGPT and before consent on %s", async mode => {
    const active = await accessTool(mode);
    const chat = await active.call({ action: "inspect" }, true);
    expect(words(chat)).not.toContain("If this inspect starts research on a question of theirs, then before your next call, tell the person in one line");
    expect(chat.structuredContent?.next_step ?? "").not.toContain(planBuildingLine(mode === "planned"));
    const inactive = await accessTool(mode, false);
    const held = await inactive.call({ action: "inspect" });
    expect(words(held)).not.toContain("If this inspect starts research on a question of theirs, then before your next call, tell the person in one line");
    expect(held.structuredContent?.next_step).toContain("notice");
  });
  it.each(["ordinary", "failed", "paused"] as const)("hands over an outline without a plan on %s", async mode => {
    const { call } = await accessTool(mode);
    const result = await call({ action: "register_plain_answer", plainAnswer: plain });
    expect(result.isError, words(result)).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ menu_outline: { researchMenu: {
      research_target: plain.researchTarget, plain_answer_receipt: "rr1~synthetic-plain-answer-receipt",
      tasks: [{ task: MENU_PLACEHOLDERS.task, kind: MENU_PLACEHOLDERS.kind, could_change: MENU_PLACEHOLDERS.could_change }],
    } } });
    const outline = result.structuredContent?.menu_outline as { researchMenu: Record<string, unknown> };
    if (mode === "ordinary") {
      expect(outline.researchMenu.steering_could_help).toBe("<true when a choice the person could make, or " +
        "something only they know, could materially change what the research checks (HRP " +
        "StructuredUserSteeringAndApproval): such as their own situation or what they have tried, the form, dose or route " +
        "they use, what to compare it with, which outcome matters most to them, people's reports or studies, or how deep; " +
        "as it usually can, even when the question is clearly worded; false only when the question already fixes all of " +
        "that, such as one result of one named study>");
      const wording = String(outline.researchMenu.steering_could_help).slice(1, -1);
      expect(RESEARCH_MENU_SHAPE).toContain(`steering_could_help, ${wording}; and tasks,`);
      expect(outline.researchMenu).not.toHaveProperty("steering_choice");
    } else expect(outline.researchMenu).not.toHaveProperty("steering_choice");
    expect(result.structuredContent?.next_step).toContain("Fill in menu_outline for your plan_research call.");
    expect(words(result)).toContain("Fill in menu_outline for your plan_research call.");
    expect(clientResultBytes(result)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
  });
  it.each(["planned", "aside"] as const)("has no outline when AskRigor hands over %s", async mode => {
    const { call } = await accessTool(mode);
    const result = await call({ action: "register_plain_answer", plainAnswer: plain,
      later_inputs: { asked: "Is this method useful?" } });
    expect(result.isError, words(result)).not.toBe(true);
    expect(result.structuredContent).toHaveProperty("research_plan");
    expect(result.structuredContent).not.toHaveProperty("menu_outline");
    expect(words(result)).not.toContain("Fill in menu_outline");
  });
  it("says when a failed plan needs more time, except on ChatGPT", async () => {
    const { call } = await accessTool("failed");
    const line = "Tell the person in one line that the plan will take a few minutes more: you are taking a first look yourself.";
    for (const chat of [false, true]) {
      const result = await call({ action: "register_plain_answer", plainAnswer: plain }, chat);
      expect(words(result).includes(line)).toBe(!chat);
      expect(String(result.structuredContent?.next_step).includes(line)).toBe(!chat);
    }
  });
  it("routes the plan text and structured instructions using this call's ChatGPT signal", async () => {
    const { call } = await accessTool();
    const menu = { research_target: plain.researchTarget, steering_choice: "none",
      tasks: [{ task: "Read the original study", kind: "full_text", could_change: "conclusion" }] };
    for (const chat of [false, true]) {
      const result = await call({ action: "plan_research", later_inputs: { researchMenu: menu } }, chat);
      expect(result.isError, words(result)).not.toBe(true);
      for (const text of [words(result), String(result.structuredContent?.next_step)]) {
        expect(text.includes(CHATGPT_PLAN_ENDING)).toBe(chat);
        expect(text.includes("Before your first research call, show the person")).toBe(!chat);
        expect(text).toContain(STEER_REPLAN);
        expect(text).toContain(STEER_REGISTER);
      }
      if (chat) expect(words(result)).not.toContain("show the menu as what you are doing");
    }
  });
  it.each(["balanced", "autonomous", "guided"] as const)("takes a steer through runtime parsing on %s without learning a menu choice", async style => {
    const { call, service } = await accessTool("planned");
    await service.setResearchSteering(SUBJECT, { style, learnMenuChoices: true });
    const result = await call({ action: "plan_research", later_inputs: { researchMenu: {
      research_target: plain.researchTarget, steering_choice: "none", done: [1],
      person_steered: true, person_reason: "Now read the original study only.",
      allocation: [{ task: 2, minutes: 3 }], person_answered: true,
      tasks: [{ task: "Find the study", kind: "study_search", could_change: "conclusion" },
        { task: "Read the original study", kind: "full_text", could_change: "detail", person_asked: true }],
    } } });
    expect(result.isError, words(result)).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ researchMenu: { person_steered: true,
      next: "go_on", tasks: [{}, { person_asked: true }] } });
    for (const text of [words(result), String(result.structuredContent?.next_step)]) {
      expect(text).toContain(STEER_PROGRESS);
      expect(text).toContain(STEER_REPLAN);
      expect(text).toContain(STEER_REGISTER);
    }
    await waitForPendingMenuChoices(service);
    expect(await service.menuChoices(service.accountKeyForSubject(SUBJECT))).toEqual([]);
  });
  it.each(["true", true, null])("explains unusable steer input %j through the runtime handler", async person_steered => {
    const { call } = await accessTool();
    const result = await call({ action: "plan_research", later_inputs: { researchMenu: {
      research_target: plain.researchTarget, steering_choice: "none", done: [1], person_steered,
      person_reason: person_steered === true ? " " : "Only the original study.",
      tasks: [{ task: "Find the study", kind: "study_search", could_change: "conclusion" },
        { task: "Read the original study", kind: "full_text", could_change: "conclusion" }],
    } } });
    expect(result.isError, words(result)).not.toBe(true);
    const reason = person_steered === true ? "it goes with the person's words, word for word, in person_reason." : "it must be boolean true.";
    expect(result.structuredContent).toMatchObject({ researchMenu: { next: "ask", person_steered_invalid: true },
      problems: [`later_inputs.researchMenu.person_steered: not used; ${reason}`] });
    for (const text of [words(result), String(result.structuredContent?.next_step)]) {
      expect(text).toContain(`later_inputs.researchMenu.person_steered: not used; ${reason}`);
      expect(text).toContain("Before I go on, I need your choice on the plan; your last message didn't reach me as a change.");
      expect(text).not.toContain("The plan changed with what I found");
    }
  });
  it("keeps an unusable-steer diagnostic when a dev menu needs its steering judgment corrected", async () => {
    const { call } = await accessTool("planned");
    for (const steering_choice of [undefined, "none_needed"]) {
      const result = await call({ action: "plan_research", later_inputs: { researchMenu: {
        research_target: plain.researchTarget, person_steered: "true", person_reason: "Only the original study.",
        ...(steering_choice === undefined ? {} : { steering_choice }),
        tasks: [{ task: "Read the original study", kind: "full_text", could_change: "conclusion" }],
      } } });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).not.toHaveProperty("researchMenu");
      expect(result.structuredContent).not.toHaveProperty("next_step");
      expect(result.structuredContent?.problems).toContain("later_inputs.researchMenu.person_steered: not used; it must be boolean true.");
      expect(words(result)).toContain("later_inputs.researchMenu.person_steered: not used; it must be boolean true.");
    }
  });
  it("keeps a ChatGPT steer display in the answer ending through the runtime handler", async () => {
    const { call } = await accessTool();
    const result = await call({ action: "plan_research", later_inputs: { researchMenu: {
      research_target: plain.researchTarget, steering_choice: "none", done: [1], person_steered: true,
      person_reason: "Read the original study only.",
      tasks: [{ task: "Find the study", kind: "study_search", could_change: "conclusion" },
        { task: "Read the original study", kind: "full_text", could_change: "conclusion", person_asked: true }],
    } } }, true);
    expect(result.isError, words(result)).not.toBe(true);
    for (const text of [words(result), String(result.structuredContent?.next_step)]) {
      expect(text).not.toContain("Show the person now");
      expect(text).toContain("What I did: [each task done, one line]. Not done: [the open tasks, numbered, with their minutes].");
      expect(text).toContain("In What I did, give what each finished task found; then say what changed because of their message;");
    }
  });
  it.each([300, 301, 5000])("bounds the outline target at %i characters and keeps the result within the client limit", async length => {
    const { call } = await accessTool();
    const target = "問".repeat(length);
    const result = await call({ action: "register_plain_answer", plainAnswer: { ...plain, researchTarget: target } });
    expect(result.isError, words(result)).not.toBe(true);
    const outline = result.structuredContent?.menu_outline as { researchMenu: { research_target: string } };
    expect(outline.researchMenu.research_target).toBe(length <= 300 ? target : MENU_PLACEHOLDERS.research_target);
    expect(clientResultBytes(result)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
  });
});
