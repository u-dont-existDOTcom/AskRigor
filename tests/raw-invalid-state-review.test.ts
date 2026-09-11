import { describe, expect, it } from "vitest";

import { EPISTEMIC_REPRESENTATION_DIMENSIONS } from "../apps/research-mcp/src/epistemic-representation-review.js";
import {
  createRawInvalidStateReviewEnvelope,
  ingestRawInvalidStateRepresentationReview
} from "../evaluation/epistemic-verifier/independent-review-development/raw-invalid-state-review.js";

const source = "The target is response. Rowan responds within 2 seconds.";
const raw = JSON.stringify({
  state_version: "askrigor_epistemic_state_v1",
  target: { target_id: "response" },
  observations: [{ qualifiers: { onset_seconds: { operator: "lte", value: 2 } } }]
}, null, 2);

function submission(envelope: ReturnType<typeof createRawInvalidStateReviewEnvelope>) {
  const start = source.indexOf("response");
  return {
    review_version: "askrigor_epistemic_representation_review_v0_1",
    source_sha256: envelope.source_sha256,
    state_sha256: envelope.raw_state_sha256,
    producer_session_id: envelope.producer_session_id,
    reviewer: { session_id: "reviewer-session", model: "GPT-5.6 Sol", mode: "Pro", fresh_independent_session: true },
    reviewed_at: "2026-09-10T12:00:00+00:00",
    findings: EPISTEMIC_REPRESENTATION_DIMENSIONS.map((dimension) => dimension === "exact_target"
      ? { dimension, status: "faithful", affects_hard_invariant: true, source_spans: [{ start, end: start + 8, quote: "response" }], state_paths: ["/target/target_id"], rationale: "The target is preserved." }
      : { dimension, status: "not_applicable", affects_hard_invariant: false, source_spans: [], state_paths: [], rationale: "Not applicable." })
  };
}

describe("raw-invalid state representation-review adapter", () => {
  it("binds exact raw bytes without disclosing the schema error", () => {
    const envelope = createRawInvalidStateReviewEnvelope({ source_packet: source, raw_candidate_state_bytes: raw, producer_session_id: "producer-session" });
    expect(envelope.raw_candidate_state_json).toMatchObject({ observations: [{ qualifiers: { onset_seconds: { value: 2 } } }] });
    expect(envelope).not.toHaveProperty("schema_error");
    const receipt = ingestRawInvalidStateRepresentationReview(envelope, submission(envelope));
    expect(receipt.status).toBe("pass");
    expect(receipt.raw_state_sha256).toBe(envelope.raw_state_sha256);
  });

  it("rejects changed bytes, fabricated spans, unresolved pointers, and self-review", () => {
    const envelope = createRawInvalidStateReviewEnvelope({ source_packet: source, raw_candidate_state_bytes: raw, producer_session_id: "producer-session" });
    const wrongHash = submission(envelope); wrongHash.state_sha256 = "0".repeat(64);
    expect(() => ingestRawInvalidStateRepresentationReview(envelope, wrongHash)).toThrow(/different raw state bytes/u);
    const badSpan = submission(envelope); badSpan.findings[0]!.source_spans[0]!.quote = "different";
    expect(() => ingestRawInvalidStateRepresentationReview(envelope, badSpan)).toThrow(/source span/u);
    const badPointer = submission(envelope); badPointer.findings[0]!.state_paths = ["/target/missing"];
    expect(() => ingestRawInvalidStateRepresentationReview(envelope, badPointer)).toThrow(/does not resolve/u);
    const self = submission(envelope); self.reviewer.session_id = "producer-session";
    expect(() => ingestRawInvalidStateRepresentationReview(envelope, self)).toThrow(/fresh session/u);
  });
});
