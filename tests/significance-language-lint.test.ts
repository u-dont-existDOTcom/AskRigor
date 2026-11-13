import { describe, expect, it } from "vitest";
import {
  significanceLanguageNotes,
  significanceMentions,
} from "../apps/research-mcp/src/significance-language-lint.js";
import { judgmentItems, meaningJudgeBundle } from "../apps/research-mcp/src/meaning-judge.js";
import { finalizeResearch } from "../apps/research-mcp/src/research-finalization-gate.js";

describe("context-aware significance-language lint", () => {
  it("finds every grammatical form but does not classify mere appearance as misuse", () => {
    const mentions = significanceMentions(
      "A significant concern. The difference was not statistically significant. The significance of that result is unclear."
    );
    expect(mentions.map(({ word }) => word)).toEqual(["significant", "significant", "significance"]);
    expect(mentions.map(({ number }) => number)).toEqual([1, 2, 3]);
  });

  it.each([
    "It was a significant personal milestone.",
    "The loss would be a significant concern for the family.",
    "This represents a significant investment of time and effort.",
    "There was a clinically significant improvement of 12 points in function.",
    "Survival increased by 33 percentage points (7/7 versus 4/6), a significant practical difference.",
    "The randomized trial showed a statistically significant 20 percentage-point reduction (95% CI 8–32).",
    "The result was not statistically significant, but a meaningful benefit remains possible given the wide interval.",
    "The difference was significant in ordinary English, not a claim about a p-value.",
    "The source's title included the word significance.",
    "The word " + String.fromCharCode(96) + "significant" + String.fromCharCode(96) + " occurs in code."
  ])("does not treat legitimate ordinary or qualified scientific usage as an error: %s", (text) => {
    expect(significanceLanguageNotes(text)).toEqual([]);
  });

  it("flags the false conclusion that a nonsignificant comparison proves equivalence", () => {
    const notes = significanceLanguageNotes(
      "The difference was not statistically significant, so the treatments are equivalent."
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("proof of no effect or equivalence");
  });

  it("flags comparing significance labels instead of testing the contrast", () => {
    const notes = significanceLanguageNotes(
      "Group A had significant results and group B had not significant results, so their effects differ."
    );
    expect(notes[0]).toContain("different effects");
  });

  it("asks for review of unqualified result language without declaring ordinary use invalid", () => {
    const notes = significanceLanguageNotes(
      "In the trial, the treated group showed a significant improvement in survival."
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("review, not error");
  });

  it("offers every occurrence to a semantic judge, with ordinal validation", () => {
    const source = {
      answer: "A significant concern. The comparison was not statistically significant, so it proves no effect.",
      commentsRead: false,
      keySources: [],
      limits: [],
    };
    const bundle = meaningJudgeBundle(source)!;
    expect(bundle.significance_mentions.map(({ word }) => word)).toEqual(["significant", "significant"]);
    const reply = {
      youtube_comments: [], comparison: [], limits: [], standalone: [], source_lines: [],
      significance_language: [
        { occurrence: 1, misused: false, why: "Ordinary English." },
        { occurrence: 2, misused: true, why: "A null test cannot establish no effect." },
        { occurrence: 2, misused: false, why: "Duplicate." },
        { occurrence: 99, misused: true, why: "Not in source." },
      ],
    };
    expect(judgmentItems(reply, bundle)!.significance).toEqual([
      { occurrence: 1, misused: false, why: "Ordinary English." },
      { occurrence: 2, misused: true, why: "A null test cannot establish no effect." },
    ]);
  });

  it("is a nonblocking advisory within finalization, not a seventh final-check gate", () => {
    const base = {
      research_target: "Illustrative evidence question",
      receipts: [] as string[],
      key_sources: [],
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "An interpretation of language, not personal clinical advice.",
      question_about: "other",
      treatment_choice: "not_compared",
    };
    const run = (answer_draft: string) => finalizeResearch(
      { ...base, answer_draft },
      { secret: "significance-lint-test-secret-0123456789", now: () => new Date("2026-11-13T12:00:00Z") }
    );
    const ordinary = run("It was a significant setback for the team.");
    const misuse = run("The difference was not statistically significant, so the treatments are equivalent.");
    expect(misuse.status).toBe(ordinary.status);
    expect(misuse.next_steps).toEqual(ordinary.next_steps);
    expect(misuse.notes?.join(" ")).toContain("Significance-language lint");
    expect(ordinary.notes?.join(" ") ?? "").not.toContain("Significance-language lint");
  });
});
