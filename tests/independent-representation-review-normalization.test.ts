import { describe, expect, it } from "vitest";

import { normalizeRenderedReviewJson } from "../evaluation/epistemic-verifier/independent-review-development/normalize-rendered-review-json.js";

describe("rendered semantic-review JSON normalization", () => {
  it("restores quotes consumed inside value strings without changing structural quotes", () => {
    const raw = '{"dimension":"predicate_semantics","rationale":"The source says "present" while the state says "absent"."}';
    expect(JSON.parse(normalizeRenderedReviewJson(raw))).toEqual({
      dimension: "predicate_semantics",
      rationale: 'The source says "present" while the state says "absent".'
    });
  });

  it("keeps quoted terms followed by prose commas inside the value string", () => {
    const raw = '{"rationale":"The value is "present", while the control is "absent", so the predicate differs.","status":"distorted"}';
    expect(JSON.parse(normalizeRenderedReviewJson(raw))).toEqual({
      rationale: 'The value is "present", while the control is "absent", so the predicate differs.',
      status: "distorted"
    });
  });

  it("escapes literal controls inside rendered strings", () => {
    const raw = '{"rationale":"first line\nsecond line","status":"faithful"}';
    expect(JSON.parse(normalizeRenderedReviewJson(raw))).toEqual({
      rationale: "first line\nsecond line",
      status: "faithful"
    });
  });

  it("accepts already valid JSON unchanged apart from terminal newline", () => {
    const raw = '{"status":"faithful","rationale":"already valid"}';
    expect(normalizeRenderedReviewJson(raw)).toBe(`${raw}\n`);
  });
});
