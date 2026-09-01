import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { observableEvidenceReviewRequestSchema } from
  "../evaluation/terminal-bench/observable-evidence-review-request-contract.js";

const requestUrl = new URL(
  "../contributions/terminal-bench-science/observable-evidence-review-request.json",
  import.meta.url,
);

async function requestFixture(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(requestUrl, "utf8")) as Record<string, unknown>;
}

describe("observable-evidence independent-review request", () => {
  it("binds a complete answer-free authoring and review handoff", async () => {
    const parsed = observableEvidenceReviewRequestSchema.parse(await requestFixture());

    expect(parsed.requiredAgentInput.evidenceFields).toHaveLength(13);
    expect(parsed.reviewBoundary.requiredQuestions).toHaveLength(8);
    expect(parsed.releaseGate.frontierProbeBlockedUntilBothPass).toBe(true);
    expect(parsed.reviewBoundary.currentVerdict).toBe("NOT_REVIEWED");
  });

  it("rejects an author allowed to inspect grader values", async () => {
    const request = await requestFixture();
    const authoringBoundary = request.authoringBoundary as Record<string, unknown>;
    authoringBoundary.authorMayReadGraderOnlyValues = true;

    expect(observableEvidenceReviewRequestSchema.safeParse(request).success).toBe(false);
  });

  it("rejects self-review by the current implementation worker", async () => {
    const request = await requestFixture();
    const authoringBoundary = request.authoringBoundary as Record<string, unknown>;
    authoringBoundary.currentImplementationWorkerIsIndependentReviewer = true;

    expect(observableEvidenceReviewRequestSchema.safeParse(request).success).toBe(false);
  });

  it("rejects a request that prematurely authorizes a frontier probe", async () => {
    const request = await requestFixture();
    const releaseGate = request.releaseGate as Record<string, unknown>;
    releaseGate.frontierProbeBlockedUntilBothPass = false;

    expect(observableEvidenceReviewRequestSchema.safeParse(request).success).toBe(false);
  });
});
