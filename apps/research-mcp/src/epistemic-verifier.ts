import { createHash } from "node:crypto";

import { z } from "zod";

export const EPISTEMIC_VERIFIER_VERSION = "askrigor_epistemic_verifier_v0_1" as const;

const shortId = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/u);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const scalarSchema = z.union([
  z.string().trim().min(1).max(500),
  z.number().finite(),
  z.boolean()
]);
const provenanceSchema = z.object({
  kind: z.enum(["user_supplied", "source_grounded", "inference"]),
  source_id: boundedText(500)
}).strict();
const comparisonRoleSchema = z.enum([
  "positive",
  "tolerated_control",
  "negative_control",
  "unknown"
]);
const dependencySchema = z.object({
  kind: z.enum(["observation", "claim"]),
  id: shortId
}).strict();
const predicateOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "gt",
  "gte",
  "lt",
  "lte"
]);
const featurePredicateOperatorSchema = z.enum([
  "present",
  "absent",
  "equals",
  "not_equals",
  "gt",
  "gte",
  "lt",
  "lte"
]);

const targetSchema = z.object({
  target_id: shortId,
  label: boundedText(240),
  description: boundedText(1_500)
}).strict();

const caseSchema = z.object({
  case_id: shortId,
  label: boundedText(240),
  comparison_role: comparisonRoleSchema,
  provenance: provenanceSchema
}).strict();

const observationSchema = z.object({
  observation_id: shortId,
  target_id: shortId,
  case_id: shortId,
  statement: boundedText(1_500),
  material: z.boolean(),
  qualifiers: z.record(shortId, scalarSchema),
  high_information_qualifier_keys: z.array(shortId).max(30),
  provenance: provenanceSchema
}).strict();

const featureAssignmentSchema = z.object({
  case_id: shortId,
  feature_id: shortId,
  value: scalarSchema,
  provenance: provenanceSchema
}).strict();

const comparisonSchema = z.object({
  comparison_id: shortId,
  target_id: shortId,
  positive_case_ids: z.array(shortId).min(1).max(50),
  control_case_ids: z.array(shortId).max(50)
}).strict();

const discriminatorSchema = z.object({
  feature_id: shortId,
  operator: featurePredicateOperatorSchema,
  value: scalarSchema.optional(),
  modifier: z.object({
    kind: z.enum(["dose", "form", "route", "context", "interaction", "other"]),
    claim_id: shortId
  }).strict().optional()
}).strict();

const qualifierPredictionSchema = z.object({
  observation_id: shortId,
  qualifier_key: shortId,
  operator: predicateOperatorSchema,
  value: scalarSchema,
  exception_claim_id: shortId.optional()
}).strict();

const hypothesisSchema = z.object({
  hypothesis_id: shortId,
  target_id: shortId,
  statement: boundedText(1_500),
  material: z.boolean(),
  discriminator: discriminatorSchema,
  qualifier_predictions: z.array(qualifierPredictionSchema).max(200)
}).strict();

const claimSchema = z.object({
  claim_id: shortId,
  target_id: shortId,
  kind: z.enum(["conclusion", "modifier", "mechanism", "intermediate"]),
  statement: boundedText(1_500),
  material: z.boolean(),
  provenance: provenanceSchema,
  dependencies: z.array(dependencySchema).max(100)
}).strict();

export const epistemicStateV1Schema = z.object({
  state_version: z.literal("askrigor_epistemic_state_v1"),
  target: targetSchema,
  cases: z.array(caseSchema).min(1).max(100),
  observations: z.array(observationSchema).min(1).max(500),
  features: z.array(featureAssignmentSchema).max(2_000),
  comparisons: z.array(comparisonSchema).max(100),
  hypotheses: z.array(hypothesisSchema).max(100),
  claims: z.array(claimSchema).max(500)
}).strict();

export type EpistemicStateV1 = z.output<typeof epistemicStateV1Schema>;

const gateNameSchema = z.enum([
  "SPECIFICITY_DISCRIMINATOR",
  "EVIDENCE_DIRECTION",
  "TARGET_PRESERVATION",
  "PROVENANCE_DEPENDENCY",
  "SYNTHESIS_LOCK"
]);
const gateStatusSchema = z.enum(["pass", "block", "insufficient"]);

