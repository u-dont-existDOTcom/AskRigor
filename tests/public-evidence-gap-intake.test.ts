import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryPublicGapIntakeStore,
  PUBLIC_PROLACTINOMA_GAP_SLUG,
  PublicEvidenceGapIntakeService,
} from "../packages/evidence-repository/src/index.js";
import {
  createPublicEvidenceGapIntakeHandler,
  publicEvidenceGapIntakeConfigFromEnv,
} from "../apps/research-mcp/src/public-evidence-gap-http.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

const REVIEW_KEY = "review-key-for-private-gpt-analysis-0001";
const NARRATIVE =
  "During the comparison period I became pregnant, delivered, and weaned, but my prolactinoma did not remit.";
const COMPLETE_DETAILS = {
  outcome: "STABLE" as const,
  exposure: "PREGNANCY_POSTPARTUM" as const,
  treatmentContext: "NO_PRIOR_DOPAMINE_AGONIST" as const,
  transitionTiming: "Pregnancy in 2021; delivery in early 2022",
  baselineDocumented: true,
  followupDocumented: true,
};
const CONSENT = {
  privateGptAnalysis: true as const,
  deidentifiedAggregateUse: false,
  futureFollowup: true,
  noticeVersion: "public-gap-intake-v1" as const,
  observationalAcknowledgement: true as const,
};

function createFixture() {
  const store = new InMemoryPublicGapIntakeStore();
  const service = new PublicEvidenceGapIntakeService(store, {
    encryptionKey: new Uint8Array(32).fill(17),
    encryptionKeyId: "test-key-v1",
    now: () => "2026-08-31T17:00:00.000Z",
  });
  return { service, store };
}

