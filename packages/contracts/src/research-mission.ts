import { createHash } from "node:crypto";
import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const boundedTextSchema = z.string().trim().min(1).max(8_000);
const boundedIdentifierSchema = z.string().trim().min(1).max(300);

export const researchMissionModeSchema = z.enum(["QUICK", "DEEP", "LONG_RANGE", "LIVING"]);

export const researchMissionStateSchema = z.enum([
  "PROPOSED",
  "PREFLIGHT",
  "ACTIVE",
  "INTERIM_SNAPSHOT",
  "RELEASE_CANDIDATE",
  "RELEASED",
  "PAUSED_USER",
  "PAUSED_BUDGET",
  "BLOCKED_ACCESS",
  "BLOCKED_OWNER_DECISION",
  "WAITING_FOR_EVIDENCE",
  "SCHEDULED_REFRESH",
  "STALE_REFRESH_FAILED",
  "CORRECTION_PENDING",
  "CANCELLED",
  "SUPERSEDED",
  "CLOSED",
]);

export const researchQuestionStatusSchema = z.enum([
  "ACTIVE",
  "ANSWERED_FOR_CURRENT_RELEASE",
  "DEFERRED",
  "SUPERSEDED",
  "REJECTED",
  "UNRESOLVED",
]);

const researchQuestionScopeSchema = z
  .object({
    population_or_domain: z.string().max(4_000).nullable(),
    intervention_or_exposure: z.string().max(4_000).nullable(),
    comparator: z.string().max(4_000).nullable(),
    outcomes: z.array(z.string().trim().min(1).max(1_000)).max(200),
    time_horizon: z.string().max(1_000).nullable(),
    setting_or_jurisdiction: z.string().max(1_000).nullable(),
    languages: z.array(z.string().trim().min(1).max(100)).max(100),
    included_source_classes: z.array(boundedIdentifierSchema).max(200),
    excluded_source_classes: z.array(boundedIdentifierSchema).max(200),
  })
  .strict();

export const researchQuestionSchema = z
  .object({
    question_id: boundedIdentifierSchema,
    version: z.number().int().min(1),
    status: researchQuestionStatusSchema,
    question: boundedTextSchema,
    scope: researchQuestionScopeSchema,
    derived_from_purpose_id: boundedIdentifierSchema,
    acceptance_requirements: z.array(boundedTextSchema).max(200),
    created_at: timestampSchema,
    supersedes_question_version: z.number().int().min(1).nullable(),
    amendment_id: boundedIdentifierSchema.nullable(),
  })
  .strict();

export const researchQuestionAmendmentSchema = z
  .object({
    amendment_id: boundedIdentifierSchema,
    question_id: boundedIdentifierSchema,
    from_version: z.number().int().min(1),
    to_version: z.number().int().min(2),
    change_type: z.enum(["CLARIFICATION", "NARROWING", "EXPANSION", "REPLACEMENT", "NEW_BRANCH"]),
    rationale: boundedTextSchema,
    evidence_refs: z.array(boundedIdentifierSchema).max(200),
    owner_or_authority_ref: boundedIdentifierSchema.nullable(),
    created_at: timestampSchema,
  })
  .strict()
  .refine((value) => value.to_version > value.from_version, {
    path: ["to_version"],
    message: "Amendment target version must exceed the source version",
  });

export const researchWorkPackageRoleSchema = z.enum([
  "DISCOVERY",
  "IDENTITY",
  "SCREENING",
  "ACCESS",
  "STUDY_AUDIT",
  "REVIEW_AUDIT",
  "SYNTHESIS",
  "CONTRADICTION_AND_INTEGRITY",
  "PREDICTION",
  "PATIENT_OR_COMMUNITY_EVIDENCE",
  "PUBLIC_EXPLANATION",
  "RELEASE_VERIFICATION",
  "IMPLEMENTATION",
  "OTHER",
]);

export const researchWorkPackageStatusSchema = z.enum([
  "PLANNED",
  "READY",
  "ACTIVE",
  "BLOCKED",
  "COMPLETE",
  "FAILED",
  "CANCELLED",
  "SUPERSEDED",
]);

