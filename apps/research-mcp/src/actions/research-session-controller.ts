import { createHash } from "node:crypto";

import type { ProtocolManifest } from "@askrigor/protocol";
import { z } from "zod";

import type { TreatmentLandscapeCoverageOutput } from "./treatment-landscape-coverage-route.js";

export const RESEARCH_MODULE_IDS = [
  "HRP",
  "DIRECT_HUMAN",
  "EXTENDED_GREY",
  "FORUM_SIGNAL",
  "BIDIRECTIONAL_ITERATION",
  "FINAL_COMPLETION_AUDIT"
] as const;

export const RESEARCH_OPERATION_IDS = [
  "automated_video_scout",
  "candidate_screening",
  "transcript_acquisition",
  "community_discussion_audit",
  "formal_evidence_search",
  "accessible_full_text_acquisition",
  "study_method_audit",
  "bidirectional_evidence_return",
  "treatment_landscape_finalization",
  "final_completion_audit"
] as const;

export const researchOutputBoundarySchema = z.enum([
  "CONTINUE_RESEARCH",
  "BOUNDED_NONRANKING_ONLY",
  "FINALIZATION_ALLOWED"
]);

export type ResearchOutputBoundary = z.output<
  typeof researchOutputBoundarySchema
>;

const protocolIdentitySchema = z.object({
  protocol: z.enum(["universal", "hrp"]),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
  revision_date: z.string().min(1).max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

const protocolTupleSchema = z.tuple([
  protocolIdentitySchema.extend({ protocol: z.literal("universal") }).strict(),
  protocolIdentitySchema.extend({ protocol: z.literal("hrp") }).strict()
]);

const moduleStateSchema = z.object({
  applicability: z.enum(["REQUIRED", "NOT_REQUIRED", "UNRESOLVED"]),
  execution_status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "COMPLETE",
    "BLOCKED",
    "NOT_APPLICABLE"
  ]),
  authority: z.enum([
    "SERVER_RESEARCH_SESSION",
    "SERVER_ROUTER",
    "SERVER_EVIDENCE",
    "PENDING_SERVER_ROUTER"
  ])
}).strict().superRefine((value, context) => {
  if (
    value.applicability === "NOT_REQUIRED" &&
    value.execution_status !== "NOT_APPLICABLE"
  ) {
    context.addIssue({
      code: "custom",
      message: "A not-required module must be not applicable"
    });
  }
  if (
    value.applicability === "UNRESOLVED" &&
    value.execution_status !== "NOT_STARTED"
  ) {
    context.addIssue({
      code: "custom",
      message: "An unresolved module cannot claim execution progress"
    });
  }
  if (
    value.applicability === "REQUIRED" &&
    value.execution_status === "NOT_APPLICABLE"
  ) {
    context.addIssue({
      code: "custom",
      message: "A required module cannot be not applicable"
    });
  }
});

const operationBoundarySchema = z.object({
  classification: z.enum(["RETRYABLE", "TERMINAL_NONRETRYABLE"]),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/u),
  summary: z.string().min(1).max(1_000)
}).strict();

const operationStateSchema = z.object({
  status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "COMPLETE",
    "BLOCKED_RETRYABLE",
    "BLOCKED_TERMINAL"
  ]),
  boundary: operationBoundarySchema.optional()
}).strict().superRefine((value, context) => {
  const needsBoundary = value.status === "BLOCKED_RETRYABLE" ||
    value.status === "BLOCKED_TERMINAL";
  if (needsBoundary !== (value.boundary !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "Blocked operation state and access boundary must agree"
    });
    return;
  }
  if (
    value.status === "BLOCKED_RETRYABLE" &&
    value.boundary?.classification !== "RETRYABLE"
  ) {
    context.addIssue({
      code: "custom",
      message: "Retryable operation state needs a retryable boundary"
    });
  }
  if (
    value.status === "BLOCKED_TERMINAL" &&
    value.boundary?.classification !== "TERMINAL_NONRETRYABLE"
  ) {
    context.addIssue({
      code: "custom",
      message: "Terminal operation state needs a terminal boundary"
    });
  }
});

