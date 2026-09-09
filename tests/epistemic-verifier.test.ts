import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  auditEpistemicRepresentation,
  epistemicStateV1Schema,
  type EpistemicStateV1,
  verifyEpistemicState
} from "../apps/research-mcp/src/epistemic-verifier.js";

const FIXTURES_URL = new URL(
  "../evaluation/epistemic-verifier/v01-development-fixtures.json",
  import.meta.url
);

type Role = "positive" | "tolerated_control" | "negative_control" | "unknown";
type Scalar = string | number | boolean;

interface FixtureExpectation {
  SPECIFICITY_DISCRIMINATOR: "pass" | "block" | "insufficient";
  EVIDENCE_DIRECTION: "pass" | "block" | "insufficient";
  TARGET_PRESERVATION: "pass" | "block" | "insufficient";
  PROVENANCE_DEPENDENCY: "pass" | "block" | "insufficient";
  SYNTHESIS_LOCK: "pass" | "block" | "insufficient";
  definitive_synthesis: boolean;
}

interface FixtureRecord {
  fixture_id: string;
  source_packet: string;
  expected?: FixtureExpectation;
  representation_requirements?: unknown;
  expected_representation_status?: "pass" | "block";
}

interface FixtureDocument {
  fixture_set: string;
  phase: string;
  confirmation_eligible: boolean;
  fixtures: FixtureRecord[];
}

const userProvenance = (fixtureId: string) => ({
  kind: "user_supplied" as const,
  source_id: `fixture:${fixtureId}`
});

const sourceProvenance = (fixtureId: string) => ({
  kind: "source_grounded" as const,
  source_id: `fixture:${fixtureId}:source`
});

const inferenceProvenance = (fixtureId: string) => ({
  kind: "inference" as const,
  source_id: `fixture:${fixtureId}:derived`
});

function caseRecord(fixtureId: string, id: string, role: Role) {
  return {
    case_id: id,
    label: id,
    comparison_role: role,
    provenance: userProvenance(fixtureId)
  };
}

function observationRecord(input: {
  fixtureId: string;
  id: string;
  targetId: string;
  caseId: string;
  material?: boolean;
  qualifiers?: Record<string, Scalar>;
  high?: string[];
}) {
  return {
    observation_id: input.id,
    target_id: input.targetId,
    case_id: input.caseId,
    statement: `${input.id} observed`,
    material: input.material ?? true,
    qualifiers: input.qualifiers ?? {},
    high_information_qualifier_keys: input.high ?? [],
    provenance: userProvenance(input.fixtureId)
  };
}

function featureRecord(
  fixtureId: string,
  caseId: string,
  featureId: string,
  value: Scalar
) {
  return {
    case_id: caseId,
    feature_id: featureId,
    value,
    provenance: sourceProvenance(fixtureId)
  };
}

function conclusionClaim(
  fixtureId: string,
  targetId: string,
  observationIds: string[]
) {
  return {
    claim_id: "claim_conclusion",
    target_id: targetId,
    kind: "conclusion" as const,
    statement: `Conclusion about ${targetId}`,
    material: true,
    provenance: inferenceProvenance(fixtureId),
    dependencies: observationIds.map((id) => ({
      kind: "observation" as const,
      id
    }))
  };
}

function state(value: unknown): EpistemicStateV1 {
  return epistemicStateV1Schema.parse(value);
}

function sharedQState(): EpistemicStateV1 {
  const fixtureId = "shared-q-control";
  const targetId = "cause_of_reaction";
  return state({
    state_version: "askrigor_epistemic_state_v1",
    target: {
      target_id: targetId,
      label: "Cause of reaction",
      description: "What explains the selective reaction?"
    },
    cases: [
      caseRecord(fixtureId, "X", "positive"),
      caseRecord(fixtureId, "Y", "positive"),
      caseRecord(fixtureId, "Z", "tolerated_control")
    ],
    observations: [
      observationRecord({ fixtureId, id: "obs_x", targetId, caseId: "X" }),
      observationRecord({ fixtureId, id: "obs_y", targetId, caseId: "Y" }),
      observationRecord({ fixtureId, id: "obs_z", targetId, caseId: "Z" })
    ],
    features: [
      featureRecord(fixtureId, "X", "Q", true),
      featureRecord(fixtureId, "Y", "Q", true),
      featureRecord(fixtureId, "Z", "Q", true)
    ],
    comparisons: [{
      comparison_id: "cmp_xyz",
      target_id: targetId,
      positive_case_ids: ["X", "Y"],
      control_case_ids: ["Z"]
    }],
    hypotheses: [{
      hypothesis_id: "h_q",
      target_id: targetId,
      statement: "Q itself explains the selective reaction.",
      material: true,
      discriminator: {
        feature_id: "Q",
        operator: "equals",
        value: true
      },
      qualifier_predictions: []
    }],
    claims: [conclusionClaim(fixtureId, targetId, ["obs_x", "obs_y", "obs_z"])]
  });
}

