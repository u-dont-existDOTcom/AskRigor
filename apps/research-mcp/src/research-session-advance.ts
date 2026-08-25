import type {
  StudyExternalEvidenceAuditOutput,
  StudyExternalEvidenceCoordinator
} from
  "./actions/study-external-evidence.js";

import type { OpenFullTextExecutor } from
  "./actions/open-full-text-route.js";
import {
  deriveDiscussionActionInput,
  deriveResearchVideoDepthWorkPackages,
  deriveTranscriptActionInput,
  type ResearchVideoDepthExecutors
} from "./actions/research-video-depth-controller.js";
import type {
  BidirectionalCommentSearchExecutor
} from "./actions/research-bidirectional-iteration.js";
import type { FormalSearchExecutors } from
  "./actions/research-formal-evidence.js";
import {
  applyServerModuleApplicability,
  projectResearchSessionView,
  recalculateResearchSessionSourceClaimCapability,
  recordCandidateScreeningCompletion,
  recordResearchSessionBidirectionalIteration,
  recordResearchSessionBidirectionalReturnAssessment,
  recordResearchSessionFormalScreening,
  recordResearchSessionReport,
  recordResearchSessionTreatmentLandscape,
  recordResearchSessionVideoEvidence,
  executeResearchSessionMethodAudit,
  deriveRequiredNextCapabilities,
  executeResearchSessionBidirectionalReturnSearch,
  executeResearchSessionFinalCompletionAudit,
  executeResearchSessionFormalSearch,
  executeResearchSessionSourceExternalEvidence,
  executeResearchSessionSourceFullTextChain,
  reconcileResearchSessionLinkedWork,
  recordDiscussionDepthResult,
  recordTranscriptDepthResult,
  RESEARCH_MODULE_IDS,
  researchSessionStateDigest,
  type ResearchModuleId,
  type ResearchSessionState
} from "./actions/research-session-controller.js";
import type { VideoEvidenceMaterial } from
  "./actions/research-bounded-evidence.js";
import type { ResearchEvidenceMaterialCache } from
  "./research-evidence-material-cache.js";
import {
  assertResearchSemanticBinding,
  researchSemanticWorkSchema,
  type ResearchSemanticModelOutput,
  type ResearchSemanticWork
} from "./research-semantic-worker.js";

export interface ResearchSemanticAdvanceDependencies {
  openFullTextExecutor?: OpenFullTextExecutor;
  externalAuditFor?(input: {
    sessionId: string;
    sourceId: string;
    receiptPayloadSha256: string;
  }): StudyExternalEvidenceAuditOutput | undefined;
  externalEvidenceReceiptSecret?: string;
  videoEvidenceMaterialFor?(input: {
    sessionId: string;
    videoId: string;
    transcriptReceiptSha256: string;
    discussionReceiptSha256: string;
  }): VideoEvidenceMaterial | undefined;
  evidenceContextForWork?(input: {
    sessionId: string;
    state: ResearchSessionState;
    work: ResearchSemanticWork;
  }): unknown | Promise<unknown>;
}

export interface ResearchExternalAuditCache {
  put(input: {
    sessionId: string;
    sourceId: string;
    output: StudyExternalEvidenceAuditOutput;
  }): void;
  get(input: {
    sessionId: string;
    sourceId: string;
    receiptPayloadSha256: string;
  }): StudyExternalEvidenceAuditOutput | undefined;
}

export function createInMemoryResearchExternalAuditCache(
  maximumEntries = 128
): ResearchExternalAuditCache {
  if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1) {
    throw new Error("Invalid external-audit cache limit");
  }
  const entries = new Map<string, StudyExternalEvidenceAuditOutput>();
  const cache: ResearchExternalAuditCache = {
    put({ sessionId, sourceId, output }) {
      const key = `${sessionId}:${sourceId}`;
      if (!entries.has(key) && entries.size >= maximumEntries) {
        throw new Error("External-audit cache capacity exceeded");
      }
      entries.set(key, structuredClone(output));
    },
    get({ sessionId, sourceId, receiptPayloadSha256 }) {
      const output = entries.get(`${sessionId}:${sourceId}`);
      if (
        output === undefined ||
        output.receipt.receipt_payload_sha256 !== receiptPayloadSha256
      ) return undefined;
      return structuredClone(output);
    }
  };
  return Object.freeze(cache);
}