const moduleStatesSchema = z.object({
  HRP: moduleStateSchema,
  DIRECT_HUMAN: moduleStateSchema,
  EXTENDED_GREY: moduleStateSchema,
  FORUM_SIGNAL: moduleStateSchema,
  BIDIRECTIONAL_ITERATION: moduleStateSchema,
  FINAL_COMPLETION_AUDIT: moduleStateSchema
}).strict();

const operationStatesSchema = z.object({
  automated_video_scout: operationStateSchema,
  candidate_screening: operationStateSchema,
  transcript_acquisition: operationStateSchema,
  community_discussion_audit: operationStateSchema,
  formal_evidence_search: operationStateSchema,
  accessible_full_text_acquisition: operationStateSchema,
  study_method_audit: operationStateSchema,
  bidirectional_evidence_return: operationStateSchema,
  treatment_landscape_finalization: operationStateSchema,
  final_completion_audit: operationStateSchema
}).strict();

const scoutStateSchema = z.object({
  status: z.enum(["NOT_STARTED", "COMPLETE", "BLOCKED"]),
  provider_response_id: z.string().max(500).optional(),
  source_packet_version: z.string().max(20).optional(),
  validation_status: z.enum(["accepted", "partial", "rejected", "blocked"]).optional(),
  candidate_count: z.number().int().nonnegative().max(16),
  validated_candidate_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).max(16),
  unresolved_candidate_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).max(16),
  access_boundary: operationBoundarySchema.optional()
}).strict();

export const researchSessionStateSchema = z.object({
  state_version: z.literal("2.0"),
  research_target: z.string().min(1).max(1_000),
  diagnosis_status: z.enum(["diagnosis_not_specified", "user_supplied_diagnosis"]),
  protocol_binding: z.object({
    expected: protocolTupleSchema,
    currency: z.enum(["CURRENT", "DRIFTED"]),
    observed_current: protocolTupleSchema.optional()
  }).strict(),
  modules: moduleStatesSchema,
  operations: operationStatesSchema,
  scout: scoutStateSchema
}).strict().superRefine((state, context) => {
  if (
    state.protocol_binding.currency === "DRIFTED" &&
    state.protocol_binding.observed_current === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Protocol drift must preserve the observed current identities"
    });
  }
  if (
    state.protocol_binding.currency === "CURRENT" &&
    state.protocol_binding.observed_current !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Current protocol state cannot retain a drift observation"
    });
  }

  const scoutOperation = state.operations.automated_video_scout;
  if (
    state.scout.status === "COMPLETE" && scoutOperation.status !== "COMPLETE"
  ) {
    context.addIssue({
      code: "custom",
      message: "A complete scout needs a complete scout operation"
    });
  }
  if (
    state.scout.status === "BLOCKED" &&
    !["BLOCKED_RETRYABLE", "BLOCKED_TERMINAL"].includes(scoutOperation.status)
  ) {
    context.addIssue({
      code: "custom",
      message: "A blocked scout needs a blocked scout operation"
    });
  }
  if (state.scout.status === "NOT_STARTED" && scoutOperation.status !== "NOT_STARTED") {
    context.addIssue({
      code: "custom",
      message: "An unstarted scout needs an unstarted scout operation"
    });
  }
  if (
    state.scout.access_boundary === undefined !==
      (scoutOperation.boundary === undefined)
  ) {
    context.addIssue({
      code: "custom",
      message: "Scout and operation boundaries must be projected from the same receipt"
    });
  }
  if (
    state.scout.access_boundary !== undefined &&
    JSON.stringify(state.scout.access_boundary) !== JSON.stringify(scoutOperation.boundary)
  ) {
    context.addIssue({
      code: "custom",
      message: "Scout and operation boundaries must match"
    });
  }

  const candidateIds = [
    ...state.scout.validated_candidate_ids,
    ...state.scout.unresolved_candidate_ids
  ];
  if (new Set(candidateIds).size !== candidateIds.length) {
    context.addIssue({
      code: "custom",
      message: "Scout candidate projections cannot overlap or duplicate"
    });
  }
  if (candidateIds.length > state.scout.candidate_count) {
    context.addIssue({
      code: "custom",
      message: "Scout candidate count cannot be smaller than projected identities"
    });
  }
});