describe("public evidence-gap intake service", () => {
  it("stores an encrypted unprompted account before accepting optional structured prompts", async () => {
    const { service, store } = createFixture();
    const started = await service.start({
      gapSlug: PUBLIC_PROLACTINOMA_GAP_SLUG,
      provenance: "SELF",
    });

    await expect(
      service.saveDetails(started.submissionId, started.recoveryKey, {}),
    ).rejects.toThrow("PUBLIC_GAP_UNPROMPTED_ACCOUNT_REQUIRED_FIRST");

    await service.saveNarrative(
      started.submissionId,
      started.recoveryKey,
      NARRATIVE,
    );
    const stored = await store.get(started.submissionId);
    expect(stored?.narrative?.ciphertext).not.toContain("pregnant");
    expect(stored?.narrativeSavedAt).not.toBeNull();
    expect(stored?.structuredSavedAt).toBeNull();

    const partial = await service.saveDetails(
      started.submissionId,
      started.recoveryKey,
      {},
    );
    expect(partial).toMatchObject({
      completenessLabel: "PARTIAL",
      partial: true,
    });
    expect(partial.missingFields).toContain("outcome classification");
  });

  it("keeps structural completeness separate from clinical verification", async () => {
    const { service } = createFixture();
    const started = await service.start({
      gapSlug: PUBLIC_PROLACTINOMA_GAP_SLUG,
      provenance: "SELF",
    });
    await service.saveNarrative(
      started.submissionId,
      started.recoveryKey,
      NARRATIVE,
    );

    const details = await service.saveDetails(
      started.submissionId,
      started.recoveryKey,
      COMPLETE_DETAILS,
    );
    expect(details).toMatchObject({
      completenessLabel: "SUBSTANTIAL",
      partial: false,
      missingFields: [],
    });

    await service.submit(started.submissionId, started.recoveryKey, CONSENT);
    const queue = await service.reviewQueue(PUBLIC_PROLACTINOMA_GAP_SLUG);
    expect(queue.items[0]).toMatchObject({
      completenessLabel: "SUBSTANTIAL",
      verificationStatus: "PARTICIPANT_REPORTED_UNVERIFIED",
      evidenceLevel: "L1_STRUCTURED_CASE",
    });
  });

  it("accepts partial and comparison cases, redacts basic contact patterns, and never infers causation", async () => {
    const { service } = createFixture();
    const remission = await service.start({
      gapSlug: PUBLIC_PROLACTINOMA_GAP_SLUG,
      provenance: "SELF",
    });
    await service.saveNarrative(
      remission.submissionId,
      remission.recoveryKey,
      "My prolactin fell after menopause. Reach me at person@example.com or https://example.com/case for details.",
    );
    await service.saveDetails(remission.submissionId, remission.recoveryKey, {
      outcome: "BIOCHEMICAL_REMISSION",
      exposure: "MENOPAUSE",
      otherChanges: "A note also listed +1 (505) 555-0112 for follow-up.",
    });
    await service.submit(remission.submissionId, remission.recoveryKey, CONSENT);

    const comparator = await service.start({
      gapSlug: PUBLIC_PROLACTINOMA_GAP_SLUG,
      provenance: "SELF",
    });
    await service.saveNarrative(
      comparator.submissionId,
      comparator.recoveryKey,
      NARRATIVE,
    );
    await service.saveDetails(
      comparator.submissionId,
      comparator.recoveryKey,
      COMPLETE_DETAILS,
    );
    await service.submit(comparator.submissionId, comparator.recoveryKey, CONSENT);

    const queue = await service.reviewQueue(PUBLIC_PROLACTINOMA_GAP_SLUG);
    expect(queue.counts).toEqual({
      total: 2,
      partial: 1,
      remissionOrRegression: 1,
      comparisonOrNonRemission: 1,
    });
    expect(queue.causalAnalysisPermitted).toBe(false);
    expect(JSON.stringify(queue)).not.toContain("person@example.com");
    expect(JSON.stringify(queue)).not.toContain("https://example.com/case");
    expect(JSON.stringify(queue)).not.toContain("505) 555-0112");
    expect(queue.items[0]?.narrativePrivacyTransform).toBe(
      "BASIC_CONTACT_REDACTION_APPLIED",
    );
    expect(queue.items[0]?.structuredContactPatternsRedacted).toBe(true);
  });

  it("rejects another recovery key and erases withdrawn content from participant and review views", async () => {
    const { service, store } = createFixture();
    const started = await service.start({
      gapSlug: PUBLIC_PROLACTINOMA_GAP_SLUG,
      provenance: "SELF",
    });
    await expect(
      service.inspect(started.submissionId, "A".repeat(43)),
    ).rejects.toThrow("PUBLIC_GAP_SUBMISSION_ACCESS_DENIED");
    await service.saveNarrative(
      started.submissionId,
      started.recoveryKey,
      NARRATIVE,
    );
    await service.saveDetails(started.submissionId, started.recoveryKey, {});
    await service.submit(started.submissionId, started.recoveryKey, CONSENT);

    const withdrawn = await service.withdraw(
      started.submissionId,
      started.recoveryKey,
    );
    expect(withdrawn).toMatchObject({
      status: "WITHDRAWN",
      narrative: null,
      details: {},
      consent: null,
    });
    expect((await service.reviewQueue(PUBLIC_PROLACTINOMA_GAP_SLUG)).items).toEqual(
      [],
    );
    expect(await store.get(started.submissionId)).toMatchObject({
      narrative: null,
      details: {},
      consent: null,
      status: "WITHDRAWN",
    });
  });
});