export interface ResearchDeterministicAdvanceDependencies {
  automatedScout?(state: ResearchSessionState): Promise<ResearchSessionState>;
  nativeDiscovery?(state: ResearchSessionState): Promise<ResearchSessionState>;
  resolveCandidateIdentities?(
    state: ResearchSessionState
  ): Promise<ResearchSessionState>;
  videoDepth?: ResearchVideoDepthExecutors;
  evidenceMaterialCache?: ResearchEvidenceMaterialCache;
  formalSearch?: FormalSearchExecutors;
  openFullText?: OpenFullTextExecutor;
  externalEvidence?: {
    coordinator: StudyExternalEvidenceCoordinator;
    receiptSecret: string;
    cache: ResearchExternalAuditCache;
  };
  bidirectionalCommentSearch?: BidirectionalCommentSearchExecutor;
}

export interface ResearchDeterministicAdvanceResult {
  state: ResearchSessionState;
  capability: string;
  state_changed: true;
}

export class ResearchAdvanceDependencyUnavailableError extends Error {
  constructor(public readonly capability: string) {
    super(`Research advancement dependency unavailable for ${capability}`);
    this.name = "ResearchAdvanceDependencyUnavailableError";
  }
}

export class ResearchAdvanceNoProgressError extends Error {
  constructor(public readonly capability: string) {
    super(`Research advancement made no authoritative progress for ${capability}`);
    this.name = "ResearchAdvanceNoProgressError";
  }
}

/**
 * Project exactly one current semantic package from authoritative state. This
 * function never accepts caller-selected work and never advances state.
 */
export function deriveResearchSemanticWorkForState(
  sessionId: string,
  rawState: ResearchSessionState
): ResearchSemanticWork | null {
  const stateDigest = researchSessionStateDigest(rawState);
  const unresolvedModuleIds = RESEARCH_MODULE_IDS.filter((moduleId) =>
    rawState.modules[moduleId].applicability === "UNRESOLVED"
  );
  if (unresolvedModuleIds.length > 0) {
    return researchSemanticWorkSchema.parse({
      kind: "module_applicability",
      package: {
        package_version: "askrigor_module_applicability_v1",
        state_digest: stateDigest,
        unresolved_module_ids: unresolvedModuleIds
      }
    });
  }

  const view = projectResearchSessionView(sessionId, rawState);
  const candidates = view.candidate_screening_work_package;
  if (candidates !== null) {
    return researchSemanticWorkSchema.parse({
      kind: "candidate_screening",
      package: { ...candidates, state_digest: stateDigest }
    });
  }
  const formalScreening = view.formal_source_screening_work_package;
  if (formalScreening !== null) {
    return researchSemanticWorkSchema.parse({
      kind: "formal_source_screening",
      package: { ...formalScreening, state_digest: stateDigest }
    });
  }
  const videoEvidence = view.next_video_evidence_work_package;
  if (videoEvidence !== null) {
    return researchSemanticWorkSchema.parse({
      kind: "video_evidence_synthesis",
      package: { ...videoEvidence, state_digest: stateDigest }
    });
  }
  const methodAudit = view.formal_method_audit_work_packages[0];
  if (methodAudit !== undefined) {
    return researchSemanticWorkSchema.parse({
      kind: "formal_method_audit",
      package: { ...methodAudit, state_digest: stateDigest }
    });
  }
  const claimRecalculation = view.formal_claim_recalculation_work_packages[0];
  if (claimRecalculation !== undefined) {
    return researchSemanticWorkSchema.parse({
      kind: "formal_claim_recalculation",
      package: { ...claimRecalculation, state_digest: stateDigest }
    });
  }
  const bidirectional = view.bidirectional_iteration_work_package;
  if (bidirectional !== null) {
    return researchSemanticWorkSchema.parse({
      kind: "bidirectional_iteration",
      package: { ...bidirectional, state_digest: stateDigest }
    });
  }
  const returnAssessment =
    view.bidirectional_return_assessment_work_packages[0];
  if (returnAssessment !== undefined) {
    return researchSemanticWorkSchema.parse({
      kind: "bidirectional_return_assessment",
      package: { ...returnAssessment, state_digest: stateDigest }
    });
  }
  const treatment = view.treatment_landscape_work_package;
  if (treatment !== null) {
    return researchSemanticWorkSchema.parse({
      kind: "treatment_landscape",
      package: { ...treatment, state_digest: stateDigest }
    });
  }
  const report = view.report_synthesis_work_package;
  if (report !== null) {
    return researchSemanticWorkSchema.parse({
      kind: "report_synthesis",
      package: { ...report, state_digest: stateDigest }
    });
  }
  return null;
}

