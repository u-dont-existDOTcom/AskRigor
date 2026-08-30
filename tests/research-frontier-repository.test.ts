import { describe, expect, it } from "vitest";

import {
  assertNoProhibitedPersistentKeys,
  deterministicUuid,
  prepareFrontierContribution,
  renderResearchFrontierViews,
  researchFrontierContributionSchema,
  sha256,
  stableJson,
  type ResearchFrontierContribution,
} from "../packages/evidence-repository/src/index.js";
import { prepareResearchFrontierImport } from "../apps/research-mcp/src/living-evidence-admin.js";

const BASE = "unit:research-frontier";

function completeFrontier(): ResearchFrontierContribution {
  const query = "hip arthroplasty versus structured rehabilitation randomized trial";
  const runId = deterministicUuid(`${BASE}:run`);
  const topicId = deterministicUuid(`${BASE}:topic`);
  const questionId = deterministicUuid(`${BASE}:question`);
  const frontierId = deterministicUuid(`${BASE}:frontier`);
  const laneId = deterministicUuid(`${BASE}:lane:pubmed`);
  const passId = deterministicUuid(`${BASE}:pass:initial`);
  return {
    schemaVersion: 1,
    idempotencyKey: "unit:research-frontier:initial",
    contributionId: deterministicUuid(`${BASE}:contribution:initial`),
    persistenceBoundary: {
      rawSourceContentPersisted: false,
      rawProviderResponsePersisted: false,
      personalDataPersisted: false,
      communityDataPersisted: false,
    },
    run: {
      runId,
      runKind: "live_research",
      startedAt: "2026-08-30T10:00:00.000Z",
      completedAt: "2026-08-30T10:02:00.000Z",
      protocolManifests: [
        { name: "AskRigor Universal", version: "20.5.15", revisionDate: "2026-08-24", sha256: "1".repeat(64) },
        { name: "AskRigor HRP", version: "20.5.23", revisionDate: "2026-08-24", sha256: "2".repeat(64) },
      ],
      provenanceNote: "Synthetic formal-source frontier fixture with no raw source content.",
    },
    topic: {
      topicId,
      canonicalKey: "hip.arthroplasty.rehabilitation",
      label: "Hip arthroplasty and rehabilitation",
    },
    question: {
      questionId,
      normalizedQuestion: "How do hip arthroplasty and structured rehabilitation compare?",
      dimensions: {
        population: "Adults with chronic hip pain",
        programOrExposure: "Hip arthroplasty or structured rehabilitation",
        comparator: "Each other",
        outcome: "Function and harms",
        horizon: "At least one year",
        setting: null,
      },
    },
    frontier: {
      frontierId,
      lanes: [{
        laneId,
        canonicalKey: "pubmed.formal-primary",
        sourceClass: "study",
        provider: "pubmed",
        label: "PubMed primary studies",
      }],
      passes: [{
        passId,
        laneId,
        deidentifiedQuery: query,
        declaredQuerySha256: sha256(query),
        executedAt: "2026-08-30T10:01:00.000Z",
        coverageBasis: "publication_date",
        requestedWindow: { start: "2025-01-01", endExclusive: "2026-01-01" },
        confirmedWindow: { start: "2025-01-01", endExclusive: "2026-01-01" },
        coverageRelation: "initial",
        deltaFromPassId: null,
        status: "complete",
        accessStatus: "api_visible_complete",
        exhausted: true,
        retrievedCandidateCount: 1,
        screenedCandidateCount: 1,
        selectedCandidateCount: 1,
        nextCapability: null,
        blockedReasonCode: null,
        receiptSha256: sha256("synthetic complete PubMed pass receipt"),
        limitations: ["Synthetic fixture."],
      }],
      candidateVersions: [{
        candidateId: deterministicUuid(`${BASE}:candidate`),
        versionId: deterministicUuid(`${BASE}:candidate:version:initial`),
        observedInPassId: passId,
        candidateKind: "study",
        identifiers: [{ scheme: "pmid", value: "40223676" }],
        displayTitle: "Synthetic candidate study",
        publicationDate: "2025-04-17",
        decision: "selected",
        decisionReason: "Directly matches the structured question.",
        relevanceSummary: "Candidate for a source-linked method audit.",
        sourceFamilyId: null,
        previousVersionId: null,
      }],
      trailVersions: [{
        trailId: deterministicUuid(`${BASE}:trail:next-delta`),
        versionId: deterministicUuid(`${BASE}:trail:next-delta:version:initial`),
        trailKind: "delta_search",
        laneId,
        targetWindow: { start: "2026-01-01", endExclusive: "2026-09-01" },
        description: "Search the next publication-date interval.",
        rationale: "The prior pass ends before the current date.",
        priority: "high",
        state: "ready",
        nextCapability: "Run a PubMed delta search for the target window.",
        blockedReasonCode: null,
        resolutionNote: null,
        previousVersionId: null,
      }],
    },
  };
}

