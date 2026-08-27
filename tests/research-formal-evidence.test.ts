import { createHash } from "node:crypto";

import {
  externalStudyRelationshipSchema,
  errorEnvelope,
  okEnvelope,
  publicationIntegrityEventSchema,
  type ExternalStudyRelationship,
  type ProvenanceEnvelope,
  type PublicationIntegrityEvent
} from "@askrigor/contracts";
import type {
  AuditableDocumentIndex,
  CrossrefPublicationIntegrityData,
  EpistemonikosReviewAncestryLookupData,
  ForrtReplicationLookupData,
  OpenFullTextAcquisitionData,
  PubpeerPostPublicationLookupData,
  PubmedRecord
} from "@askrigor/sources";
import {
  adaptEpistemonikosAuthorizedRecord,
  adaptPubpeerAuthorizedRecord
} from "@askrigor/sources";
import { describe, expect, it, vi } from "vitest";

import {
  FORMAL_SOURCE_SCREENING_BATCH_MAXIMUM,
  FORMAL_SOURCE_MAXIMUM,
  STUDY_METHOD_AUDIT_DOMAINS,
  StudyExternalEvidenceIdentityError,
  assertResearchSessionTransition,
  createFormalEvidenceScreeningWorkPackage,
  createFormalClaimRecalculationWorkPackages,
  createFormalExternalEvidenceWorkPackages,
  createInMemoryEvidenceArtifactStore,
  createOpenFullTextExecutor,
  createOpenFullTextHandleStore,
  createInitialResearchSessionState,
  createStudyExternalEvidenceCoordinator,
  deriveProgramSignature,
  deriveFormalEvidenceDiagnostics,
  deriveFormalEvidenceOperationStatus,
  deriveRequiredNextCapabilities,
  executeResearchFormalSearch,
  executeResearchSourceExternalEvidence,
  executeResearchSourceFullTextChain,
  executeResearchSessionFormalSearch,
  executeResearchSessionMethodAudit,
  executeResearchSessionSourceExternalEvidence,
  executeResearchSessionSourceFullTextChain,
  formalEvidenceScreeningComplete,
  formalEvidenceScreeningSubmissionSchema,
  ingestCandidateScreeningSubmission,
  ingestFormalEvidenceScreeningSubmission,
  ingestNativeYoutubeSurvey,
  ingestResearchSourceExternalEvidence,
  ingestValidatedGeminiFrontier,
  initialResearchCandidateDiscoveryState,
  initializeResearchFormalEvidence,
  protocolBindingsFromManifests,
  PROGRAM_NOT_DESCRIBED,
  recalculateResearchSourceClaimCapability,
  reconcileFormalEvidenceAfterEphemeralLoss,
  reconcileFormalEvidenceLinkedWork,
  recordFormalMethodAudit,
  recordAutomatedScoutCompletion,
  recordCandidateScreeningCompletion,
  recordNativeYoutubeDiscovery,
  recordResearchSessionFormalScreening,
  researchFormalEvidenceStateSchema,
  restartResearchSourceFullTextChain,
  type FormalSearchExecutors,
  type ResearchFormalEvidenceState,
  type ResearchSessionState,
  type StudyExternalEvidenceAuditOutput,
  type StudyMethodAuditExternalSubmission,
  type StudyMethodAuditSubmission
} from "../apps/research-mcp/src/index.js";
import { PRIVATE_ORCHESTRATION_REQUEST_MAX_BYTES } from
  "../apps/research-mcp/src/config.js";