export type ResearchSessionState = z.output<typeof researchSessionStateSchema>;
export type ResearchModuleId = typeof RESEARCH_MODULE_IDS[number];
export type ResearchOperationId = typeof RESEARCH_OPERATION_IDS[number];

export const researchNextCapabilitySchema = z.enum([
  "route_module_applicability",
  "automated_video_scout",
  "candidate_screening",
  "transcript_acquisition",
  "community_discussion_audit",
  "formal_evidence_search",
  "accessible_full_text_acquisition",
  "study_method_audit",
  "bidirectional_evidence_return",
  "treatment_landscape_finalization",
  "final_completion_audit",
  "restart_under_current_protocols"
]);

export type ResearchNextCapability = z.output<
  typeof researchNextCapabilitySchema
>;

export const finalizationPermitSchema = z.object({
  permit_version: z.literal("askrigor_finalization_permit_v1"),
  execution_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  output_boundary: z.literal("FINALIZATION_ALLOWED"),
  protocol_identities: protocolTupleSchema,
  state_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  domain: z.literal("askrigor.research.finalization")
}).strict();

export type FinalizationPermit = z.output<typeof finalizationPermitSchema>;

const finalizationDenialReasonSchema = z.enum([
  "PROTOCOL_DRIFT",
  "MODULE_APPLICABILITY_UNRESOLVED",
  "REQUIRED_MODULE_INCOMPLETE",
  "REQUIRED_OPERATION_INCOMPLETE",
  "RETRYABLE_WORK_REMAINS",
  "TERMINAL_BOUNDARY_LIMITS_OUTPUT",
  "PHASE_A_FINALIZATION_NOT_ENABLED"
]);

export const researchSessionViewSchema = z.object({
  session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  execution_status: z.enum([
    "IN_PROGRESS",
    "BLOCKED_RETRYABLE",
    "BOUNDED",
    "PROTOCOL_DRIFT"
  ]),
  output_boundary: researchOutputBoundarySchema,
  protocol_binding: z.object({
    expected: protocolTupleSchema,
    currency: z.enum(["CURRENT", "DRIFTED"]),
    observed_current: protocolTupleSchema.optional()
  }).strict(),
  modules: moduleStatesSchema,
  operations: operationStatesSchema,
  scout: z.object({
    status: z.enum(["NOT_STARTED", "COMPLETE", "BLOCKED"]),
    candidate_count: z.number().int().nonnegative(),
    validated_candidate_count: z.number().int().nonnegative(),
    unresolved_candidate_count: z.number().int().nonnegative(),
    access_boundary: operationBoundarySchema.optional()
  }).strict(),
  required_next_capabilities: z.array(researchNextCapabilitySchema),
  finalization_permit: z.null()
}).strict();

