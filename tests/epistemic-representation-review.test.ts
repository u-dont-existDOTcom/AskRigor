import { describe, expect, it } from "vitest";

import {
  EPISTEMIC_REPRESENTATION_DIMENSIONS,
  EPISTEMIC_REPRESENTATION_REVIEW_VERSION,
  createEpistemicRepresentationReviewWorkPackage,
  ingestEpistemicRepresentationReview,
  type EpistemicRepresentationReviewSubmission,
  type EpistemicRepresentationReviewWorkPackage
} from "../apps/research-mcp/src/epistemic-representation-review.js";
import { verifyEpistemicState } from "../apps/research-mcp/src/epistemic-verifier.js";

const SOURCE = "The target is cause_of_reaction. X reacts while Z is tolerated. Feature Q is present in X and absent in Z.";

function candidateState(operator: "present" | "equals" = "equals") {
  return {
    state_version: "askrigor_epistemic_state_v1" as const,
    target: {
      target_id: "cause_of_reaction",
      label: "Cause of reaction",
      description: "What explains the selective reaction?"
    },
    cases: [
      {
        case_id: "X",
        label: "X",
        comparison_role: "positive" as const,
        provenance: { kind: "user_supplied" as const, source_id: "fixture:source" }
      },
      {
        case_id: "Z",
        label: "Z",
        comparison_role: "tolerated_control" as const,
        provenance: { kind: "user_supplied" as const, source_id: "fixture:source" }
      }
    ],
    observations: [
      {
        observation_id: "obs_x",
        target_id: "cause_of_reaction",
        case_id: "X",
        statement: "X reacts.",
        material: true,
        qualifiers: {},
        high_information_qualifier_keys: [],
        provenance: { kind: "user_supplied" as const, source_id: "fixture:source" }
      }
    ],
    features: [
      {
        case_id: "X",
        feature_id: "Q",
        value: "present",
        provenance: { kind: "user_supplied" as const, source_id: "fixture:source" }
      },
      {
        case_id: "Z",
        feature_id: "Q",
        value: "absent",
        provenance: { kind: "user_supplied" as const, source_id: "fixture:source" }
      }
    ],
    comparisons: [{
      comparison_id: "cmp_xz",
      target_id: "cause_of_reaction",
      positive_case_ids: ["X"],
      control_case_ids: ["Z"]
    }],
    hypotheses: [{
      hypothesis_id: "h_q",
      target_id: "cause_of_reaction",
      statement: "Q distinguishes X from Z.",
      material: true,
      discriminator: operator === "present"
        ? { feature_id: "Q", operator }
        : { feature_id: "Q", operator, value: "present" },
      qualifier_predictions: []
    }],
    claims: [{
      claim_id: "claim_conclusion",
      target_id: "cause_of_reaction",
      kind: "conclusion" as const,
      statement: "Q survives the represented contrast.",
      material: true,
      provenance: { kind: "inference" as const, source_id: "fixture:derived" },
      dependencies: [{ kind: "observation" as const, id: "obs_x" }]
    }]
  };
}

function workPackage(operator: "present" | "equals" = "equals") {
  return createEpistemicRepresentationReviewWorkPackage({
    source_packet: SOURCE,
    candidate_state: candidateState(operator),
    producer: {
      session_id: "producer-session-1",
      model: "consumer-model",
      mode: "reasoning"
    }
  });
}

function span(quote: string) {
  const start = SOURCE.indexOf(quote);
  if (start < 0) throw new Error(`Missing test quote: ${quote}`);
  return { start, end: start + quote.length, quote };
}

function submission(
  work: EpistemicRepresentationReviewWorkPackage,
  overrides: Partial<Record<(typeof EPISTEMIC_REPRESENTATION_DIMENSIONS)[number], {
    status: "faithful" | "missing" | "distorted" | "uncertain" | "not_applicable";
    affects_hard_invariant: boolean;
    source_spans: ReturnType<typeof span>[];
    state_paths: string[];
    rationale: string;
  }>> = {}
): EpistemicRepresentationReviewSubmission {
  const defaults = Object.fromEntries(EPISTEMIC_REPRESENTATION_DIMENSIONS.map((dimension) => [
    dimension,
    {
      dimension,
      status: "not_applicable",
      affects_hard_invariant: false,
      source_spans: [],
      state_paths: [],
      rationale: "The source does not make this dimension applicable."
    }
  ]));
  const findings = EPISTEMIC_REPRESENTATION_DIMENSIONS.map((dimension) => ({
    ...(defaults[dimension] as object),
    ...(overrides[dimension] ?? {})
  }));
  const exactTarget = overrides.exact_target ?? {
    status: "faithful" as const,
    affects_hard_invariant: true,
    source_spans: [span("cause_of_reaction")],
    state_paths: ["/target/target_id"],
    rationale: "The requested target is preserved exactly."
  };
  findings[0] = { dimension: "exact_target", ...exactTarget };
  return {
    review_version: EPISTEMIC_REPRESENTATION_REVIEW_VERSION,
    source_sha256: work.source_sha256,
    state_sha256: work.state_sha256,
    producer_session_id: work.producer.session_id,
    reviewer: {
      session_id: "reviewer-session-2",
      model: "reviewer-model",
      mode: "reasoning",
      fresh_independent_session: true
    },
    reviewed_at: "2026-09-10T08:00:00.000Z",
    findings
  } as EpistemicRepresentationReviewSubmission;
}