const researchLeaseSchema = z
  .object({
    lease_id: boundedIdentifierSchema.nullable(),
    fence_token: boundedIdentifierSchema.nullable(),
    claimed_by: boundedIdentifierSchema.nullable(),
    claimed_at: timestampSchema.nullable(),
    expires_at: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const populated = [value.lease_id, value.fence_token, value.claimed_by, value.claimed_at, value.expires_at].filter(
      (entry) => entry !== null,
    ).length;
    if (populated !== 0 && populated !== 5) {
      context.addIssue({ code: "custom", path: [], message: "A research lease must be either empty or fully populated" });
    }
    if (value.claimed_at && value.expires_at && Date.parse(value.claimed_at) >= Date.parse(value.expires_at)) {
      context.addIssue({ code: "custom", path: ["expires_at"], message: "Research lease must expire after it is claimed" });
    }
  });

export const researchWorkPackageSchema = z
  .object({
    work_package_id: boundedIdentifierSchema,
    question_id: boundedIdentifierSchema,
    question_version: z.number().int().min(1),
    objective: boundedTextSchema,
    epistemic_role: researchWorkPackageRoleSchema,
    status: researchWorkPackageStatusSchema,
    read_set: z.array(boundedIdentifierSchema).max(2_000),
    write_set: z.array(boundedIdentifierSchema).max(2_000),
    prerequisites: z.array(boundedIdentifierSchema).max(500),
    dependencies: z.array(boundedIdentifierSchema).max(500),
    independence_requirement: z.enum(["NONE", "INDEPENDENT", "BLINDED_INDEPENDENT", "ADJUDICATOR_ONLY"]),
    blinding_requirement: z.enum(["NONE", "BLINDED_TO_PEERS", "BLINDED_TO_SYNTHESIS", "BLINDED_TO_OUTCOME", "OTHER"]),
    worker_class: z.enum(["CODEX", "EXTRA_HIGH", "PRO", "DETERMINISTIC_SERVICE", "HUMAN"]),
    reasoning_tier: z.enum(["STANDARD", "HIGH", "EXTRA_HIGH", "PRO", "NOT_APPLICABLE"]),
    allowed_tools_and_providers: z.array(boundedIdentifierSchema).max(200),
    budget: z
      .object({
        currency: z.string().max(10).nullable(),
        hard_ceiling: z.number().nonnegative().nullable(),
        token_or_usage_ceiling: z.number().int().nonnegative().nullable(),
        time_or_cycle_ceiling: z.number().int().positive().nullable(),
      })
      .strict(),
    lease: researchLeaseSchema,
    structured_output_schema_ref: boundedIdentifierSchema,
    deterministic_acceptance_checks: z.array(boundedTextSchema).max(200),
    scientific_review_required: z.boolean(),
    scientific_review_state: z.enum(["NOT_REVIEWED", "PENDING", "ACCEPTED", "REJECTED", "UNRESOLVED"]),
    heartbeat_cadence: boundedTextSchema,
    last_heartbeat_at: timestampSchema.nullable(),
    checkpoint_ref: boundedIdentifierSchema.nullable(),
    escalation_criteria: z.array(boundedTextSchema).max(100),
    stop_conditions: z.array(boundedTextSchema).max(100),
    completion_disposition: z
      .enum(["SUBTASK_COMPLETE_PARENT_OPEN", "BLOCKED", "FAILED", "ROOT_CLOSURE_CANDIDATE"])
      .nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "ACTIVE" && value.lease.lease_id === null) {
      context.addIssue({ code: "custom", path: ["lease"], message: "Active work packages require a lease" });
    }
    if (value.status === "COMPLETE" && value.completion_disposition === null) {
      context.addIssue({ code: "custom", path: ["completion_disposition"], message: "Completed packages require a completion disposition" });
    }
  });

