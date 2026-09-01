import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { observableEvidenceReviewRequestSchema } from
  "../evaluation/terminal-bench/observable-evidence-review-request-contract.js";

function root(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function main(): Promise<void> {
  const repositoryRoot = root();
  const request = observableEvidenceReviewRequestSchema.parse(JSON.parse(await readFile(
    join(
      repositoryRoot,
      "contributions",
      "terminal-bench-science",
      "observable-evidence-review-request.json",
    ),
    "utf8",
  )) as unknown);

  process.stdout.write(`${JSON.stringify({
    status: "INDEPENDENT_METHOD_REVIEW_REQUEST_OPEN_FRONTIER_PROBE_BLOCKED",
    request_id: request.requestId,
    issue_url: request.publicRequest.issueUrl,
    review_questions: request.reviewBoundary.requiredQuestions.length,
    evidence_fields: request.requiredAgentInput.evidenceFields.length,
    current_verdict: request.reviewBoundary.currentVerdict,
    frontier_probe_blocked: request.releaseGate.frontierProbeBlockedUntilBothPass,
    paid_inference_authorized: request.releaseGate.paidInferenceAuthorized,
    external_submission_authorized:
      request.releaseGate.externalTerminalBenchSubmissionAuthorized,
    completion: request.completion,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown review-request validation failure";
  process.stderr.write(`Observable-evidence review request failed: ${message}\n`);
  process.exitCode = 1;
});