export const epistemicGateReceiptSchema = z.object({
  gate: gateNameSchema,
  status: gateStatusSchema,
  blockers: z.array(boundedText(1_000)).max(500),
  checked_ids: z.array(shortId).max(2_000)
}).strict();

export const epistemicVerifierReceiptSchema = z.object({
  verifier_version: z.literal(EPISTEMIC_VERIFIER_VERSION),
  state_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  gates: z.array(epistemicGateReceiptSchema).length(5),
  definitive_synthesis: z.boolean(),
  synthesis_boundary: z.enum(["definitive_allowed", "bounded_or_uncertain_only"]),
  blockers: z.array(boundedText(1_000)).max(2_000)
}).strict();

export type EpistemicGateReceipt = z.output<typeof epistemicGateReceiptSchema>;
export type EpistemicVerifierReceipt = z.output<typeof epistemicVerifierReceiptSchema>;

export function verifyEpistemicState(rawState: unknown): EpistemicVerifierReceipt {
  const state = epistemicStateV1Schema.parse(rawState);
  const specificity = evaluateSpecificityDiscriminatorGate(state);
  const direction = evaluateEvidenceDirectionGate(state);
  const target = evaluateTargetPreservationGate(state);
  const provenance = evaluateProvenanceDependencyGate(state);
  const hardGates = [specificity, direction, target, provenance];
  const hardBlockers = hardGates.flatMap((receipt) => receipt.blockers);
  const synthesisStatus = hardGates.some(({ status }) => status === "block")
    ? "block" as const
    : hardGates.some(({ status }) => status === "insufficient")
      ? "insufficient" as const
      : "pass" as const;
  const synthesis = epistemicGateReceiptSchema.parse({
    gate: "SYNTHESIS_LOCK",
    status: synthesisStatus,
    blockers: synthesisStatus === "pass"
      ? []
      : hardBlockers.length > 0
        ? hardBlockers
        : ["At least one hard epistemic gate is not in a pass state."],
    checked_ids: hardGates.flatMap(({ checked_ids }) => checked_ids)
  });
  const gates = [specificity, direction, target, provenance, synthesis];
  const definitive = synthesis.status === "pass";
  return epistemicVerifierReceiptSchema.parse({
    verifier_version: EPISTEMIC_VERIFIER_VERSION,
    state_sha256: sha256(JSON.stringify(state)),
    gates,
    definitive_synthesis: definitive,
    synthesis_boundary: definitive
      ? "definitive_allowed"
      : "bounded_or_uncertain_only",
    blockers: definitive ? [] : synthesis.blockers
  });
}

export function evaluateSpecificityDiscriminatorGate(
  state: EpistemicStateV1
): EpistemicGateReceipt {
  const materialHypotheses = state.hypotheses.filter(({ material }) => material);
  const comparisons = state.comparisons.filter(({ target_id }) =>
    target_id === state.target.target_id
  );
  const positiveIds = unique(comparisons.flatMap(({ positive_case_ids }) => positive_case_ids));
  const controlIds = unique(comparisons.flatMap(({ control_case_ids }) => control_case_ids));
  const blockers: string[] = [];
  const insufficient: string[] = [];
  const checkedIds = materialHypotheses.map(({ hypothesis_id }) => hypothesis_id);

  if (materialHypotheses.length === 0) {
    return gateReceipt(
      "SPECIFICITY_DISCRIMINATOR",
      "insufficient",
      ["No material hypothesis is represented for specificity testing."],
      []
    );
  }
  if (comparisons.length === 0 || controlIds.length === 0) {
    return gateReceipt(
      "SPECIFICITY_DISCRIMINATOR",
      "insufficient",
      ["No tolerated or negative control comparison is represented; discrimination cannot be established."],
      checkedIds
    );
  }
  if (positiveIds.length === 0) {
    return gateReceipt(
      "SPECIFICITY_DISCRIMINATOR",
      "insufficient",
      ["No positive comparison cases are represented; discrimination cannot be established."],
      checkedIds
    );
  }

  const claims = new Map(state.claims.map((claim) => [claim.claim_id, claim]));
  for (const hypothesis of materialHypotheses) {
    if (hypothesis.discriminator.modifier !== undefined) {
      const modifier = claims.get(hypothesis.discriminator.modifier.claim_id);
      if (
        modifier === undefined ||
        !["modifier", "mechanism"].includes(modifier.kind) ||
        modifier.target_id !== hypothesis.target_id
      ) {
        blockers.push(
          `${hypothesis.hypothesis_id}: the proposed discriminator modifier is not represented by a target-bound modifier/mechanism claim.`
        );
      }
    }
    const positiveResults = positiveIds.map((caseId) =>
      evaluateFeaturePredicate(state, caseId, hypothesis.discriminator)
    );
    const controlResults = controlIds.map((caseId) =>
      evaluateFeaturePredicate(state, caseId, hypothesis.discriminator)
    );
    if ([...positiveResults, ...controlResults].some((value) => value === undefined)) {
      insufficient.push(
        `${hypothesis.hypothesis_id}: discriminator evidence is missing or ambiguous for at least one positive/control case.`
      );
      continue;
    }
    if (
      !positiveResults.every((value) => value === true) ||
      !controlResults.every((value) => value === false)
    ) {
      blockers.push(
        `${hypothesis.hypothesis_id}: the proposed discriminator does not distinguish every represented positive case from every tolerated/negative control.`
      );
    }
  }

  if (blockers.length > 0) {
    return gateReceipt("SPECIFICITY_DISCRIMINATOR", "block", blockers, checkedIds);
  }
  if (insufficient.length > 0) {
    return gateReceipt("SPECIFICITY_DISCRIMINATOR", "insufficient", insufficient, checkedIds);
  }
  return gateReceipt("SPECIFICITY_DISCRIMINATOR", "pass", [], checkedIds);
}