/**
 * Apply one exact state-bound semantic result. Source executors validate block
 * linkage and receipt identity; this layer does not treat schema validity as
 * semantic truth or completion authority.
 */
export async function applyResearchSemanticResult(
  sessionId: string,
  rawState: ResearchSessionState,
  rawOutput: ResearchSemanticModelOutput,
  dependencies: ResearchSemanticAdvanceDependencies
): Promise<ResearchSessionState> {
  const semanticWork = deriveResearchSemanticWorkForState(sessionId, rawState);
  if (semanticWork === null) {
    throw new Error("The controller has no current semantic work package");
  }
  assertResearchSemanticBinding({
    session_id: sessionId,
    state_digest: researchSessionStateDigest(rawState),
    semantic_work: semanticWork
  }, rawOutput);

  switch (rawOutput.work_type) {
    case "module_applicability":
      return applyModuleApplicability(rawState, rawOutput.submission);
    case "candidate_screening":
      return recordCandidateScreeningCompletion(rawState, rawOutput.submission);
    case "formal_source_screening":
      return recordResearchSessionFormalScreening(rawState, rawOutput.submission);
    case "formal_method_audit":
      if (dependencies.openFullTextExecutor === undefined) {
        throw new Error("The source-bound method-audit executor is unavailable");
      }
      return executeResearchSessionMethodAudit(
        rawState,
        rawOutput.source_id,
        rawOutput.submission,
        dependencies.openFullTextExecutor
      );
    case "formal_claim_recalculation": {
      if (
        dependencies.openFullTextExecutor === undefined ||
        dependencies.externalAuditFor === undefined ||
        dependencies.externalEvidenceReceiptSecret === undefined
      ) {
        throw new Error("Claim-recalculation dependencies are unavailable");
      }
      const externalAudit = dependencies.externalAuditFor({
        sessionId,
        sourceId: rawOutput.source_id,
        receiptPayloadSha256:
          rawOutput.submission.external_evidence_binding
            .external_receipt_payload_sha256
      });
      if (externalAudit === undefined) {
        throw new Error(
          "The exact external audit is unavailable; claim recalculation must reacquire it"
        );
      }
      return recalculateResearchSessionSourceClaimCapability(rawState, {
        sessionId,
        sourceId: rawOutput.source_id,
        submission: rawOutput.submission,
        executor: dependencies.openFullTextExecutor,
        externalAudit,
        receiptSecret: dependencies.externalEvidenceReceiptSecret
      });
    }
    case "video_evidence_synthesis": {
      const work = semanticWork.kind === "video_evidence_synthesis"
        ? semanticWork.package
        : undefined;
      const material = work === undefined
        ? undefined
        : dependencies.videoEvidenceMaterialFor?.({
          sessionId,
          videoId: work.video_id,
          transcriptReceiptSha256: work.transcript_receipt_sha256,
          discussionReceiptSha256: work.discussion_receipt_sha256
        });
      if (material === undefined) {
        throw new Error("The exact transcript and discussion material must be reacquired before video-evidence synthesis");
      }
      return recordResearchSessionVideoEvidence(
        rawState,
        material,
        rawOutput.submission
      );
    }
    case "bidirectional_iteration":
      return recordResearchSessionBidirectionalIteration(
        rawState,
        rawOutput.submission
      );
    case "bidirectional_return_assessment":
      return recordResearchSessionBidirectionalReturnAssessment(
        rawState,
        rawOutput.submission
      );
    case "treatment_landscape":
      return recordResearchSessionTreatmentLandscape(
        rawState,
        rawOutput.submission
      );
    case "report_synthesis":
      return recordResearchSessionReport(rawState, rawOutput.submission);
  }
}

