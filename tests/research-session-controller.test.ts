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
  createResearchSessionStore,
  createTreatmentLandscapeWorkPackage,
  deriveResearchFinalizationLimitations,
  deriveResearchFinalizationReadiness,
  deriveRequiredNextCapabilities,
  deriveResearchOutputBoundary,
  evaluateResearchFinalization,
  executeResearchSessionFinalCompletionAudit,
  finalizationDecisionSchema,
  finalizationPermitSchema,
  mapTreatmentLandscapeBoundary,
  projectResearchSessionView,
  protocolBindingsFromManifests,
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  recordCandidateScreeningCompletion,
  recordDiscussionDepthResult,
  recordNativeYoutubeDiscovery,
  recordResearchSessionBidirectionalIteration,
  recordResearchSessionTreatmentLandscape,
  recordTranscriptDepthResult,
  researchSessionStateSchema,
  verifyResearchFinalizationPermit,
  ResearchFinalizationPermitError,
  type FinalizationPermit,
  type ResearchSessionState
} from "../apps/research-mcp/src/index.js";
import { deriveGeminiYoutubeCandidateFrontier } from "../packages/sources/src/index.js";
import {
  RESEARCH_FIXTURE_VIDEO_IDS,
  nativeSurvey,
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

function testJsonHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function completionFixture(): ResearchSessionState {
  const packet = structuredClone(researchPacket());
  const receipt = structuredClone(researchReceipt());
  packet.candidates[0]!.provisional_specific_program = "named program one";
  receipt.validated_candidates[0]!.gemini_provisional_annotations.specific_program =
    "named program one";
  let initial = recordAutomatedScoutCompletion(initialState(), {
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
    state = recordTranscriptDepthResult(state, videoId, transcriptOutput(videoId));
    state = recordDiscussionDepthResult(
      state,
      videoId,
      undefined,
      discussionOutput(videoId)
    );
  }
  const modules = structuredClone(state.modules);
  for (const moduleId of RESEARCH_MODULE_IDS) {
    modules[moduleId] = {
      applicability: "REQUIRED",
      execution_status: moduleId === "BIDIRECTIONAL_ITERATION" ||
        moduleId === "FINAL_COMPLETION_AUDIT"
        ? "NOT_STARTED"
        : "COMPLETE",
      authority: "SERVER_ROUTER"
    };
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
    modules,
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

  it("keeps unresolved scout identities executable and blocks downstream screening", () => {
    const packet = researchPacket();
    const receipt = researchReceipt();
    const unresolvedId = RESEARCH_FIXTURE_VIDEO_IDS[2];
    const partial = recordAutomatedScoutCompletion(initialState(), {
      providerResponseId: "interaction-partial",
      packet,
      receipt: {
        ...receipt,
        status: "partial",
        candidate_frontier: deriveGeminiYoutubeCandidateFrontier(
          RESEARCH_FIXTURE_VIDEO_IDS,
          RESEARCH_FIXTURE_VIDEO_IDS.slice(0, 2),
          [],
          [unresolvedId]
        ),
        validated_candidates: receipt.validated_candidates.slice(0, 2),
        unresolved_candidates: [{
          video_id: unresolvedId,
          metadata_access_status: "rate_limited",
          retryable: true,
          provider_error_code: "youtube_rate_limited",
          limitations: ["Retryable fixture boundary."]
        }]
      }
    });

    expect(partial.operations.automated_video_scout.status).toBe("BLOCKED_RETRYABLE");
    expect(deriveRequiredNextCapabilities(partial)).toEqual([
      "route_module_applicability",
      "automated_video_scout"
    ]);
    expect(partial.candidate_discovery.candidates).toHaveLength(2);
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
    expect(evaluateResearchFinalization(SESSION_ID, boundedScout)).toMatchObject({
      authorization: "DENIED",
      output_boundary: "CONTINUE_RESEARCH",
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
      /de-identified treatment comparison|diagnosis_not_specified|transcript text|comment text|provider body|credential/iu
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
    const bounded = researchSessionStateSchema.parse({
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
        final_completion_audit: { status: "NOT_STARTED" }
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
        operationId === "formal_evidence_search" ||
        operationId === "accessible_full_text_acquisition" ||
        operationId === "study_method_audit" ||
        operationId === "external_study_evidence_audit" ||
        operationId === "linked_replication_and_review_audit" ||
        operationId === "claim_capability_recalculation" ||
        operationId === "bidirectional_evidence_return" ||
        operationId === "treatment_landscape_finalization"
      ) {
        expect(() => researchSessionStateSchema.parse({ ...withoutFinalAudit, operations }))
          .toThrow(/depth|derived.*(?:per-video|per-source).*state|source-bound iteration|session-owned coverage assessment/u);
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
  });
});
