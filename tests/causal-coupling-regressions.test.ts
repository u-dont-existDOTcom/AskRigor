import { describe, expect, it } from "vitest";

import {
  assessCausalCouplingCoverage,
  causalCouplingCoverageReceiptSha256,
  causalCouplingPlanSchema
} from "../apps/research-mcp/src/causal-coupling-contract.js";
import { assertReportIntegrityClaim } from
  "../apps/research-mcp/src/actions/research-report-synthesis.js";
import {
  migrateUniversal20_5_22To20_5_23,
  OLD_UNIVERSAL_SHA256,
  restoreUniversal20_5_22
} from "../scripts/protocol-migrations/migrate-universal-20.5.22-to-20.5.23.mts";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const evidence = ["https://example.test/evidence"];

function discriminator(
  dimension: "NECESSITY" | "SUFFICIENCY_OR_SPECIFICITY" |
    "DOSE_OR_SEVERITY_COVARIATION" | "MEDIATION" | "COMMON_CAUSE",
  overrides: Record<string, unknown> = {}
) {
  return {
    discriminator_id: `test-${dimension.toLowerCase()}`,
    prediction_tested: `Prediction for ${dimension}`,
    dimension,
    search_query_or_test: `Search ${dimension}`,
    evidence_tier: "RANDOMIZED_MATCHED_EXPOSURE_WITH_BENEFIT",
    status: "COMPLETED",
    outcome_match: "BOTH",
    evidence_refs: evidence,
    used_for_efficacy_preservation: dimension === "NECESSITY" || dimension === "MEDIATION",
    ...overrides
  };
}

function validPlan() {
  return causalCouplingPlanSchema.parse({
    contract_version: "askrigor_causal_coupling_plan_v1",
    applies: true,
    research_question: "Is the observed marker causally coupled to the desired outcome?",
    marker_or_response: "observed marker",
    desired_benefit: "desired outcome",
    marker_cause_question: "What causes the marker?",
    benefit_coupling_question: "Is the marker necessary for or predictive of benefit?",
    hypotheses: [
      {
        hypothesis_id: "coupled",
        statement: "The marker participates in or tracks benefit.",
        serious_live_hypothesis: true,
        distinguishing_predictions: ["Benefit should be uncommon when the marker is absent."],
        discriminators: [
          discriminator("NECESSITY"),
          discriminator("SUFFICIENCY_OR_SPECIFICITY"),
          discriminator("DOSE_OR_SEVERITY_COVARIATION"),
          discriminator("MEDIATION")
        ]
      },
      {
        hypothesis_id: "independent",
        statement: "A common exposure causes marker and benefit independently.",
        serious_live_hypothesis: true,
        distinguishing_predictions: ["Covariation should weaken after exposure control."],
        discriminators: [discriminator("COMMON_CAUSE")]
      }
    ],
    challenge_observations: [
      {
        observation: "Benefit persists after marker reduction.",
        direction: "STRENGTHEN",
        search_or_test: "Search controlled marker reduction with benefit.",
        status: "COMPLETED",
        evidence_refs: evidence
      },
      {
        observation: "Marker magnitude strongly predicts benefit under matched exposure.",
        direction: "WEAKEN",
        search_or_test: "Search matched reaction-response evidence.",
        status: "COMPLETED",
        evidence_refs: evidence
      }
    ],
    formal_evidence_searched_first: true,
    community_gap: {
      could_materially_discriminate: false,
      targeted_queries: [],
      status: "PLANNED",
      evidence_refs: []
    },
    follow_up_replan: {
      triggered: false,
      prior_plan_omitted_dimension: false
    }
  });
}

