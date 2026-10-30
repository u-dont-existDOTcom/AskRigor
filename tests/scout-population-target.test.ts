import { describe, expect, it } from "vitest";

import {
  isPopulationLevelResearchTarget, isPublicLeadTerm, RESEARCH_TARGET_SCREEN_PARTS, researchTargetScreenFailures,
  researchTargetScreenRefusal
} from "../apps/research-mcp/src/actions/gemini-scout-route.js";
import { CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET } from "../apps/research-mcp/src/custom-gpt-acceptance-receipt.js";

describe("population-level scout targets", () => {
  it("accepts targets that describe a group of people and their goal, or name no one", () => {
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
      "Runners had knee pain after marathons: what helped them",
      "Adults like runners and cyclists with knee pain",
      // Owner answer 201a (30 Oct): a target with no group word and nothing identifying passes, as the question's own
      // examples and the 27 and 28 Oct runs' copper scout.
      "Two forms of copper in humans",
      "A runner with knee pain after a marathon",
      "Hip osteoarthritis: avoiding a hip replacement",
      // The Custom GPT acceptance question runs the scout in every release check.
      CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET
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
      // Identity and example markers are refused in any capitalization.
      "adults like xiomara garcia with a rare cancer",
      "adults with a rare cancer, e.g. xiomara garcia",
      "adults with a rare cancer such as xiomara garcia",
      "a support group member named xiomara with a rare cancer"
    ]) expect(isPopulationLevelResearchTarget(target), target).toBe(false);
  });

  it("names every part of the screen a refused target failed, so one retry can fix it (29 Oct runs)", () => {
    for (const [target, failures] of [
      // On 27 and 28 Oct the group-word check refused 6 of 15 runs' scouts, among them two forms of copper "in
      // humans", since its English word list has no "humans"; owner answer 201a (30 Oct) dropped that check.
      ["Two forms of copper in humans", []],
      // The person markers read English only, so the tool asks for an English target: without the English word list,
      // a target in another language passes when nothing in it matches them.
      ["Adultes souffrant d'arthrose de la hanche qui veulent éviter une prothèse", []],
      ["A 47-year-old woman with knee pain", ["age"]],
      ["She wants to avoid a hip replacement", ["pronoun", "named_subject"]],
      ["Jane Doe, age 47, in Boston has a rare cancer", ["age", "name_like_pair", "named_subject"]],
      ["Adults like Xiomara Garcia with a rare cancer", ["example_marker", "name_like_pair"]],
      ["Dr. Smith's patient with a torn meniscus", ["title"]],
      // A target that fails the de-identification screen reports that part alone.
      ["My knee hurts and I want to avoid surgery", ["first_person"]],
      ["Adults with knee pain, see https://example.com", ["link"]],
      ["Adults with knee pain\u200b", ["hidden_characters"]],
      ["Adults with hip osteoarthritis trying to avoid a replacement", []],
    ] as const) {
      expect(researchTargetScreenFailures(target), target).toEqual(failures);
      expect(isPopulationLevelResearchTarget(target), target).toBe(failures.length === 0);
    }
    expect(researchTargetScreenRefusal(["age", "title"])).toBe(
      `This research_target was refused because it has ${RESEARCH_TARGET_SCREEN_PARTS.age}; and ` +
        `${RESEARCH_TARGET_SCREEN_PARTS.title}.`
    );
    expect(Object.keys(RESEARCH_TARGET_SCREEN_PARTS)).not.toContain("no_group_word");
    expect(researchTargetScreenRefusal([])).toBe("");
  });

  it("accepts a rediscovery lead only as a short public term", () => {
    for (const lead of [
      "gelatin",
      "collagen peptides",
      "red light therapy",
      "low dose naltrexone",
      "Egoscue Method",
      "bob and brad hip exercises",
      "GROWING HIP BACK SHAPEFIXER"
    ]) expect(isPublicLeadTerm(lead), lead).toBe(true);
    for (const lead of [
      "Jane Doe in Boston says chemotherapy cured her",
      "jane doe says chemotherapy cured the tumor",
      "she fixed her hip without surgery",
      "Dr. Berg",
      "Shawn Baker",
      "a 47-year-old woman's routine",
      "my hip routine",
      "gelatin every morning with orange juice and ten minutes of walking daily"
    ]) expect(isPublicLeadTerm(lead), lead).toBe(false);
  });
});