export function evaluateEvidenceDirectionGate(
  state: EpistemicStateV1
): EpistemicGateReceipt {
  const blockers: string[] = [];
  const insufficient: string[] = [];
  const observations = state.observations.filter((observation) =>
    observation.material && observation.target_id === state.target.target_id
  );
  const observationById = new Map(state.observations.map((observation) => [
    observation.observation_id,
    observation
  ]));
  const claims = new Map(state.claims.map((claim) => [claim.claim_id, claim]));
  const materialHypotheses = state.hypotheses.filter(({ material }) => material);

  for (const hypothesis of materialHypotheses) {
    for (const observation of observations) {
      for (const qualifierKey of observation.high_information_qualifier_keys) {
        const predictions = hypothesis.qualifier_predictions.filter((prediction) =>
          prediction.observation_id === observation.observation_id &&
          prediction.qualifier_key === qualifierKey
        );
        if (predictions.length === 0) {
          insufficient.push(
            `${hypothesis.hypothesis_id}: no prediction is represented for high-information qualifier ${observation.observation_id}.${qualifierKey}.`
          );
          continue;
        }
        if (predictions.length > 1) {
          blockers.push(
            `${hypothesis.hypothesis_id}: multiple predictions are represented for ${observation.observation_id}.${qualifierKey}; the expected direction is ambiguous.`
          );
          continue;
        }
        const actual = observation.qualifiers[qualifierKey];
        if (actual === undefined) {
          insufficient.push(
            `${observation.observation_id}: high-information qualifier ${qualifierKey} is declared but its observed value is missing.`
          );
          continue;
        }
        const prediction = predictions[0]!;
        const matches = evaluateScalarPredicate(actual, prediction.operator, prediction.value);
        if (matches === undefined) {
          insufficient.push(
            `${hypothesis.hypothesis_id}: prediction for ${observation.observation_id}.${qualifierKey} cannot be mechanically compared to the represented value.`
          );
          continue;
        }
        if (!matches && !supportedExceptionClaim(prediction.exception_claim_id, hypothesis.target_id, claims)) {
          blockers.push(
            `${hypothesis.hypothesis_id}: prediction is opposite to observed high-information qualifier ${observation.observation_id}.${qualifierKey} and no separately represented supported exception mechanism is linked.`
          );
        }
      }
    }
    for (const prediction of hypothesis.qualifier_predictions) {
      if (!observationById.has(prediction.observation_id)) {
        blockers.push(
          `${hypothesis.hypothesis_id}: prediction references unknown observation ${prediction.observation_id}.`
        );
      }
    }
  }

  const checkedIds = materialHypotheses.map(({ hypothesis_id }) => hypothesis_id);
  if (blockers.length > 0) {
    return gateReceipt("EVIDENCE_DIRECTION", "block", blockers, checkedIds);
  }
  if (insufficient.length > 0) {
    return gateReceipt("EVIDENCE_DIRECTION", "insufficient", insufficient, checkedIds);
  }
  return gateReceipt("EVIDENCE_DIRECTION", "pass", [], checkedIds);
}