function doseModifiedQState(): EpistemicStateV1 {
  const fixtureId = "dose-modified-q";
  const targetId = "cause_of_reaction";
  return state({
    state_version: "askrigor_epistemic_state_v1",
    target: {
      target_id: targetId,
      label: "Cause of reaction",
      description: "What explains the selective reaction?"
    },
    cases: [
      caseRecord(fixtureId, "X", "positive"),
      caseRecord(fixtureId, "Y", "positive"),
      caseRecord(fixtureId, "Z", "tolerated_control")
    ],
    observations: [
      observationRecord({ fixtureId, id: "obs_x", targetId, caseId: "X" }),
      observationRecord({ fixtureId, id: "obs_y", targetId, caseId: "Y" }),
      observationRecord({ fixtureId, id: "obs_z", targetId, caseId: "Z" })
    ],
    features: [
      featureRecord(fixtureId, "X", "Q", true),
      featureRecord(fixtureId, "Y", "Q", true),
      featureRecord(fixtureId, "Z", "Q", true),
      featureRecord(fixtureId, "X", "Q_dose", 10),
      featureRecord(fixtureId, "Y", "Q_dose", 12),
      featureRecord(fixtureId, "Z", "Q_dose", 1)
    ],
    comparisons: [{
      comparison_id: "cmp_xyz",
      target_id: targetId,
      positive_case_ids: ["X", "Y"],
      control_case_ids: ["Z"]
    }],
    hypotheses: [{
      hypothesis_id: "h_q_dose",
      target_id: targetId,
      statement: "A represented Q dose above 5 distinguishes reactive from tolerated cases.",
      material: true,
      discriminator: {
        feature_id: "Q_dose",
        operator: "gt",
        value: 5,
        modifier: {
          kind: "dose",
          claim_id: "claim_dose_modifier"
        }
      },
      qualifier_predictions: []
    }],
    claims: [
      {
        claim_id: "claim_dose_modifier",
        target_id: targetId,
        kind: "modifier",
        statement: "The represented Q dose differs materially across the comparison.",
        material: true,
        provenance: sourceProvenance(fixtureId),
        dependencies: []
      },
      conclusionClaim(fixtureId, targetId, ["obs_x", "obs_y", "obs_z"])
    ]
  });
}

function directionConflictState(
  fixtureId: "immediate-vs-delayed" | "tiny-vs-threshold"
): EpistemicStateV1 {
  const targetId = "cause_of_reaction";
  const qualifierKey = fixtureId === "immediate-vs-delayed"
    ? "onset_seconds"
    : "exposure_units";
  const actual = fixtureId === "immediate-vs-delayed" ? 2 : 0.1;
  const predictedMinimum = fixtureId === "immediate-vs-delayed" ? 3_600 : 10;
  return state({
    state_version: "askrigor_epistemic_state_v1",
    target: {
      target_id: targetId,
      label: "Cause of reaction",
      description: "What explains the target reaction?"
    },
    cases: [
      caseRecord(fixtureId, "X", "positive"),
      caseRecord(fixtureId, "Z", "tolerated_control")
    ],
    observations: [
      observationRecord({
        fixtureId,
        id: "obs_x",
        targetId,
        caseId: "X",
        qualifiers: { [qualifierKey]: actual },
        high: [qualifierKey]
      }),
      observationRecord({
        fixtureId,
        id: "obs_z",
        targetId,
        caseId: "Z",
        material: false
      })
    ],
    features: [featureRecord(fixtureId, "X", "R", true)],
    comparisons: [{
      comparison_id: "cmp_xz",
      target_id: targetId,
      positive_case_ids: ["X"],
      control_case_ids: ["Z"]
    }],
    hypotheses: [{
      hypothesis_id: "h_direction",
      target_id: targetId,
      statement: "The hypothesis requires a value above the observed high-information qualifier.",
      material: true,
      discriminator: {
        feature_id: "R",
        operator: "present"
      },
      qualifier_predictions: [{
        observation_id: "obs_x",
        qualifier_key: qualifierKey,
        operator: "gte",
        value: predictedMinimum
      }]
    }],
    claims: [conclusionClaim(fixtureId, targetId, ["obs_x"])]
  });
}

