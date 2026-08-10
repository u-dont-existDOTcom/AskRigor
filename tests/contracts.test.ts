import { describe, expect, it } from "vitest";
import {
  ACCESS_STATUSES,
  errorEnvelope,
  okEnvelope,
} from "@askrigor/contracts";

describe("workspace bootstrap", () => {
  it("exports normalized access statuses", () => {
    expect(ACCESS_STATUSES).toContain("api_visible_complete");
  });

  it("preserves a complete empty result", () => {
    expect(
      okEnvelope({
        provider: "pubmed",
        recordType: "search",
        data: [],
        returned: 0,
        accessStatus: "complete",
      }).access_status,
    ).toBe("complete");
  });

  it("preserves provider errors for failed empty access", () => {
    expect(
      errorEnvelope({
        provider: "youtube",
        recordType: "comments",
        accessStatus: "comments_disabled",
        code: "commentsDisabled",
        message: "Comments are disabled",
      }).error?.code,
    ).toBe("commentsDisabled");
  });
});
