import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import {
  SyntheticProlactinomaGapLoop,
  type SyntheticGapDetailsInput,
} from "../packages/evidence-repository/src/index.js";
import { createSyntheticEvidenceGapLabServer } from "../scripts/run-synthetic-evidence-gap-lab.mjs";

const AT = "2026-08-31T15:00:00.000Z";
const NARRATIVE =
  "Synthetic private account SECRET-RAW-ACCOUNT: a postpartum transition occurred before the fictional laboratory trend changed.";

const remissionDetails: SyntheticGapDetailsInput = {
  outcome: "REPORTED_REMISSION",
  exposure: "PREGNANCY_POSTPARTUM",
  timingKnown: true,
  persistenceKnown: false,
  baselineDocumented: false,
  followupDocumented: false,
  treatmentContext: "NO_PRIOR_DOPAMINE_AGONIST",
};

function buildPublishedLoop(provenance: "SELF" | "HEARSAY" = "SELF") {
  const lab = new SyntheticProlactinomaGapLoop(() => AT);
  const started = lab.startContribution(provenance);
  lab.saveUnpromptedAccount(started.contributionId, NARRATIVE);
  lab.saveStructuredDetails(started.contributionId, remissionDetails);
  lab.consentAndPublish(started.contributionId, {
    publicLead: true,
    recontact: false,
    syntheticOnly: true,
  });
  return { lab, contributionId: started.contributionId };
}

describe("synthetic prolactinoma evidence-gap loop", () => {
  it("starts with an equal-weight non-remission comparator and no denominator", () => {
    const snapshot = new SyntheticProlactinomaGapLoop(() => AT).snapshot();

    expect(snapshot).toMatchObject({
      synthetic: true,
      labOnly: true,
      guardrails: {
        acceptsRealHealthData: false,
        recruitmentActive: false,
        efficacyPercentagePermitted: false,
        causalClaimPermitted: false,
      },
      comparatorCoverage: {
        remissionLeads: 0,
        nonRemissionComparators: 1,
        comparisonCasesValuable: true,
      },
      frontier: {
        denominatorAvailable: false,
        effectivenessPercentageDisplayPermitted: false,
        discussionActivityAffectsEvidenceState: false,
      },
    });
    expect(snapshot.frontier.cards).toHaveLength(1);
    expect(snapshot.frontier.cards[0]).toMatchObject({
      reportedDirection: "NO_CLEAR_CHANGE",
      verificationState: "UNVERIFIED",
      noEffectReported: true,
    });
    expect(snapshot.researchBoundary.proposal).toMatchObject({
      status: "DRAFT",
      recruitmentActive: false,
      ethicsState: "REVIEW_REQUIRED",
      privacyState: "REVIEW_REQUIRED",
      safetyState: "REVIEW_REQUIRED",
    });
  });

  it("saves the unprompted account before structured prompts without public leakage", () => {
    const lab = new SyntheticProlactinomaGapLoop(() => AT);
    const started = lab.startContribution("SELF");

    expect(() =>
      lab.saveStructuredDetails(started.contributionId, remissionDetails),
    ).toThrow("SYNTHETIC_GAP_UNPROMPTED_ACCOUNT_REQUIRED_FIRST");
    expect(() =>
      lab.saveUnpromptedAccount(
        started.contributionId,
        "A plausible real account without the required marker",
      ),
    ).toThrow("SYNTHETIC_GAP_NARRATIVE_MARKER_REQUIRED");

    lab.saveUnpromptedAccount(started.contributionId, NARRATIVE);
    lab.saveStructuredDetails(started.contributionId, remissionDetails);

    expect(lab.getContributionAudit(started.contributionId)).toMatchObject({
      narrativeSavedBeforeStructuredDetails: true,
      rawNarrativePubliclyExposed: false,
    });
    expect(JSON.stringify(lab.snapshot())).not.toContain("SECRET-RAW-ACCOUNT");
    expect(JSON.stringify(lab.snapshot())).not.toContain(
      "ARSYN-GAPREPORTER",
    );
  });

  it("publishes remission and non-remission cases at their actual evidence level", () => {
    const { lab } = buildPublishedLoop();
    const snapshot = lab.snapshot();

    expect(snapshot.comparatorCoverage).toMatchObject({
      remissionLeads: 1,
      nonRemissionComparators: 1,
    });
    expect(snapshot.frontier.cards.map((card) => card.reportedDirection)).toEqual([
      "NO_CLEAR_CHANGE",
      "IMPROVED",
    ]);
    const remission = snapshot.frontier.cards.find(
      (card) => card.reportedDirection === "IMPROVED",
    );
    expect(remission).toMatchObject({
      verificationState: "UNVERIFIED",
      completenessBand: "PARTIAL",
      evidenceCapability: "DESCRIPTIVE_REPORT_ONLY",
      researchStatus: "EVIDENCE_CHECK_PENDING",
      discussionActivityAffectsEvidenceState: false,
    });
    expect(snapshot.researchBoundary.cluster.directionCounts).toMatchObject({
      improved: 1,
      noClearChange: 1,
    });
  });

  it("keeps hearsay public visibility independent from weak evidence capability", () => {
    const { lab } = buildPublishedLoop("HEARSAY");
    const hearsay = lab
      .snapshot()
      .frontier.cards.find((card) => card.reportedDirection === "IMPROVED");

    expect(hearsay).toMatchObject({
      sourceDistance: "MULTI_HOP_HEARSAY",
      verificationState: "UNVERIFIED",
      evidenceCapability: "LEAD_ONLY",
      withdrawn: false,
    });
  });

  it("propagates challenge and correction without evidence inflation", () => {
    const { lab, contributionId } = buildPublishedLoop();
    expect(
      lab.challengeContribution(contributionId),
    ).toMatchObject({ challengeCount: 1, dependencyReviewRequired: true });
    const correction = lab.correctContribution(contributionId);

    expect(correction.leadVersion).toBe(2);
    expect(correction.missingMaterialFields).not.toContain(
      "baseline prolactin/MRI documentation",
    );
    const contribution = lab
      .snapshot()
      .contributions.find((item) => item.contributionId === contributionId);
    expect(contribution).toMatchObject({
      leadVersion: 2,
      verificationState: "UNVERIFIED",
      challengeCount: 1,
      publicProjectionVisible: true,
      correctionSummary:
        "Baseline documentation metadata added; no verification or causal upgrade.",
    });
    expect(lab.snapshot().researchBoundary).toMatchObject({
      dependencyReviewRequired: true,
      latestChangeReason: "SYNTHETIC_LEAD_CORRECTED",
      recruitmentActive: false,
      automaticResearchExecution: false,
    });
  });

  it("removes a withdrawn projection and retains only a no-content tombstone", () => {
    const { lab, contributionId } = buildPublishedLoop();
    lab.correctContribution(contributionId);
    const result = lab.withdrawContribution(contributionId);
    const snapshot = lab.snapshot();

    expect(result).toMatchObject({
      withdrawn: true,
      tombstone: { contentRetained: false },
      withdrawnPublicVersionCount: 2,
      dependencyReviewRequired: true,
    });
    expect(snapshot.frontier.cards).toHaveLength(1);
    expect(snapshot.frontier.cards[0]?.reportedDirection).toBe(
      "NO_CLEAR_CHANGE",
    );
    expect(snapshot.tombstones).toHaveLength(2);
    expect(snapshot.tombstones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          publicVersionId: expect.stringMatching(/V1$/u),
          contentRetained: false,
        }),
        expect.objectContaining({
          publicVersionId: expect.stringMatching(/V2$/u),
          contentRetained: false,
        }),
      ]),
    );
    expect(JSON.stringify(snapshot.tombstones)).not.toContain(NARRATIVE);
    expect(snapshot.researchBoundary).toMatchObject({
      latestChangeReason: "SYNTHETIC_LEAD_WITHDRAWN",
      dependencyReviewRequired: true,
    });
  });
});