describe("research-frontier persistence contracts", () => {
  it("prepares one deterministic, source-free frontier contribution", () => {
    const contribution = completeFrontier();
    const prepared = prepareFrontierContribution(contribution);

    expect(prepared.contribution).toEqual(contribution);
    expect(prepared.payloadSha256).toBe(sha256(stableJson(contribution)));
    expect(prepared.queryDigests).toEqual([{
      passId: contribution.frontier.passes[0]!.passId,
      sha256: contribution.frontier.passes[0]!.declaredQuerySha256,
      bytes: Buffer.byteLength(contribution.frontier.passes[0]!.deidentifiedQuery, "utf8"),
    }]);
    expect(() => assertNoProhibitedPersistentKeys(contribution)).not.toThrow();
  });

  it("does not represent YouTube, comments, people, or community identities", () => {
    const communityCandidate = structuredClone(completeFrontier()) as unknown as Record<string, unknown>;
    const frontier = communityCandidate.frontier as { candidateVersions: Array<Record<string, unknown>> };
    frontier.candidateVersions[0]!.candidateKind = "youtube_video";
    expect(researchFrontierContributionSchema.safeParse(communityCandidate).success).toBe(false);

    const disguisedCommunity = completeFrontier();
    disguisedCommunity.frontier.candidateVersions[0]!.candidateKind = "other";
    disguisedCommunity.frontier.candidateVersions[0]!.identifiers = [{
      scheme: "url",
      value: "https://www.youtube.com/watch?v=not-durable",
    }];
    expect(researchFrontierContributionSchema.safeParse(disguisedCommunity).success).toBe(false);

    expect(() => assertNoProhibitedPersistentKeys({ frontier: { comments: [] } }))
      .toThrow("PROHIBITED_PERSISTENT_KEY");
    expect(() => assertNoProhibitedPersistentKeys({ frontier: { authorChannelIdentity: "no" } }))
      .toThrow("PROHIBITED_PERSISTENT_KEY");
  });

  it("rejects complete status when requested work exceeds confirmed coverage", () => {
    const contribution = completeFrontier();
    contribution.frontier.passes[0]!.confirmedWindow = {
      start: "2025-01-01",
      endExclusive: "2025-06-01",
    };
    const parsed = researchFrontierContributionSchema.safeParse(contribution);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ message }) => message))
        .toContain("a complete dated pass must confirm its exact requested window");
    }
  });

  it("requires an executable next capability for partial and retryable work", () => {
    for (const status of ["partial", "blocked_retryable"] as const) {
      const contribution = completeFrontier();
      const pass = contribution.frontier.passes[0]!;
      pass.status = status;
      pass.exhausted = false;
      pass.nextCapability = null;
      pass.blockedReasonCode = status === "blocked_retryable" ? "provider_rate_limited" : null;
      expect(researchFrontierContributionSchema.safeParse(contribution).success).toBe(false);
    }
  });

  it("prevents terminal blocks from claiming confirmed coverage", () => {
    const contribution = completeFrontier();
    const pass = contribution.frontier.passes[0]!;
    pass.status = "blocked_terminal";
    pass.exhausted = false;
    pass.blockedReasonCode = "provider_removed_access";
    expect(researchFrontierContributionSchema.safeParse(contribution).success).toBe(false);
  });

  it("reconciles screened and selected counts with submitted candidate decisions", () => {
    const contribution = completeFrontier();
    contribution.frontier.passes[0]!.screenedCandidateCount = 2;
    expect(researchFrontierContributionSchema.safeParse(contribution).success).toBe(false);
  });

  it("turns a skipped delta interval into an explicit coverage-gap trail", () => {
    const contribution = completeFrontier();
    const laneId = contribution.frontier.lanes[0]!.laneId;
    const firstPass = contribution.frontier.passes[0]!;
    const deltaPassId = deterministicUuid(`${BASE}:pass:gapped-delta`);
    contribution.frontier.passes.push({
      ...structuredClone(firstPass),
      passId: deltaPassId,
      executedAt: "2026-08-30T10:02:00.000Z",
      requestedWindow: { start: "2026-03-01", endExclusive: "2026-09-01" },
      confirmedWindow: { start: "2026-03-01", endExclusive: "2026-09-01" },
      coverageRelation: "gap_delta",
      deltaFromPassId: firstPass.passId,
      retrievedCandidateCount: 0,
      screenedCandidateCount: 0,
      selectedCandidateCount: 0,
    });
    expect(researchFrontierContributionSchema.safeParse(contribution).success).toBe(false);

    contribution.frontier.trailVersions.push({
      trailId: deterministicUuid(`${BASE}:trail:coverage-gap`),
      versionId: deterministicUuid(`${BASE}:trail:coverage-gap:version:initial`),
      trailKind: "coverage_gap",
      laneId,
      targetWindow: { start: "2026-01-01", endExclusive: "2026-03-01" },
      description: "Search the skipped publication-date interval.",
      rationale: "The later delta began after the preceding confirmed window ended.",
      priority: "decision_critical",
      state: "ready",
      nextCapability: "Run the missing PubMed date-window search.",
      blockedReasonCode: null,
      resolutionNote: null,
      previousVersionId: null,
    });
    expect(researchFrontierContributionSchema.safeParse(contribution).success).toBe(true);
  });

  it("keeps every lane on one comparable temporal coverage basis", () => {
    const contribution = completeFrontier();
    const firstPass = contribution.frontier.passes[0]!;
    contribution.frontier.passes.push({
      ...structuredClone(firstPass),
      passId: deterministicUuid(`${BASE}:pass:index-date-refresh`),
      executedAt: "2026-08-30T10:02:00.000Z",
      coverageBasis: "index_date",
      coverageRelation: "full_refresh",
      deltaFromPassId: null,
      retrievedCandidateCount: 0,
      screenedCandidateCount: 0,
      selectedCandidateCount: 0,
    });

    const parsed = researchFrontierContributionSchema.safeParse(contribution);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ message }) => message))
        .toContain("all passes in a frontier lane must use one temporal coverage basis");
    }
  });

  it("rejects a declared query hash that does not match the stored de-identified query", () => {
    const contribution = completeFrontier();
    contribution.frontier.passes[0]!.declaredQuerySha256 = "0".repeat(64);
    expect(() => prepareFrontierContribution(contribution))
      .toThrow("FRONTIER_QUERY_SHA256_MISMATCH");
  });

  it("renders deterministic Obsidian and Mermaid views as non-authoritative projections", () => {
    const contribution = completeFrontier();
    const pass = contribution.frontier.passes[0]!;
    const candidate = contribution.frontier.candidateVersions[0]!;
    const trail = contribution.frontier.trailVersions[0]!;
    const snapshot = {
      frontier_id: contribution.frontier.frontierId,
      topic: {
        topic_id: contribution.topic.topicId,
        canonical_key: contribution.topic.canonicalKey,
        label: contribution.topic.label,
      },
      question: {
        question_id: contribution.question.questionId,
        normalized_question: contribution.question.normalizedQuestion,
        dimensions: contribution.question.dimensions,
      },
      lanes: contribution.frontier.lanes.map((lane) => ({
        lane_id: lane.laneId,
        canonical_key: lane.canonicalKey,
        source_class: lane.sourceClass,
        provider: lane.provider,
        label: lane.label,
        latest_confirmed_end_exclusive: pass.confirmedWindow?.endExclusive ?? null,
        open_gap_count: 0,
        next_delta_start: pass.confirmedWindow?.endExclusive ?? null,
      })),
      passes: [{
        pass_id: pass.passId,
        lane_id: pass.laneId,
        executed_at: pass.executedAt,
        status: pass.status,
        coverage_relation: pass.coverageRelation,
        requested_start: pass.requestedWindow?.start ?? null,
        requested_end_exclusive: pass.requestedWindow?.endExclusive ?? null,
        confirmed_start: pass.confirmedWindow?.start ?? null,
        confirmed_end_exclusive: pass.confirmedWindow?.endExclusive ?? null,
      }],
      current_candidates: [{
        candidate_id: candidate.candidateId,
        version_id: candidate.versionId,
        observed_in_pass_id: candidate.observedInPassId,
        display_title: candidate.displayTitle,
        decision: candidate.decision,
        decision_reason: candidate.decisionReason,
      }],
      current_trails: [{
        trail_id: trail.trailId,
        version_id: trail.versionId,
        lane_id: trail.laneId,
        trail_kind: trail.trailKind,
        description: trail.description,
        priority: trail.priority,
        state: trail.state,
        next_capability: trail.nextCapability,
      }],
      contribution_receipts: [],
      frontier_state: "actionable",
      next_capabilities: [{ trail_id: trail.trailId, next_capability: trail.nextCapability }],
      terminal_boundaries: [],
    };
    const canonicalSnapshot = {
      ...snapshot,
      canonical_sha256: sha256(stableJson(snapshot)),
    };

    const first = renderResearchFrontierViews(canonicalSnapshot);
    const second = renderResearchFrontierViews(structuredClone(canonicalSnapshot));
    expect(first).toEqual(second);
    expect(first.obsidianMarkdown).toContain("derived_view: true");
    expect(first.obsidianMarkdown).toContain("not_evidence_authority: true");
    expect(first.obsidianMarkdown).toContain("2025-01-01 to 2026-01-01 (end exclusive)");
    expect(first.obsidianMarkdown).toContain(candidate.displayTitle);
    expect(first.mermaid).toContain("flowchart LR");
    expect(first.mermaid).toContain("PubMed primary studies");
    expect(first.sourceCanonicalSha256).toBe(canonicalSnapshot.canonical_sha256);
  });

  it("renders stored source text as inert Markdown rather than executable markup", () => {
    const contribution = completeFrontier();
    const pass = contribution.frontier.passes[0]!;
    const candidate = contribution.frontier.candidateVersions[0]!;
    const trail = contribution.frontier.trailVersions[0]!;
    const snapshot = {
      frontier_id: contribution.frontier.frontierId,
      topic: {
        topic_id: contribution.topic.topicId,
        canonical_key: contribution.topic.canonicalKey,
        label: "Topic\n# injected heading",
      },
      question: {
        question_id: contribution.question.questionId,
        normalized_question: "Question <script>alert(1)</script> \\\"] click escaped",
        dimensions: contribution.question.dimensions,
      },
      lanes: [{
        lane_id: pass.laneId,
        canonical_key: contribution.frontier.lanes[0]!.canonicalKey,
        source_class: "study",
        provider: "pubmed",
        label: contribution.frontier.lanes[0]!.label,
        latest_confirmed_end_exclusive: pass.confirmedWindow?.endExclusive ?? null,
        open_gap_count: 0,
        next_delta_start: pass.confirmedWindow?.endExclusive ?? null,
      }],
      passes: [{
        pass_id: pass.passId,
        lane_id: pass.laneId,
        executed_at: pass.executedAt,
        status: pass.status,
        coverage_relation: pass.coverageRelation,
        requested_start: pass.requestedWindow?.start ?? null,
        requested_end_exclusive: pass.requestedWindow?.endExclusive ?? null,
        confirmed_start: pass.confirmedWindow?.start ?? null,
        confirmed_end_exclusive: pass.confirmedWindow?.endExclusive ?? null,
      }],
      current_candidates: [{
        candidate_id: candidate.candidateId,
        version_id: candidate.versionId,
        observed_in_pass_id: candidate.observedInPassId,
        display_title: "[linked title](https://example.invalid)",
        decision: candidate.decision,
        decision_reason: "<img src=x onerror=alert(1)>",
      }],
      current_trails: [{
        trail_id: trail.trailId,
        version_id: trail.versionId,
        lane_id: trail.laneId,
        trail_kind: trail.trailKind,
        description: trail.description,
        priority: trail.priority,
        state: trail.state,
        next_capability: trail.nextCapability,
      }],
      contribution_receipts: [],
      frontier_state: "actionable",
      next_capabilities: [],
      terminal_boundaries: [],
    };
    const rendered = renderResearchFrontierViews({
      ...snapshot,
      canonical_sha256: sha256(stableJson(snapshot)),
    });

    expect(rendered.obsidianMarkdown).not.toContain("<script>");
    expect(rendered.obsidianMarkdown).not.toContain("<img");
    expect(rendered.obsidianMarkdown).not.toContain("[linked title](https://example.invalid)");
    expect(rendered.obsidianMarkdown).not.toContain("\n# injected heading");
    expect(rendered.obsidianMarkdown).toContain("&lt;script&gt;");
    expect(rendered.obsidianMarkdown).toContain("\\[linked title\\](https://example.invalid)");
    expect(rendered.mermaid).not.toContain("\\");
    expect(rendered.mermaid).toContain("&#92;");
  });

  it("prepares a writer-only frontier import against the exact current protocols", async () => {
    const contribution = completeFrontier();
    contribution.run.protocolManifests = [
      {
        name: "AskRigor.com universal saved instructions",
        version: "20.5.15",
        revisionDate: "2026-08-24",
        sha256: "69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172",
      },
      {
        name: "HRP",
        version: "20.5.23",
        revisionDate: "2026-08-24",
        sha256: "bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299",
      },
    ];
    const prepared = await prepareResearchFrontierImport(contribution);
    expect(prepared).toEqual(contribution);
    expect(() => assertNoProhibitedPersistentKeys(prepared)).not.toThrow();

    contribution.run.protocolManifests[0]!.sha256 = "0".repeat(64);
    await expect(prepareResearchFrontierImport(contribution))
      .rejects.toThrow("FRONTIER_PROTOCOL_MANIFEST_MISMATCH");
  });
});