export function evaluateTargetPreservationGate(
  state: EpistemicStateV1
): EpistemicGateReceipt {
  const blockers: string[] = [];
  const targetId = state.target.target_id;
  const conclusions = state.claims.filter((claim) =>
    claim.material && claim.kind === "conclusion"
  );
  const claimById = new Map(state.claims.map((claim) => [claim.claim_id, claim]));
  const observationById = new Map(state.observations.map((observation) => [
    observation.observation_id,
    observation
  ]));

  for (const hypothesis of state.hypotheses.filter(({ material }) => material)) {
    if (hypothesis.target_id !== targetId) {
      blockers.push(
        `${hypothesis.hypothesis_id}: material hypothesis is bound to adjacent target ${hypothesis.target_id}, not requested target ${targetId}.`
      );
    }
  }
  if (conclusions.length === 0) {
    blockers.push("No material conclusion claim is represented for the requested target.");
  }
  for (const conclusion of conclusions) {
    if (conclusion.target_id !== targetId) {
      blockers.push(
        `${conclusion.claim_id}: conclusion is bound to adjacent target ${conclusion.target_id}, not requested target ${targetId}.`
      );
      continue;
    }
    if (!claimReachesTargetObservation(conclusion, targetId, claimById, observationById)) {
      blockers.push(
        `${conclusion.claim_id}: conclusion dependencies do not reach any observation bound to requested target ${targetId}.`
      );
    }
  }

  return gateReceipt(
    "TARGET_PRESERVATION",
    blockers.length > 0 ? "block" : "pass",
    blockers,
    conclusions.map(({ claim_id }) => claim_id)
  );
}