function targetSubstitutionState(): EpistemicStateV1 {
  const fixtureId = "target-substitution";
  const targetId = "risk_of_harm";
  return state({
    state_version: "askrigor_epistemic_state_v1",
    target: {
      target_id: targetId,
      label: "Risk of harm",
      description: "Does the evidence establish risk of harm?"
    },
    cases: [
      caseRecord(fixtureId, "X", "positive"),
      caseRecord(fixtureId, "Z", "tolerated_control")
    ],
    observations: [
      observationRecord({
        fixtureId,
        id: "obs_mechanism",
        targetId: "mechanism_activity",
        caseId: "X"
      })
    ],
    features: [featureRecord(fixtureId, "X", "R", true)],
    comparisons: [{
      comparison_id: "cmp_xz",
      target_id: targetId,
      positive_case_ids: ["X"],
      control_case_ids: ["Z"]
    }],
    hypotheses: [{
      hypothesis_id: "h_harm",
      target_id: targetId,
      statement: "R is proposed as relevant to harm.",
      material: true,
      discriminator: {
        feature_id: "R",
        operator: "present"
      },
      qualifier_predictions: []
    }],
    claims: [conclusionClaim(fixtureId, targetId, ["obs_mechanism"])]
  });
}

function trueDiscriminatorState(): EpistemicStateV1 {
  const fixtureId = "true-discriminator";
  const targetId = "cause_of_reaction";
  return state({
    state_version: "askrigor_epistemic_state_v1",
    target: {
      target_id: targetId,
      label: "Cause of reaction",
      description: "Does R survive the represented specificity contrast?"
    },
    cases: [
      caseRecord(fixtureId, "X", "positive"),
      caseRecord(fixtureId, "Y", "positive"),
      caseRecord(fixtureId, "Z", "tolerated_control")
    ],
    observations: [
      observationRecord({ fixtureId, id: "obs_x", targetId, caseId: "X" }),
      observationRecord({ fixtureId, id: "obs_y", targetId, caseId: "Y" }),
      observationRecord({ fixtureId, id: "obs_z", targetId, caseId: "Z" })
    ],
    features: [
      featureRecord(fixtureId, "X", "R", true),
      featureRecord(fixtureId, "Y", "R", true)
    ],
    comparisons: [{
      comparison_id: "cmp_xyz",
      target_id: targetId,
      positive_case_ids: ["X", "Y"],
      control_case_ids: ["Z"]
    }],
    hypotheses: [{
      hypothesis_id: "h_r",
      target_id: targetId,
      statement: "R survives the represented specificity contrast; this does not prove causality.",
      material: true,
      discriminator: {
        feature_id: "R",
        operator: "present"
      },
      qualifier_predictions: []
    }],
    claims: [conclusionClaim(fixtureId, targetId, ["obs_x", "obs_y", "obs_z"])]
  });
}

function noControlState(): EpistemicStateV1 {
  const fixtureId = "no-control";
  const targetId = "cause_of_reaction";
  return state({
    state_version: "askrigor_epistemic_state_v1",
    target: {
      target_id: targetId,
      label: "Cause of reaction",
      description: "Does Q discriminate reactive from non-reactive cases?"
    },
    cases: [
      caseRecord(fixtureId, "X", "positive"),
      caseRecord(fixtureId, "Y", "positive")
    ],
    observations: [
      observationRecord({ fixtureId, id: "obs_x", targetId, caseId: "X" }),
      observationRecord({ fixtureId, id: "obs_y", targetId, caseId: "Y" })
    ],
    features: [
      featureRecord(fixtureId, "X", "Q", true),
      featureRecord(fixtureId, "Y", "Q", true)
    ],
    comparisons: [{
      comparison_id: "cmp_xy",
      target_id: targetId,
      positive_case_ids: ["X", "Y"],
      control_case_ids: []
    }],
    hypotheses: [{
      hypothesis_id: "h_q",
      target_id: targetId,
      statement: "Q is proposed as the discriminator without a control case.",
      material: true,
      discriminator: {
        feature_id: "Q",
        operator: "equals",
        value: true
      },
      qualifier_predictions: []
    }],
    claims: [conclusionClaim(fixtureId, targetId, ["obs_x", "obs_y"])]
  });
}

