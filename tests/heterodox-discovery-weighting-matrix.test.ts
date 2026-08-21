import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

type Review = "broad" | "bounded" | "narrow" | "not_applicable";
type Control =
  | "option_space"
  | "intervention_hypothesis_ledger"
  | "evidence_frontier_search"
  | "transcript_verified_creator_content"
  | "content_verified_watchlist"
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
    expect(matrix.cases).toHaveLength(8);
    expect(new Set(matrix.cases.map(({ id }) => id)).size).toBe(8);
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
        "evidence_frontier_search",
        "transcript_verified_creator_content",
        "content_verified_watchlist",
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

  it("requires discrete hypotheses and matched creator content without naming answers", async () => {
    const matrix = await loadMatrix();
    const pathway = matrix.cases.find(({ id }) => id === "broad-uncued-hip-pathway");
    const exercise = matrix.cases.find(({ id }) => id === "exercise-umbrella-decomposition");

    for (const candidate of [pathway, exercise]) {
      expect(candidate?.required_controls).toEqual(expect.arrayContaining([
        "intervention_hypothesis_ledger",
        "evidence_frontier_search",
        "transcript_verified_creator_content",
        "content_verified_watchlist",
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
        "steelman without inflation",
        "get_youtube_transcript",
        "support_not_located",
      ]) {
        expect(surface, fragment).toContain(fragment);
      }
    }

    expect(project).toContain("candidate-selection ledger");
    expect(project).toContain("exact claim fingerprint");
    expect(project).toContain("surprising or hard-to-find information");
    expect(project).toContain("Title, description, and comments do not establish");
    expect(project).toContain("transcript status");
    expect(forum).toContain("exact claim fingerprint");
    expect(forum).toContain("hard to recover from studies");
    expect(forum).toContain("relevant transcript timestamp");
    expect(forum).toContain("No content-verified watchlist candidate located");

    for (const compactSurface of [skill, generated]) {
      for (const compactControl of [
        "how I cured/reversed/fixed my [condition]",
        "Hooks are not conclusions",
        "Rewrite/use-cursor/new-batch if generic/redundant",
        "components/dose/frequency/duration",
        "supervision/adherence/cointerventions",
        "assess transportability",
        "defer false tokens",
        "Metadata/comments cannot establish creator content",
        "Action canonical link",
      ]) {
        expect(compactSurface, compactControl).toContain(compactControl);
      }
    }

    expect(forum).toContain("Prepare up to six YouTube searches across the general landscape");
    expect(forum).toContain("rewrite queries, use cursors, or start another batch");
    expect(forum).toContain("assess transportability to the question");
    expect(forum).toContain("do not auto-resubmit it in the same pass");
    expect(project).toContain("false tokens are deferred recovery state");
  });

  it("reserves six diverse product cases without broadening the definition control", async () => {
    const matrix = await loadMatrix();
    const live = matrix.cases.filter(({ live_acceptance_priority }) => live_acceptance_priority);
    expect(live).toHaveLength(6);
    expect(live.map(({ id }) => id)).toContain("narrow-celecoxib-experience");
    expect(live.map(({ expected_review }) => expected_review)).not.toContain("not_applicable");
  });

  it("keeps the evidence-frontier regression held out from production instructions", async () => {
    const fixture = JSON.parse(await readFile(
      rootFile("docs/youtube-evidence-frontier-held-out-v0.1.0.json"),
      "utf8",
    )) as {
      candidates: Array<{
        id: string;
        provider_rank: number;
        stage_match: boolean;
        unique_claim: boolean;
        decision_usefulness: string;
        transcript_status: string;
        timestamp_seconds?: number;
        canonical_url: string;
      }>;
      expected_watchlist_ids: string[];
      production_leakage_terms: string[];
    };
    const selected = fixture.candidates.filter((candidate) =>
      candidate.stage_match &&
      candidate.unique_claim &&
      candidate.decision_usefulness === "material" &&
      candidate.transcript_status === "api_visible_complete"
    );
    expect(selected.map(({ id }) => id)).toEqual(fixture.expected_watchlist_ids);
    expect(selected.every(({ timestamp_seconds, canonical_url }) =>
      Number.isInteger(timestamp_seconds) && canonical_url.startsWith("https://www.youtube.com/watch?v=")
    )).toBe(true);
    expect(fixture.candidates.find(({ provider_rank }) => provider_rank === 1)?.id)
      .not.toBe(fixture.expected_watchlist_ids[0]);

    const production = (await Promise.all([
      readFile(rootFile("project/PROJECT_INSTRUCTIONS.md"), "utf8"),
      readFile(rootFile("project/FORUM_SIGNAL_MODULE.md"), "utf8"),
      readFile(rootFile("skills/askrigor/SKILL.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-instructions.md"), "utf8"),
    ])).join("\n").toLowerCase();
    for (const term of fixture.production_leakage_terms) {
      expect(production).not.toContain(term.toLowerCase());
    }
    for (const contaminatedRequirement of [
      "for hip-arthritis/replacement reviews",
      "hip-oa/replacement: separate gelatin",
      "gelatin/collagen; hydration",
    ]) {
      expect(production).not.toContain(contaminatedRequirement);
    }
  });
});