const sourceFrontierSchema = z
  .object({
    frontier_version: z.number().int().min(1),
    source_classes: z.array(boundedIdentifierSchema).max(500),
    search_passes: z.array(boundedIdentifierSchema).max(100_000),
    requested_date_windows: z.array(boundedTextSchema).max(1_000),
    confirmed_date_windows: z.array(boundedTextSchema).max(1_000),
    query_fingerprints: z.array(boundedIdentifierSchema).max(100_000),
    pagination_or_cursor_state: z.array(boundedTextSchema).max(100_000),
    candidate_counts: z
      .object({
        discovered: z.number().int().nonnegative(),
        screened: z.number().int().nonnegative(),
        included: z.number().int().nonnegative(),
        excluded: z.number().int().nonnegative(),
        deferred: z.number().int().nonnegative(),
        duplicate: z.number().int().nonnegative(),
        unresolved_identity: z.number().int().nonnegative(),
      })
      .strict(),
    full_text_coverage: z
      .object({
        complete: z.number().int().nonnegative(),
        partial: z.number().int().nonnegative(),
        abstract_or_registry_only: z.number().int().nonnegative(),
        inaccessible: z.number().int().nonnegative(),
        unknown: z.number().int().nonnegative(),
      })
      .strict(),
    audit_coverage: z.array(boundedTextSchema).max(10_000),
    synthesis_coverage: z.array(boundedTextSchema).max(10_000),
    unresolved_trails: z.array(boundedTextSchema).max(10_000),
    blocked_sources: z.array(boundedTextSchema).max(10_000),
    zero_result_receipts: z.array(boundedIdentifierSchema).max(10_000),
    freshness: z
      .object({
        last_complete_pass_at: timestampSchema.nullable(),
        last_partial_pass_at: timestampSchema.nullable(),
        next_refresh_due_at: timestampSchema.nullable(),
        refresh_state: z.enum(["NOT_SCHEDULED", "CURRENT", "DUE", "RUNNING", "FAILED_STALE", "PAUSED"]),
      })
      .strict(),
    stopping_or_refresh_rule: boundedTextSchema,
  })
  .strict();

const invariantPurposeSchema = z
  .object({
    purpose_id: boundedIdentifierSchema,
    epoch: z.number().int().min(1),
    sha256: sha256Schema,
    source_refs: z.array(boundedIdentifierSchema).max(100),
    verbatim_owner_or_user_request: z.array(boundedTextSchema).min(1).max(100),
    normalized_purpose: boundedTextSchema,
    non_satisfying_proxies: z.array(boundedTextSchema).max(100),
    frozen: z.literal(true),
  })
  .strict();

const terminalComparatorSchema = z
  .object({
    result: z.enum(["OWNER_OUTCOME_SATISFIED", "OWNER_OUTCOME_NOT_SATISFIED", "NOT_EVALUATED"]).nullable(),
    evaluates_invariant_purpose: z.literal(true),
    evaluated_purpose_epoch: z.number().int().min(1).nullable(),
    evaluated_purpose_sha256: sha256Schema.nullable(),
    required_outcome_evidence_refs: z.array(boundedIdentifierSchema).max(1_000),
    unresolved_gaps_compatible_with_closure: z.boolean().nullable(),
    no_active_leases_or_unreviewed_consequential_conflicts: z.boolean().nullable(),
    release_handback_and_deletion_obligations_complete: z.boolean().nullable(),
  })
  .strict();