function missingQualifierCandidateState(): EpistemicStateV1 {
  const fixtureId = "missing-high-information-qualifier";
  const targetId = "cause_of_reaction";
  return state({
    state_version: "askrigor_epistemic_state_v1",
    target: {
      target_id: targetId,
      label: "Cause of reaction",
      description: "Candidate extraction that accidentally omits onset timing."
    },
    cases: [
      caseRecord(fixtureId, "X", "positive"),
      caseRecord(fixtureId, "Z", "tolerated_control")
    ],
    observations: [
      observationRecord({ fixtureId, id: "obs_x", targetId, caseId: "X" }),
      observationRecord({ fixtureId, id: "obs_z", targetId, caseId: "Z", material: false })
    ],
    features: [featureRecord(fixtureId, "X", "R", true)],
    comparisons: [{
      comparison_id: "cmp_xz",
      target_id: targetId,
      positive_case_ids: ["X"],
      control_case_ids: ["Z"]
    }],
    hypotheses: [{
      hypothesis_id: "h_r",
      target_id: targetId,
      statement: "Candidate hypothesis after timing was dropped from extraction.",
      material: true,
      discriminator: {
        feature_id: "R",
        operator: "present"
      },
      qualifier_predictions: []
    }],
    claims: [conclusionClaim(fixtureId, targetId, ["obs_x"])]
  });
}

function stateForFixture(fixtureId: string): EpistemicStateV1 {
  if (fixtureId === "shared-q-control") return sharedQState();
  if (fixtureId === "dose-modified-q") return doseModifiedQState();
  if (fixtureId === "immediate-vs-delayed") return directionConflictState(fixtureId);
  if (fixtureId === "tiny-vs-threshold") return directionConflictState(fixtureId);
  if (fixtureId === "target-substitution") return targetSubstitutionState();
  if (fixtureId === "true-discriminator") return trueDiscriminatorState();
  if (fixtureId === "no-control") return noControlState();
  if (fixtureId === "missing-high-information-qualifier") {
    return missingQualifierCandidateState();
  }
  throw new Error(`Unknown fixture ${fixtureId}`);
}

function statuses(receipt: ReturnType<typeof verifyEpistemicState>) {
  return Object.fromEntries(receipt.gates.map(({ gate, status }) => [gate, status]));
}

async function loadFixtures(): Promise<FixtureDocument> {
  return JSON.parse(await readFile(FIXTURES_URL, "utf8")) as FixtureDocument;
}