/** Execute one server-selected deterministic capability and reject no-op work. */
export async function advanceResearchSessionDeterministically(
  sessionId: string,
  rawState: ResearchSessionState,
  dependencies: ResearchDeterministicAdvanceDependencies
): Promise<ResearchDeterministicAdvanceResult> {
  if (deriveResearchSemanticWorkForState(sessionId, rawState) !== null) {
    throw new Error("Semantic work must be completed before deterministic advancement");
  }
  const capability = deriveRequiredNextCapabilities(rawState)[0];
  if (capability === undefined) {
    throw new ResearchAdvanceNoProgressError("none");
  }
  let next: ResearchSessionState;
  switch (capability) {
    case "automated_video_scout":
      next = await requireDependency(
        dependencies.automatedScout,
        capability
      )(rawState);
      break;
    case "native_video_discovery":
      next = await requireDependency(
        dependencies.nativeDiscovery,
        capability
      )(rawState);
      break;
    case "resolve_candidate_identities":
      next = await requireDependency(
        dependencies.resolveCandidateIdentities ?? dependencies.nativeDiscovery,
        capability
      )(rawState);
      break;
    case "transcript_acquisition": {
      const executors = requireDependency(dependencies.videoDepth, capability);
      const work = deriveResearchVideoDepthWorkPackages(rawState.video_depth)
        .find((candidate) => candidate.capability === capability);
      if (work === undefined) throw new ResearchAdvanceNoProgressError(capability);
      const output = await executors.getTranscript(
        deriveTranscriptActionInput(rawState.video_depth, work.video_id)
      );
      dependencies.evidenceMaterialCache?.captureTranscript({
        sessionId,
        videoId: work.video_id,
        output
      });
      next = recordTranscriptDepthResult(rawState, work.video_id, output);
      break;
    }
    case "community_discussion_audit": {
      const executors = requireDependency(dependencies.videoDepth, capability);
      const work = deriveResearchVideoDepthWorkPackages(rawState.video_depth)
        .find((candidate) => candidate.capability === capability);
      if (work === undefined) throw new ResearchAdvanceNoProgressError(capability);
      const record = rawState.video_depth.discussions.find(({ source }) =>
        source.video_id === work.video_id
      );
      if (record === undefined) throw new ResearchAdvanceNoProgressError(capability);
      const requestedHandle = record.continuation_handle;
      const output = await executors.auditDiscussion(
        deriveDiscussionActionInput(rawState.video_depth, work.video_id)
      );
      dependencies.evidenceMaterialCache?.captureDiscussion({
        sessionId,
        videoId: work.video_id,
        output
      });
      next = recordDiscussionDepthResult(
        rawState,
        work.video_id,
        requestedHandle,
        output
      );
      break;
    }
    case "formal_evidence_search": {
      const executors = requireDependency(dependencies.formalSearch, capability);
      const hypothesis = rawState.formal_evidence.hypotheses.find((item) =>
        item.provider_searches.some(({ status }) =>
          status === "NOT_STARTED" || status === "IN_PROGRESS" ||
          status === "BLOCKED_RETRYABLE"
        )
      );
      if (hypothesis === undefined) {
        throw new ResearchAdvanceNoProgressError(capability);
      }
      next = await executeResearchSessionFormalSearch(
        rawState,
        hypothesis.hypothesis_id,
        executors,
        1
      );
      break;
    }
    case "accessible_full_text_acquisition": {
      const executor = requireDependency(dependencies.openFullText, capability);
      const source = rawState.formal_evidence.sources.find((item) =>
        item.decision_importance === "DECISION_IMPORTANT" &&
        ["NOT_STARTED", "IN_PROGRESS", "BLOCKED_RETRYABLE"].includes(
          item.full_text.status
        )
      );
      if (source === undefined) throw new ResearchAdvanceNoProgressError(capability);
      next = await executeResearchSessionSourceFullTextChain(
        rawState,
        source.source_id,
        executor,
        1
      );
      break;
    }
    case "external_study_evidence_audit": {
      const external = requireDependency(dependencies.externalEvidence, capability);
      const work = projectResearchSessionView(sessionId, rawState)
        .formal_external_evidence_work_packages[0];
      if (work === undefined) throw new ResearchAdvanceNoProgressError(capability);
      let output: StudyExternalEvidenceAuditOutput | undefined;
      const capturingCoordinator: StudyExternalEvidenceCoordinator = {
        async audit(input) {
          output = await external.coordinator.audit(input);
          return output;
        }
      };
      next = await executeResearchSessionSourceExternalEvidence(
        rawState,
        sessionId,
        work.source_id,
        capturingCoordinator,
        external.receiptSecret
      );
      if (output !== undefined) {
        external.cache.put({ sessionId, sourceId: work.source_id, output });
      }
      break;
    }
    case "linked_replication_and_review_audit":
      next = reconcileResearchSessionLinkedWork(rawState);
      break;
    case "bidirectional_evidence_return": {
      const execute = requireDependency(
        dependencies.bidirectionalCommentSearch,
        capability
      );
      const transfer = rawState.bidirectional_iteration.rounds
        .flatMap(({ formal_to_community_transfers }) =>
          formal_to_community_transfers
        )
        .find(({ searches }) => searches.some(({ status }) =>
          status === "NOT_STARTED" || status === "IN_PROGRESS" ||
          status === "BLOCKED_RETRYABLE"
        ));
      if (transfer === undefined) throw new ResearchAdvanceNoProgressError(capability);
      next = await executeResearchSessionBidirectionalReturnSearch(
        rawState,
        transfer.transfer_id,
        execute,
        1
      );
      break;
    }
    case "final_completion_audit":
      next = executeResearchSessionFinalCompletionAudit(rawState);
      break;
    default:
      throw new ResearchAdvanceDependencyUnavailableError(capability);
  }
  if (researchSessionStateDigest(next) === researchSessionStateDigest(rawState)) {
    throw new ResearchAdvanceNoProgressError(capability);
  }
  return { state: next, capability, state_changed: true };
}

function requireDependency<T>(
  value: T | undefined,
  capability: string
): T {
  if (value === undefined) {
    throw new ResearchAdvanceDependencyUnavailableError(capability);
  }
  return value;
}

function applyModuleApplicability(
  state: ResearchSessionState,
  submission: Extract<
    ResearchSemanticModelOutput,
    { work_type: "module_applicability" }
  >["submission"]
): ResearchSessionState {
  const unresolved = RESEARCH_MODULE_IDS.filter((moduleId) =>
    state.modules[moduleId].applicability === "UNRESOLVED"
  );
  const submitted = submission.decisions.map(({ module_id }) => module_id);
  if (
    new Set(submitted).size !== submitted.length ||
    unresolved.length !== submitted.length ||
    unresolved.some((moduleId) => !submitted.includes(moduleId))
  ) {
    throw new Error("Module routing must decide the exact unresolved frontier");
  }
  const updates: Partial<
    Record<ResearchModuleId, "REQUIRED" | "NOT_REQUIRED">
  > = {};
  for (const decision of submission.decisions) {
    updates[decision.module_id] = decision.applicability;
  }
  return applyServerModuleApplicability(state, updates, "SERVER_ROUTER");
}