export const researchMissionSchema = z
  .object({
    schema_version: z.literal("research-mission-v1"),
    mission_id: boundedIdentifierSchema,
    title: boundedTextSchema,
    mode: researchMissionModeSchema,
    state: researchMissionStateSchema,
    owner_authorized: z.literal(true),
    invariant_purpose: invariantPurposeSchema,
    research_questions: z.array(researchQuestionSchema).min(1).max(1_000),
    question_amendments: z.array(researchQuestionAmendmentSchema).max(10_000),
    source_frontier: sourceFrontierSchema,
    work_packages: z.array(researchWorkPackageSchema).max(10_000),
    maximum_concurrent_packages: z.number().int().positive(),
    write_set_conflict_policy: z.literal("REJECT_OR_SERIALIZE"),
    stale_commit_policy: z.literal("REJECT_BY_FENCE_TOKEN"),
    false_consensus_prohibited: z.literal(true),
    mission_wide_percent_complete: z.null(),
    current_state_summary: boundedTextSchema,
    latest_interim_snapshot_ref: boundedIdentifierSchema.nullable(),
    current_release_ref: boundedIdentifierSchema.nullable(),
    next_executable_step: boundedTextSchema,
    owner_decision_needed: boundedTextSchema.nullable(),
    public_release_allowed: z.boolean(),
    release_receipt_required: z.literal(true),
    worker_may_publish_directly: z.literal(false),
    supervisor_verdict_alone_may_publish: z.literal(false),
    retention_policy_ref: boundedIdentifierSchema,
    cancellation_policy_ref: boundedIdentifierSchema,
    proposed_terminal_state: researchMissionStateSchema.nullable(),
    terminal_comparator: terminalComparatorSchema,
    mission_payload_sha256: sha256Schema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const activeQuestionKeys = value.research_questions.map((question) => `${question.question_id}:${question.version}`);
    if (new Set(activeQuestionKeys).size !== activeQuestionKeys.length) {
      context.addIssue({ code: "custom", path: ["research_questions"], message: "Question ID/version pairs must be unique" });
    }
    const packageIds = value.work_packages.map((workPackage) => workPackage.work_package_id);
    if (new Set(packageIds).size !== packageIds.length) {
      context.addIssue({ code: "custom", path: ["work_packages"], message: "Work package IDs must be unique" });
    }
    if (value.state === "CLOSED") {
      const comparator = value.terminal_comparator;
      if (
        comparator.result !== "OWNER_OUTCOME_SATISFIED" ||
        comparator.evaluated_purpose_epoch !== value.invariant_purpose.epoch ||
        comparator.evaluated_purpose_sha256 !== value.invariant_purpose.sha256 ||
        comparator.unresolved_gaps_compatible_with_closure !== true ||
        comparator.no_active_leases_or_unreviewed_consequential_conflicts !== true ||
        comparator.release_handback_and_deletion_obligations_complete !== true
      ) {
        context.addIssue({ code: "custom", path: ["terminal_comparator"], message: "Closed missions require a passing comparator against the current invariant purpose" });
      }
    }
  });

export type ResearchMission = z.infer<typeof researchMissionSchema>;
export type ResearchQuestion = z.infer<typeof researchQuestionSchema>;
export type ResearchWorkPackage = z.infer<typeof researchWorkPackageSchema>;

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical mission JSON does not permit non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) {
        output[key] = canonicalize(child);
      }
    }
    return output;
  }
  throw new TypeError(`Canonical mission JSON does not permit values of type ${typeof value}`);
}

export function researchMissionSha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

export function sealResearchMission(input: ResearchMission): ResearchMission {
  const parsed = researchMissionSchema.parse(input);
  const withoutHash = { ...parsed, mission_payload_sha256: null };
  return researchMissionSchema.parse({
    ...withoutHash,
    mission_payload_sha256: researchMissionSha256(withoutHash),
  });
}