describe("local synthetic evidence-gap HTTP boundary", () => {
  const servers: Array<ReturnType<typeof createSyntheticEvidenceGapLabServer>> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolveClose) => server.close(() => resolveClose())),
      ),
    );
  });

  it("serves the page locally and never exposes the private unprompted account", async () => {
    const server = createSyntheticEvidenceGapLabServer(
      new SyntheticProlactinomaGapLoop(() => AT),
    );
    servers.push(server);
    await new Promise<void>((resolveListen) =>
      server.listen(0, "127.0.0.1", resolveListen),
    );
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;

    const page = await fetch(
      `${base}/evidence-gaps/prolactinoma-spontaneous-remission`,
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Local synthetic laboratory");

    const start = await fetch(`${base}/api/contributions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provenance: "SELF" }),
    });
    const started = (await start.json()) as { contributionId: string };
    expect(start.status).toBe(201);

    const prematureDetails = await fetch(
      `${base}/api/contributions/${started.contributionId}/details`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remissionDetails),
      },
    );
    expect(prematureDetails.status).toBe(400);
    expect(await prematureDetails.json()).toEqual({
      error: "SYNTHETIC_GAP_UNPROMPTED_ACCOUNT_REQUIRED_FIRST",
    });

    for (const [action, body] of [
      ["narrative", { narrative: NARRATIVE }],
      ["details", remissionDetails],
      ["publish", { publicLead: true, recontact: false, syntheticOnly: true }],
    ] as const) {
      const response = await fetch(
        `${base}/api/contributions/${started.contributionId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      expect(response.status).toBe(200);
    }

    const stateResponse = await fetch(`${base}/api/state`);
    const rawState = await stateResponse.text();
    expect(stateResponse.status).toBe(200);
    expect(rawState).not.toContain("SECRET-RAW-ACCOUNT");
    expect(rawState).not.toContain("ARSYN-GAPREPORTER");
    expect(JSON.parse(rawState)).toMatchObject({
      guardrails: {
        acceptsRealHealthData: false,
        publicDeployment: false,
        recruitmentActive: false,
      },
      comparatorCoverage: {
        remissionLeads: 1,
        nonRemissionComparators: 1,
      },
    });

    const hostileHost = await fetch(`${base}/api/state`, {
      headers: { Origin: "https://example.test" },
    });
    expect(hostileHost.status).toBe(421);
    expect(hostileHost.headers.get("x-frame-options")).toBe("DENY");
  });
});
