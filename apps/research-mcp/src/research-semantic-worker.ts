import { z } from "zod";

import {
  candidateScreeningSubmissionSchema,
  candidateScreeningWorkPackageSchema
} from "./actions/research-candidate-frontier.js";
import {
  RESEARCH_MODULE_IDS
} from "./actions/research-session-controller.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const sessionId = z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);

const moduleDecisionSchema = z.object({
  module_id: z.enum(RESEARCH_MODULE_IDS),
  applicability: z.enum(["REQUIRED", "NOT_REQUIRED"]),
  rationale: bounded(1_000)
}).strict();

export const moduleApplicabilitySubmissionSchema = z.object({
  package_version: z.literal("askrigor_module_applicability_v1"),
  decisions: z.array(moduleDecisionSchema).min(1).max(RESEARCH_MODULE_IDS.length)
}).strict();

const moduleOutputSchema = z.object({
  contract_version: z.literal("askrigor_hermes_semantic_result_v1"),
  session_id: sessionId,
  state_digest: digest,
  work_type: z.literal("module_applicability"),
  submission: moduleApplicabilitySubmissionSchema
}).strict();

const candidateOutputSchema = z.object({
  contract_version: z.literal("askrigor_hermes_semantic_result_v1"),
  session_id: sessionId,
  state_digest: digest,
  work_type: z.literal("candidate_screening"),
  submission: candidateScreeningSubmissionSchema
}).strict();

export const researchSemanticModelOutputSchema = z.discriminatedUnion(
  "work_type",
  [moduleOutputSchema, candidateOutputSchema]
);

export const researchSemanticExecutionEnvelopeSchema = z.object({
  model_output: researchSemanticModelOutputSchema
}).passthrough();

export type ResearchSemanticModelOutput = z.output<
  typeof researchSemanticModelOutputSchema
>;

const moduleWorkPackageSchema = z.object({
  kind: z.literal("module_applicability"),
  package: z.object({
    package_version: z.literal("askrigor_module_applicability_v1"),
    state_digest: digest,
    unresolved_module_ids: z.array(z.enum(RESEARCH_MODULE_IDS)).min(1)
  }).strict()
}).strict();

const candidateWorkPackageSchema = z.object({
  kind: z.literal("candidate_screening"),
  package: candidateScreeningWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

export const researchSemanticWorkSchema = z.union([
  moduleWorkPackageSchema,
  candidateWorkPackageSchema
]);

export type ResearchSemanticWork = z.output<
  typeof researchSemanticWorkSchema
>;

export interface ResearchSemanticWorkPackage {
  session_id: string;
  state_digest: string;
  research_context?: string;
  semantic_work: ResearchSemanticWork;
}

export interface ResearchSemanticExecutor {
  execute(input: ResearchSemanticWorkPackage): Promise<unknown>;
}

export function assertResearchSemanticBinding(
  expected: {
    session_id: string;
    state_digest: string;
    work_type: "module_applicability" | "candidate_screening";
    discovery_digest?: string;
  },
  output: ResearchSemanticModelOutput
): void {
  if (
    output.session_id !== expected.session_id ||
    output.state_digest !== expected.state_digest ||
    output.work_type !== expected.work_type
  ) {
    throw new Error("Semantic result is bound to another work package");
  }
  if (
    output.work_type === "candidate_screening" &&
    output.submission.discovery_digest !== expected.discovery_digest
  ) {
    throw new Error("Candidate result is bound to another discovery frontier");
  }
}