const allowedTransitions: Readonly<Record<ResearchMission["state"], readonly ResearchMission["state"][]>> = {
  PROPOSED: ["PREFLIGHT", "CANCELLED"],
  PREFLIGHT: ["ACTIVE", "BLOCKED_ACCESS", "BLOCKED_OWNER_DECISION", "PAUSED_BUDGET", "CANCELLED"],
  ACTIVE: [
    "INTERIM_SNAPSHOT",
    "RELEASE_CANDIDATE",
    "PAUSED_USER",
    "PAUSED_BUDGET",
    "BLOCKED_ACCESS",
    "BLOCKED_OWNER_DECISION",
    "WAITING_FOR_EVIDENCE",
    "CORRECTION_PENDING",
    "CANCELLED",
  ],
  INTERIM_SNAPSHOT: ["ACTIVE", "RELEASE_CANDIDATE", "PAUSED_USER", "PAUSED_BUDGET", "CANCELLED"],
  RELEASE_CANDIDATE: ["RELEASED", "ACTIVE", "CORRECTION_PENDING", "BLOCKED_OWNER_DECISION", "CANCELLED"],
  RELEASED: ["ACTIVE", "SCHEDULED_REFRESH", "CORRECTION_PENDING", "SUPERSEDED", "CLOSED"],
  PAUSED_USER: ["ACTIVE", "CANCELLED"],
  PAUSED_BUDGET: ["ACTIVE", "CANCELLED"],
  BLOCKED_ACCESS: ["ACTIVE", "WAITING_FOR_EVIDENCE", "CANCELLED"],
  BLOCKED_OWNER_DECISION: ["ACTIVE", "CANCELLED"],
  WAITING_FOR_EVIDENCE: ["ACTIVE", "SCHEDULED_REFRESH", "CANCELLED"],
  SCHEDULED_REFRESH: ["ACTIVE", "STALE_REFRESH_FAILED", "PAUSED_USER", "PAUSED_BUDGET", "CANCELLED"],
  STALE_REFRESH_FAILED: ["ACTIVE", "SCHEDULED_REFRESH", "CORRECTION_PENDING", "CANCELLED"],
  CORRECTION_PENDING: ["ACTIVE", "RELEASE_CANDIDATE", "CANCELLED"],
  CANCELLED: [],
  SUPERSEDED: ["CLOSED"],
  CLOSED: [],
};

export function transitionResearchMission(
  input: ResearchMission,
  nextState: ResearchMission["state"],
  currentStateSummary: string,
  nextExecutableStep: string,
): ResearchMission {
  const mission = researchMissionSchema.parse(input);
  if (!allowedTransitions[mission.state].includes(nextState)) {
    throw new Error(`Invalid research mission transition: ${mission.state} -> ${nextState}`);
  }
  return sealResearchMission({
    ...mission,
    state: nextState,
    current_state_summary: currentStateSummary,
    next_executable_step: nextExecutableStep,
    proposed_terminal_state: nextState === "CLOSED" ? "CLOSED" : mission.proposed_terminal_state,
  });
}

export interface ClaimResearchWorkPackageInput {
  work_package_id: string;
  worker_id: string;
  lease_id: string;
  fence_token: string;
  claimed_at: string;
  expires_at: string;
}

export function claimResearchWorkPackage(
  inputMission: ResearchMission,
  input: ClaimResearchWorkPackageInput,
): ResearchMission {
  const mission = researchMissionSchema.parse(inputMission);
  const index = mission.work_packages.findIndex((workPackage) => workPackage.work_package_id === input.work_package_id);
  if (index < 0) {
    throw new RangeError("Unknown research work package");
  }
  const workPackage = mission.work_packages[index] as ResearchWorkPackage;
  if (workPackage.status !== "PLANNED" && workPackage.status !== "READY" && workPackage.status !== "BLOCKED") {
    throw new Error("Research work package is not claimable");
  }
  if (Date.parse(input.claimed_at) >= Date.parse(input.expires_at)) {
    throw new RangeError("Research work package lease must expire after claim time");
  }
  const updatedPackages = mission.work_packages.map((candidate, candidateIndex) =>
    candidateIndex === index
      ? researchWorkPackageSchema.parse({
          ...candidate,
          status: "ACTIVE",
          lease: {
            lease_id: input.lease_id,
            fence_token: input.fence_token,
            claimed_by: input.worker_id,
            claimed_at: input.claimed_at,
            expires_at: input.expires_at,
          },
          last_heartbeat_at: input.claimed_at,
        })
      : candidate,
  );
  return sealResearchMission({ ...mission, work_packages: updatedPackages });
}

export interface CompleteResearchWorkPackageInput {
  work_package_id: string;
  fence_token: string;
  completed_at: string;
  checkpoint_ref: string;
  disposition: "SUBTASK_COMPLETE_PARENT_OPEN" | "BLOCKED" | "FAILED" | "ROOT_CLOSURE_CANDIDATE";
  scientific_review_state?: "NOT_REVIEWED" | "PENDING" | "ACCEPTED" | "REJECTED" | "UNRESOLVED";
}