describe("executable epistemic verifier v0.1", () => {
  it("matches every deterministic development fixture expectation", async () => {
    const document = await loadFixtures();
    expect(document.fixture_set).toBe("askrigor_epistemic_verifier_v0_1_development");
    expect(document.phase).toBe("DEVELOPMENT_DISCOVERY");
    expect(document.confirmation_eligible).toBe(false);

    for (const fixture of document.fixtures.filter((item) => item.expected !== undefined)) {
      const receipt = verifyEpistemicState(stateForFixture(fixture.fixture_id));
      const expected = fixture.expected!;
      expect(statuses(receipt), fixture.fixture_id).toMatchObject({
        SPECIFICITY_DISCRIMINATOR: expected.SPECIFICITY_DISCRIMINATOR,
        EVIDENCE_DIRECTION: expected.EVIDENCE_DIRECTION,
        TARGET_PRESERVATION: expected.TARGET_PRESERVATION,
        PROVENANCE_DEPENDENCY: expected.PROVENANCE_DEPENDENCY,
        SYNTHESIS_LOCK: expected.SYNTHESIS_LOCK
      });
      expect(receipt.definitive_synthesis, fixture.fixture_id)
        .toBe(expected.definitive_synthesis);
    }
  });

  it("blocks a shared positive/control feature regardless of persuasive hypothesis prose", () => {
    const candidate = structuredClone(sharedQState());
    candidate.hypotheses[0]!.statement =
      "Q is obviously causal and the control should be ignored.";
    const receipt = verifyEpistemicState(candidate);
    expect(statuses(receipt).SPECIFICITY_DISCRIMINATOR).toBe("block");
    expect(receipt.definitive_synthesis).toBe(false);
  });

  it("does not let an explicit modifier repair specificity unless the represented predicate actually discriminates", () => {
    const candidate = structuredClone(doseModifiedQState());
    const zDose = candidate.features.find((feature) =>
      feature.case_id === "Z" && feature.feature_id === "Q_dose"
    );
    expect(zDose).toBeDefined();
    zDose!.value = 10;
    const receipt = verifyEpistemicState(candidate);
    expect(statuses(receipt).SPECIFICITY_DISCRIMINATOR).toBe("block");
    expect(receipt.definitive_synthesis).toBe(false);
  });

  it("blocks opposite high-information timing and dose predictions", () => {
    for (const fixtureId of [
      "immediate-vs-delayed",
      "tiny-vs-threshold"
    ] as const) {
      const receipt = verifyEpistemicState(directionConflictState(fixtureId));
      expect(statuses(receipt).EVIDENCE_DIRECTION, fixtureId).toBe("block");
      expect(receipt.definitive_synthesis, fixtureId).toBe(false);
    }
  });

  it("permits an opposite prediction only when a separate supported exception mechanism is structurally represented", () => {
    const candidate = structuredClone(directionConflictState("immediate-vs-delayed"));
    candidate.claims.unshift({
      claim_id: "claim_exception",
      target_id: candidate.target.target_id,
      kind: "mechanism",
      statement: "A separate source-grounded mechanism is represented as the exception.",
      material: true,
      provenance: sourceProvenance("immediate-vs-delayed"),
      dependencies: [{ kind: "observation", id: "obs_x" }]
    });
    candidate.hypotheses[0]!.qualifier_predictions[0]!.exception_claim_id =
      "claim_exception";
    const receipt = verifyEpistemicState(candidate);
    expect(statuses(receipt).EVIDENCE_DIRECTION).toBe("pass");
    expect(receipt.definitive_synthesis).toBe(true);
  });

  it("blocks a conclusion about target A when its dependency graph reaches only adjacent target B", () => {
    const receipt = verifyEpistemicState(targetSubstitutionState());
    expect(statuses(receipt).TARGET_PRESERVATION).toBe("block");
    expect(receipt.blockers.join(" ")).toContain("risk_of_harm");
    expect(receipt.definitive_synthesis).toBe(false);
  });

  it("fails closed on unresolved material dependencies", () => {
    const candidate = structuredClone(trueDiscriminatorState());
    candidate.claims[0]!.dependencies.push({
      kind: "observation",
      id: "missing_observation"
    });
    const receipt = verifyEpistemicState(candidate);
    expect(statuses(receipt).PROVENANCE_DEPENDENCY).toBe("block");
    expect(receipt.definitive_synthesis).toBe(false);
  });

  it("returns insufficient rather than inventing discrimination when no control is represented", () => {
    const receipt = verifyEpistemicState(noControlState());
    expect(statuses(receipt).SPECIFICITY_DISCRIMINATOR).toBe("insufficient");
    expect(statuses(receipt).SYNTHESIS_LOCK).toBe("insufficient");
    expect(receipt.definitive_synthesis).toBe(false);
  });

  it("allows a genuinely represented discriminator without claiming that specificity proves causality", () => {
    const candidate = trueDiscriminatorState();
    const receipt = verifyEpistemicState(candidate);
    expect(statuses(receipt).SPECIFICITY_DISCRIMINATOR).toBe("pass");
    expect(receipt.definitive_synthesis).toBe(true);
    expect(candidate.hypotheses[0]!.statement).toContain("does not prove causality");
  });

  it("separates semantic translation failure from deterministic verification", async () => {
    const document = await loadFixtures();
    const fixture = document.fixtures.find(({ fixture_id }) =>
      fixture_id === "missing-high-information-qualifier"
    );
    expect(fixture?.representation_requirements).toBeDefined();
    const candidate = missingQualifierCandidateState();

    const deterministic = verifyEpistemicState(candidate);
    expect(deterministic.definitive_synthesis).toBe(true);

    const representation = auditEpistemicRepresentation(
      fixture!.representation_requirements,
      candidate
    );
    expect(representation.status).toBe(fixture!.expected_representation_status);
    expect(representation.missing).toContain("qualifier:obs_x.onset_seconds");
    expect(representation.mismatched)
      .toContain("high_information:obs_x.onset_seconds");
  });

  it("uses strict canonical state so unknown override fields cannot bypass the verifier", () => {
    const candidate = {
      ...trueDiscriminatorState(),
      force_definitive_synthesis: true
    };
    expect(() => verifyEpistemicState(candidate)).toThrow();
  });
});