export function evaluateProvenanceDependencyGate(
  state: EpistemicStateV1
): EpistemicGateReceipt {
  const blockers: string[] = [];
  const caseById = new Map<string, EpistemicStateV1["cases"][number]>();
  const observationById = new Map<string, EpistemicStateV1["observations"][number]>();
  const claimById = new Map<string, EpistemicStateV1["claims"][number]>();
  const hypothesisById = new Map<string, EpistemicStateV1["hypotheses"][number]>();
  const comparisonById = new Map<string, EpistemicStateV1["comparisons"][number]>();

  recordUnique(state.cases, ({ case_id }) => case_id, caseById, "case", blockers);
  recordUnique(
    state.observations,
    ({ observation_id }) => observation_id,
    observationById,
    "observation",
    blockers
  );
  recordUnique(state.claims, ({ claim_id }) => claim_id, claimById, "claim", blockers);
  recordUnique(
    state.hypotheses,
    ({ hypothesis_id }) => hypothesis_id,
    hypothesisById,
    "hypothesis",
    blockers
  );
  recordUnique(
    state.comparisons,
    ({ comparison_id }) => comparison_id,
    comparisonById,
    "comparison",
    blockers
  );

  const featureKeys = new Set<string>();
  for (const feature of state.features) {
    const key = `${feature.case_id}\u0000${feature.feature_id}`;
    if (featureKeys.has(key)) {
      blockers.push(
        `Duplicate feature assignment for case ${feature.case_id} and feature ${feature.feature_id}; discriminator evidence is ambiguous.`
      );
    }
    featureKeys.add(key);
    if (!caseById.has(feature.case_id)) {
      blockers.push(`Feature ${feature.feature_id} references unknown case ${feature.case_id}.`);
    }
  }

  for (const observation of state.observations) {
    if (!caseById.has(observation.case_id)) {
      blockers.push(
        `${observation.observation_id}: observation references unknown case ${observation.case_id}.`
      );
    }
    for (const qualifierKey of observation.high_information_qualifier_keys) {
      if (!(qualifierKey in observation.qualifiers)) {
        blockers.push(
          `${observation.observation_id}: high-information qualifier ${qualifierKey} is declared without an observed value.`
        );
      }
    }
  }

  for (const comparison of state.comparisons) {
    const overlap = comparison.positive_case_ids.filter((caseId) =>
      comparison.control_case_ids.includes(caseId)
    );
    if (overlap.length > 0) {
      blockers.push(
        `${comparison.comparison_id}: cases cannot be both positive and control in the same comparison (${overlap.join(", ")}).`
      );
    }
    for (const caseId of [...comparison.positive_case_ids, ...comparison.control_case_ids]) {
      if (!caseById.has(caseId)) {
        blockers.push(`${comparison.comparison_id}: comparison references unknown case ${caseId}.`);
      }
    }
    for (const caseId of comparison.positive_case_ids) {
      const role = caseById.get(caseId)?.comparison_role;
      if (role !== undefined && role !== "positive") {
        blockers.push(
          `${comparison.comparison_id}: positive case ${caseId} is labelled ${role}, not positive.`
        );
      }
    }
    for (const caseId of comparison.control_case_ids) {
      const role = caseById.get(caseId)?.comparison_role;
      if (role !== undefined && !["tolerated_control", "negative_control"].includes(role)) {
        blockers.push(
          `${comparison.comparison_id}: control case ${caseId} is labelled ${role}, not a tolerated/negative control.`
        );
      }
    }
  }

  for (const claim of state.claims) {
    if (claim.material && claim.provenance.kind === "inference" && claim.dependencies.length === 0) {
      blockers.push(
        `${claim.claim_id}: material inference has no explicit dependencies.`
      );
    }
    for (const dependency of claim.dependencies) {
      const exists = dependency.kind === "observation"
        ? observationById.has(dependency.id)
        : claimById.has(dependency.id);
      if (!exists) {
        blockers.push(
          `${claim.claim_id}: dependency ${dependency.kind}:${dependency.id} does not resolve.`
        );
      }
      if (dependency.kind === "claim" && dependency.id === claim.claim_id) {
        blockers.push(`${claim.claim_id}: claim cannot depend directly on itself.`);
      }
    }
  }

  for (const hypothesis of state.hypotheses) {
    const modifier = hypothesis.discriminator.modifier;
    if (modifier !== undefined && !claimById.has(modifier.claim_id)) {
      blockers.push(
        `${hypothesis.hypothesis_id}: discriminator modifier claim ${modifier.claim_id} does not resolve.`
      );
    }
    for (const prediction of hypothesis.qualifier_predictions) {
      if (!observationById.has(prediction.observation_id)) {
        blockers.push(
          `${hypothesis.hypothesis_id}: qualifier prediction references unknown observation ${prediction.observation_id}.`
        );
      }
      if (
        prediction.exception_claim_id !== undefined &&
        !claimById.has(prediction.exception_claim_id)
      ) {
        blockers.push(
          `${hypothesis.hypothesis_id}: exception claim ${prediction.exception_claim_id} does not resolve.`
        );
      }
    }
  }

  return gateReceipt(
    "PROVENANCE_DEPENDENCY",
    blockers.length > 0 ? "block" : "pass",
    blockers,
    [
      ...state.observations.map(({ observation_id }) => observation_id),
      ...state.claims.map(({ claim_id }) => claim_id)
    ]
  );
}

export const epistemicRepresentationRequirementsSchema = z.object({
  target_id: shortId,
  required_case_ids: z.array(shortId).max(100),
  required_observations: z.array(z.object({
    observation_id: shortId,
    required_qualifier_keys: z.array(shortId).max(30)
  }).strict()).max(500)
}).strict();

export const epistemicRepresentationAuditSchema = z.object({
  status: z.enum(["pass", "block"]),
  missing: z.array(boundedText(1_000)).max(1_000),
  mismatched: z.array(boundedText(1_000)).max(1_000)
}).strict();

export type EpistemicRepresentationRequirements = z.output<
  typeof epistemicRepresentationRequirementsSchema
>;
export type EpistemicRepresentationAudit = z.output<
  typeof epistemicRepresentationAuditSchema
>;

