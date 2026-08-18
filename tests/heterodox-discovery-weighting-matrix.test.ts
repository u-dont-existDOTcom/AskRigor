import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

type Review = "broad" | "bounded" | "narrow" | "not_applicable";
type Control =
  | "option_space"
  | "intervention_hypothesis_ledger"
  | "program_matched_video_selection"
  | "matched_video_or_no_candidate"
  | "youtube_candidate_selection"
  | "intervention_decomposition"
  | "cross_layer_iteration"
  | "decisive_study_scope"
  | "transportability"
  | "support_not_located_scope"
  | "steelman_without_inflation";

interface DiscoveryCase {
  id: string;
  prompt: string;
  expected_review: Review;
  required_controls: Control[];
  live_acceptance_priority: boolean;
}

interface DiscoveryMatrix {
  schema_version: number;
  purpose: string;
  cases: DiscoveryCase[];
}

async function loadMatrix(): Promise<DiscoveryMatrix> {
  return JSON.parse(await readFile(
    rootFile("docs/heterodox-discovery-weighting-matrix-v0.1.0.json"),
    "utf8",
  )) as DiscoveryMatrix;
}

describe("heterodox discovery and weighting matrix", () => {
  it("preserves broad, bounded, narrow, and nonapplicable controls", async () => {
    const matrix = await loadMatrix();
    expect(matrix.schema_version).toBe(1);
    expect(matrix.purpose).toContain("does not prove Custom GPT behavior");
    expect(matrix.cases).toHaveLength(7);
    expect(new Set(matrix.cases.map(({ id }) => id)).size).toBe(7);
    expect(new Set(matrix.cases.map(({ expected_review }) => expected_review))).toEqual(
      new Set<Review>(["broad", "bounded", "narrow", "not_applicable"]),
    );
  });

  it("binds the observed uncued pathway to discovery and study-scope controls", async () => {
    const matrix = await loadMatrix();
    expect(matrix.cases.find(({ id }) => id === "broad-uncued-hip-pathway")).toMatchObject({
      expected_review: "broad",
      required_controls: [
        "option_space",
        "intervention_hypothesis_ledger",
        "program_matched_video_selection",
        "matched_video_or_no_candidate",
        "youtube_candidate_selection",
        "cross_layer_iteration",
        "decisive_study_scope",
      ],
      live_acceptance_priority: true,
    });
  });

  it("prevents a single exercise comparator from standing for all PT", async () => {
    const matrix = await loadMatrix();
    const comparator = matrix.cases.find(({ id }) => id === "trial-comparator-overgeneralization");
    expect(comparator?.required_controls).toEqual([
      "intervention_decomposition",
      "decisive_study_scope",
      "transportability",
    ]);
  });

  it("requires discrete old-hip hypotheses and matched preoperative videos", async () => {
    const matrix = await loadMatrix();
    const pathway = matrix.cases.find(({ id }) => id === "broad-uncued-hip-pathway");
    const exercise = matrix.cases.find(({ id }) => id === "exercise-umbrella-decomposition");

    for (const candidate of [pathway, exercise]) {
      expect(candidate?.required_controls).toEqual(expect.arrayContaining([
        "intervention_hypothesis_ledger",
        "program_matched_video_selection",
        "matched_video_or_no_candidate",
      ]));
    }
  });

  it("keeps exact null evidence separate from dismissal", async () => {
    const matrix = await loadMatrix();
    const nullEvidence = matrix.cases.find(({ id }) => id === "heterodox-null-evidence");
    expect(nullEvidence?.required_controls).toEqual([
      "support_not_located_scope",
      "steelman_without_inflation",
      "cross_layer_iteration",
    ]);
  });

  it("links every executable control to Project, Forum, skill, and generated surfaces", async () => {
    const [project, forum, skill, generated] = await Promise.all([
      readFile(rootFile("project/PROJECT_INSTRUCTIONS.md"), "utf8"),
      readFile(rootFile("project/FORUM_SIGNAL_MODULE.md"), "utf8"),
      readFile(rootFile("skills/askrigor/SKILL.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-instructions.md"), "utf8"),
    ]);
    for (const surface of [project, forum, skill, generated]) {
      for (const fragment of [
        "candidate-selection ledger",
        "decision usefulness",
        "provider rank",
        "unique hypothesis",
        "exact intervention and comparator programs",
        "what the contrast can and cannot establish",
        "weak or mismatched comparator narrows inference",
        "preoperative conservative care",
        "postoperative rehabilitation",
        "exact matched outcome support",
        "adjacent human, mechanistic, grey/practitioner, and community evidence",
        "steelman without inflation",
        "gelatin/collagen",
        "hydration",
        "swimming/aquatic exercise",
        "distinct preoperative PT programs",
        "PT/exercise or postoperative-rehabilitation video",
        "matched video or explicit no-candidate",
      ]) {
        expect(surface, fragment).toContain(fragment);
      }
    }

    for (const compactSurface of [skill, generated]) {
      for (const compactControl of [
        "Survey up to 6 general/prevention/exact-variant/contrarian-practitioner/benefit/failure/harm-discontinuation/formal-discriminator searches",
        "rewrite/use-cursor/new-batch if redundant",
        "components/dose/frequency/duration",
        "supervision/adherence/cointerventions",
        "assess transportability",
        "Defer false tokens",
      ]) {
        expect(compactSurface, compactControl).toContain(compactControl);
      }
    }
    expect(forum).toContain("Prepare up to six YouTube searches across the general landscape");
    expect(forum).toContain("rewrite queries, use cursors, or start another batch");
    expect(forum).toContain("assess transportability to the question");
    expect(forum).toContain("do not auto-resubmit it in the same pass");
    expect(project).toContain(
      "A token paired with `continuation_recommended: false` is deferred recovery state",
    );
  });

  it("reserves five diverse product cases without broadening the definition control", async () => {
    const matrix = await loadMatrix();
    const live = matrix.cases.filter(({ live_acceptance_priority }) => live_acceptance_priority);
    expect(live).toHaveLength(5);
    expect(live.map(({ id }) => id)).toContain("narrow-celecoxib-experience");
    expect(live.map(({ expected_review }) => expected_review)).not.toContain("not_applicable");
  });
});