describe("causal-coupling research regressions", () => {
  it("blocks the primary failure when benefit without the marker was not tested", () => {
    const plan = validPlan();
    plan.hypotheses[0]!.discriminators = plan.hypotheses[0]!.discriminators.filter(
      ({ dimension }) => dimension !== "NECESSITY"
    );
    const receipt = assessCausalCouplingCoverage(plan);
    expect(receipt.synthesis_lock).toBe("BLOCK");
    expect(receipt.failure_codes).toContain(
      "OMITTED_BENEFIT_MARKER_CAUSAL_COUPLING_TEST"
    );
  });

  it("accepts a controlled benefit-with-little-marker discriminator as a necessity test", () => {
    const receipt = assessCausalCouplingCoverage(validPlan());
    expect(receipt.checks.find(({ check_id }) => check_id === "FS-NECESSITY-01")?.status)
      .toBe("PASS");
  });

  it("separately requires marker-without-benefit evidence for specificity", () => {
    const plan = validPlan();
    plan.hypotheses[0]!.discriminators = plan.hypotheses[0]!.discriminators.filter(
      ({ dimension }) => dimension !== "SUFFICIENCY_OR_SPECIFICITY"
    );
    const receipt = assessCausalCouplingCoverage(plan);
    expect(receipt.checks.find(({ check_id }) => check_id === "FS-SUFFICIENCY-01")?.status)
      .toBe("FAIL");
  });

  it("blocks efficacy preservation inferred from a tolerability-only manipulation", () => {
    const plan = validPlan();
    const item = plan.hypotheses[0]!.discriminators.find(({ dimension }) =>
      dimension === "MEDIATION"
    )!;
    item.outcome_match = "SIDE_EFFECT_OUTCOME_ONLY";
    const receipt = assessCausalCouplingCoverage(plan);
    expect(receipt.synthesis_lock).toBe("BLOCK");
    expect(receipt.failure_codes).toContain("OUTCOME_MISMATCH_EFFICACY_CLAIM");
  });

  it("does not let a tolerability-only record satisfy the mediation check", () => {
    const plan = validPlan();
    const item = plan.hypotheses[0]!.discriminators.find(({ dimension }) =>
      dimension === "MEDIATION"
    )!;
    item.outcome_match = "SIDE_EFFECT_OUTCOME_ONLY";
    item.used_for_efficacy_preservation = false;
    const receipt = assessCausalCouplingCoverage(plan);
    expect(receipt.checks.find(({ check_id }) => check_id === "FS-MEDIATION-01")?.status)
      .toBe("FAIL");
    expect(receipt.synthesis_lock).toBe("BLOCK");
  });

  it("blocks synthesis when community retrieval precedes the formal discriminator search", () => {
    const plan = validPlan();
    plan.formal_evidence_searched_first = false;
    const receipt = assessCausalCouplingCoverage(plan);
    expect(receipt.failure_codes).toContain("FORMAL_EVIDENCE_ORDER_VIOLATION");
    expect(receipt.synthesis_lock).toBe("BLOCK");
  });

  it("does not substitute marker causation for marker-benefit covariation", () => {
    const plan = validPlan();
    plan.hypotheses[0]!.discriminators = plan.hypotheses[0]!.discriminators.filter(
      ({ dimension }) => dimension !== "DOSE_OR_SEVERITY_COVARIATION"
    );
    const receipt = assessCausalCouplingCoverage(plan);
    expect(receipt.checks.find(({ check_id }) => check_id === "FS-COUPLING-01")?.status)
      .toBe("FAIL");
  });

  it("requires the strongest strengthening and weakening challenge before synthesis", () => {
    const plan = validPlan();
    plan.challenge_observations[1]!.status = "PLANNED";
    plan.challenge_observations[1]!.evidence_refs = [];
    const receipt = assessCausalCouplingCoverage(plan);
    expect(receipt.checks.find(({ check_id }) => check_id === "FS-STRENGTHEN-01")?.status)
      .toBe("FAIL");
  });

  it("keeps a material targeted community discriminator open after formal evidence", () => {
    const plan = validPlan();
    plan.community_gap = {
      could_materially_discriminate: true,
      targeted_queries: ["same person marker reduction benefit comparison"],
      status: "PLANNED",
      evidence_refs: []
    };
    const receipt = assessCausalCouplingCoverage(plan);
    expect(receipt.failure_codes).toContain("OMITTED_TARGETED_COMMUNITY_DISCRIMINATOR");
    expect(receipt.synthesis_lock).toBe("BLOCK");
  });

  it("blocks report synthesis when the exact causal receipt is unresolved", () => {
    const plan = validPlan();
    plan.hypotheses[0]!.discriminators = plan.hypotheses[0]!.discriminators.filter(
      ({ dimension }) => dimension !== "NECESSITY"
    );
    const receipt = assessCausalCouplingCoverage(plan);
    expect(() => assertReportIntegrityClaim({
      claim_kind: "context_or_mechanism",
      wording: "The marker is causally related to the desired outcome.",
      causal_coupling_claim: true,
      causal_coupling_receipt_sha256:
        causalCouplingCoverageReceiptSha256(receipt)
    }, { causal_coupling_receipt: receipt })).toThrow(/blocked/u);
  });

  it("blocks an applicable coupling synthesis when the model omits its causal flag", () => {
    const receipt = assessCausalCouplingCoverage(validPlan());
    expect(() => assertReportIntegrityClaim({
      claim_kind: "context_or_mechanism",
      wording: "The unpleasant marker appears to be part of the desired benefit."
    }, {
      causal_coupling_applicability: "APPLICABLE",
      causal_coupling_receipt: receipt
    })).toThrow(/applicable causal-coupling synthesis.*exact receipt/iu);
  });

  it("preserves a follow-up omission receipt and round-trips the exact migration", async () => {
    const plan = validPlan();
    plan.follow_up_replan = {
      triggered: true,
      prior_plan_omitted_dimension: true,
      omitted_dimension: "NECESSITY",
      correction_receipt: "The original plan omitted benefit without the marker."
    };
    expect(causalCouplingPlanSchema.parse(plan).follow_up_replan.omitted_dimension)
      .toBe("NECESSITY");

    const current = await readFile(new URL("../protocols/Universal_Instructions.xml", import.meta.url), "utf8");
    const prior = restoreUniversal20_5_22(current);
    expect(createHash("sha256").update(prior).digest("hex")).toBe(OLD_UNIVERSAL_SHA256);
    expect(migrateUniversal20_5_22To20_5_23(prior)).toBe(current);
  });
});