export function auditEpistemicRepresentation(
  rawRequirements: unknown,
  rawState: unknown
): EpistemicRepresentationAudit {
  const requirements = epistemicRepresentationRequirementsSchema.parse(rawRequirements);
  const state = epistemicStateV1Schema.parse(rawState);
  const missing: string[] = [];
  const mismatched: string[] = [];
  if (state.target.target_id !== requirements.target_id) {
    mismatched.push(
      `target_id expected ${requirements.target_id} but candidate state contains ${state.target.target_id}`
    );
  }
  const caseIds = new Set(state.cases.map(({ case_id }) => case_id));
  for (const caseId of requirements.required_case_ids) {
    if (!caseIds.has(caseId)) missing.push(`case:${caseId}`);
  }
  const observations = new Map(state.observations.map((observation) => [
    observation.observation_id,
    observation
  ]));
  for (const requirement of requirements.required_observations) {
    const observation = observations.get(requirement.observation_id);
    if (observation === undefined) {
      missing.push(`observation:${requirement.observation_id}`);
      continue;
    }
    for (const qualifierKey of requirement.required_qualifier_keys) {
      if (!(qualifierKey in observation.qualifiers)) {
        missing.push(`qualifier:${requirement.observation_id}.${qualifierKey}`);
      }
      if (!observation.high_information_qualifier_keys.includes(qualifierKey)) {
        mismatched.push(
          `high_information:${requirement.observation_id}.${qualifierKey}`
        );
      }
    }
  }
  return epistemicRepresentationAuditSchema.parse({
    status: missing.length === 0 && mismatched.length === 0 ? "pass" : "block",
    missing,
    mismatched
  });
}

function evaluateFeaturePredicate(
  state: EpistemicStateV1,
  caseId: string,
  predicate: EpistemicStateV1["hypotheses"][number]["discriminator"]
): boolean | undefined {
  const assignments = state.features.filter((feature) =>
    feature.case_id === caseId && feature.feature_id === predicate.feature_id
  );
  if (predicate.operator === "present") return assignments.length === 1 ? true : assignments.length === 0 ? false : undefined;
  if (predicate.operator === "absent") return assignments.length === 0 ? true : assignments.length === 1 ? false : undefined;
  if (assignments.length !== 1 || predicate.value === undefined) return undefined;
  return evaluateScalarPredicate(assignments[0]!.value, predicate.operator, predicate.value);
}

function evaluateScalarPredicate(
  actual: z.output<typeof scalarSchema>,
  operator: z.output<typeof predicateOperatorSchema>,
  expected: z.output<typeof scalarSchema>
): boolean | undefined {
  if (operator === "equals") return actual === expected;
  if (operator === "not_equals") return actual !== expected;
  if (typeof actual !== "number" || typeof expected !== "number") return undefined;
  if (operator === "gt") return actual > expected;
  if (operator === "gte") return actual >= expected;
  if (operator === "lt") return actual < expected;
  if (operator === "lte") return actual <= expected;
  return undefined;
}

function supportedExceptionClaim(
  claimId: string | undefined,
  targetId: string,
  claims: Map<string, EpistemicStateV1["claims"][number]>
): boolean {
  if (claimId === undefined) return false;
  const claim = claims.get(claimId);
  return claim !== undefined &&
    claim.target_id === targetId &&
    ["modifier", "mechanism"].includes(claim.kind) &&
    claim.dependencies.length > 0;
}

function claimReachesTargetObservation(
  root: EpistemicStateV1["claims"][number],
  targetId: string,
  claims: Map<string, EpistemicStateV1["claims"][number]>,
  observations: Map<string, EpistemicStateV1["observations"][number]>
): boolean {
  const visited = new Set<string>();
  const visit = (claim: EpistemicStateV1["claims"][number]): boolean => {
    if (visited.has(claim.claim_id)) return false;
    visited.add(claim.claim_id);
    for (const dependency of claim.dependencies) {
      if (dependency.kind === "observation") {
        if (observations.get(dependency.id)?.target_id === targetId) return true;
        continue;
      }
      const next = claims.get(dependency.id);
      if (next !== undefined && visit(next)) return true;
    }
    return false;
  };
  return visit(root);
}

function recordUnique<T>(
  values: readonly T[],
  id: (value: T) => string,
  destination: Map<string, T>,
  label: string,
  blockers: string[]
): void {
  for (const value of values) {
    const key = id(value);
    if (destination.has(key)) blockers.push(`Duplicate ${label} id ${key}.`);
    destination.set(key, value);
  }
}

function gateReceipt(
  gate: z.output<typeof gateNameSchema>,
  status: z.output<typeof gateStatusSchema>,
  blockers: string[],
  checkedIds: string[]
): EpistemicGateReceipt {
  return epistemicGateReceiptSchema.parse({
    gate,
    status,
    blockers,
    checked_ids: unique(checkedIds)
  });
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
