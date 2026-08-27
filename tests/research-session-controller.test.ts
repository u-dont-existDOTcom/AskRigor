import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  RESEARCH_MODULE_IDS,
  RESEARCH_OPERATION_IDS,
  applyProtocolRecheck,
  applyServerModuleApplicability,
  assertResearchSessionTransition,
  createBidirectionalIterationWorkPackage,
  createCandidateScreeningWorkPackage,
  createInitialResearchSessionState,
  createReportSynthesisEvidenceContext,
  createReportSynthesisWorkPackage,
  createResearchSessionStore,
  createTreatmentLandscapeWorkPackage,
  createVideoEvidenceWorkPackage,
  deriveResearchFinalizationLimitations,
  deriveResearchFinalizationReadiness,
  deriveRequiredNextCapabilities,
  deriveResearchOutputBoundary,
  evaluateResearchFinalization,
  executeResearchSessionFinalCompletionAudit,
  finalizationDecisionSchema,
  finalizationPermitSchema,
  ingestReportSynthesisSubmission,
  initialResearchReportState,
  mapTreatmentLandscapeBoundary,
  projectResearchSessionView,
  protocolBindingsFromManifests,
  reconcileRestoredResearchSessionState,
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  recordAutomatedScoutProgress,
  recordCandidateScreeningCompletion,
  recordDiscussionDepthResult,
  recordNativeYoutubeDiscovery,
  recordResearchSessionBidirectionalIteration,
  recordResearchSessionReport,
  recordResearchSessionTreatmentLandscape,
  recordResearchSessionVideoEvidence,
  recordTranscriptDepthResult,
  researchSessionStateSchema,
  sourceMaterialDigest,
  sourceRecordSha256,
  verifyResearchFinalizationPermit,
  ResearchFinalizationPermitError,
  type FinalizationPermit,
  type ResearchSessionState
} from "../apps/research-mcp/src/index.js";
import { deriveGeminiYoutubeCandidateFrontier } from "../packages/sources/src/index.js";
import {
  RESEARCH_FIXTURE_VIDEO_IDS,
  nativeSearchQuotaSurvey,
  nativeSurvey,
  rejectedResearchReceipt,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";
import {
  discussionOutput,
  screeningSubmissionFor,
  transcriptOutput
} from "./helpers/research-video-depth-fixtures.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const SESSION_ID = `ars1_${"A".repeat(32)}`;
const OTHER_SESSION_ID = `ars1_${"B".repeat(32)}`;
const FINALIZATION_SECRET = "phase-f-finalization-secret-that-is-at-least-thirty-two-bytes";
const FINALIZATION_KEY_ID = "phase-f-test-key";
const FINALIZATION_NOW = new Date("2026-08-24T12:00:00.000Z");
const LIVE_PARTIAL_SCOUT_VIDEO_IDS = [
  "SparkVid001",
  "SparkVid002",
  "SparkVid003",
  "SparkVid004",
  "SparkVid005",
  "SparkVid006",
  "SparkVid007",
  "SparkVid008"
] as const;

function manifest(protocol: "universal" | "hrp", hash?: string) {
  return {
    name: protocol === "universal" ? "Universal Instructions" : "Health Research Protocol",
    version: protocol === "universal" ? "20.5.14" : "20.5.22",
    revisionDate: protocol === "universal" ? "2026-08-18" : "2026-08-23",
    sha256: hash ?? (protocol === "universal" ? HASH_A : HASH_B)
  };
}

function initialState(): ResearchSessionState {
  return createInitialResearchSessionState({
    research_target: "de-identified treatment comparison",
    diagnosis_status: "diagnosis_not_specified"
  }, protocolBindingsFromManifests(manifest("universal"), manifest("hrp")));
}

function scoutComplete(state = initialState()): ResearchSessionState {
  return recordAutomatedScoutCompletion(state, {
    providerResponseId: "interaction-1",
    packet: researchPacket(),
    receipt: researchReceipt()
  });
}

function livePartialScout(state = initialState()): ResearchSessionState {
  const packet = researchPacket();
  const receipt = researchReceipt();
  const rejected = rejectedResearchReceipt().rejected_candidates[0]!;
  const validatedIds = LIVE_PARTIAL_SCOUT_VIDEO_IDS.slice(0, 6);
  const rejectedId = LIVE_PARTIAL_SCOUT_VIDEO_IDS[6];
  const unresolvedId = LIVE_PARTIAL_SCOUT_VIDEO_IDS[7];
  return recordAutomatedScoutCompletion(state, {
    providerResponseId: "interaction-live-partial",
    packet: {
      ...packet,
      candidates: LIVE_PARTIAL_SCOUT_VIDEO_IDS.map((videoId, index) => ({
        ...packet.candidates[index % packet.candidates.length]!,
        video_id: videoId,
        canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
        title: `Spark candidate ${index + 1}`,
        channel: `Spark channel ${index + 1}`,
        provisional_specific_program: `Spark program ${index + 1}`
      })),
      suggested_seed_video_ids: [LIVE_PARTIAL_SCOUT_VIDEO_IDS[0]]
    },
    receipt: {
      ...receipt,
      status: "partial",
      candidate_frontier: deriveGeminiYoutubeCandidateFrontier(
        LIVE_PARTIAL_SCOUT_VIDEO_IDS,
        validatedIds,
        [rejectedId],
        [unresolvedId]
      ),
      validated_candidates: validatedIds.map((videoId, index) => ({
        ...receipt.validated_candidates[index % receipt.validated_candidates.length]!,
        video_id: videoId,
        canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
        provider_metadata: {
          ...receipt.validated_candidates[index % receipt.validated_candidates.length]!
            .provider_metadata,
          title: `Spark candidate ${index + 1}`,
          channel_title: `Spark channel ${index + 1}`
        },
        gemini_provisional_annotations: {
          ...receipt.validated_candidates[index % receipt.validated_candidates.length]!
            .gemini_provisional_annotations,
          specific_program: `Spark program ${index + 1}`
        }
      })),
      rejected_candidates: [{ ...rejected, video_id: rejectedId }],
      unresolved_candidates: [{
        video_id: unresolvedId,
        metadata_access_status: "rate_limited",
        retryable: true,
        provider_error_code: "youtube_rate_limited",
        limitations: ["Retryable fixture boundary."]
      }],
      suggested_seed_receipts: [{
        video_id: LIVE_PARTIAL_SCOUT_VIDEO_IDS[0],
        disposition: "eligible",
        reasons: []
      }],
      eligible_seed_video_ids: [LIVE_PARTIAL_SCOUT_VIDEO_IDS[0]]
    }
  });
}

function completedDecisionStudy(
  hypothesisId: string
): ResearchSessionState["formal_evidence"]["sources"][number] {
  const sourceId = "1".repeat(64);
  const contentHash = "2".repeat(64);
  const methodHash = "3".repeat(64);
  const capabilityHash = "4".repeat(64);
  const externalReceiptHash = "5".repeat(64);
  const forrtAttemptHash = "6".repeat(64);
  const pubpeerAttemptHash = "7".repeat(64);
  const claimLocalLimitations = [{
    claim_id: "provider_coverage:pubpeer",
    limitation: "PubPeer was not configured for this exact study.",
    source_item_hashes: [pubpeerAttemptHash]
  }, {
    claim_id: "forrt_relationship_coverage",
    limitation: "The replication-registry result is provider-scoped and does not rule out related work elsewhere.",
    source_item_hashes: [forrtAttemptHash]
  }];
  return {
    source_id: sourceId,
    hypothesis_ids: [hypothesisId],
    origins: [{
      provider: "pubmed",
      provider_record_id: "12345678",
      canonical_url: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
      hypothesis_ids: [hypothesisId],
      provider_access_status: "metadata_only",
      source_record_hash: "8".repeat(64)
    }],
    identity: {
      doi: "10.1234/phase-f-fixture",
      pmid: "12345678",
      title: "Exact decision study fixture",
      first_author: "Fixture",
      year: 2026,
      version: "published",
      identity_status: "EXTERNAL_VERIFIED",
      identity_hash: "9".repeat(64)
    },
    source_kind: "SCIENTIFIC_STUDY",
    abstract_visibility: "ABSTRACT_PRESENT",
    screening_status: "SCREENED",
    decision_importance: "DECISION_IMPORTANT",
    possible_decision_impact: "ranking_changing",
    screening_rationale: "Exact comparative study used by the completion fixture.",
    full_text: {
      status: "EXHAUSTED",
      document_handle: `aft1_${"T".repeat(32)}`,
      requested_doi: "10.1234/phase-f-fixture",
      discovery_attempts: [{
        route: "europe_pmc",
        result: "indexed",
        identifier: "PMC12345678"
      }],
      source_primary_identifier: "PMC12345678",
      source_canonical_url: "https://europepmc.org/articles/PMC12345678",
      source_version: "published",
      source_content_sha256: contentHash,
      source_block_count: 1,
      source_segment_count: 1,
      source_segments_retrieved_cumulative: 1,
      synthesis_lock: "pass",
      unseen_content_used_as_evidence: false
    },
    method_audit: {
      status: "COMPLETE",
      audit_kind: "STUDY",
      audit_sha256: methodHash,
      source_content_sha256: contentHash,
      source_primary_identifier: "PMC12345678",
      claim_capability_digest: capabilityHash,
      reader_evidence: {
        audit_kind: "STUDY",
        source_content_sha256: contentHash,
        audit_sha256: methodHash,
        design_label: "Randomized comparative study",
        design_capability_statement: "Supports the exact studied comparison, population, outcomes, and horizon subject to the audited limitations.",
        population_and_stage: "Adults in the exact decision population and stage.",
        intervention_program: reportProgram("Intervention program"),
        comparator_program: reportProgram("Comparator program"),
        outcome_and_horizon: "Walking and symptom outcomes at the reported follow-up.",
        method_findings: [{
          finding_id: "e".repeat(64),
          domain: "allocation and follow-up",
          status: "adequate",
          plain_language_finding: "The source blocks support the audited design description.",
          evidence_block_ids: ["jats_000001_aaaaaaaaaaaa"],
          unresolved_fields: []
        }],
        claim_capabilities: [{
          capability_id: capabilityHash,
          claim: "The exact intervention and comparator can be compared for the reported outcome and horizon.",
          capability: "can_support",
          reason: "The complete audited study directly reports this comparison.",
          evidence_block_ids: ["jats_000001_aaaaaaaaaaaa"]
        }, {
          capability_id: "f".repeat(64),
          claim: "The study proves effects in every disease stage and program implementation.",
          capability: "cannot_support",
          reason: "The audited population and programs are narrower.",
          evidence_block_ids: ["jats_000001_aaaaaaaaaaaa"]
        }]
      },
      external_receipt_payload_sha256: externalReceiptHash,
      external_bound_audit_sha256: "a".repeat(64)
    },
    external_evidence: {
      status: "COMPLETE",
      study_identity_hash: "9".repeat(64),
      receipt_payload_sha256: externalReceiptHash,
      bundle_hash: "b".repeat(64),
      provider_attempt_hashes: ["c".repeat(64), forrtAttemptHash, pubpeerAttemptHash],
      provider_coverage: [{
        provider: "crossref",
        provider_outcome: "records_available",
        access_status: "metadata_only",
        attempt_sha256: "c".repeat(64)
      }, {
        provider: "forrt",
        provider_outcome: "no_match_in_provider",
        access_status: "complete",
        attempt_sha256: forrtAttemptHash
      }, {
        provider: "pubpeer",
        provider_outcome: "not_configured",
        access_status: "inaccessible",
        attempt_sha256: pubpeerAttemptHash
      }],
      publication_integrity: {
        record_state: "no_update_marker_found",
        events: []
      },
      controller_directives: [{
        directive: "disclose_provider_coverage_gap",
        source_item_hash: pubpeerAttemptHash
      }],
      unresolved_item_hashes: [],
      claim_local_limitation_hashes: claimLocalLimitations.map(testJsonHash),
      claim_local_limitations: claimLocalLimitations,
      linked_work: [],
      possible_decision_impact: "detail_only",
      effect_claims_excluded: false
    },
    claim_capability: {
      status: "CURRENT",
      capability_digest: capabilityHash,
      method_audit_sha256: methodHash,
      external_receipt_payload_sha256: externalReceiptHash,
      unrestricted_decision_use: true
    }
  };
}

function reportProgram(name: string) {
  return {
    name,
    components: ["Exact described component"],
    dose_or_intensity: "As described in the audited source",
    frequency: "As described in the audited source",
    duration: "As described in the audited source",
    supervision: "As described in the audited source",
    adherence: "As reported in the audited source",
    co_interventions: [],
    care_stage: "nonsurgical" as const
  };
}

function testJsonHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function completionFixture(): ResearchSessionState {
  const packet = structuredClone(researchPacket());
  const receipt = structuredClone(researchReceipt());
  packet.candidates[0]!.provisional_specific_program = "named program one";
  receipt.validated_candidates[0]!.gemini_provisional_annotations.specific_program =
    "named program one";
  const routed = applyServerModuleApplicability(
    initialState(),
    Object.fromEntries(RESEARCH_MODULE_IDS
      .filter((moduleId) => !["HRP", "FINAL_COMPLETION_AUDIT"].includes(moduleId))
      .map((moduleId) => [moduleId, "REQUIRED"])),
    "SERVER_ROUTER"
  );
  let initial = recordAutomatedScoutCompletion(routed, {
    providerResponseId: "interaction-narrow-completion",
    packet,
    receipt
  });
  const discovered = recordNativeYoutubeDiscovery(initial, nativeSurvey());
  const candidateWork = createCandidateScreeningWorkPackage(
    discovered.candidate_discovery
  );
  let state = recordCandidateScreeningCompletion(
    discovered,
    {
      package_version: candidateWork.package_version,
      discovery_digest: candidateWork.discovery_digest,
      decisions: discovered.candidate_discovery.candidates.map((candidate) => ({
        video_id: candidate.video_id,
        materiality: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
          ? "MATERIAL" as const
          : "NOT_MATERIAL" as const,
        redundancy: "DISTINCT" as const,
        selection_status: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
          ? "SELECTED" as const
          : "NOT_SELECTED" as const,
        rationale: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
          ? "Only material program in the narrow completion fixture."
          : "Screened as not decision relevant in the narrow completion fixture."
      }))
    }
  );
  for (const videoId of state.video_depth.selected_video_ids) {
    const transcript = transcriptOutput(videoId);
    const discussion = discussionOutput(videoId);
    state = recordTranscriptDepthResult(state, videoId, transcript);
    state = recordDiscussionDepthResult(
      state,
      videoId,
      undefined,
      discussion
    );
    const transcriptReceiptSha256 = sourceRecordSha256(
      transcript.coverage_receipt
    );
    const discussionReceiptSha256 = sourceRecordSha256(
      discussion.coverage_receipt
    );
    const transcriptSegments = transcript.data.map((segment) => ({
      ...segment,
      record_sha256: sourceRecordSha256(segment)
    }));
    const material = {
      video_id: videoId,
      transcript_receipt_sha256: transcriptReceiptSha256,
      discussion_receipt_sha256: discussionReceiptSha256,
      transcript_segments: transcriptSegments,
      discussion_comments: [],
      source_material_digest: sourceMaterialDigest({
        video_id: videoId,
        transcript_receipt_sha256: transcriptReceiptSha256,
        discussion_receipt_sha256: discussionReceiptSha256,
        transcript_record_sha256s: transcriptSegments.map(({ record_sha256 }) =>
          record_sha256
        ),
        discussion_record_sha256s: []
      })
    };
    const videoWork = createVideoEvidenceWorkPackage(
      state.bounded_evidence,
      state.candidate_discovery,
      state.video_depth,
      material
    );
    state = recordResearchSessionVideoEvidence(state, material, {
      package_version: videoWork.package_version,
      evidence_basis_digest: videoWork.evidence_basis_digest,
      video_id: videoId,
      creator_findings: [{
        finding_type: "program",
        plain_language: "The creator describes the exact selected program.",
        transcript_segment_sha256s: [transcriptSegments[0]!.record_sha256],
        program: reportProgram("Selected video program")
      }],
      community_findings: [],
      limitations: ["The public discussion sample contained no analyzable records."]
    });
  }
  const operations = structuredClone(state.operations);
  for (const operationId of [
    "formal_evidence_search",
    "accessible_full_text_acquisition",
    "study_method_audit",
    "external_study_evidence_audit",
    "linked_replication_and_review_audit",
    "claim_capability_recalculation"
  ] as const) operations[operationId] = { status: "COMPLETE" };
  const formalEvidence = structuredClone(state.formal_evidence);
  for (const hypothesis of formalEvidence.hypotheses) {
    for (const search of hypothesis.provider_searches) {
      search.status = "COMPLETE";
      search.pages_retrieved = 1;
      search.records_returned_cumulative = 0;
      search.page_receipt_hashes = ["d".repeat(64)];
      search.access_statuses = ["complete"];
    }
  }
  formalEvidence.sources.push(completedDecisionStudy(
    formalEvidence.hypotheses[0]!.hypothesis_id
  ));
  let ready = researchSessionStateSchema.parse({
    ...state,
    operations,
    formal_evidence: formalEvidence
  });
  const work = createBidirectionalIterationWorkPackage(
    ready.bidirectional_iteration,
    {
      candidates: ready.candidate_discovery,
      videoDepth: ready.video_depth,
      formalEvidence: ready.formal_evidence
    }
  );
  ready = recordResearchSessionBidirectionalIteration(ready, {
    package_version: work.package_version,
    evidence_basis_digest: work.evidence_basis_digest,
    round_number: work.round_number,
    community_to_formal_assessments: work.community_evidence.map(({ evidence_ref_id }) => ({
      evidence_ref_id,
      disposition: "NO_NEW_MATERIAL_TRANSFER",
      rationale: "Fixture has no new material community-to-formal transfer."
    })),
    formal_to_community_assessments: work.formal_evidence.map(({ evidence_ref_id }) => ({
      evidence_ref_id,
      disposition: "NO_NEW_MATERIAL_TRANSFER",
      rationale: "Fixture has no new material formal-to-community transfer."
    })),
    transfers: [],
    discordances: []
  });
  const treatmentWork = createTreatmentLandscapeWorkPackage(
    ready.treatment_finalization,
    {
      researchTarget: ready.research_target,
      candidates: ready.candidate_discovery,
      videoDepth: ready.video_depth,
      formalEvidence: ready.formal_evidence,
      bidirectional: ready.bidirectional_iteration
    }
  );
  const material = treatmentWork.candidates.find(({ materiality }) =>
    materiality === "MATERIAL"
  )!;
  const batch = treatmentWork.discovery_batches.find(({ query_or_scope }) =>
    query_or_scope.includes("named program one")
  )!;
  ready = recordResearchSessionTreatmentLandscape(ready, {
    package_version: treatmentWork.package_version,
    evidence_basis_digest: treatmentWork.evidence_basis_digest,
    attempt: treatmentWork.attempt,
    broad_treatment_choice: false,
    specific_implementation_searches: [{
      search_id: "specific_named_program_one",
      discovery_batch_id: batch.batch_id,
      treatment_class_id: material.treatment_class_id,
      implementation_terms: ["named program one"],
      discriminator_terms: ["condition"],
      candidate_video_ids: [material.video_id]
    }],
    directional_search_batches: {
      benefit: [],
      no_effect_or_failure: [],
      harm: [],
      discontinuation: [],
      eventual_standard_treatment: []
    },
    selected_video_interpretations: treatmentWork.selected_videos.map(({ video_id }) => ({
      video_id,
      stage_or_baseline: "Population and stage described by the exact source.",
      outcome_and_horizon: "Walking outcome at the reported horizon.",
      nonredundant_value: "Only material program in the narrow completion fixture.",
      what_it_changed: "Added source-bound real-world implementation evidence."
    })),
    further_expansion_likely_to_improve_answer: "no"
  });
  const limitations = deriveResearchFinalizationLimitations(ready).map((item) => ({
    limitation_id: item.limitation_id,
    plain_language: item.plain_language
  }));
  const reportWork = createReportSynthesisWorkPackage(ready.report, {
    researchTarget: ready.research_target,
    candidates: ready.candidate_discovery,
    boundedEvidence: ready.bounded_evidence,
    formalEvidence: ready.formal_evidence,
    treatment: ready.treatment_finalization,
    limitations
  });
  const reportContext = createReportSynthesisEvidenceContext({
    researchTarget: ready.research_target,
    candidates: ready.candidate_discovery,
    boundedEvidence: ready.bounded_evidence,
    formalEvidence: ready.formal_evidence,
    treatment: ready.treatment_finalization,
    limitations
  });
  const creator = reportContext.videos[0]!.evidence.creator_findings[0]!;
  ready = recordResearchSessionReport(ready, {
    package_version: reportWork.package_version,
    evidence_basis_digest: reportWork.evidence_basis_digest,
    packet: {
      packet_version: "askrigor_reader_report_v1",
      evidence_basis_digest: reportWork.evidence_basis_digest,
      report_scope: "comparative_synthesis",
      title: "De-identified treatment comparison",
      public_boundary: "This is population-level evidence research, not a personal diagnosis or treatment directive.",
      bottom_line: ["The exact audited comparison supports a bounded population-level conclusion."],
      comparative_conclusion: "For the exact studied population and programs, the audited evidence supports the reported comparison.",
      claims: [{
        claim_kind: "comparative_effect",
        wording: "The exact audited intervention and comparator differed for the reported walking outcome at follow-up.",
        inference: "direct",
        population_or_stage: "Adults in the exact audited decision population.",
        program: reportProgram("Intervention program"),
        outcome_and_horizon: "Walking outcome at the reported follow-up.",
        uncertainty: "This does not establish the result for materially different programs or stages.",
        references: [{
          reference_kind: "formal_capability",
          source_id: "1".repeat(64),
          capability_id: "4".repeat(64)
        }]
      }],
      approaches: [{
        approach_name: "Exact intervention program",
        program: reportProgram("Intervention program"),
        population_or_stage: "Adults in the exact audited decision population.",
        outcome_and_horizon: "Walking outcome at the reported follow-up.",
        evidence_summary: "The complete study supports only its exact comparison.",
        claim_indexes: [0]
      }],
      alternatives: ["The exact comparator program."],
      harms_and_counter_signals: ["The public discussion sample contained no analyzable records."],
      uncertainty: ["The finding should not be generalized beyond the audited population and programs."],
      videos_actually_audited: reportContext.videos.map((video) => ({
        video_id: video.video_id,
        canonical_url: video.canonical_url,
        title: video.title,
        channel_title: video.channel_title,
        evidence_status: video.evidence.status,
        creator_finding_ids: video.evidence.creator_findings.map(({ finding_id }) =>
          finding_id
        ),
        community_finding_ids: video.evidence.community_findings.map(({ finding_id }) =>
          finding_id
        ),
        limitations: video.evidence.limitations
      })),
      videos_worth_watching: [{
        video_id: reportContext.videos[0]!.video_id,
        creator_finding_id: creator.finding_id,
        timestamp_url: creator.timestamp_url,
        why_it_is_useful: "It describes the exact selected program at the cited timestamp.",
        boundary: "The creator account is attributed and is not treated as proof of efficacy."
      }],
      provider_and_access_limitations: limitations,
      clinician_review_questions: ["Does the evidence population and exact program match the clinical question?"]
    }
  });
  return executeResearchSessionFinalCompletionAudit(ready);
}

function stateAfterFormalEvidenceChange(
  rawState: ResearchSessionState
): ResearchSessionState {
  return researchSessionStateSchema.parse({
    ...rawState,
    modules: {
      ...rawState.modules,
      FINAL_COMPLETION_AUDIT: {
        ...rawState.modules.FINAL_COMPLETION_AUDIT,
        execution_status: "NOT_STARTED"
      }
    },
    operations: {
      ...rawState.operations,
      treatment_landscape_finalization: { status: "IN_PROGRESS" },
      report_synthesis: { status: "NOT_STARTED" },
      final_completion_audit: { status: "NOT_STARTED" }
    },
    final_completion_audit: undefined
  });
}

describe("research session controller core", () => {
  it("represents every router module explicitly and derives capabilities from state", () => {
    const state = initialState();

    expect(Object.keys(state.modules)).toEqual(RESEARCH_MODULE_IDS);
    expect(state.modules.HRP).toMatchObject({
      applicability: "REQUIRED",
      execution_status: "IN_PROGRESS"
    });
    expect(state.modules.FINAL_COMPLETION_AUDIT).toMatchObject({
      applicability: "REQUIRED",
      execution_status: "NOT_STARTED"
    });
    expect(state.modules.FORUM_SIGNAL.applicability).toBe("UNRESOLVED");
    expect(deriveRequiredNextCapabilities(state)).toEqual([
      "route_module_applicability",
      "automated_video_scout"
    ]);

    expect(deriveRequiredNextCapabilities(scoutComplete(state))).toEqual([
      "route_module_applicability",
      "native_video_discovery"
    ]);
  });

  it("makes REQUIRED applicability monotonic in both controller and store", () => {
    const state = initialState();
    expect(() => applyServerModuleApplicability(
      state,
      { HRP: "NOT_REQUIRED" },
      "SERVER_ROUTER"
    )).toThrow(/cannot be demoted/u);

    const store = createResearchSessionStore({
      random: () => new Uint8Array(24).fill(1)
    });
    const sessionId = store.issue(state);
    const claimed = store.claim(sessionId);
    const forged = researchSessionStateSchema.parse({
      ...claimed,
      modules: {
        ...claimed.modules,
        HRP: {
          applicability: "NOT_REQUIRED",
          execution_status: "NOT_APPLICABLE",
          authority: "SERVER_ROUTER"
        }
      }
    });
    expect(() => store.replace(sessionId, forged)).toThrow(/cannot be demoted/u);
    store.rollback(sessionId);
  });

  it("detects exact protocol drift and keeps it monotonic", () => {
    const state = initialState();
    const drifted = applyProtocolRecheck(
      state,
      protocolBindingsFromManifests(
        manifest("universal", HASH_C),
        manifest("hrp")
      )
    );

    expect(drifted.protocol_binding.currency).toBe("DRIFTED");
    expect(deriveRequiredNextCapabilities(drifted)).toEqual([
      "restart_under_current_protocols"
    ]);
    expect(evaluateResearchFinalization(SESSION_ID, drifted)).toMatchObject({
      authorization: "DENIED",
      output_boundary: "CONTINUE_RESEARCH",
      finalization_permit: null,
      denial_reasons: expect.arrayContaining(["PROTOCOL_DRIFT"])
    });

    const stillDrifted = applyProtocolRecheck(
      drifted,
      protocolBindingsFromManifests(manifest("universal"), manifest("hrp"))
    );
    expect(stillDrifted.protocol_binding.currency).toBe("DRIFTED");
  });

  it("bounds unresolved scout identities while advancing from the validated subset", () => {
    const partial = livePartialScout();

    expect(partial.operations.automated_video_scout).toMatchObject({
      status: "BLOCKED_TERMINAL",
      boundary: {
        classification: "TERMINAL_NONRETRYABLE",
        code: "AUTOMATED_SCOUT_PARTIAL_VALIDATED_FRONTIER"
      }
    });
    expect(deriveRequiredNextCapabilities(partial)).toEqual([
      "route_module_applicability",
      "native_video_discovery"
    ]);
    expect(partial.scout).toMatchObject({
      candidate_count: 8,
      validated_candidate_ids: LIVE_PARTIAL_SCOUT_VIDEO_IDS.slice(0, 6),
      unresolved_candidate_ids: [LIVE_PARTIAL_SCOUT_VIDEO_IDS[7]]
    });
    expect(partial.candidate_discovery.candidates).toHaveLength(6);
  });

  it("keeps a wholly rejected scout packet retryable and blocks native discovery", () => {
    const rejected = recordAutomatedScoutCompletion(initialState(), {
      providerResponseId: "interaction-rejected",
      packet: researchPacket(),
      receipt: rejectedResearchReceipt()
    });

    expect(rejected.operations.automated_video_scout).toMatchObject({
      status: "BLOCKED_RETRYABLE",
      boundary: {
        classification: "RETRYABLE",
        code: "AUTOMATED_SCOUT_PACKET_REJECTED"
      }
    });
    expect(rejected.scout).toMatchObject({
      status: "BLOCKED",
      validation_status: "rejected",
      candidate_count: 3,
      validated_candidate_ids: []
    });
    expect(deriveRequiredNextCapabilities(rejected)).toContain(
      "automated_video_scout"
    );
    expect(deriveRequiredNextCapabilities(rejected)).not.toContain(
      "native_video_discovery"
    );
  });

  it("reconciles a retained partial frontier after a later terminal scout attempt", () => {
    const bounded = livePartialScout();
    const legacyBoundary = {
      classification: "RETRYABLE" as const,
      code: "AUTOMATED_SCOUT_IDENTITIES_UNRESOLVED",
      summary: "Some externally scouted video identities remain unresolved and must be retried."
    };
    const legacy = researchSessionStateSchema.parse({
      ...bounded,
      operations: {
        ...bounded.operations,
        automated_video_scout: {
          status: "BLOCKED_RETRYABLE",
          boundary: legacyBoundary
        }
      },
      scout: {
        ...bounded.scout,
        status: "BLOCKED",
        access_boundary: legacyBoundary
      },
      candidate_discovery: {
        ...bounded.candidate_discovery,
        external_scout: {
          ...bounded.candidate_discovery.external_scout,
          status: "BLOCKED_RETRYABLE"
        }
      }
    });

    const reconciled = reconcileRestoredResearchSessionState(legacy);
    expect(reconciled.candidate_discovery.external_scout).toMatchObject({
      status: "BLOCKED_TERMINAL",
      validated_candidate_video_ids: LIVE_PARTIAL_SCOUT_VIDEO_IDS.slice(0, 6),
      unresolved_candidate_video_ids: [LIVE_PARTIAL_SCOUT_VIDEO_IDS[7]]
    });
    expect(reconciled.operations.automated_video_scout).toMatchObject({
      status: "BLOCKED_TERMINAL",
      boundary: { code: "AUTOMATED_SCOUT_PARTIAL_VALIDATED_FRONTIER" }
    });
    expect(reconciled.candidate_discovery.candidates).toHaveLength(6);
    expect(reconciled.scout).toMatchObject({
      status: "BLOCKED",
      candidate_count: 8,
      validated_candidate_ids: LIVE_PARTIAL_SCOUT_VIDEO_IDS.slice(0, 6),
      unresolved_candidate_ids: [LIVE_PARTIAL_SCOUT_VIDEO_IDS[7]],
      provider_response_id: "interaction-live-partial"
    });
    expect(deriveRequiredNextCapabilities(reconciled)).toContain(
      "native_video_discovery"
    );
    expect(deriveRequiredNextCapabilities(reconciled)).not.toContain(
      "resolve_candidate_identities"
    );
  });

  it("maps treatment boundaries without treating a component lock as global synthesis", () => {
    expect(mapTreatmentLandscapeBoundary("continue_research")).toBe(
      "CONTINUE_RESEARCH"
    );
    expect(mapTreatmentLandscapeBoundary("bounded_nonranking_only")).toBe(
      "BOUNDED_NONRANKING_ONLY"
    );
    expect(mapTreatmentLandscapeBoundary("ledger_consistent_for_synthesis")).toBe(
      "CONTINUE_RESEARCH"
    );
  });

  it("does not equate a valid terminal boundary with completion", () => {
    const boundedScout = recordAutomatedScoutBoundary(initialState(), {
      classification: "TERMINAL_NONRETRYABLE",
      code: "AUTOMATED_SCOUT_TERMINAL_BOUNDARY",
      summary: "The required provider returned a recognized terminal boundary."
    });
    expect(deriveResearchOutputBoundary(boundedScout)).toBe("CONTINUE_RESEARCH");
    expect(deriveRequiredNextCapabilities(boundedScout)).toEqual([
      "route_module_applicability",
      "native_video_discovery"
    ]);
    expect(boundedScout.candidate_discovery.external_scout.status).toBe(
      "BLOCKED_TERMINAL"
    );
    expect(evaluateResearchFinalization(SESSION_ID, boundedScout)).toMatchObject({
      authorization: "DENIED",
      output_boundary: "CONTINUE_RESEARCH",
      required_next_capabilities: [
        "route_module_applicability",
        "native_video_discovery"
      ],
      denial_reasons: expect.arrayContaining([
        "TERMINAL_BOUNDARY_LIMITS_OUTPUT",
        "REQUIRED_OPERATION_INCOMPLETE"
      ])
    });

    const otherwiseFinished = completionFixture();
    const terminalOperation = {
      status: "BLOCKED_TERMINAL" as const,
      boundary: {
        classification: "TERMINAL_NONRETRYABLE" as const,
        code: "FORMAL_SOURCE_TERMINAL_BOUNDARY",
        summary: "One exact source remained inaccessible after lawful acquisition."
      }
    };
    expect(() => researchSessionStateSchema.parse({
      ...otherwiseFinished,
      operations: {
        ...otherwiseFinished.operations,
        accessible_full_text_acquisition: terminalOperation
      }
    })).toThrow(/derived exactly from per-source formal evidence state/u);
  });

  it("records an opaque automated-scout job as executable progress without candidate evidence", () => {
    const progress = recordAutomatedScoutProgress(initialState(), {
      interaction_id: "interaction-background-controller-1",
      phase: "INITIAL",
      provider_interaction_count: 1,
      poll_attempts: 0,
      executed_search_queries: []
    }, 1_000_000_000);

    expect(progress.operations.automated_video_scout).toEqual({
      status: "IN_PROGRESS"
    });
    expect(progress.scout).toMatchObject({
      status: "IN_PROGRESS",
      provider_storage_mode: "TEMPORARY_BACKGROUND_DELETE_PENDING",
      accounted_nano_usd: 1_000_000_000,
      candidate_count: 0,
      background_job: {
        interaction_id: "interaction-background-controller-1",
        phase: "INITIAL"
      }
    });
    expect(progress.candidate_discovery.external_scout.status).toBe("NOT_STARTED");
    expect(deriveRequiredNextCapabilities(progress)).toContain(
      "automated_video_scout"
    );
    expect(deriveRequiredNextCapabilities(progress)).not.toContain(
      "native_video_discovery"
    );
    expect(reconcileRestoredResearchSessionState(progress).scout.background_job)
      .toEqual(progress.scout.background_job);
  });

  it("projects a stable terminal block instead of a continue-without-work exception", () => {
    const routed = applyServerModuleApplicability(
      initialState(),
      Object.fromEntries(RESEARCH_MODULE_IDS
        .filter((moduleId) => !["HRP", "FINAL_COMPLETION_AUDIT"].includes(moduleId))
        .map((moduleId) => [moduleId, "REQUIRED"])),
      "SERVER_ROUTER"
    );
    const externalTerminal = recordAutomatedScoutBoundary(routed, {
      classification: "TERMINAL_NONRETRYABLE",
      code: "AUTOMATED_SCOUT_TERMINAL_BOUNDARY",
      summary: "The external scout reached a terminal boundary."
    });
    const emptySurvey = nativeSurvey();
    emptySurvey.access_status = "inaccessible";
    emptySurvey.candidates = [];
    emptySurvey.searches = emptySurvey.searches.map((search) => ({
      ...search,
      access_status: "inaccessible" as const,
      candidate_video_ids: []
    }));
    const noCandidates = recordNativeYoutubeDiscovery(
      externalTerminal,
      emptySurvey
    );

    expect(deriveResearchOutputBoundary(noCandidates)).toBe("CONTINUE_RESEARCH");
    expect(deriveRequiredNextCapabilities(noCandidates)).toEqual([]);
    expect(projectResearchSessionView(SESSION_ID, noCandidates)).toMatchObject({
      execution_status: "BLOCKED_TERMINAL",
      output_boundary: "CONTINUE_RESEARCH",
      required_next_capabilities: []
    });
  });

  it("continues to candidate screening after exact daily native-search exhaustion", () => {
    const discovered = recordNativeYoutubeDiscovery(
      livePartialScout(),
      nativeSearchQuotaSurvey()
    );

    expect(discovered.operations.native_video_discovery).toEqual({
      status: "BLOCKED_TERMINAL",
      boundary: {
        classification: "TERMINAL_NONRETRYABLE",
        code: "NATIVE_SEARCH_DAILY_QUOTA_EXHAUSTED",
        summary: expect.stringMatching(/current research execution.*validated.*frontier/iu)
      }
    });
    expect(deriveRequiredNextCapabilities(discovered)).toContain(
      "candidate_screening"
    );
    expect(deriveRequiredNextCapabilities(discovered)).not.toContain(
      "native_video_discovery"
    );
    expect(projectResearchSessionView(SESSION_ID, discovered)
      .candidate_screening_work_package?.candidates).toHaveLength(
        6
      );
    expect(discovered.scout.unresolved_candidate_ids).toEqual([
      LIVE_PARTIAL_SCOUT_VIDEO_IDS[7]
    ]);
    expect(deriveResearchFinalizationLimitations(discovered)
      .map(({ plain_language }) => plain_language)).toEqual(expect.arrayContaining([
        expect.stringMatching(/validated subset.*unresolved.*excluded/iu),
        expect.stringMatching(/daily YouTube search allocation.*validated.*frontier/iu)
      ]));
    expect(deriveResearchFinalizationReadiness(discovered)).toBe("CONTINUE_RESEARCH");
  });

  it("issues a signed permit only for a controller-complete execution", () => {
    expect(evaluateResearchFinalization(SESSION_ID, initialState(), {
      signingSecret: FINALIZATION_SECRET,
      keyId: FINALIZATION_KEY_ID,
      now: () => FINALIZATION_NOW
    })).toMatchObject({
      authorization: "DENIED",
      output_boundary: "CONTINUE_RESEARCH",
      finalization_permit: null
    });
    const finished = completionFixture();
    expect(evaluateResearchFinalization(SESSION_ID, finished)).toMatchObject({
      authorization: "DENIED",
      output_boundary: "FINALIZATION_ALLOWED",
      finalization_permit: null,
      denial_reasons: ["FINALIZATION_SIGNING_NOT_CONFIGURED"]
    });
    expect(deriveResearchFinalizationReadiness(finished)).toBe("FINALIZATION_ALLOWED");
    expect(deriveResearchOutputBoundary(finished)).toBe("FINALIZATION_ALLOWED");
    expect(projectResearchSessionView(SESSION_ID, finished)).toMatchObject({
      execution_status: "READY_TO_FINALIZE",
      output_boundary: "FINALIZATION_ALLOWED",
      finalization_permit: null
    });

    const decision = evaluateResearchFinalization(SESSION_ID, finished, {
      signingSecret: FINALIZATION_SECRET,
      keyId: FINALIZATION_KEY_ID,
      now: () => FINALIZATION_NOW
    });
    expect(decision).toMatchObject({
      authorization: "AUTHORIZED",
      output_boundary: "FINALIZATION_ALLOWED",
      reader_facing: { permitted_scope: "comparative_synthesis" },
      required_next_capabilities: []
    });
    if (decision.finalization_permit === null) throw new Error("Missing permit");
    expect(finalizationPermitSchema.parse(decision.finalization_permit)).toMatchObject({
      artifact_kind: "COMPARATIVE_FINALIZATION_PERMIT",
      execution_id: SESSION_ID,
      key_id: FINALIZATION_KEY_ID
    });
    expect(verifyResearchFinalizationPermit(
      decision.finalization_permit,
      SESSION_ID,
      finished,
      {
        signingSecret: FINALIZATION_SECRET,
        keyId: FINALIZATION_KEY_ID,
        now: () => new Date("2026-08-24T12:05:00.000Z")
      }
    )).toEqual(decision.finalization_permit);
    expect(JSON.stringify(decision.finalization_permit)).not.toMatch(
      /de-identified treatment|diagnosis|transcript|comment|provider_body|credential/iu
    );
    expect(JSON.stringify(decision)).not.toMatch(
      /diagnosis_not_specified|Segment 0|raw transcript|raw comment|provider body|credential/iu
    );
  });

  it("rejects caller construction, tampering, expiry, and cross-context replay", () => {
    const finished = completionFixture();
    const decision = evaluateResearchFinalization(SESSION_ID, finished, {
      signingSecret: FINALIZATION_SECRET,
      keyId: FINALIZATION_KEY_ID,
      now: () => FINALIZATION_NOW
    });
    if (decision.finalization_permit === null) throw new Error("Missing permit");
    const permit = decision.finalization_permit;
    const verify = (candidate: FinalizationPermit, state = finished, sessionId = SESSION_ID) =>
      verifyResearchFinalizationPermit(candidate, sessionId, state, {
        signingSecret: FINALIZATION_SECRET,
        keyId: FINALIZATION_KEY_ID,
        now: () => new Date("2026-08-24T12:05:00.000Z")
      });

    expect(finalizationPermitSchema.safeParse({
      permit_version: "askrigor_finalization_permit_v1",
      artifact_kind: "COMPARATIVE_FINALIZATION_PERMIT",
      execution_id: SESSION_ID,
      output_boundary: "FINALIZATION_ALLOWED",
      protocol_identities: finished.protocol_binding.expected,
      state_digest: permit.state_digest,
      authorization_basis_digest: permit.authorization_basis_digest,
      limitations_digest: permit.limitations_digest,
      issued_at: permit.issued_at,
      expires_at: permit.expires_at,
      key_id: permit.key_id,
      domain: permit.domain
    }).success).toBe(false);
    expect(finalizationDecisionSchema.safeParse({
      ...decision,
      state_digest: "d".repeat(64)
    }).success).toBe(false);

    for (const candidate of [{
      ...permit,
      state_digest: "f".repeat(64)
    }, {
      ...permit,
      limitations_digest: "e".repeat(64)
    }, {
      ...permit,
      signature: `${permit.signature.slice(0, -1)}A`
    }] as FinalizationPermit[]) {
      expect(() => verify(candidate)).toThrow(ResearchFinalizationPermitError);
    }
    expect(() => verify(permit, finished, OTHER_SESSION_ID))
      .toThrow(ResearchFinalizationPermitError);
    expect(() => verifyResearchFinalizationPermit(
      permit,
      SESSION_ID,
      finished,
      {
        signingSecret: "different-finalization-secret-that-is-also-at-least-thirty-two-bytes",
        keyId: FINALIZATION_KEY_ID,
        now: () => new Date("2026-08-24T12:05:00.000Z")
      }
    )).toThrow(ResearchFinalizationPermitError);
    expect(() => verifyResearchFinalizationPermit(
      permit,
      SESSION_ID,
      finished,
      {
        signingSecret: FINALIZATION_SECRET,
        keyId: FINALIZATION_KEY_ID,
        now: () => new Date("2026-08-24T12:16:00.000Z")
      }
    )).toThrow(ResearchFinalizationPermitError);

    const drifted = applyProtocolRecheck(
      finished,
      protocolBindingsFromManifests(manifest("universal", HASH_C), manifest("hrp"))
    );
    expect(() => verify(permit, drifted)).toThrow(ResearchFinalizationPermitError);

    const changedReceipt = structuredClone(finished);
    changedReceipt.formal_evidence.sources[0]!.external_evidence
      .receipt_payload_sha256 = "0".repeat(64);
    expect(() => verify(permit, changedReceipt)).toThrow(ResearchFinalizationPermitError);
  });

  it("rejects invented report references, effect-excluded support, and report mutation", () => {
    const finished = completionFixture();
    const storedPacket = finished.report.attempts.at(-1)!.packet;
    const evidence = {
      researchTarget: finished.research_target,
      candidates: finished.candidate_discovery,
      boundedEvidence: finished.bounded_evidence,
      formalEvidence: finished.formal_evidence,
      treatment: finished.treatment_finalization,
      limitations: deriveResearchFinalizationLimitations(finished).map((item) => ({
        limitation_id: item.limitation_id,
        plain_language: item.plain_language
      }))
    };
    const work = createReportSynthesisWorkPackage(
      initialResearchReportState(),
      evidence
    );
    const submissionPacket = {
      ...storedPacket,
      evidence_basis_digest: work.evidence_basis_digest,
      claims: storedPacket.claims.map(({ claim_id: _claimId, ...claim }) => claim),
      approaches: storedPacket.approaches.map(({
        claim_ids: _claimIds,
        ...approach
      }, index) => ({ ...approach, claim_indexes: [index] }))
    };
    const invented = structuredClone(submissionPacket);
    invented.claims[0]!.references = [{
      reference_kind: "formal_capability",
      source_id: "0".repeat(64),
      capability_id: "4".repeat(64)
    }];
    expect(() => ingestReportSynthesisSubmission(
      initialResearchReportState(),
      evidence,
      {
        package_version: "askrigor_report_synthesis_v1",
        evidence_basis_digest: work.evidence_basis_digest,
        packet: invented
      }
    )).toThrow(/unknown formal claim capability/u);

    const conflatedProgram = structuredClone(submissionPacket);
    conflatedProgram.claims[0]!.program = reportProgram(
      "A materially different program hidden under the same treatment label"
    );
    expect(() => ingestReportSynthesisSubmission(
      initialResearchReportState(),
      evidence,
      {
        package_version: "askrigor_report_synthesis_v1",
        evidence_basis_digest: work.evidence_basis_digest,
        packet: conflatedProgram
      }
    )).toThrow(/materially different program/u);

    const excludedFormal = structuredClone(finished.formal_evidence);
    excludedFormal.sources[0]!.claim_capability = {
      ...excludedFormal.sources[0]!.claim_capability,
      status: "EFFECT_CLAIMS_EXCLUDED",
      unrestricted_decision_use: false
    };
    excludedFormal.sources[0]!.external_evidence.effect_claims_excluded = true;
    const excludedEvidence = { ...evidence, formalEvidence: excludedFormal };
    const excludedWork = createReportSynthesisWorkPackage(
      initialResearchReportState(),
      excludedEvidence
    );
    expect(() => ingestReportSynthesisSubmission(
      initialResearchReportState(),
      excludedEvidence,
      {
        package_version: "askrigor_report_synthesis_v1",
        evidence_basis_digest: excludedWork.evidence_basis_digest,
        packet: {
          ...submissionPacket,
          evidence_basis_digest: excludedWork.evidence_basis_digest
        }
      }
    )).toThrow(/effect-excluded/u);

    const decision = evaluateResearchFinalization(SESSION_ID, finished, {
      signingSecret: FINALIZATION_SECRET,
      keyId: FINALIZATION_KEY_ID,
      now: () => FINALIZATION_NOW
    });
    if (decision.authorization === "DENIED") throw new Error("Missing report permit");
    expect(finalizationDecisionSchema.safeParse({
      ...decision,
      reader_facing: {
        ...decision.reader_facing,
        report: { ...decision.reader_facing.report, title: "Mutated after permit" }
      }
    }).success).toBe(false);
  });

  it("preserves publication history and provider-scoped limitations", () => {
    const finished = completionFixture();
    const baseLimitations = deriveResearchFinalizationLimitations(finished);
    expect(baseLimitations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: "provider_coverage",
        provider: "forrt",
        plain_language: expect.stringContaining("applies only to this provider")
      }),
      expect.objectContaining({
        scope: "provider_coverage",
        provider: "pubpeer",
        plain_language: expect.stringContaining("was not available")
      })
    ]));
    expect(baseLimitations.map(({ plain_language }) => plain_language).join(" "))
      .not.toMatch(/no concerns? (?:were )?found/iu);

    const decision = evaluateResearchFinalization(SESSION_ID, finished, {
      signingSecret: FINALIZATION_SECRET,
      keyId: FINALIZATION_KEY_ID,
      now: () => FINALIZATION_NOW
    });
    if (decision.finalization_permit === null) throw new Error("Missing permit");

    for (const [recordState, eventKind, expected] of [[
      "active_retraction_or_withdrawal",
      "retraction",
      "active retraction"
    ], [
      "expression_of_concern_recorded",
      "expression_of_concern",
      "expression of concern"
    ], [
      "correction_recorded",
      "correction",
      "correction record"
    ]] as const) {
      const changed = structuredClone(finished);
      const source = changed.formal_evidence.sources[0]!;
      source.external_evidence.publication_integrity = {
        record_state: recordState,
        events: [{ event_kind: eventKind, event_hash: "f".repeat(64) }]
      };
      if (recordState === "active_retraction_or_withdrawal") {
        source.external_evidence.effect_claims_excluded = true;
      }
      const reparsed = stateAfterFormalEvidenceChange(changed);
      expect(deriveResearchFinalizationLimitations(reparsed)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scope: "publication_integrity",
            plain_language: expect.stringContaining(expected)
          })
        ])
      );
      expect(() => verifyResearchFinalizationPermit(
        decision.finalization_permit,
        SESSION_ID,
        reparsed,
        {
          signingSecret: FINALIZATION_SECRET,
          keyId: FINALIZATION_KEY_ID,
          now: () => new Date("2026-08-24T12:05:00.000Z")
        }
      )).toThrow(ResearchFinalizationPermitError);
      expect(() => assertResearchSessionTransition(finished, reparsed))
        .toThrow(/external-study evidence is immutable/u);
    }
  });

  it("rejects forged final-audit checks and keeps undercovered work nonfinal", () => {
    const finished = completionFixture();
    const forged = structuredClone(finished);
    forged.final_completion_audit!.checks[0]!.summary =
      "Caller-authored replacement for a server-owned completion check.";
    expect(() => researchSessionStateSchema.parse(forged))
      .toThrow(/server-derived checks exactly/u);

    const undercovered = researchSessionStateSchema.parse({
      ...finished,
      treatment_finalization: { ...finished.treatment_finalization, attempts: [] },
      final_completion_audit: undefined,
      modules: {
        ...finished.modules,
        FINAL_COMPLETION_AUDIT: {
          ...finished.modules.FINAL_COMPLETION_AUDIT,
          execution_status: "NOT_STARTED",
          authority: "SERVER_EVIDENCE"
        }
      },
      operations: {
        ...finished.operations,
        treatment_landscape_finalization: { status: "NOT_STARTED" },
        report_synthesis: { status: "NOT_STARTED" },
        final_completion_audit: { status: "NOT_STARTED" }
      }
    });
    const audited = executeResearchSessionFinalCompletionAudit(undercovered);
    expect(audited.final_completion_audit).toMatchObject({ status: "FAIL" });
    expect(audited.final_completion_audit?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ check_id: "TREATMENT_LOCKS_PASS", status: "FAIL" })
    ]));
    expect(deriveResearchFinalizationReadiness(audited)).toBe("CONTINUE_RESEARCH");
  });

  it("maps an otherwise resolved terminal treatment boundary only to bounded nonranking output", () => {
    const finished = completionFixture();
    const treatment = structuredClone(finished.treatment_finalization);
    const latest = treatment.attempts.at(-1)!;
    latest.assessment = {
      ...latest.assessment,
      selection_coverage_lock: "block",
      per_video_depth_lock: "pass",
      synthesis_lock: "block",
      answer_boundary: "bounded_nonranking_only",
      boundary_blockers: ["One exact source path reached a nonretryable boundary."],
      blockers: ["One exact source path reached a nonretryable boundary."],
      access_boundary_ids_used: ["formal_program_fixture"]
    };
    let bounded = researchSessionStateSchema.parse({
      ...finished,
      treatment_finalization: treatment,
      final_completion_audit: undefined,
      modules: {
        ...finished.modules,
        FINAL_COMPLETION_AUDIT: {
          ...finished.modules.FINAL_COMPLETION_AUDIT,
          execution_status: "NOT_STARTED",
          authority: "SERVER_EVIDENCE"
        }
      },
      operations: {
        ...finished.operations,
        treatment_landscape_finalization: {
          status: "BLOCKED_TERMINAL",
          boundary: {
            classification: "TERMINAL_NONRETRYABLE",
            code: "TREATMENT_LANDSCAPE_BOUNDED_NONRANKING",
            summary: "The current treatment landscape permits only bounded nonranking output."
          }
        },
        report_synthesis: { status: "IN_PROGRESS" },
        final_completion_audit: { status: "NOT_STARTED" }
      }
    });
    const limitations = deriveResearchFinalizationLimitations(bounded).map((item) => ({
      limitation_id: item.limitation_id,
      plain_language: item.plain_language
    }));
    const reportWork = createReportSynthesisWorkPackage(bounded.report, {
      researchTarget: bounded.research_target,
      candidates: bounded.candidate_discovery,
      boundedEvidence: bounded.bounded_evidence,
      formalEvidence: bounded.formal_evidence,
      treatment: bounded.treatment_finalization,
      limitations
    });
    const priorPacket = finished.report.attempts.at(-1)!.packet;
    bounded = recordResearchSessionReport(bounded, {
      package_version: reportWork.package_version,
      evidence_basis_digest: reportWork.evidence_basis_digest,
      packet: {
        ...priorPacket,
        evidence_basis_digest: reportWork.evidence_basis_digest,
        report_scope: "bounded_nonranking_report",
        bottom_line: ["The inspected evidence and unresolved boundary can be described without ranking treatments."],
        comparative_conclusion: null,
        claims: priorPacket.claims.map(({ claim_id: _claimId, ...claim }) => ({
          ...claim,
          claim_kind: claim.claim_kind === "comparative_effect"
            ? "formal_effect" as const
            : claim.claim_kind
        })),
        approaches: priorPacket.approaches.map(({
          claim_ids: _claimIds,
          ...approach
        }, index) => ({ ...approach, claim_indexes: [index] })),
        provider_and_access_limitations: limitations
      }
    });

    expect(deriveResearchFinalizationReadiness(bounded))
      .toBe("BOUNDED_NONRANKING_ONLY");
    expect(deriveResearchOutputBoundary(bounded)).toBe("BOUNDED_NONRANKING_ONLY");
    expect(evaluateResearchFinalization(SESSION_ID, bounded)).toMatchObject({
      authorization: "DENIED",
      output_boundary: "BOUNDED_NONRANKING_ONLY",
      finalization_permit: null,
      denial_reasons: expect.arrayContaining([
        "TERMINAL_BOUNDARY_LIMITS_OUTPUT",
        "FINALIZATION_SIGNING_NOT_CONFIGURED"
      ])
    });

    const decision = evaluateResearchFinalization(SESSION_ID, bounded, {
      signingSecret: FINALIZATION_SECRET,
      keyId: FINALIZATION_KEY_ID,
      now: () => FINALIZATION_NOW
    });
    expect(decision).toMatchObject({
      authorization: "BOUNDED",
      output_boundary: "BOUNDED_NONRANKING_ONLY",
      finalization_permit: {
        artifact_kind: "BOUNDED_NONRANKING_REPORT_PERMIT",
        output_boundary: "BOUNDED_NONRANKING_ONLY"
      },
      reader_facing: {
        permitted_scope: "bounded_nonranking_report",
        limitations: expect.arrayContaining([
          expect.objectContaining({ scope: "treatment_landscape" })
        ])
      }
    });
  });

  it("mutation-checks every required module and operation completion condition", () => {
    const finished = completionFixture();
    const withoutFinalAudit = {
      ...finished,
      final_completion_audit: undefined,
      modules: {
        ...finished.modules,
        FINAL_COMPLETION_AUDIT: {
          ...finished.modules.FINAL_COMPLETION_AUDIT,
          execution_status: "NOT_STARTED" as const
        }
      },
      operations: {
        ...finished.operations,
        final_completion_audit: { status: "NOT_STARTED" as const }
      }
    };

    for (const moduleId of RESEARCH_MODULE_IDS) {
      const modules = structuredClone(withoutFinalAudit.modules);
      modules[moduleId].execution_status = "NOT_STARTED";
      const mutated = researchSessionStateSchema.parse({ ...withoutFinalAudit, modules });
      expect(
        evaluateResearchFinalization(SESSION_ID, mutated).denial_reasons,
        `module completion check removed for ${moduleId}`
      ).toContain("REQUIRED_MODULE_INCOMPLETE");
    }

    for (const operationId of RESEARCH_OPERATION_IDS) {
      if (operationId === "automated_video_scout") continue;
      const operations = structuredClone(withoutFinalAudit.operations);
      operations[operationId] = { status: "NOT_STARTED" };
      if (
        operationId === "candidate_screening" ||
        operationId === "transcript_acquisition" ||
        operationId === "community_discussion_audit" ||
        operationId === "video_evidence_synthesis" ||
        operationId === "formal_evidence_search" ||
        operationId === "accessible_full_text_acquisition" ||
        operationId === "study_method_audit" ||
        operationId === "external_study_evidence_audit" ||
        operationId === "linked_replication_and_review_audit" ||
        operationId === "claim_capability_recalculation" ||
        operationId === "bidirectional_evidence_return" ||
        operationId === "treatment_landscape_finalization" ||
        operationId === "report_synthesis"
      ) {
        expect(() => researchSessionStateSchema.parse({ ...withoutFinalAudit, operations }))
          .toThrow(/depth|derived.*(?:per-video|per-source).*state|source-bound iteration|session-owned coverage assessment|video_evidence_synthesis|report_synthesis/u);
        continue;
      }
      const mutated = researchSessionStateSchema.parse({ ...withoutFinalAudit, operations });
      expect(
        evaluateResearchFinalization(SESSION_ID, mutated).denial_reasons,
        `operation completion check removed for ${operationId}`
      ).toContain("REQUIRED_OPERATION_INCOMPLETE");
    }

    const scoutMissing = initialState();
    expect(
      evaluateResearchFinalization(SESSION_ID, scoutMissing).denial_reasons
    ).toContain("REQUIRED_OPERATION_INCOMPLETE");
  }, 15_000);
});
