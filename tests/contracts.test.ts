import { describe, expect, it } from "vitest";
import { ACCESS_STATUSES } from "@askrigor/contracts";

describe("workspace bootstrap", () => {
  it("exports normalized access statuses", () => {
    expect(ACCESS_STATUSES).toContain("api_visible_complete");
  });
});