describe("public evidence-gap HTTP boundary", () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  async function startServer() {
    const { service } = createFixture();
    const handler = createPublicEvidenceGapIntakeHandler({
      service,
      reviewApiKey: REVIEW_KEY,
    });
    const server = createAskRigorHttpServer({
      publicServerEnabled: false,
      publicEvidenceGapIntakeHandler: handler,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closeCallbacks.push(
      () => new Promise<void>((resolve, reject) => server.close((error) =>
        error === undefined ? resolve() : reject(error))),
    );
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  }

  it("serves the partial-friendly public form without publishing participant data", async () => {
    const base = await startServer();
    const page = await fetch(
      `${base}/evidence-gaps/${PUBLIC_PROLACTINOMA_GAP_SLUG}`,
    );
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
    const html = await page.text();
    expect(html).toContain("A partial case is still useful");
    expect(html).toContain("did <strong>not</strong> remit");

    const metadata = await fetch(
      `${base}/api/evidence-gaps/${PUBLIC_PROLACTINOMA_GAP_SLUG}`,
    ).then((response) => response.json());
    expect(metadata).toMatchObject({
      rawSubmissionsPublic: false,
      partialSubmissionsAccepted: true,
      privateGptReviewAvailable: true,
    });
    expect(JSON.stringify(metadata)).not.toContain(NARRATIVE);
  });

  it("runs a partial comparison case from public form to private GPT review", async () => {
    const base = await startServer();
    const start = await fetch(
      `${base}/api/evidence-gaps/${PUBLIC_PROLACTINOMA_GAP_SLUG}/submissions/start`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provenance: "SELF", website: "" }),
      },
    );
    expect(start.status).toBe(201);
    const opened = await start.json() as {
      submissionId: string;
      recoveryKey: string;
      participantPseudonym: string;
    };
    const authorization = { authorization: `Bearer ${opened.recoveryKey}` };

    const narrative = await fetch(
      `${base}/api/evidence-gap-submissions/${opened.submissionId}/narrative`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authorization },
        body: JSON.stringify({ narrative: NARRATIVE }),
      },
    );
    expect(narrative.status).toBe(200);
    const details = await fetch(
      `${base}/api/evidence-gap-submissions/${opened.submissionId}/details`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authorization },
        body: "{}",
      },
    );
    expect(await details.json()).toMatchObject({ partial: true });
    const submitted = await fetch(
      `${base}/api/evidence-gap-submissions/${opened.submissionId}/submit`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authorization },
        body: JSON.stringify(CONSENT),
      },
    );
    expect(submitted.status).toBe(200);

    expect(
      (await fetch(`${base}/internal/evidence-gaps/${PUBLIC_PROLACTINOMA_GAP_SLUG}/review-queue`)).status,
    ).toBe(401);
    const queue = await fetch(
      `${base}/internal/evidence-gaps/${PUBLIC_PROLACTINOMA_GAP_SLUG}/review-queue`,
      { headers: { authorization: `Bearer ${REVIEW_KEY}` } },
    ).then((response) => response.json());
    expect(queue).toMatchObject({
      counts: { total: 1, partial: 1 },
      items: [
        {
          participantPseudonym: opened.participantPseudonym,
          partial: true,
          verificationStatus: "PARTICIPANT_REPORTED_UNVERIFIED",
        },
      ],
    });
  });

  it("enforces origin, recovery-key, content-type, and request-size boundaries", async () => {
    const base = await startServer();
    const path = `/api/evidence-gaps/${PUBLIC_PROLACTINOMA_GAP_SLUG}/submissions/start`;
    expect((await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://hostile.example" },
      body: JSON.stringify({ provenance: "SELF" }),
    })).status).toBe(403);
    expect((await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    })).status).toBe(415);
    expect((await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provenance: "SELF", padding: "x".repeat(17_000) }),
    })).status).toBe(413);
    expect((await fetch(
      `${base}/api/evidence-gap-submissions/00000000-0000-4000-8000-000000000000`,
    )).status).toBe(401);
  });

  it("fails closed when enabled runtime configuration is incomplete", () => {
    expect(publicEvidenceGapIntakeConfigFromEnv({})).toBeUndefined();
    expect(() => publicEvidenceGapIntakeConfigFromEnv({
      ASKRIGOR_EVIDENCE_GAP_INTAKE_ENABLED: "true",
    })).toThrow("Public evidence-gap intake configuration unavailable");
  });
});
