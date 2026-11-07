import { describe, expect, it } from "vitest";

import { ONE_REPORT_PER_INCIDENT, connectorLessonToolResult } from "../apps/research-mcp/src/lessons/connector-tool.js";

// AskRigor#431, the owner's requirement there: one reporting path per problem. A defect that can be debugged gets one
// detailed bug report; a preference, feature request or style feedback gets one lesson; never both for one incident.
describe("one report per incident (AskRigor#431)", () => {
  it("is said with every saved lesson, new or already in review", () => {
    expect(ONE_REPORT_PER_INCIDENT).toBe("One report per incident: a defect that can be debugged (a failed or wrong " +
      "step, a tool or check that misbehaved) gets one detailed bug report, and a preference, feature request or style " +
      "feedback gets one lesson, never both, so send nothing more about this incident.");
    const saved = connectorLessonToolResult({ status: "submitted", retryable: false, candidate_id: "ARL-0042", occurrence_count: 1 });
    expect(saved.content).toEqual([{ type: "text", text: `Lesson saved for review as ARL-0042. ${ONE_REPORT_PER_INCIDENT}` }]);
    const matched = connectorLessonToolResult({
      status: "existing_candidate", retryable: false, candidate_id: "ARL-0042", occurrence_count: 3,
    });
    expect((matched.content as Array<{ text: string }>)[0]!.text).toBe("This lesson matches ARL-0042, already in " +
      `review; it has now been reported 3 time(s). ${ONE_REPORT_PER_INCIDENT}`);
    // A refusal saved nothing, so it asks for no restraint.
    const refused = connectorLessonToolResult({ status: "rate_limited", retryable: true, retry_after_seconds: 30 });
    expect(JSON.stringify(refused.content)).not.toContain("One report per incident");
  });
});