describe("independent epistemic representation review v0.1", () => {
  it("binds the exact source and state without producer rationale or scorer fields", () => {
    const work = workPackage();
    expect(work.phase).toBe("DEVELOPMENT_DISCOVERY");
    expect(work.source_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(work.state_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(work.state_sha256).toBe(verifyEpistemicState(candidateState()).state_sha256);
    expect(work.required_dimensions).toEqual(EPISTEMIC_REPRESENTATION_DIMENSIONS);
    expect(work).not.toHaveProperty("producer_rationale");
    expect(work).not.toHaveProperty("gold");
  });

  it("accepts a complete independent review when critical semantics are faithful", () => {
    const work = workPackage();
    const receipt = ingestEpistemicRepresentationReview(work, submission(work));
    expect(receipt.status).toBe("pass");
    expect(receipt.critical_representation).toBe("faithful");
    expect(receipt.reviewer_independent).toBe(true);
    expect(receipt.producer_session_id).toBe("producer-session-1");
    expect(receipt.reviewer.session_id).toBe("reviewer-session-2");
  });

  it("blocks the observed feature-value versus presence-operator translation defect", () => {
    const work = workPackage("present");
    const review = submission(work, {
      feature_value: {
        status: "faithful",
        affects_hard_invariant: true,
        source_spans: [span("Feature Q is present in X and absent in Z")],
        state_paths: ["/features/0/value", "/features/1/value"],
        rationale: "The contrasting values are represented."
      },
      predicate_semantics: {
        status: "distorted",
        affects_hard_invariant: true,
        source_spans: [span("Feature Q is present in X and absent in Z")],
        state_paths: ["/hypotheses/0/discriminator/operator"],
        rationale: "The presence operator tests record existence although both cases have value-coded Q records."
      }
    });
    const receipt = ingestEpistemicRepresentationReview(work, review);
    expect(receipt.status).toBe("block");
    expect(receipt.critical_representation).toBe("defective");
    expect(receipt.blockers.join(" ")).toContain("record existence");
  });

  it("fails closed when a critical source fact is uncertain", () => {
    const work = workPackage();
    const review = submission(work, {
      negative_or_tolerated_comparator: {
        status: "uncertain",
        affects_hard_invariant: true,
        source_spans: [span("Z is tolerated")],
        state_paths: ["/cases/1/comparison_role"],
        rationale: "The reviewer cannot establish whether the represented control role preserves the source."
      }
    });
    const receipt = ingestEpistemicRepresentationReview(work, review);
    expect(receipt.status).toBe("indeterminate");
    expect(receipt.critical_representation).toBe("uncertain");
  });

  it("rejects self-review and submissions bound to different bytes", () => {
    const work = workPackage();
    const selfReview = submission(work);
    selfReview.reviewer.session_id = work.producer.session_id;
    expect(() => ingestEpistemicRepresentationReview(work, selfReview))
      .toThrow(/fresh session independent/u);

    const wrongSource = submission(work);
    wrongSource.source_sha256 = "0".repeat(64);
    expect(() => ingestEpistemicRepresentationReview(work, wrongSource))
      .toThrow(/different source packet/u);

    const wrongState = submission(work);
    wrongState.state_sha256 = "f".repeat(64);
    expect(() => ingestEpistemicRepresentationReview(work, wrongState))
      .toThrow(/different candidate state/u);
  });

  it("rejects fabricated source spans, unresolved state paths, and missing dimensions", () => {
    const work = workPackage();
    const badSpan = submission(work);
    badSpan.findings[0]!.source_spans[0]!.quote = "different bytes";
    expect(() => ingestEpistemicRepresentationReview(work, badSpan))
      .toThrow(/source span does not match/u);

    const badPointer = submission(work);
    badPointer.findings[0]!.state_paths = ["/target/not_a_field"];
    expect(() => ingestEpistemicRepresentationReview(work, badPointer))
      .toThrow(/does not resolve/u);

    const missing = submission(work) as unknown as { findings: unknown[] };
    missing.findings = missing.findings.slice(0, -1);
    expect(() => ingestEpistemicRepresentationReview(work, missing)).toThrow();
  });
});