export const finalizationDecisionSchema = z.object({
  session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  authorization: z.literal("DENIED"),
  output_boundary: z.enum(["CONTINUE_RESEARCH", "BOUNDED_NONRANKING_ONLY"]),
  finalization_permit: z.null(),
  denial_reasons: z.array(finalizationDenialReasonSchema).min(1),
  required_next_capabilities: z.array(researchNextCapabilitySchema),
  state_digest: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

export type ResearchFinalizationDecision = z.output<
  typeof finalizationDecisionSchema
>;

export interface ResearchSessionStartInput {
  research_target: string;
  diagnosis_status: "diagnosis_not_specified" | "user_supplied_diagnosis";
}

export interface AutomatedScoutCompletion {
  providerResponseId: string;
  sourcePacketVersion: string;
  validationStatus: "accepted" | "partial" | "rejected" | "blocked";
  sourceCandidateIds: readonly string[];
  validatedCandidateIds: readonly string[];
  unresolvedCandidateIds: readonly string[];
}

export function protocolBindingsFromManifests(
  universal: ProtocolManifest,
  hrp: ProtocolManifest
): ResearchSessionState["protocol_binding"]["expected"] {
  return protocolTupleSchema.parse([
    protocolIdentity("universal", universal),
    protocolIdentity("hrp", hrp)
  ]);
}

export function createInitialResearchSessionState(
  input: ResearchSessionStartInput,
  protocols: ResearchSessionState["protocol_binding"]["expected"]
): ResearchSessionState {
  const notStarted = (): ResearchSessionState["operations"][ResearchOperationId] => ({
    status: "NOT_STARTED"
  });
  const unresolvedModule = (): ResearchSessionState["modules"][ResearchModuleId] => ({
    applicability: "UNRESOLVED",
    execution_status: "NOT_STARTED",
    authority: "PENDING_SERVER_ROUTER"
  });

  return researchSessionStateSchema.parse({
    state_version: "2.0",
    research_target: input.research_target,
    diagnosis_status: input.diagnosis_status,
    protocol_binding: {
      expected: protocols,
      currency: "CURRENT"
    },
    modules: {
      HRP: {
        applicability: "REQUIRED",
        execution_status: "IN_PROGRESS",
        authority: "SERVER_RESEARCH_SESSION"
      },
      DIRECT_HUMAN: unresolvedModule(),
      EXTENDED_GREY: unresolvedModule(),
      FORUM_SIGNAL: unresolvedModule(),
      BIDIRECTIONAL_ITERATION: unresolvedModule(),
      FINAL_COMPLETION_AUDIT: {
        applicability: "REQUIRED",
        execution_status: "NOT_STARTED",
        authority: "SERVER_RESEARCH_SESSION"
      }
    },
    operations: {
      automated_video_scout: notStarted(),
      candidate_screening: notStarted(),
      transcript_acquisition: notStarted(),
      community_discussion_audit: notStarted(),
      formal_evidence_search: notStarted(),
      accessible_full_text_acquisition: notStarted(),
      study_method_audit: notStarted(),
      bidirectional_evidence_return: notStarted(),
      treatment_landscape_finalization: notStarted(),
      final_completion_audit: notStarted()
    },
    scout: {
      status: "NOT_STARTED",
      candidate_count: 0,
      validated_candidate_ids: [],
      unresolved_candidate_ids: []
    }
  });
}

export function applyServerModuleApplicability(
  rawState: ResearchSessionState,
  updates: Partial<Record<ResearchModuleId, "REQUIRED" | "NOT_REQUIRED">>,
  authority: "SERVER_ROUTER" | "SERVER_EVIDENCE"
): ResearchSessionState {
  const state = researchSessionStateSchema.parse(rawState);
  const modules = structuredClone(state.modules);
  for (const moduleId of RESEARCH_MODULE_IDS) {
    const nextApplicability = updates[moduleId];
    if (nextApplicability === undefined) continue;
    const current = modules[moduleId];
    if (
      current.applicability === "REQUIRED" &&
      nextApplicability !== "REQUIRED"
    ) {
      throw new Error(`Required research module ${moduleId} cannot be demoted`);
    }
    modules[moduleId] = nextApplicability === "REQUIRED"
      ? {
        applicability: "REQUIRED",
        execution_status: current.execution_status === "NOT_APPLICABLE"
          ? "NOT_STARTED"
          : current.execution_status,
        authority
      }
      : {
        applicability: "NOT_REQUIRED",
        execution_status: "NOT_APPLICABLE",
        authority
      };
  }
  return researchSessionStateSchema.parse({ ...state, modules });
}

export function applyProtocolRecheck(
  rawState: ResearchSessionState,
  observedCurrent: ResearchSessionState["protocol_binding"]["expected"]
): ResearchSessionState {
  const state = researchSessionStateSchema.parse(rawState);
  if (state.protocol_binding.currency === "DRIFTED") return state;
  if (sameProtocols(state.protocol_binding.expected, observedCurrent)) return state;
  return researchSessionStateSchema.parse({
    ...state,
    protocol_binding: {
      expected: state.protocol_binding.expected,
      currency: "DRIFTED",
      observed_current: observedCurrent
    }
  });
}

export function recordAutomatedScoutCompletion(
  rawState: ResearchSessionState,
  rawCompletion: AutomatedScoutCompletion
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  const completion = automatedScoutCompletionSchema.parse(rawCompletion);
  const sourceIds = unique(completion.sourceCandidateIds);
  const validatedIds = unique(completion.validatedCandidateIds);
  const unresolvedIds = unique(completion.unresolvedCandidateIds);
  assertSubset(validatedIds, sourceIds, "validated scout candidate");
  assertSubset(unresolvedIds, sourceIds, "unresolved scout candidate");
  if (validatedIds.some((videoId) => unresolvedIds.includes(videoId))) {
    throw new Error("Validated and unresolved scout candidates cannot overlap");
  }

  return researchSessionStateSchema.parse({
    ...state,
    operations: {
      ...state.operations,
      automated_video_scout: { status: "COMPLETE" }
    },
    scout: {
      status: "COMPLETE",
      provider_response_id: completion.providerResponseId,
      source_packet_version: completion.sourcePacketVersion,
      validation_status: completion.validationStatus,
      candidate_count: sourceIds.length,
      validated_candidate_ids: validatedIds,
      unresolved_candidate_ids: unresolvedIds
    }
  });
}

export function recordAutomatedScoutBoundary(
  rawState: ResearchSessionState,
  boundary: z.output<typeof operationBoundarySchema>
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  const parsedBoundary = operationBoundarySchema.parse(boundary);
  const status = parsedBoundary.classification === "RETRYABLE"
    ? "BLOCKED_RETRYABLE" as const
    : "BLOCKED_TERMINAL" as const;
  return researchSessionStateSchema.parse({
    ...state,
    operations: {
      ...state.operations,
      automated_video_scout: { status, boundary: parsedBoundary }
    },
    scout: {
      status: "BLOCKED",
      candidate_count: 0,
      validated_candidate_ids: [],
      unresolved_candidate_ids: [],
      access_boundary: parsedBoundary
    }
  });
}

export function deriveRequiredNextCapabilities(
  rawState: ResearchSessionState
): ResearchNextCapability[] {
  const state = researchSessionStateSchema.parse(rawState);
  if (state.protocol_binding.currency === "DRIFTED") {
    return ["restart_under_current_protocols"];
  }

  const capabilities: ResearchNextCapability[] = [];
  if (Object.values(state.modules).some(({ applicability }) =>
    applicability === "UNRESOLVED"
  )) {
    capabilities.push("route_module_applicability");
  }

  const scout = state.operations.automated_video_scout;
  if (isExecutable(scout)) capabilities.push("automated_video_scout");
  if (scout.status !== "COMPLETE") return unique(capabilities);

  if (isExecutable(state.operations.candidate_screening)) {
    capabilities.push("candidate_screening");
  }
  if (isExecutable(state.operations.formal_evidence_search)) {
    capabilities.push("formal_evidence_search");
  }
  if (state.operations.candidate_screening.status === "COMPLETE") {
    if (isExecutable(state.operations.transcript_acquisition)) {
      capabilities.push("transcript_acquisition");
    }
    if (isExecutable(state.operations.community_discussion_audit)) {
      capabilities.push("community_discussion_audit");
    }
  }
  if (
    state.operations.formal_evidence_search.status === "COMPLETE" &&
    isExecutable(state.operations.accessible_full_text_acquisition)
  ) {
    capabilities.push("accessible_full_text_acquisition");
  }
  if (
    state.operations.accessible_full_text_acquisition.status === "COMPLETE" &&
    isExecutable(state.operations.study_method_audit)
  ) {
    capabilities.push("study_method_audit");
  }
  if (
    operationCompleteOrTerminal(state.operations.transcript_acquisition) &&
    operationCompleteOrTerminal(state.operations.community_discussion_audit) &&
    operationCompleteOrTerminal(state.operations.study_method_audit) &&
    isExecutable(state.operations.bidirectional_evidence_return)
  ) {
    capabilities.push("bidirectional_evidence_return");
  }
  if (
    operationCompleteOrTerminal(state.operations.bidirectional_evidence_return) &&
    isExecutable(state.operations.treatment_landscape_finalization)
  ) {
    capabilities.push("treatment_landscape_finalization");
  }
  if (
    operationCompleteOrTerminal(state.operations.treatment_landscape_finalization) &&
    isExecutable(state.operations.final_completion_audit)
  ) {
    capabilities.push("final_completion_audit");
  }
  return unique(capabilities);
}

export function deriveResearchOutputBoundary(
  rawState: ResearchSessionState
): Exclude<ResearchOutputBoundary, "FINALIZATION_ALLOWED"> {
  const state = researchSessionStateSchema.parse(rawState);
  if (hasExecutableOrIncompleteWork(state)) return "CONTINUE_RESEARCH";
  if (hasTerminalBoundary(state)) return "BOUNDED_NONRANKING_ONLY";
  // Phase A deliberately leaves successful finalization unreachable.
  return "CONTINUE_RESEARCH";
}

export function mapTreatmentLandscapeBoundary(
  boundary: TreatmentLandscapeCoverageOutput["answer_boundary"]
): Exclude<ResearchOutputBoundary, "FINALIZATION_ALLOWED"> {
  if (boundary === "bounded_nonranking_only") {
    return "BOUNDED_NONRANKING_ONLY";
  }
  // A passing treatment ledger is one required gate, never global completion.
  return "CONTINUE_RESEARCH";
}

export function projectResearchSessionView(
  sessionId: string,
  rawState: ResearchSessionState
): z.output<typeof researchSessionViewSchema> {
  const state = researchSessionStateSchema.parse(rawState);
  const outputBoundary = deriveResearchOutputBoundary(state);
  const hasRetryable = Object.values(state.operations).some(({ status }) =>
    status === "BLOCKED_RETRYABLE"
  );
  return researchSessionViewSchema.parse({
    session_id: sessionId,
    execution_status: state.protocol_binding.currency === "DRIFTED"
      ? "PROTOCOL_DRIFT"
      : outputBoundary === "BOUNDED_NONRANKING_ONLY"
        ? "BOUNDED"
        : hasRetryable
          ? "BLOCKED_RETRYABLE"
          : "IN_PROGRESS",
    output_boundary: outputBoundary,
    protocol_binding: state.protocol_binding,
    modules: state.modules,
    operations: state.operations,
    scout: {
      status: state.scout.status,
      candidate_count: state.scout.candidate_count,
      validated_candidate_count: state.scout.validated_candidate_ids.length,
      unresolved_candidate_count: state.scout.unresolved_candidate_ids.length,
      ...(state.scout.access_boundary === undefined
        ? {}
        : { access_boundary: state.scout.access_boundary })
    },
    required_next_capabilities: deriveRequiredNextCapabilities(state),
    finalization_permit: null
  });
}

export function evaluateResearchFinalization(
  sessionId: string,
  rawState: ResearchSessionState
): ResearchFinalizationDecision {
  const state = researchSessionStateSchema.parse(rawState);
  const reasons: z.output<typeof finalizationDenialReasonSchema>[] = [];
  if (state.protocol_binding.currency === "DRIFTED") {
    reasons.push("PROTOCOL_DRIFT");
  }
  if (Object.values(state.modules).some(({ applicability }) =>
    applicability === "UNRESOLVED"
  )) {
    reasons.push("MODULE_APPLICABILITY_UNRESOLVED");
  }
  if (Object.values(state.modules).some((module) =>
    module.applicability === "REQUIRED" && module.execution_status !== "COMPLETE"
  )) {
    reasons.push("REQUIRED_MODULE_INCOMPLETE");
  }
  if (Object.values(state.operations).some(({ status }) =>
    status === "NOT_STARTED" || status === "IN_PROGRESS"
  )) {
    reasons.push("REQUIRED_OPERATION_INCOMPLETE");
  }
  if (Object.values(state.operations).some(({ status }) =>
    status === "BLOCKED_RETRYABLE"
  )) {
    reasons.push("RETRYABLE_WORK_REMAINS");
  }
  if (hasTerminalBoundary(state)) {
    reasons.push("TERMINAL_BOUNDARY_LIMITS_OUTPUT");
  }
  reasons.push("PHASE_A_FINALIZATION_NOT_ENABLED");

  return finalizationDecisionSchema.parse({
    session_id: sessionId,
    authorization: "DENIED",
    output_boundary: deriveResearchOutputBoundary(state),
    finalization_permit: null,
    denial_reasons: unique(reasons),
    required_next_capabilities: deriveRequiredNextCapabilities(state),
    state_digest: researchSessionStateDigest(state)
  });
}

export function researchSessionStateDigest(rawState: ResearchSessionState): string {
  const state = researchSessionStateSchema.parse(rawState);
  return createHash("sha256").update(JSON.stringify(state), "utf8").digest("hex");
}

export function assertResearchSessionTransition(
  rawPrevious: ResearchSessionState,
  rawNext: ResearchSessionState
): void {
  const previous = researchSessionStateSchema.parse(rawPrevious);
  const next = researchSessionStateSchema.parse(rawNext);
  if (
    previous.research_target !== next.research_target ||
    previous.diagnosis_status !== next.diagnosis_status ||
    !sameProtocols(
      previous.protocol_binding.expected,
      next.protocol_binding.expected
    )
  ) {
    throw new Error("Research session identity is immutable");
  }
  if (
    previous.protocol_binding.currency === "DRIFTED" &&
    next.protocol_binding.currency !== "DRIFTED"
  ) {
    throw new Error("Protocol drift cannot be cleared without a new execution");
  }
  for (const moduleId of RESEARCH_MODULE_IDS) {
    if (
      previous.modules[moduleId].applicability === "REQUIRED" &&
      next.modules[moduleId].applicability !== "REQUIRED"
    ) {
      throw new Error(`Required research module ${moduleId} cannot be demoted`);
    }
  }
  for (const operationId of RESEARCH_OPERATION_IDS) {
    const before = previous.operations[operationId].status;
    const after = next.operations[operationId].status;
    if (before === "COMPLETE" && after !== "COMPLETE") {
      throw new Error(`Completed operation ${operationId} cannot regress`);
    }
    if (before === "BLOCKED_TERMINAL" && after !== "BLOCKED_TERMINAL") {
      throw new Error(`Terminal operation ${operationId} cannot be silently reopened`);
    }
  }
  if (
    previous.scout.status === "COMPLETE" &&
    JSON.stringify(previous.scout) !== JSON.stringify(next.scout)
  ) {
    throw new Error("Completed scout evidence is immutable");
  }
}

function protocolIdentity(
  protocol: "universal" | "hrp",
  manifest: ProtocolManifest
) {
  return {
    protocol,
    name: manifest.name,
    version: manifest.version,
    revision_date: manifest.revisionDate,
    sha256: manifest.sha256
  };
}

function requireCurrentProtocols(rawState: ResearchSessionState): ResearchSessionState {
  const state = researchSessionStateSchema.parse(rawState);
  if (state.protocol_binding.currency !== "CURRENT") {
    throw new Error("Research session protocol binding is no longer current");
  }
  return state;
}

function sameProtocols(
  left: ResearchSessionState["protocol_binding"]["expected"],
  right: ResearchSessionState["protocol_binding"]["expected"]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isExecutable(operation: ResearchSessionState["operations"][ResearchOperationId]) {
  return operation.status === "NOT_STARTED" ||
    operation.status === "IN_PROGRESS" ||
    operation.status === "BLOCKED_RETRYABLE";
}

function operationCompleteOrTerminal(
  operation: ResearchSessionState["operations"][ResearchOperationId]
): boolean {
  return operation.status === "COMPLETE" || operation.status === "BLOCKED_TERMINAL";
}

function hasExecutableOrIncompleteWork(state: ResearchSessionState): boolean {
  if (state.protocol_binding.currency === "DRIFTED") return true;
  if (Object.values(state.modules).some((module) =>
    module.applicability === "UNRESOLVED" ||
    (module.applicability === "REQUIRED" && module.execution_status !== "COMPLETE")
  )) return true;
  return Object.values(state.operations).some(({ status }) =>
    status === "NOT_STARTED" ||
    status === "IN_PROGRESS" ||
    status === "BLOCKED_RETRYABLE"
  );
}

function hasTerminalBoundary(state: ResearchSessionState): boolean {
  return Object.values(state.operations).some(({ status }) =>
    status === "BLOCKED_TERMINAL"
  );
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function assertSubset(values: readonly string[], source: readonly string[], label: string): void {
  const sourceSet = new Set(source);
  if (values.some((value) => !sourceSet.has(value))) {
    throw new Error(`Every ${label} must belong to the source frontier`);
  }
}

const automatedScoutCompletionSchema = z.object({
  providerResponseId: z.string().min(1).max(500),
  sourcePacketVersion: z.string().min(1).max(20),
  validationStatus: z.enum(["accepted", "partial", "rejected", "blocked"]),
  sourceCandidateIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).max(16),
  validatedCandidateIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).max(16),
  unresolvedCandidateIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).max(16)
}).strict();