import {
  nativeSurvey,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";
import { screeningSubmissionFor } from "./helpers/research-video-depth-fixtures.js";

const SESSION_ID = `ars1_${"A".repeat(32)}`;
const SECRET = "external-evidence-receipt-secret-32-bytes";
const PROTOCOLS = {
  universal: {
    name: "Universal Instructions",
    version: "20.5.14",
    revisionDate: "2026-08-18",
    sha256: "a".repeat(64)
  },
  hrp: {
    name: "Health Research Protocol",
    version: "20.5.22",
    revisionDate: "2026-08-23",
    sha256: "b".repeat(64)
  }
};

describe("controller-owned formal evidence frontier", () => {
  it("allows initial semantic screening to activate study integrity work", async () => {
    let before = formalSession();
    const executors = formalExecutors();
    for (const hypothesis of before.formal_evidence.hypotheses) {
      before = await executeResearchSessionFormalSearch(
        before,
        hypothesis.hypothesis_id,
        executors
      );
    }
    const screening = createFormalEvidenceScreeningWorkPackage(
      before.formal_evidence
    );
    const after = recordResearchSessionFormalScreening(before, {
      package_version: screening.package_version,
      formal_frontier_digest: screening.formal_frontier_digest,
      decisions: screening.sources.map(({ source_id }) => ({
        source_id,
        source_kind: "SCIENTIFIC_STUDY",
        decision_importance: "DECISION_IMPORTANT",
        possible_decision_impact: "confidence_changing",
        rationale: "Fixture study selected for full-text, methods, and integrity review."
      }))
    });

    expect(after.formal_evidence.sources.every(({ external_evidence }) =>
      external_evidence.status === "NOT_STARTED"
    )).toBe(true);
    expect(() => assertResearchSessionTransition(before, after)).not.toThrow();

    const screenedTerminal = structuredClone(after);
    screenedTerminal.formal_evidence.sources[0]!.external_evidence.status =
      "NOT_APPLICABLE";
    const illegallyReopened = structuredClone(screenedTerminal);
    illegallyReopened.formal_evidence.sources[0]!.external_evidence.status =
      "NOT_STARTED";
    expect(() => assertResearchSessionTransition(
      screenedTerminal,
      illegallyReopened
    )).toThrow();
  });

  it("rejects a changed hypothesis core or frontier digest", () => {
    const formal = initializeResearchFormalEvidence(
      screenedCandidates(),
      "de-identified treatment comparison"
    );
    const changedCore = structuredClone(formal);
    changedCore.hypotheses[0]!.claim_summary = "Caller-authored replacement claim.";
    expect(() => researchFormalEvidenceStateSchema.parse(changedCore))
      .toThrow(/hypothesis identity|frontier digest/u);

    expect(() => researchFormalEvidenceStateSchema.parse({
      ...formal,
      hypothesis_frontier_digest: "f".repeat(64)
    })).toThrow(/frontier digest/u);
  });

  it("builds bounded program-specific formal queries from a broad comparison target", () => {
    const researchTarget = [
      "Adults with advanced joint disease comparing surgery with materially distinct nonoperative programs.",
      "The comparison includes resistance, aquatic, mobility, gait, cycling, rehabilitation, injections, nutrition, supplements, and waiting.",
      "Distinguish components, dose, disease stage, benefit, no effect, harm, progression, eventual surgery, durability, and study methods."
    ].join(" ").repeat(4);
    const formal = initializeResearchFormalEvidence(
      screenedCandidates(),
      researchTarget
    );
    const queries = formal.hypotheses.map(({ formal_query }) => formal_query);

    expect(new Set(queries).size).toBe(formal.hypotheses.length);
    for (const hypothesis of formal.hypotheses) {
      expect(hypothesis.formal_query.length).toBeLessThanOrEqual(600);
      expect(hypothesis.formal_query).not.toContain(researchTarget);
      expect(hypothesis.formal_query).toContain(hypothesis.treatment_class);
      expect(hypothesis.formal_query).toContain(hypothesis.program.components);
      expect(hypothesis.formal_query).toContain(hypothesis.claim_summary);
    }
  });

  it("uses source titles to distinguish material hypotheses whose programs are undescribed", () => {
    const candidateState = screenedUndescribedCandidates();

    const formal = initializeResearchFormalEvidence(
      candidateState,
      "Adults with advanced joint disease comparing surgery with nonoperative care."
    );
    const materialTitles = candidateState.candidates
      .filter(({ materiality }) => materiality === "MATERIAL")
      .map(({ title }) => title);

    expect(formal.hypotheses).toHaveLength(materialTitles.length);
    expect(new Set(formal.hypotheses.map(({ formal_query }) => formal_query)).size)
      .toBe(formal.hypotheses.length);
    for (const hypothesis of formal.hypotheses) {
      const title = materialTitles.find((candidateTitle) =>
        hypothesis.formal_query.includes(candidateTitle)
      );
      expect(title).toBeDefined();
      expect(hypothesis.formal_query.length).toBeLessThanOrEqual(600);
    }
  });

  it("reuses exact terminal provider receipts without collapsing indistinguishable hypotheses", async () => {
    const candidateState = screenedUndescribedCandidates(true);
    let formal = initializeResearchFormalEvidence(
      candidateState,
      "Adults with advanced joint disease comparing surgery with nonoperative care."
    );
    const hypotheses = formal.hypotheses;
    expect(hypotheses).toHaveLength(3);
    expect(new Set(hypotheses.map(({ formal_query }) => formal_query)).size).toBe(1);
    const executors = formalExecutors();

    for (const hypothesis of hypotheses) {
      formal = await executeResearchFormalSearch(
        formal,
        hypothesis.hypothesis_id,
        executors
      );
    }

    expect(executors.searchPubmed).toHaveBeenCalledTimes(1);
    expect(executors.searchEuropePmc).toHaveBeenCalledTimes(1);
    expect(executors.fetchPubmedRecord).toHaveBeenCalledTimes(1);
    for (const hypothesis of formal.hypotheses.slice(1)) {
      expect(hypothesis.provider_searches.every(({ reused_from_hypothesis_id }) =>
        reused_from_hypothesis_id === hypotheses[0]!.hypothesis_id
      )).toBe(true);
    }
    expect(formal.sources.every(({ hypothesis_ids, origins }) =>
      hypothesis_ids.length === hypotheses.length &&
      origins.every(({ hypothesis_ids: originHypothesisIds }) =>
        originHypothesisIds.length === hypotheses.length
      )
    )).toBe(true);

    const forged = structuredClone(formal);
    forged.hypotheses[1]!.provider_searches[0]!.reused_from_hypothesis_id =
      "f".repeat(64);
    expect(() => researchFormalEvidenceStateSchema.parse(forged))
      .toThrow(/exact terminal query receipt chain/u);
  });

  it("does not replace an in-progress chain with a later duplicate terminal receipt", async () => {
    let formal = initializeResearchFormalEvidence(
      screenedUndescribedCandidates(true),
      "Adults with advanced joint disease comparing surgery with nonoperative care."
    );
    const [donor, target] = formal.hypotheses;
    const executors = formalExecutors();
    let pubmedCalls = 0;
    executors.searchPubmed = vi.fn(async (input: { query: string; cursor?: string }) => {
      pubmedCalls += 1;
      return okEnvelope({
        provider: "pubmed",
        recordType: "pubmed_search_result",
        query: { query: input.query },
        accessStatus: "complete",
        pagination: pubmedCalls === 1
          ? {
            page_size: 100,
            returned: 0,
            exhausted: false,
            next_cursor: "target-partial-page"
          }
          : { page_size: 100, returned: 0, exhausted: true },
        data: []
      });
    }) as never;
    executors.searchEuropePmc = vi.fn(async (input: { query: string }) => okEnvelope({
      provider: "europe_pmc",
      recordType: "europe_pmc_search_result",
      query: { query: input.query },
      accessStatus: "complete",
      pagination: { page_size: 100, returned: 0, exhausted: true },
      data: []
    })) as never;

    formal = await executeResearchFormalSearch(formal, target!.hypothesis_id, executors);
    expect(providerState(formal, target!.hypothesis_id, "pubmed")).toMatchObject({
      status: "IN_PROGRESS",
      pages_retrieved: 1,
      next_cursor: "target-partial-page"
    });
    formal = await executeResearchFormalSearch(formal, donor!.hypothesis_id, executors);
    formal = await executeResearchFormalSearch(formal, target!.hypothesis_id, executors);

    expect(executors.searchPubmed).toHaveBeenCalledTimes(3);
    expect(executors.searchEuropePmc).toHaveBeenCalledTimes(1);
    const completedTarget = providerState(formal, target!.hypothesis_id, "pubmed");
    expect(completedTarget).toMatchObject({
      status: "COMPLETE",
      pages_retrieved: 2
    });
    expect(completedTarget.page_receipt_hashes).toHaveLength(2);
    expect(completedTarget.reused_from_hypothesis_id).toBeUndefined();
  });

  it("closes the formal frontier truthfully when a provider page crosses source capacity", async () => {
    let formal = await formalWithSourceCount(FORMAL_SOURCE_MAXIMUM - 1);
    const hypothesis = formal.hypotheses[0]!;
    const executors = sourceCapacityExecutors();

    formal = await executeResearchFormalSearch(
      formal,
      hypothesis.hypothesis_id,
      executors
    );

    expect(formal.sources).toHaveLength(FORMAL_SOURCE_MAXIMUM);
    expect(formal.sources.some(({ identity }) => identity.pmid === "9000001"))
      .toBe(true);
    expect(formal.sources.some(({ identity }) => identity.pmid === "9000002"))
      .toBe(false);
    expect(executors.fetchPubmedRecord).toHaveBeenCalledTimes(2);
    expect(executors.searchEuropePmc).not.toHaveBeenCalled();
    for (const provider of formal.hypotheses.flatMap(({ provider_searches }) =>
      provider_searches
    )) {
      expect(provider).toMatchObject({
        status: "BLOCKED_TERMINAL",
        boundary: {
          classification: "TERMINAL_NONRETRYABLE",
          code: "FORMAL_SOURCE_CAPACITY_REACHED"
        }
      });
      expect(provider.next_cursor).toBeUndefined();
      expect(provider.limitations).toContain(
        "The bounded formal-source frontier reached its 2,000-identity capacity; additional unseen provider records were not stored or treated as evidence."
      );
    }
    const current = providerState(formal, hypothesis.hypothesis_id, "pubmed");
    expect(current).toMatchObject({
      pages_retrieved: 1,
      records_returned_cumulative: 2
    });
    expect(current.page_receipt_hashes).toHaveLength(1);
    const work = createFormalEvidenceScreeningWorkPackage(formal);
    expect(work).toMatchObject({
      sources_total: FORMAL_SOURCE_MAXIMUM,
      sources_pending_before: FORMAL_SOURCE_MAXIMUM
    });
    expect(work.sources).toHaveLength(FORMAL_SOURCE_SCREENING_BATCH_MAXIMUM);
  });

  it("closes open provider searches without another request when source capacity is already full", async () => {
    const formal = await formalWithSourceCount(FORMAL_SOURCE_MAXIMUM);
    const hypothesis = formal.hypotheses[0]!;
    const executors = sourceCapacityExecutors();

    const bounded = await executeResearchFormalSearch(
      formal,
      hypothesis.hypothesis_id,
      executors
    );

    expect(executors.searchPubmed).not.toHaveBeenCalled();
    expect(executors.fetchPubmedRecord).not.toHaveBeenCalled();
    expect(executors.searchEuropePmc).not.toHaveBeenCalled();
    expect(bounded.sources).toEqual(formal.sources);
    expect(bounded.hypotheses.flatMap(({ provider_searches }) =>
      provider_searches
    ).every(({ status, boundary }) =>
      status === "BLOCKED_TERMINAL" &&
      boundary?.code === "FORMAL_SOURCE_CAPACITY_REACHED"
    )).toBe(true);
  });

  it("screens a full formal frontier in exact signed batches without dropping pending sources", async () => {
    let formal = await formalWithSourceCount(205);
    formal = researchFormalEvidenceStateSchema.parse({
      ...formal,
      hypotheses: formal.hypotheses.map((hypothesis) => ({
        ...hypothesis,
        provider_searches: hypothesis.provider_searches.map((search) => ({
          provider: search.provider,
          query: search.query,
          status: "COMPLETE" as const,
          pages_retrieved: 0,
          records_returned_cumulative: 0,
          page_receipt_hashes: [],
          access_statuses: [],
          limitations: []
        })) as typeof hypothesis.provider_searches
      }))
    });

    const seen = new Set<string>();
    for (const expectedSize of [100, 100, 5]) {
      const work = createFormalEvidenceScreeningWorkPackage(formal);
      expect(work.sources_total).toBe(205);
      expect(work.sources_pending_before).toBe(205 - seen.size);
      expect(work.sources).toHaveLength(expectedSize);
      expect(work.sources.every(({ source_id }) => !seen.has(source_id))).toBe(true);
      for (const { source_id } of work.sources) seen.add(source_id);

      formal = ingestFormalEvidenceScreeningSubmission(formal, {
        package_version: work.package_version,
        formal_frontier_digest: work.formal_frontier_digest,
        decisions: work.sources.map(({ source_id }) => ({
          source_id,
          source_kind: "SCIENTIFIC_STUDY",
          decision_importance: "NOT_DECISION_IMPORTANT",
          possible_decision_impact: "unknown",
          rationale: "Fixture source is not decision-important for this bounded target."
        }))
      });
    }

    expect(seen.size).toBe(205);
    expect(formalEvidenceScreeningComplete(formal)).toBe(true);
    expect(formal.sources.every(({ screening_status }) =>
      screening_status === "SCREENED"
    )).toBe(true);
  });

  it("keeps the maximum formal screening submission below the private Action request limit", () => {
    const digest = "a".repeat(64);
    const sessionId = `ars1_${"B".repeat(32)}`;
    const submission = formalEvidenceScreeningSubmissionSchema.parse({
      package_version: "askrigor_formal_source_screening_v1",
      formal_frontier_digest: digest,
      decisions: Array.from(
        { length: FORMAL_SOURCE_SCREENING_BATCH_MAXIMUM },
        (_, index) => ({
          source_id: hash(`request-bound-source:${index}`),
          source_kind: "SCIENTIFIC_STUDY",
          decision_importance: "DECISION_IMPORTANT",
          possible_decision_impact: "potentially_conclusion_changing",
          rationale: "\u0001".repeat(350)
        })
      )
    });
    const request = {
      session_id: sessionId,
      state_digest: digest,
      worker_payload_receipt: {
        receipt_version: "askrigor_controlled_worker_payload_receipt_v1",
        session_id: sessionId,
        state_digest: digest,
        work_digest: digest,
        payload_digest: digest,
        chunk_count: 999,
        expires_at_ms: Number.MAX_SAFE_INTEGER,
        signature: "s".repeat(512)
      },
      semantic_result: {
        contract_version: "askrigor_hermes_semantic_result_v1",
        session_id: sessionId,
        state_digest: digest,
        work_type: "formal_source_screening",
        submission
      }
    };

    expect(Buffer.byteLength(JSON.stringify(request), "utf8"))
      .toBeLessThan(PRIVATE_ORCHESTRATION_REQUEST_MAX_BYTES);
  });

  it("derives every material program/outcome hypothesis and calls both formal providers itself", async () => {
    const candidateState = screenedCandidates();
    let formal = initializeResearchFormalEvidence(
      candidateState,
      "de-identified treatment comparison"
    );
    expect(formal.hypotheses).toHaveLength(3);
    expect(new Set(formal.hypotheses.map(({ program_signature }) => program_signature)).size)
      .toBe(3);

    const executors = formalExecutors();
    for (const hypothesis of formal.hypotheses) {
      formal = await executeResearchFormalSearch(
        formal,
        hypothesis.hypothesis_id,
        executors
      );
    }

    expect(executors.searchPubmed).toHaveBeenCalledTimes(3);
    expect(executors.searchEuropePmc).toHaveBeenCalledTimes(3);
    expect(executors.fetchPubmedRecord).toHaveBeenCalledTimes(3);
    expect(formal.sources).toHaveLength(3);
    expect(formal.sources.every(({ origins }) => origins.length === 2)).toBe(true);
    expect(deriveFormalEvidenceOperationStatus(formal, "formal_evidence_search"))
      .toBe("IN_PROGRESS");

    const work = createFormalEvidenceScreeningWorkPackage(formal);
    const omitted = {
      package_version: work.package_version,
      formal_frontier_digest: work.formal_frontier_digest,
      decisions: work.sources.slice(1).map(({ source_id }) => ({
        source_id,
        source_kind: "SCIENTIFIC_STUDY" as const,
        decision_importance: "DECISION_IMPORTANT" as const,
        possible_decision_impact: "confidence_changing" as const,
        rationale: "Fixture source selected for exact full-text and method audit."
      }))
    };
    expect(() => ingestFormalEvidenceScreeningSubmission(formal, omitted))
      .toThrow(/every packaged provider identity exactly once/u);

    formal = selectAllStudies(formal);
    expect(deriveFormalEvidenceOperationStatus(formal, "formal_evidence_search"))
      .toBe("COMPLETE");
    expect(deriveFormalEvidenceDiagnostics(formal)).toMatchObject({
      hypotheses: 3,
      hypotheses_search_complete: 3,
      decision_important_sources: 3
    });
  });

  it("discards stale provider cursors and retry boundaries when a later page completes", async () => {
    let formal = initializeResearchFormalEvidence(
      screenedCandidates(),
      "de-identified treatment comparison"
    );
    const hypothesis = formal.hypotheses[0]!;
    let pubmedCalls = 0;
    let europeCalls = 0;
    const executors: FormalSearchExecutors = {
      searchPubmed: vi.fn(async (input: { query: string; cursor?: string }) => {
        pubmedCalls += 1;
        const identifier = String(2_000 + pubmedCalls);
        return okEnvelope({
          provider: "pubmed",
          recordType: "pubmed_search_result",
          query: { query: input.query },
          accessStatus: "complete",
          pagination: pubmedCalls === 1
            ? {
                page_size: 100,
                returned: 1,
                next_cursor: "pubmed-next-page",
                exhausted: false
              }
            : { page_size: 100, returned: 1, exhausted: true },
          data: [{ pmid: identifier }]
        });
      }) as never,
      fetchPubmedRecord: vi.fn(async (identifier: string) => okEnvelope({
        provider: "pubmed",
        recordType: "pubmed_record",
        primaryIdentifier: identifier,
        sourceIdentity: {
          canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${identifier}/`
        },
        accessStatus: "api_visible_complete",
        pagination: { returned: 1, exhausted: true },
        data: {
          pmid: identifier,
          doi: `10.5555/paginated.${identifier}`,
          title: `Paginated study ${identifier}`,
          abstract: "Abstract only.",
          authors: ["Researcher"],
          dates: [{ type: "pub", value: "2025" }]
        } satisfies PubmedRecord
      })) as never,
      searchEuropePmc: vi.fn(async (input: { query: string }) => {
        europeCalls += 1;
        if (europeCalls === 1) {
          return errorEnvelope({
            provider: "europe_pmc",
            recordType: "europe_pmc_search_result",
            query: { query: input.query },
            accessStatus: "rate_limited",
            pagination: {
              page_size: 100,
              next_cursor: "europe-retry-page",
              exhausted: false
            },
            returned: 0,
            limitations: ["Retryable fixture boundary."],
            code: "europe_pmc_rate_limited",
            message: "Europe PMC rate limit reached",
            retryable: true,
            data: []
          });
        }
        return okEnvelope({
          provider: "europe_pmc",
          recordType: "europe_pmc_search_result",
          query: { query: input.query },
          accessStatus: "complete",
          pagination: { page_size: 100, returned: 1, exhausted: true },
          data: [{
            source: "MED",
            id: "3001",
            pmid: "3001",
            doi: "10.5555/paginated.3001",
            title: "Recovered provider study",
            authors: ["Researcher"],
            year: "2025"
          }]
        });
      }) as never,
      pubmedConfig: { tool: "askrigor-test", email: "research@example.test" }
    };

    formal = await executeResearchFormalSearch(
      formal,
      hypothesis.hypothesis_id,
      executors
    );
    const interrupted = formal.hypotheses[0]!.provider_searches;
    expect(interrupted[0]).toMatchObject({
      status: "IN_PROGRESS",
      next_cursor: "pubmed-next-page"
    });
    expect(interrupted[1]).toMatchObject({
      status: "BLOCKED_RETRYABLE",
      boundary: { classification: "RETRYABLE" }
    });

    formal = await executeResearchFormalSearch(
      formal,
      hypothesis.hypothesis_id,
      executors
    );
    for (const provider of formal.hypotheses[0]!.provider_searches) {
      expect(provider.status).toBe("COMPLETE");
      expect(provider.next_cursor).toBeUndefined();
      expect(provider.boundary).toBeUndefined();
    }
  });

  it("allows exhausted provider results to contain no decision-important source", async () => {
    const formal = await searchedFormal();
    const work = createFormalEvidenceScreeningWorkPackage(formal);

    const screened = ingestFormalEvidenceScreeningSubmission(formal, {
      package_version: work.package_version,
      formal_frontier_digest: work.formal_frontier_digest,
      decisions: work.sources.map(({ source_id }) => ({
        source_id,
        source_kind: "OTHER",
        decision_importance: "NOT_DECISION_IMPORTANT",
        possible_decision_impact: "detail_only",
        rationale: "Provider result is unrelated to the treatment hypothesis."
      }))
    });

    expect(screened.sources.every((source) =>
      source.screening_status === "SCREENED" &&
      source.decision_importance === "NOT_DECISION_IMPORTANT" &&
      source.full_text.status === "NOT_APPLICABLE" &&
      source.method_audit.status === "NOT_APPLICABLE"
    )).toBe(true);
    expect(deriveFormalEvidenceOperationStatus(screened, "formal_evidence_search"))
      .toBe("COMPLETE");
    expect(deriveFormalEvidenceDiagnostics(screened)).toMatchObject({
      hypotheses: 3,
      hypotheses_search_complete: 3,
      decision_important_sources: 0
    });
  });

  it("keeps abstract-only or inaccessible sources as unseen claim-local leads", async () => {
    let formal = selectAllStudies(await searchedFormal());
    const executor = createOpenFullTextExecutor({
      acquire: async ({ doi }) => okEnvelope({
        provider: "open_full_text",
        recordType: "open_full_text_acquisition",
        primaryIdentifier: doi,
        sourceIdentity: { canonical_url: `https://doi.org/${doi}` },
        pagination: { exhausted: true },
        returned: 0,
        accessStatus: "inaccessible",
        limitations: ["No complete open copy."],
        data: {
          requested_doi: doi,
          outcome: "possibly_useful_lead",
          discovery_attempts: [
            { route: "europe_pmc", result: "not_found" },
            { route: "unpaywall", result: "inaccessible", identifier: doi }
          ],
          access_boundary: "No complete identity-verified open full text was available."
        } satisfies OpenFullTextAcquisitionData
      }),
      unpaywallConfig: { email: "research@example.test" }
    });
    const sourceId = formal.sources[0]!.source_id;
    formal = await executeResearchSourceFullTextChain(formal, sourceId, executor);
    const source = formal.sources.find(({ source_id }) => source_id === sourceId)!;

    expect(source.full_text).toMatchObject({
      status: "LEAD_BOUNDARY",
      unseen_content_used_as_evidence: false,
      synthesis_lock: "fail"
    });
    expect(source.method_audit.status).toBe("BOUNDARY");
    expect(source.claim_capability).toEqual({
      status: "UNAVAILABLE_UNSEEN_SOURCE",
      unrestricted_decision_use: false
    });
    expect(deriveFormalEvidenceOperationStatus(formal, "claim_capability_recalculation"))
      .toBe("BLOCKED_TERMINAL");
  });

  it("discards an expired partial full-text chain and restarts the exact source without combining counts", async () => {
    let formal = selectAllStudies(await searchedFormal());
    const sourceId = formal.sources[0]!.source_id;
    const longIndex = documentIndex(formal.sources[0]!.identity.doi!, "x".repeat(50_000));
    const firstExecutor = createOpenFullTextExecutor({
      acquire: async () => acquisition(longIndex),
      store: createOpenFullTextHandleStore(),
      unpaywallConfig: { email: "research@example.test" }
    });
    formal = await executeResearchSourceFullTextChain(formal, sourceId, firstExecutor, 1);
    expect(formal.sources.find(({ source_id }) => source_id === sourceId)!.full_text)
      .toMatchObject({ status: "IN_PROGRESS" });
    expect(formal.sources.find(({ source_id }) => source_id === sourceId)!.full_text
      .source_segments_retrieved_cumulative).toBeGreaterThan(0);

    const replacementExecutor = createOpenFullTextExecutor({
      acquire: async () => acquisition(longIndex),
      store: createOpenFullTextHandleStore(),
      unpaywallConfig: { email: "research@example.test" }
    });
    formal = await executeResearchSourceFullTextChain(formal, sourceId, replacementExecutor);
    expect(formal.sources.find(({ source_id }) => source_id === sourceId)!.full_text)
      .toMatchObject({
        status: "BLOCKED_RETRYABLE",
        source_segments_retrieved_cumulative: 0,
        synthesis_lock: "fail"
      });

    formal = await executeResearchSourceFullTextChain(formal, sourceId, replacementExecutor);
    expect(formal.sources.find(({ source_id }) => source_id === sourceId)!.full_text)
      .toMatchObject({
        status: "EXHAUSTED",
        source_segments_retrieved_cumulative: 5,
        source_segment_count: 5,
        synthesis_lock: "pass"
      });
    const restored = reconcileFormalEvidenceAfterEphemeralLoss(formal);
    expect(restored.sources.find(({ source_id }) => source_id === sourceId))
      .toMatchObject({
        full_text: {
          status: "BLOCKED_RETRYABLE",
          source_segments_retrieved_cumulative: 0,
          synthesis_lock: "fail"
        },
        method_audit: { status: "NOT_STARTED" },
        external_evidence: { status: "NOT_STARTED" },
        claim_capability: { status: "METHOD_AUDIT_PENDING" }
      });
    expect(() => restartResearchSourceFullTextChain(formal, sourceId, "forged restart"))
      .toThrow(/Only an incomplete/u);
  });

  it("requires exhausted exact text, a source-linked method audit, and mandatory external receipts before ordinary decision use", async () => {
    let formal = selectAllStudies(await searchedFormal());
    const executor = openTextExecutor();
    for (const source of formal.sources) {
      const sourceId = source.source_id;
      formal = await executeResearchSourceFullTextChain(
        formal,
        sourceId,
        executor
      );
      const exhausted = formal.sources.find(({ source_id }) => source_id === sourceId)!;
      expect(exhausted.full_text).toMatchObject({
        status: "EXHAUSTED",
        synthesis_lock: "pass"
      });
      const audit = await executor.validateStudyAudit({
        document_handle: exhausted.full_text.document_handle!,
        audit: studyAudit(documentIndex(exhausted.identity.doi!))
      });
      formal = recordFormalMethodAudit(formal, sourceId, audit);
      const readerEvidence = formal.sources.find(({ source_id }) =>
        source_id === sourceId
      )!.method_audit.reader_evidence;
      expect(readerEvidence).toMatchObject({
        audit_kind: "STUDY",
        source_content_sha256: exhausted.full_text.source_content_sha256,
        audit_sha256: audit.audit_receipt.audit_sha256
      });
      if (readerEvidence?.audit_kind !== "STUDY") {
        throw new Error("Missing source-linked reader evidence");
      }
      const expectedBlockId = documentIndex(exhausted.identity.doi!).blocks[0]!.block_id;
      expect(readerEvidence.method_findings.every(({ evidence_block_ids }) =>
        evidence_block_ids.every((blockId) => blockId === expectedBlockId)
      )).toBe(true);
      expect(readerEvidence.claim_capabilities.every(({ evidence_block_ids }) =>
        evidence_block_ids.every((blockId) => blockId === expectedBlockId)
      )).toBe(true);
    }

    expect(deriveFormalEvidenceOperationStatus(formal, "study_method_audit"))
      .toBe("COMPLETE");
    expect(formal.sources.every(({ claim_capability }) =>
      claim_capability.status === "EXTERNAL_AUDIT_PENDING"
    )).toBe(true);

    let restoredBeforeExternal = reconcileFormalEvidenceAfterEphemeralLoss(formal);
    expect(restoredBeforeExternal.sources.every((source) =>
      source.full_text.status === "BLOCKED_RETRYABLE" &&
      source.method_audit.status === "COMPLETE" &&
      source.external_evidence.status === "NOT_STARTED" &&
      source.claim_capability.status === "EXTERNAL_AUDIT_PENDING"
    )).toBe(true);
    const reacquisitionExecutor = openTextExecutor();
    for (const source of [...restoredBeforeExternal.sources]) {
      restoredBeforeExternal = await executeResearchSourceFullTextChain(
        restoredBeforeExternal,
        source.source_id,
        reacquisitionExecutor,
      );
    }
    expect(restoredBeforeExternal.sources.map((source) => ({
      full_text: source.full_text.status,
      method_audit: source.method_audit.status,
      external_evidence: source.external_evidence.status,
      claim_capability: source.claim_capability.status,
    }))).toEqual(formal.sources.map((source) => ({
      full_text: source.full_text.status,
      method_audit: source.method_audit.status,
      external_evidence: source.external_evidence.status,
      claim_capability: source.claim_capability.status,
    })));
    expect(createFormalExternalEvidenceWorkPackages(formal)).toHaveLength(3);

    for (const source of [...formal.sources]) {
      const coordinator = externalCoordinator();
      const output = await coordinator.audit({
        session_id: SESSION_ID,
        doi: source.identity.doi!
      });
      formal = ingestResearchSourceExternalEvidence(
        formal,
        SESSION_ID,
        source.source_id,
        output,
        SECRET,
        protocolTuple()
      );
      const pending = formal.sources.find(({ source_id }) =>
        source_id === source.source_id
      )!;
      expect(pending.claim_capability.status).toBe("RECALCULATION_REQUIRED");
      expect(createFormalClaimRecalculationWorkPackages(formal).map(({ source_id }) =>
        source_id
      )).toContain(source.source_id);
      if (source.source_id === formal.sources[0]!.source_id) {
        let restoredAfterExternal = reconcileFormalEvidenceAfterEphemeralLoss(formal);
        expect(restoredAfterExternal.sources.find(({ source_id }) =>
          source_id === source.source_id
        )).toMatchObject({
          full_text: { status: "BLOCKED_RETRYABLE" },
          method_audit: {
            status: "COMPLETE",
            audit_sha256: pending.method_audit.audit_sha256
          },
          external_evidence: { status: "NOT_STARTED" },
          claim_capability: {
            status: "EXTERNAL_AUDIT_PENDING",
            unrestricted_decision_use: false
          }
        });
        restoredAfterExternal = await executeResearchSourceFullTextChain(
          restoredAfterExternal,
          source.source_id,
          openTextExecutor()
        );
        expect(createFormalExternalEvidenceWorkPackages(restoredAfterExternal)
          .map(({ source_id }) => source_id)).toContain(source.source_id);
        expect(createFormalClaimRecalculationWorkPackages(restoredAfterExternal)
          .map(({ source_id }) => source_id)).not.toContain(source.source_id);

        const omittedCoverage = externalStudyAudit(pending, output);
        const ancestry = omittedCoverage.domain_findings.find(({ domain }) =>
          domain === "replication_contradiction_and_evidence_ancestry"
        )!;
        ancestry.external_evidence_references = ancestry.external_evidence_references
          .filter(({ provider }) => provider === "crossref");
        await expect(recalculateResearchSourceClaimCapability(formal, {
          sessionId: SESSION_ID,
          sourceId: source.source_id,
          submission: omittedCoverage,
          executor,
          externalAudit: output,
          receiptSecret: SECRET
        })).rejects.toThrow(/omitted required external-evidence work or coverage/u);
      }
      formal = await recalculateResearchSourceClaimCapability(formal, {
        sessionId: SESSION_ID,
        sourceId: source.source_id,
        submission: externalStudyAudit(pending, output),
        executor,
        externalAudit: output,
        receiptSecret: SECRET
      });
    }
    expect(deriveFormalEvidenceOperationStatus(formal, "external_study_evidence_audit"))
      .toBe("COMPLETE");
    expect(deriveFormalEvidenceOperationStatus(formal, "linked_replication_and_review_audit"))
      .toBe("COMPLETE");
    expect(deriveFormalEvidenceOperationStatus(formal, "claim_capability_recalculation"))
      .toBe("COMPLETE");
    expect(formal.sources.every(({ claim_capability }) =>
      claim_capability.unrestricted_decision_use
    )).toBe(true);
    expect(reconcileFormalEvidenceAfterEphemeralLoss(formal)).toEqual(formal);
  });

  it("rejects cross-protocol external receipts and turns retractions/replication labels into linked work rather than conclusions", async () => {
    let formal = selectAllStudies(await searchedFormal());
    const executor = openTextExecutor();
    const selected = formal.sources[0]!;
    formal = await executeResearchSourceFullTextChain(formal, selected.source_id, executor);
    const exhausted = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    formal = recordFormalMethodAudit(formal, selected.source_id, await executor.validateStudyAudit({
      document_handle: exhausted.full_text.document_handle!,
      audit: studyAudit(documentIndex(exhausted.identity.doi!))
    }));

    await expect(executeResearchSourceExternalEvidence(
      formal,
      SESSION_ID,
      selected.source_id,
      externalCoordinator({ protocols: {
        ...PROTOCOLS,
        hrp: { ...PROTOCOLS.hrp, sha256: "c".repeat(64) }
      } }),
      SECRET,
      protocolTuple()
    )).rejects.toThrow(/invalid or mismatched/u);

    const completeOutput = await externalCoordinator().audit({
      session_id: SESSION_ID,
      doi: exhausted.identity.doi!
    });
    const missingMandatoryAttempt = structuredClone(completeOutput);
    missingMandatoryAttempt.bundle.provider_attempts =
      missingMandatoryAttempt.bundle.provider_attempts.filter(({ provider }) =>
        provider !== "forrt"
      );
    expect(() => ingestResearchSourceExternalEvidence(
      formal,
      SESSION_ID,
      selected.source_id,
      missingMandatoryAttempt,
      SECRET,
      protocolTuple()
    )).toThrow(/internally inconsistent|invalid or mismatched|Crossref and FORRT/u);

    formal = await executeResearchSourceExternalEvidence(
      formal,
      SESSION_ID,
      selected.source_id,
      externalCoordinator({ withRetractionAndReplication: true }),
      SECRET,
      protocolTuple()
    );
    const parent = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    expect(parent.external_evidence.effect_claims_excluded).toBe(true);
    expect(parent.claim_capability).toMatchObject({
      status: "EFFECT_CLAIMS_EXCLUDED",
      unrestricted_decision_use: false
    });
    expect(parent.external_evidence.linked_work).toHaveLength(2);
    expect(parent.external_evidence.linked_work.map(({ provider_reported_outcome }) =>
      provider_reported_outcome
    )).toContain("failed");
    expect(parent.external_evidence.linked_work.every(({ status }) =>
      status !== "COMPLETE"
    )).toBe(true);
    expect(formal.sources.filter(({ origins }) => origins.some(({ provider }) =>
      provider === "external_evidence"
    ))).toHaveLength(2);
    expect(deriveFormalEvidenceOperationStatus(formal, "linked_replication_and_review_audit"))
      .toBe("NOT_STARTED");

    const noticeWork = parent.external_evidence.linked_work.find(({ item_kind }) =>
      item_kind === "PUBLICATION_NOTICE"
    )!;
    formal = await executeResearchSourceFullTextChain(
      formal,
      noticeWork.linked_source_id!,
      executor
    );
    const notice = formal.sources.find(({ source_id }) =>
      source_id === noticeWork.linked_source_id
    )!;
    formal = recordFormalMethodAudit(
      formal,
      notice.source_id,
      await executor.validateNoticeAudit({
        document_handle: notice.full_text.document_handle!,
        audit: {
          source_primary_identifier: notice.full_text.source_primary_identifier!,
          source_content_sha256: notice.full_text.source_content_sha256!,
          notice_type: "retraction",
          affected_source_identity: exhausted.identity.doi!,
          plain_language_finding: "The exact notice was inspected; its record status constrains ordinary effect claims without making broader misconduct or universal-invalidity claims.",
          evidence_block_ids: [documentIndex(notice.identity.doi!).blocks[0]!.block_id],
          possible_decision_impact: "potentially_conclusion_changing",
          unresolved_fields: []
        }
      })
    );
    formal = reconcileFormalEvidenceLinkedWork(formal);
    expect(formal.sources.find(({ source_id }) => source_id === notice.source_id)!
      .claim_capability.status).toBe("CURRENT");
    expect(formal.sources.find(({ source_id }) => source_id === selected.source_id)!
      .external_evidence.linked_work.find(({ item_kind }) =>
        item_kind === "PUBLICATION_NOTICE"
      )!.status).toBe("COMPLETE");
  });

  it("keeps retryable provider identity failure executable and terminal failure claim-local", async () => {
    let formal = selectAllStudies(await searchedFormal());
    const executor = openTextExecutor();
    const selected = formal.sources[0]!;
    formal = await executeResearchSourceFullTextChain(formal, selected.source_id, executor);
    const exhausted = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    formal = recordFormalMethodAudit(formal, selected.source_id, await executor.validateStudyAudit({
      document_handle: exhausted.full_text.document_handle!,
      audit: studyAudit(documentIndex(exhausted.identity.doi!))
    }));

    formal = await executeResearchSourceExternalEvidence(
      formal,
      SESSION_ID,
      selected.source_id,
      { audit: async () => { throw new StudyExternalEvidenceIdentityError(true); } },
      SECRET,
      protocolTuple()
    );
    expect(formal.sources.find(({ source_id }) => source_id === selected.source_id))
      .toMatchObject({
        external_evidence: { status: "BLOCKED_RETRYABLE" },
        claim_capability: {
          status: "EXTERNAL_AUDIT_PENDING",
          unrestricted_decision_use: false
        }
      });
    expect(deriveFormalEvidenceOperationStatus(formal, "external_study_evidence_audit"))
      .toBe("BLOCKED_RETRYABLE");

    formal = await executeResearchSourceExternalEvidence(
      formal,
      SESSION_ID,
      selected.source_id,
      { audit: async () => { throw new StudyExternalEvidenceIdentityError(false); } },
      SECRET,
      protocolTuple()
    );
    expect(formal.sources.find(({ source_id }) => source_id === selected.source_id))
      .toMatchObject({
        external_evidence: { status: "BOUNDED_NONRETRYABLE" },
        claim_capability: { status: "BOUNDED_ONLY", unrestricted_decision_use: false }
      });
  });

  it("turns configured post-publication messages and review ancestry into source-bound linked work rather than conclusions", async () => {
    let formal = selectAllStudies(await searchedFormal());
    const executor = openTextExecutor();
    const selected = formal.sources[0]!;
    formal = await executeResearchSourceFullTextChain(formal, selected.source_id, executor);
    let parent = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    formal = recordFormalMethodAudit(formal, selected.source_id, await executor.validateStudyAudit({
      document_handle: parent.full_text.document_handle!,
      audit: studyAudit(documentIndex(parent.identity.doi!))
    }));

    const output = await externalCoordinator({ withOptionalEvidence: true }).audit({
      session_id: SESSION_ID,
      doi: parent.identity.doi!
    });
    formal = ingestResearchSourceExternalEvidence(
      formal,
      SESSION_ID,
      selected.source_id,
      output,
      SECRET,
      protocolTuple()
    );
    parent = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;

    expect(parent.claim_capability).toMatchObject({
      status: "LINKED_WORK_REQUIRED",
      unrestricted_decision_use: false
    });
    expect(parent.external_evidence.linked_work.map(({ item_kind, status }) => ({
      item_kind,
      status
    }))).toEqual(expect.arrayContaining([
      { item_kind: "POSTPUBLICATION_MESSAGE", status: "NOT_STARTED" },
      { item_kind: "REVIEW", status: "NOT_STARTED" }
    ]));
    expect(parent.external_evidence.controller_directives.map(({ directive }) => directive))
      .toEqual(expect.arrayContaining([
        "require_postpublication_message_audit",
        "require_review_acquisition"
      ]));
    const submission = externalStudyAudit(parent, output);
    const ancestryReferences = submission.domain_findings.flatMap((finding) =>
      finding.external_evidence_references
    ).filter(({ item_kind }) => item_kind === "review_ancestry");
    expect(ancestryReferences).toHaveLength(1);
    expect(ancestryReferences[0]!.provider).toBe("epistemonikos");
    expect(JSON.stringify(parent.external_evidence)).not.toContain("review_approved");
    expect(JSON.stringify(parent.external_evidence)).not.toContain("study_invalid");
  });

  it("cannot recalculate partial external-provider coverage into unrestricted use", async () => {
    let formal = selectAllStudies(await searchedFormal());
    const executor = openTextExecutor();
    const selected = formal.sources[0]!;
    formal = await executeResearchSourceFullTextChain(formal, selected.source_id, executor);
    let source = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    formal = recordFormalMethodAudit(formal, selected.source_id, await executor.validateStudyAudit({
      document_handle: source.full_text.document_handle!,
      audit: studyAudit(documentIndex(source.identity.doi!))
    }));
    const output = await externalCoordinator({ forrtPartial: true }).audit({
      session_id: SESSION_ID,
      doi: source.identity.doi!
    });
    formal = ingestResearchSourceExternalEvidence(
      formal,
      SESSION_ID,
      selected.source_id,
      output,
      SECRET,
      protocolTuple()
    );
    source = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    expect(source).toMatchObject({
      external_evidence: { status: "PARTIAL" },
      claim_capability: { status: "BOUNDED_ONLY", unrestricted_decision_use: false }
    });
    await expect(recalculateResearchSourceClaimCapability(formal, {
      sessionId: SESSION_ID,
      sourceId: selected.source_id,
      submission: externalStudyAudit(source, output),
      executor,
      externalAudit: output,
      receiptSecret: SECRET
    })).rejects.toThrow(/requires completed linked work/u);
  });

  it("executes a decision-changing linked study before recalculating the parent claim capability", async () => {
    let formal = selectAllStudies(await searchedFormal());
    const executor = openTextExecutor();
    const selected = formal.sources[0]!;
    formal = await executeResearchSourceFullTextChain(formal, selected.source_id, executor);
    let parent = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    formal = recordFormalMethodAudit(formal, selected.source_id, await executor.validateStudyAudit({
      document_handle: parent.full_text.document_handle!,
      audit: studyAudit(documentIndex(parent.identity.doi!))
    }));

    const coordinator = externalCoordinator({ withReplicationOnly: true });
    const originalExternal = await coordinator.audit({
      session_id: SESSION_ID,
      doi: parent.identity.doi!
    });
    formal = ingestResearchSourceExternalEvidence(
      formal,
      SESSION_ID,
      selected.source_id,
      originalExternal,
      SECRET,
      protocolTuple()
    );
    parent = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    expect(parent.claim_capability.status).toBe("LINKED_WORK_REQUIRED");
    const restoredWithLinkedWorkPending =
      reconcileFormalEvidenceAfterEphemeralLoss(formal);
    expect(restoredWithLinkedWorkPending.sources.find(({ source_id }) =>
      source_id === selected.source_id
    )).toMatchObject({
      full_text: { status: "BLOCKED_RETRYABLE" },
      method_audit: { status: "COMPLETE" },
      external_evidence: { status: "NOT_STARTED", linked_work: [] },
      claim_capability: {
        status: "EXTERNAL_AUDIT_PENDING",
        unrestricted_decision_use: false
      }
    });
    const linkedSourceId = parent.external_evidence.linked_work[0]!.linked_source_id!;
    expect(deriveFormalEvidenceOperationStatus(formal, "accessible_full_text_acquisition"))
      .toBe("IN_PROGRESS");

    formal = await executeResearchSourceFullTextChain(formal, linkedSourceId, executor);
    const linked = formal.sources.find(({ source_id }) => source_id === linkedSourceId)!;
    formal = recordFormalMethodAudit(formal, linkedSourceId, await executor.validateStudyAudit({
      document_handle: linked.full_text.document_handle!,
      audit: studyAudit(documentIndex(linked.identity.doi!))
    }));
    const linkedExternal = await externalCoordinator().audit({
      session_id: SESSION_ID,
      doi: linked.identity.doi!
    });
    formal = ingestResearchSourceExternalEvidence(
      formal,
      SESSION_ID,
      linkedSourceId,
      linkedExternal,
      SECRET,
      protocolTuple()
    );
    const linkedPending = formal.sources.find(({ source_id }) =>
      source_id === linkedSourceId
    )!;
    formal = await recalculateResearchSourceClaimCapability(formal, {
      sessionId: SESSION_ID,
      sourceId: linkedSourceId,
      submission: externalStudyAudit(linkedPending, linkedExternal),
      executor,
      externalAudit: linkedExternal,
      receiptSecret: SECRET
    });
    formal = reconcileFormalEvidenceLinkedWork(formal);
    parent = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    expect(parent.external_evidence.linked_work[0]!.status).toBe("COMPLETE");
    expect(parent.claim_capability.status).toBe("RECALCULATION_REQUIRED");

    formal = await recalculateResearchSourceClaimCapability(formal, {
      sessionId: SESSION_ID,
      sourceId: selected.source_id,
      submission: externalStudyAudit(parent, originalExternal),
      executor,
      externalAudit: originalExternal,
      receiptSecret: SECRET
    });
    parent = formal.sources.find(({ source_id }) => source_id === selected.source_id)!;
    expect(parent.claim_capability).toMatchObject({
      status: "CURRENT",
      unrestricted_decision_use: true,
      external_receipt_payload_sha256: originalExternal.receipt.receipt_payload_sha256
    });
    expect(deriveFormalEvidenceOperationStatus(formal, "claim_capability_recalculation"))
      .toBe("IN_PROGRESS");
  });

  it("lets verified linked evidence reopen completed downstream session gates", async () => {
    let session = formalSession();
    const executors = formalExecutors();
    for (const hypothesis of session.formal_evidence.hypotheses) {
      session = await executeResearchSessionFormalSearch(
        session,
        hypothesis.hypothesis_id,
        executors
      );
    }
    const screening = createFormalEvidenceScreeningWorkPackage(session.formal_evidence);
    session = recordResearchSessionFormalScreening(session, {
      package_version: screening.package_version,
      formal_frontier_digest: screening.formal_frontier_digest,
      decisions: screening.sources.map(({ source_id }) => ({
        source_id,
        source_kind: "SCIENTIFIC_STUDY",
        decision_importance: "DECISION_IMPORTANT",
        possible_decision_impact: "confidence_changing",
        rationale: "Exact fixture study selected for controller-owned source auditing."
      }))
    });
    const executor = openTextExecutor();
    for (const [index, source] of [...session.formal_evidence.sources].entries()) {
      session = await executeResearchSessionSourceFullTextChain(
        session,
        source.source_id,
        executor
      );
      const exhausted = session.formal_evidence.sources.find(({ source_id }) =>
        source_id === source.source_id
      )!;
      if (index === 0) {
        const forged = studyAudit(documentIndex(exhausted.identity.doi!));
        forged.domain_findings[0]!.evidence_block_ids = [
          `pdf_999999_${"f".repeat(12)}`
        ];
        await expect(executeResearchSessionMethodAudit(
          session,
          source.source_id,
          forged,
          executor
        )).rejects.toThrow(/unknown source block/u);
      }
      session = await executeResearchSessionMethodAudit(
        session,
        source.source_id,
        studyAudit(documentIndex(exhausted.identity.doi!)),
        executor
      );
    }
    expect(session.operations.accessible_full_text_acquisition.status).toBe("COMPLETE");
    expect(session.operations.study_method_audit.status).toBe("COMPLETE");

    const beforeExternal = session;
    session = await executeResearchSessionSourceExternalEvidence(
      session,
      SESSION_ID,
      session.formal_evidence.sources[0]!.source_id,
      externalCoordinator({ withReplicationOnly: true }),
      SECRET
    );
    expect(session.formal_evidence.sources).toHaveLength(
      beforeExternal.formal_evidence.sources.length + 1
    );
    expect(session.operations.accessible_full_text_acquisition.status).toBe("IN_PROGRESS");
    expect(session.operations.study_method_audit.status).toBe("IN_PROGRESS");
    expect(() => assertResearchSessionTransition(beforeExternal, session)).not.toThrow();
  });

  it("preserves a terminal formal-provider failure while continuing unrelated source work", async () => {
    let session = formalSession();
    const executors = formalExecutors();
    executors.searchEuropePmc = vi.fn(async (input: { query: string }) => errorEnvelope({
      provider: "europe_pmc",
      recordType: "europe_pmc_search_result",
      query: { query: input.query },
      accessStatus: "error",
      pagination: { page_size: 100, exhausted: true },
      returned: 0,
      limitations: ["Provider request failed terminally in the fixture."],
      code: "provider_terminal_fixture",
      message: "Provider request failed terminally in the fixture.",
      retryable: false,
      data: []
    })) as never;
    for (const hypothesis of session.formal_evidence.hypotheses) {
      session = await executeResearchSessionFormalSearch(
        session,
        hypothesis.hypothesis_id,
        executors
      );
    }
    const screening = createFormalEvidenceScreeningWorkPackage(session.formal_evidence);
    session = recordResearchSessionFormalScreening(session, {
      package_version: screening.package_version,
      formal_frontier_digest: screening.formal_frontier_digest,
      decisions: screening.sources.map(({ source_id }) => ({
        source_id,
        source_kind: "SCIENTIFIC_STUDY",
        decision_importance: "DECISION_IMPORTANT",
        possible_decision_impact: "confidence_changing",
        rationale: "The available exact identity remains decision-important despite the other provider boundary."
      }))
    });
    expect(session.operations.formal_evidence_search).toMatchObject({
      status: "BLOCKED_TERMINAL",
      boundary: { classification: "TERMINAL_NONRETRYABLE" }
    });
    expect(session.formal_evidence.hypotheses.every((hypothesis) =>
      hypothesis.provider_searches.some((search) =>
        search.provider === "europe_pmc" &&
        search.status === "BLOCKED_TERMINAL" &&
        search.records_returned_cumulative === 0
      )
    )).toBe(true);
    expect(deriveRequiredNextCapabilities(session))
      .toContain("accessible_full_text_acquisition");
  });
});

function screenedCandidates() {
  let discovery = initialResearchCandidateDiscoveryState();
  discovery = ingestValidatedGeminiFrontier(
    discovery,
    researchPacket(),
    researchReceipt(),
    "interaction-formal"
  );
  discovery = ingestNativeYoutubeSurvey(discovery, nativeSurvey());
  return ingestCandidateScreeningSubmission(
    discovery,
    screeningSubmissionFor(discovery)
  );
}

function screenedUndescribedCandidates(sharedDiscoveryText = false) {
  const candidateState = screenedCandidates();
  const unspecifiedProgram = {
    components: PROGRAM_NOT_DESCRIBED,
    dose_or_intensity: PROGRAM_NOT_DESCRIBED,
    frequency: PROGRAM_NOT_DESCRIBED,
    duration: PROGRAM_NOT_DESCRIBED,
    supervision: PROGRAM_NOT_DESCRIBED,
    adherence_or_fidelity: PROGRAM_NOT_DESCRIBED,
    cointerventions: PROGRAM_NOT_DESCRIBED,
    stage_or_baseline: PROGRAM_NOT_DESCRIBED,
    outcome: PROGRAM_NOT_DESCRIBED,
    horizon: PROGRAM_NOT_DESCRIBED,
    care_stage: PROGRAM_NOT_DESCRIBED
  };
  for (const candidate of candidateState.candidates) {
    if (candidate.materiality !== "MATERIAL") continue;
    if (sharedDiscoveryText) {
      candidate.title = "Shared provisional source title";
      candidate.channel_title = "Shared provisional source channel";
    }
    candidate.provisional_treatment_class = "joint preservation";
    candidate.provisional_claim_summary = PROGRAM_NOT_DESCRIBED;
    candidate.program = unspecifiedProgram;
    candidate.program_description_status = "NOT_DESCRIBED";
    candidate.program_signature = deriveProgramSignature(unspecifiedProgram);
  }
  return candidateState;
}

function providerState(
  formal: ResearchFormalEvidenceState,
  hypothesisId: string,
  provider: "pubmed" | "europe_pmc"
) {
  return formal.hypotheses.find(({ hypothesis_id }) =>
    hypothesis_id === hypothesisId
  )!.provider_searches.find((search) => search.provider === provider)!;
}

function formalSession(): ResearchSessionState {
  let state = createInitialResearchSessionState({
    research_target: "de-identified treatment comparison",
    diagnosis_status: "diagnosis_not_specified"
  }, protocolBindingsFromManifests(PROTOCOLS.universal, PROTOCOLS.hrp));
  state = recordAutomatedScoutCompletion(state, {
    providerResponseId: "interaction-formal-session",
    packet: researchPacket(),
    receipt: researchReceipt()
  });
  state = recordNativeYoutubeDiscovery(state, nativeSurvey());
  return recordCandidateScreeningCompletion(
    state,
    screeningSubmissionFor(state.candidate_discovery)
  );
}

async function searchedFormal(): Promise<ResearchFormalEvidenceState> {
  let state = initializeResearchFormalEvidence(
    screenedCandidates(),
    "de-identified treatment comparison"
  );
  const executors = formalExecutors();
  for (const hypothesis of state.hypotheses) {
    state = await executeResearchFormalSearch(state, hypothesis.hypothesis_id, executors);
  }
  return state;
}

function selectAllStudies(state: ResearchFormalEvidenceState): ResearchFormalEvidenceState {
  const work = createFormalEvidenceScreeningWorkPackage(state);
  return ingestFormalEvidenceScreeningSubmission(state, {
    package_version: work.package_version,
    formal_frontier_digest: work.formal_frontier_digest,
    decisions: work.sources.map(({ source_id }) => ({
      source_id,
      source_kind: "SCIENTIFIC_STUDY",
      decision_importance: "DECISION_IMPORTANT",
      possible_decision_impact: "confidence_changing",
      rationale: "Fixture source selected for exact full-text and method audit."
    }))
  });
}

async function formalWithSourceCount(
  sourceCount: number
): Promise<ResearchFormalEvidenceState> {
  let state = initializeResearchFormalEvidence(
    screenedCandidates(),
    "de-identified treatment comparison"
  );
  const hypothesisId = state.hypotheses[0]!.hypothesis_id;
  state = await executeResearchFormalSearch(
    state,
    hypothesisId,
    formalExecutors()
  );
  const prototype = state.sources[0]!;
  const sources = Array.from({ length: sourceCount }, (_, index) => {
    const pmid = String(1_000_000 + index);
    const identity = {
      pmid,
      title: `Capacity seed study ${pmid}`,
      identity_status: "PROVIDER_REPORTED" as const,
      identity_hash: hash(`capacity-identity:${pmid}`)
    };
    return {
      ...prototype,
      source_id: hash(`capacity-source:${pmid}`),
      hypothesis_ids: [hypothesisId],
      origins: [{
        provider: "pubmed" as const,
        provider_record_id: pmid,
        canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        hypothesis_ids: [hypothesisId],
        provider_access_status: "api_visible_complete",
        source_record_hash: hash(`capacity-record:${pmid}`)
      }],
      identity
    };
  }).sort((left, right) => left.source_id.localeCompare(right.source_id));
  const hypotheses = state.hypotheses.map((hypothesis) => ({
    ...hypothesis,
    provider_searches: hypothesis.provider_searches.map((search) => ({
      provider: search.provider,
      query: search.query,
      status: "NOT_STARTED" as const,
      pages_retrieved: 0,
      records_returned_cumulative: 0,
      page_receipt_hashes: [],
      access_statuses: [],
      limitations: []
    })) as typeof hypothesis.provider_searches
  }));
  return researchFormalEvidenceStateSchema.parse({ ...state, hypotheses, sources });
}

function sourceCapacityExecutors(): FormalSearchExecutors & {
  searchPubmed: ReturnType<typeof vi.fn>;
  fetchPubmedRecord: ReturnType<typeof vi.fn>;
  searchEuropePmc: ReturnType<typeof vi.fn>;
} {
  const identifiers = ["9000001", "9000002"];
  return {
    searchPubmed: vi.fn(async (input: { query: string }) => okEnvelope({
      provider: "pubmed",
      recordType: "pubmed_search_result",
      query: { query: input.query },
      accessStatus: "complete",
      pagination: {
        page_size: 100,
        returned: identifiers.length,
        exhausted: false,
        next_cursor: "capacity-next-page"
      },
      data: identifiers.map((pmid) => ({ pmid }))
    })) as never,
    fetchPubmedRecord: vi.fn(async (identifier: string) => okEnvelope({
      provider: "pubmed",
      recordType: "pubmed_record",
      primaryIdentifier: identifier,
      sourceIdentity: {
        canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${identifier}/`
      },
      accessStatus: "api_visible_complete",
      pagination: { returned: 1, exhausted: true },
      data: {
        pmid: identifier,
        title: `Capacity page study ${identifier}`,
        abstract: "Abstract only.",
        authors: ["Researcher"],
        dates: [{ type: "pub", value: "2025" }]
      } satisfies PubmedRecord
    })) as never,
    searchEuropePmc: vi.fn(async () => {
      throw new Error("Europe PMC must not run after the global source boundary");
    }) as never,
    pubmedConfig: { tool: "askrigor-test", email: "research@example.test" }
  };
}

function formalExecutors(): FormalSearchExecutors & {
  searchPubmed: ReturnType<typeof vi.fn>;
  fetchPubmedRecord: ReturnType<typeof vi.fn>;
  searchEuropePmc: ReturnType<typeof vi.fn>;
} {
  const ids = new Map<string, string>();
  let count = 1000;
  const pubmedSearch = vi.fn(async (input: { query: string }) => {
    const id = String(++count);
    ids.set(input.query, id);
    return okEnvelope({
      provider: "pubmed",
      recordType: "pubmed_search_result",
      query: { query: input.query },
      accessStatus: "complete",
      pagination: { page_size: 100, returned: 1, exhausted: true },
      data: [{ pmid: id }]
    });
  });
  const fetchRecord = vi.fn(async (identifier: string) => okEnvelope({
    provider: "pubmed",
    recordType: "pubmed_record",
    primaryIdentifier: identifier,
    sourceIdentity: {
      canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${identifier}/`,
      title: `Exact study ${identifier}`,
      authors_or_channel: ["Researcher"]
    },
    accessStatus: "api_visible_complete",
    pagination: { returned: 1, exhausted: true },
    limitations: ["Abstract metadata only until full text is acquired."],
    data: {
      pmid: identifier,
      doi: `10.5555/formal.${identifier}`,
      title: `Exact study ${identifier}`,
      abstract: "Abstract only.",
      authors: ["Researcher"],
      dates: [{ type: "pub", value: "2025" }],
      publication_types: ["Clinical Trial"]
    } satisfies PubmedRecord
  }));
  const europe = vi.fn(async (input: { query: string }) => {
    const identifier = ids.get(input.query)!;
    return okEnvelope({
      provider: "europe_pmc",
      recordType: "europe_pmc_search_result",
      query: { query: input.query },
      accessStatus: "complete",
      pagination: { page_size: 100, returned: 1, exhausted: true },
      data: [{
        source: "MED",
        id: identifier,
        pmid: identifier,
        pmcid: `PMC${identifier}`,
        doi: `10.5555/formal.${identifier}`,
        title: `Exact study ${identifier}`,
        authors: ["Researcher"],
        year: "2025",
        is_open_access: true,
        has_full_text: true
      }]
    });
  });
  return {
    searchPubmed: pubmedSearch as never,
    fetchPubmedRecord: fetchRecord as never,
    searchEuropePmc: europe as never,
    pubmedConfig: { tool: "askrigor-test", email: "research@example.test" }
  };
}

function openTextExecutor() {
  return createOpenFullTextExecutor({
    acquire: async ({ doi }) => acquisition(documentIndex(doi)),
    unpaywallConfig: { email: "research@example.test" }
  });
}

function documentIndex(
  doi: string,
  text = `Complete methods and results for ${doi}.`
): AuditableDocumentIndex {
  const textHash = hash(text);
  return {
    source: {
      provider: "unpaywall_open_location",
      primary_identifier: doi,
      canonical_url: `https://repository.example.test/${encodeURIComponent(doi)}.pdf`,
      doi,
      title: `Exact study ${doi}`,
      version: "acceptedVersion",
      format: "pdf_text",
      content_sha256: hash(`pdf:${text}`),
      document_completeness: "full_text_with_body",
      identity_verification: "doi_exact"
    },
    section_paths: [["Page 1"]],
    blocks: [{
      block_id: `pdf_000001_${textHash.slice(0, 12)}`,
      kind: "page_text",
      section_path: ["Page 1"],
      page_number: 1,
      text,
      text_sha256: textHash
    }]
  };
}

function acquisition(index: AuditableDocumentIndex) {
  return okEnvelope({
    provider: "open_full_text",
    recordType: "open_full_text_acquisition",
    primaryIdentifier: index.source.doi!,
    sourceIdentity: { canonical_url: index.source.canonical_url },
    pagination: { returned: 1, exhausted: true },
    accessStatus: "complete",
    limitations: ["Method audit required."],
    data: {
      requested_doi: index.source.doi!,
      requested_pmcid: index.source.pmcid,
      outcome: "full_text_indexed",
      discovery_attempts: [{ route: "unpaywall", result: "indexed", identifier: index.source.doi }],
      document_index: index
    } satisfies OpenFullTextAcquisitionData
  });
}

function studyAudit(index: AuditableDocumentIndex): StudyMethodAuditSubmission {
  const block = index.blocks[0]!.block_id;
  return {
    source_primary_identifier: index.source.primary_identifier,
    source_content_sha256: index.source.content_sha256,
    design_label: "parallel comparison",
    design_capability_statement: "The design label does not establish reliability; exact implementation and methods remain separately audited.",
    population_and_stage: "The exact enrolled population and baseline stage in the source.",
    intervention_program: program("specified intervention"),
    comparator_program: program("specified comparator"),
    outcome_and_horizon: "The exact source outcome and horizon.",
    domain_findings: STUDY_METHOD_AUDIT_DOMAINS.map((domain) => ({
      domain,
      status: "limitation_identified" as const,
      plain_language_finding: `The ${domain.replaceAll("_", " ")} domain was inspected and has a bounded limitation.`,
      evidence_block_ids: [block],
      unresolved_fields: []
    })),
    claim_capabilities: [{
      claim: "The exact compared programs can be described for the recorded outcome horizon.",
      capability: "can_support",
      reason: "The cited source block describes that bounded contrast.",
      evidence_block_ids: [block]
    }, {
      claim: "The study proves every treatment in the umbrella category works.",
      capability: "cannot_support",
      reason: "Only one exact implementation and comparison were inspected.",
      evidence_block_ids: [block]
    }]
  };
}

function externalStudyAudit(
  source: ResearchFormalEvidenceState["sources"][number],
  output: StudyExternalEvidenceAuditOutput
): StudyMethodAuditExternalSubmission {
  const base = studyAudit(documentIndex(source.identity.doi!));
  const referenceBase = {
    external_receipt_payload_sha256: output.receipt.receipt_payload_sha256,
    study_identity_hash: output.study_identity.identity_hash
  };
  const references: StudyMethodAuditExternalSubmission["domain_findings"][number]["external_evidence_references"] = [];
  for (const attempt of output.bundle.provider_attempts) {
    references.push({
      ...referenceBase,
      provider: attempt.provider,
      item_kind: "provider_attempt",
      item_hash: hash(canonicalJson(attempt))
    });
  }
  for (const event of output.bundle.publication_integrity.events) {
    for (const provider of new Set(event.assertions.map(({ provider }) => provider))) {
      references.push({
        ...referenceBase,
        provider,
        item_kind: "publication_integrity_event",
        item_hash: event.event_hash
      });
    }
  }
  for (const relationship of output.bundle.replication_relationships) {
    references.push({
      ...referenceBase,
      provider: relationship.provider,
      item_kind: "replication_relationship",
      item_hash: relationship.relationship_hash
    });
  }
  for (const thread of output.bundle.postpublication_threads) {
    for (const message of thread.messages) {
      references.push({
        ...referenceBase,
        provider: thread.provider,
        item_kind: "postpublication_message",
        item_hash: message.content_hash
      });
    }
  }
  for (const context of output.bundle.citation_contexts) {
    references.push({
      ...referenceBase,
      provider: context.provider,
      item_kind: "citation_context",
      item_hash: context.aggregate_hash
    });
  }
  for (const link of output.bundle.review_ancestry) {
    references.push({
      ...referenceBase,
      provider: link.provider,
      item_kind: "review_ancestry",
      item_hash: link.link_hash
    });
  }
  for (const judgment of output.bundle.imported_risk_of_bias) {
    references.push({
      ...referenceBase,
      provider: "review_risk_of_bias",
      item_kind: "imported_risk_of_bias",
      item_hash: judgment.judgment_hash
    });
  }
  const uniqueReferences = [...new Map(references.map((reference) => [
    `${reference.provider}:${reference.item_kind}:${reference.item_hash}`,
    reference
  ])).values()];
  if (uniqueReferences.length === 0) {
    throw new Error("Fixture external audit needs at least one exact provider item");
  }
  return {
    ...base,
    domain_findings: base.domain_findings.map((finding) => ({
      ...finding,
      ...(finding.domain === "replication_contradiction_and_evidence_ancestry"
        ? {
          plain_language_finding: "The exact external provider items and any linked work were inspected under their source-scoped limitations; provider labels were not accepted as results by themselves.",
          unresolved_fields: []
        }
        : {}),
      external_evidence_references:
        finding.domain === "replication_contradiction_and_evidence_ancestry"
          ? uniqueReferences
          : []
    })),
    external_evidence_binding: {
      external_receipt_payload_sha256: output.receipt.receipt_payload_sha256,
      study_identity_hash: output.study_identity.identity_hash,
      bundle_hash: output.bundle.bundle_hash
    }
  };
}

function program(name: string) {
  return {
    name,
    components: [`${name} component`],
    dose_or_intensity: "described",
    frequency: "described",
    duration: "described",
    supervision: "described",
    adherence: "described",
    co_interventions: [],
    care_stage: "nonsurgical" as const
  };
}

function externalCoordinator(input: {
  protocols?: typeof PROTOCOLS;
  withRetractionAndReplication?: boolean;
  withReplicationOnly?: boolean;
  forrtPartial?: boolean;
  withOptionalEvidence?: boolean;
} = {}) {
  return createStudyExternalEvidenceCoordinator({
    protocolManifests: input.protocols ?? PROTOCOLS,
    crossrefConfig: { mailto: "research@example.test" },
    receiptSecret: SECRET,
    receiptKeyId: "external-v1",
    artifactStore: createInMemoryEvidenceArtifactStore({
      now: () => new Date("2026-08-24T03:00:00.000Z")
    }),
    now: () => new Date("2026-08-24T03:00:00.000Z"),
    providers: {
      crossref: vi.fn(async (doi) => crossrefEnvelope(
        doi,
        input.withRetractionAndReplication ? [retractionEvent(doi)] : []
      )),
      forrt: vi.fn(async (doi) => input.forrtPartial
        ? forrtPartialEnvelope(doi)
        : forrtEnvelope(
          doi,
          input.withRetractionAndReplication || input.withReplicationOnly
            ? [replication(doi)]
            : []
        )),
      ...(input.withOptionalEvidence
        ? {
          pubpeer: vi.fn(async (doi) => pubpeerEnvelope(doi)),
          epistemonikos: vi.fn(async (doi) => epistemonikosEnvelope(doi))
        }
        : {})
    }
  });
}

function pubpeerEnvelope(
  doi: string
): ProvenanceEnvelope<PubpeerPostPublicationLookupData> {
  return adaptPubpeerAuthorizedRecord(doi, {
    record_kind: "response",
    contract_version: "askrigor.pubpeer-authorized-response.v1",
    retrieved_at: "2026-08-24T02:59:30.000Z",
    doi,
    thread: {
      thread_id: "formal-pubpeer-thread",
      provider_record_id: "formal-pubpeer-publication",
      canonical_url: "https://pubpeer.com/publications/FORMAL",
      provider_reported_message_count: 1,
      messages: [{
        message_id: "formal-pubpeer-message",
        role: "comment",
        posted_at: "2026-08-24T02:59:00.000Z",
        updated_at: null,
        provider_revision_id: null,
        revision_state: "current_visible",
        text: "A source-linked concern requiring independent audit.",
        links: [],
        classification: { raw_label: "methodological", source: "provider" }
      }]
    },
    pagination: {
      returned: 1,
      provider_reported_total: 1,
      page_size: 100,
      next_cursor: null,
      exhausted: true
    }
  });
}

function epistemonikosEnvelope(
  doi: string
): ProvenanceEnvelope<EpistemonikosReviewAncestryLookupData> {
  return adaptEpistemonikosAuthorizedRecord(doi, {
    record_kind: "response",
    contract_version: "askrigor.epistemonikos-authorized-response.v1",
    retrieved_at: "2026-08-24T02:59:40.000Z",
    doi,
    source_document_id: "formal-epistemonikos-source",
    source_title: `External identity ${doi}`,
    ancestry: [{
      provider_record_id: "formal-epistemonikos-relation",
      relationship: "review_includes_study",
      raw_relationship: "included",
      relation_state: "current",
      classification: { raw_label: "systematic review", source: "provider" },
      review: {
        doi: "10.5555/formal.review",
        pmid: null,
        title: "Formal evidence review",
        first_author: "Reviewer",
        year: 2025
      }
    }],
    pagination: {
      returned: 1,
      provider_reported_total: 1,
      page_size: 100,
      next_cursor: null,
      exhausted: true
    }
  });
}

function crossrefEnvelope(
  doi: string,
  events: PublicationIntegrityEvent[]
): ProvenanceEnvelope<CrossrefPublicationIntegrityData> {
  return okEnvelope({
    provider: "crossref",
    recordType: "publication_integrity",
    primaryIdentifier: doi,
    retrievedAt: "2026-08-24T02:58:00.000Z",
    sourceIdentity: {
      canonical_url: `https://doi.org/${doi}`,
      title: `External identity ${doi}`,
      authors_or_channel: ["Researcher"]
    },
    accessStatus: "metadata_only",
    pagination: { returned: 1, exhausted: true },
    data: {
      doi,
      record_state: events.length === 0
        ? "no_update_marker_found"
        : "active_retraction_or_withdrawal",
      events,
      sources_checked: ["crossref"]
    }
  });
}

function forrtEnvelope(
  doi: string,
  relationships: ExternalStudyRelationship[]
): ProvenanceEnvelope<ForrtReplicationLookupData> {
  return okEnvelope({
    provider: "forrt",
    recordType: "replication_relationships",
    primaryIdentifier: doi,
    retrievedAt: "2026-08-24T02:59:00.000Z",
    sourceIdentity: { canonical_url: `https://doi.org/${doi}` },
    accessStatus: "metadata_only",
    pagination: { returned: relationships.length, exhausted: true },
    limitations: ["Provider-scoped relationship coverage."],
    data: {
      doi,
      lookup_status: relationships.length === 0
        ? "no_match_in_provider"
        : "records_available",
      relationships,
      rejected_relationship_rows: 0,
      coverage_statement: "FORRT provider scope only."
    }
  });
}

function forrtPartialEnvelope(
  doi: string
): ProvenanceEnvelope<ForrtReplicationLookupData> {
  return okEnvelope({
    provider: "forrt",
    recordType: "replication_relationships",
    primaryIdentifier: doi,
    retrievedAt: "2026-08-24T02:59:00.000Z",
    sourceIdentity: { canonical_url: `https://doi.org/${doi}` },
    accessStatus: "partial",
    pagination: { returned: 0, exhausted: false },
    limitations: ["Only a bounded provider page was available."],
    data: {
      doi,
      lookup_status: "no_match_in_provider",
      relationships: [],
      rejected_relationship_rows: 0,
      coverage_statement: "Partial FORRT provider scope only."
    }
  });
}

function retractionEvent(doi: string): PublicationIntegrityEvent {
  const assertionCore = {
    provider: "crossref" as const,
    assertion_source: "publisher" as const,
    raw_source: "publisher",
    relation_direction: "inbound" as const,
    provider_record_id: "notice-1",
    raw_relation_type: "updated-by",
    raw_type: "retraction",
    raw_label: "Retraction",
    asserted_at: "2026-01-01T00:00:00.000Z"
  };
  return publicationIntegrityEventSchema.parse({
    sequence: 0,
    event_kind: "retraction",
    event_date: "2026-01-01",
    original_doi: doi,
    notice_doi: "10.5555/formal.notice",
    reasons: [],
    assertions: [{
      ...assertionCore,
      assertion_hash: hash(JSON.stringify(assertionCore))
    }],
    event_hash: hash(`retraction:${doi}`)
  });
}

function replication(doi: string): ExternalStudyRelationship {
  const original = providerIdentity(doi);
  const repetition = providerIdentity("10.5555/formal.replication");
  const core = {
    relationship_kind: "replication" as const,
    relation_direction: "original_to_repetition" as const,
    original_identity: original,
    repetition_identity: repetition,
    provider: "forrt" as const,
    provider_record_id: "replication-1",
    provider_reported_outcome: "failed" as const,
    raw_provider_outcome: "failed",
    implementation_match_audit_status: "not_started" as const,
    linked_source_audit_status: "not_started" as const,
    limitations: ["Provider-reported only."]
  };
  return externalStudyRelationshipSchema.parse({
    ...core,
    relationship_hash: hash(JSON.stringify(core))
  });
}

function providerIdentity(doi: string) {
  const core = {
    doi,
    title: `Study ${doi}`,
    identity_status: "provider_reported" as const,
    identity_basis: ["provider_reported_doi" as const]
  };
  return { ...core, identity_hash: hash(JSON.stringify(core)) };
}

function protocolTuple() {
  return [{
    protocol: "universal" as const,
    name: PROTOCOLS.universal.name,
    version: PROTOCOLS.universal.version,
    revision_date: PROTOCOLS.universal.revisionDate,
    sha256: PROTOCOLS.universal.sha256
  }, {
    protocol: "hrp" as const,
    name: PROTOCOLS.hrp.name,
    version: PROTOCOLS.hrp.version,
    revision_date: PROTOCOLS.hrp.revisionDate,
    sha256: PROTOCOLS.hrp.sha256
  }] as const;
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}
