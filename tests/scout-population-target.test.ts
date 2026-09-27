import { describe, expect, it } from "vitest";

import { isPopulationLevelResearchTarget } from "../apps/research-mcp/src/actions/gemini-scout-route.js";

describe("population-level scout targets", () => {
  it("accepts targets that describe a group of people and their goal", () => {
    for (const target of [
      "Adults trying to avoid a hip replacement: what they tried and what happened",
      "People over age 60 with knee arthritis who avoided surgery",
      "Adults aged 50 to 70 with frozen shoulder",
      "Adults aged 65+ with Parkinson's disease trying exercise programs",
      "People in their 40s with HER2-positive breast cancer",
      "Women with Hashimoto's thyroiditis trying diet changes",
      "50-year-olds with plantar fasciitis",
      "MS patients using cold exposure",
      "Adults with Rheumatoid Arthritis trying diet changes",
      "People with Ehlers-Danlos Syndrome and joint pain",
      "Runners had knee pain after marathons: what helped them"
    ]) expect(isPopulationLevelResearchTarget(target), target).toBe(true);
  });

  it("refuses a narrative about one person", () => {
    for (const target of [
      "Jane Doe, age 47, in Boston has a rare cancer",
      "Jane Doe in Boston with a rare cancer",
      "Michael has chronic knee pain after a fall",
      "She wants to avoid a hip replacement",
      "A 47-year-old woman with knee pain",
      "A woman, 47 years old, with knee pain",
      "Dr. Smith's patient with a torn meniscus",
      "My knee hurts and I want to avoid surgery",
      // Names no dictionary knows are refused too.
      "Xiomara Garcia in Boston has a rare cancer and wants experimental treatment options",
      "Adults like Xiomara Garcia with a rare cancer",
      "Xiomara has a rare cancer, like many adults",
      // A condition with no group of people is refused; the error asks for one.
      "Hip osteoarthritis: avoiding a hip replacement"
    ]) expect(isPopulationLevelResearchTarget(target), target).toBe(false);
  });
});