export function completeResearchWorkPackage(
  inputMission: ResearchMission,
  input: CompleteResearchWorkPackageInput,
): ResearchMission {
  const mission = researchMissionSchema.parse(inputMission);
  const index = mission.work_packages.findIndex((workPackage) => workPackage.work_package_id === input.work_package_id);
  if (index < 0) {
    throw new RangeError("Unknown research work package");
  }
  const workPackage = mission.work_packages[index] as ResearchWorkPackage;
  if (workPackage.status !== "ACTIVE" || workPackage.lease.fence_token !== input.fence_token) {
    throw new Error("Stale or unauthorized research work package commit");
  }
  if (workPackage.lease.expires_at === null || Date.parse(input.completed_at) > Date.parse(workPackage.lease.expires_at)) {
    throw new Error("Research work package lease expired before completion commit");
  }
  const status =
    input.disposition === "SUBTASK_COMPLETE_PARENT_OPEN" || input.disposition === "ROOT_CLOSURE_CANDIDATE"
      ? "COMPLETE"
      : input.disposition === "BLOCKED"
        ? "BLOCKED"
        : "FAILED";
  const updatedPackages = mission.work_packages.map((candidate, candidateIndex) =>
    candidateIndex === index
      ? researchWorkPackageSchema.parse({
          ...candidate,
          status,
          checkpoint_ref: input.checkpoint_ref,
          last_heartbeat_at: input.completed_at,
          completion_disposition: input.disposition,
          scientific_review_state: input.scientific_review_state ?? candidate.scientific_review_state,
          lease: {
            lease_id: null,
            fence_token: null,
            claimed_by: null,
            claimed_at: null,
            expires_at: null,
          },
        })
      : candidate,
  );
  return sealResearchMission({ ...mission, work_packages: updatedPackages });
}

export interface AmendResearchQuestionInput {
  question_id: string;
  from_version: number;
  change_type: z.infer<typeof researchQuestionAmendmentSchema>["change_type"];
  rationale: string;
  evidence_refs: string[];
  owner_or_authority_ref?: string | null;
  created_at: string;
  new_question: Omit<ResearchQuestion, "version" | "supersedes_question_version" | "amendment_id">;
}

export function amendResearchQuestion(
  inputMission: ResearchMission,
  input: AmendResearchQuestionInput,
): ResearchMission {
  const mission = researchMissionSchema.parse(inputMission);
  const current = mission.research_questions.find(
    (question) => question.question_id === input.question_id && question.version === input.from_version,
  );
  if (!current) {
    throw new RangeError("Research question version to amend was not found");
  }
  if (input.new_question.derived_from_purpose_id !== mission.invariant_purpose.purpose_id) {
    throw new Error("Research question amendment cannot detach from the invariant purpose");
  }
  const nextVersion = input.from_version + 1;
  const amendmentId = `${input.question_id}-amendment-${nextVersion}`;
  const amendment = researchQuestionAmendmentSchema.parse({
    amendment_id: amendmentId,
    question_id: input.question_id,
    from_version: input.from_version,
    to_version: nextVersion,
    change_type: input.change_type,
    rationale: input.rationale,
    evidence_refs: input.evidence_refs,
    owner_or_authority_ref: input.owner_or_authority_ref ?? null,
    created_at: input.created_at,
  });
  const supersededQuestions = mission.research_questions.map((question) =>
    question.question_id === input.question_id && question.version === input.from_version
      ? researchQuestionSchema.parse({ ...question, status: "SUPERSEDED" })
      : question,
  );
  const nextQuestion = researchQuestionSchema.parse({
    ...input.new_question,
    version: nextVersion,
    supersedes_question_version: input.from_version,
    amendment_id: amendmentId,
  });
  return sealResearchMission({
    ...mission,
    research_questions: [...supersededQuestions, nextQuestion],
    question_amendments: [...mission.question_amendments, amendment],
  });
}
