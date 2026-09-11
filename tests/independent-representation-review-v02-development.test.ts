import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  EPISTEMIC_REPRESENTATION_DIMENSIONS
} from "../apps/research-mcp/src/epistemic-representation-review.js";
import {
  evaluateSpecificityDiscriminatorGate
} from "../apps/research-mcp/src/epistemic-verifier.js";
import {
  V02_PROCEDURE_ID,
  buildMutationPairsV02
} from "../evaluation/epistemic-verifier/independent-review-development/v02/mutation-fixtures.js";

const V02_ROOT = new URL(
  "../evaluation/epistemic-verifier/independent-review-development/v02/",
  import.meta.url
);
const PROSPECTIVE_ROOT = new URL(
  "prospective/20260911-v02-contract/",
  V02_ROOT
);
const V01_RUN_ROOT = new URL(
  "../evaluation/epistemic-verifier/independent-review-development/runs/20260910-full-3x46/",
  import.meta.url
);

async function json<T>(path: string, root = PROSPECTIVE_ROOT): Promise<T> {
  return JSON.parse(await readFile(new URL(path, root), "utf8")) as T;
}

function diffPointers(left: unknown, right: unknown, prefix = ""): string[] {
  if (Object.is(left, right)) return [];
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return [prefix];
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...keys].flatMap((key) => {
    const escaped = key.replace(/~/gu, "~0").replace(/\//gu, "~1");
    return diffPointers(leftRecord[key], rightRecord[key], `${prefix}/${escaped}`);
  });
}

describe("independent semantic representation review v0.2 DEVELOPMENT candidate", () => {
  it("requires a case-by-case predicate truth-condition evaluation", async () => {
    const prompt = await readFile(
      new URL("independent-representation-review-prompt.txt", V02_ROOT),
      "utf8"
    );
    expect(prompt).toContain("perform this procedure before judging `predicate_semantics`");
    expect(prompt).toContain("Evaluate what the candidate operator returns for each case");
    expect(prompt).toContain("`operator: \"present\"` asks whether a record");
    expect(prompt).toContain("a `present` operator returns true for both records");
    expect(prompt).toContain("procedure v0.2 deliberately retains the v0.1 machine schema");
  });

  it("builds one isolated faithful/defective pair for every required dimension", () => {
    const pairs = buildMutationPairsV02();
    expect(pairs).toHaveLength(EPISTEMIC_REPRESENTATION_DIMENSIONS.length);
    expect(pairs.map(({ dimension }) => dimension)).toEqual(EPISTEMIC_REPRESENTATION_DIMENSIONS);

    for (const pair of pairs) {
      expect(pair.candidates.map(({ variant }) => variant)).toEqual(["FAITHFUL", "DEFECTIVE"]);
      expect(pair.candidates[0].source_sha256).toBe(pair.candidates[1].source_sha256);
      expect(pair.candidates[0].state_sha256).not.toBe(pair.candidates[1].state_sha256);
      expect(diffPointers(pair.faithful_state, pair.defective_state).sort())
        .toEqual([...pair.changed_json_pointers].sort());
    }
  });

  it("removes every load-bearing v0.1 mutation-base confound", () => {
    for (const pair of buildMutationPairsV02()) {
      const positive = pair.faithful_state.observations[0]!;
      const control = pair.faithful_state.observations[1]!;
      const hypothesis = pair.faithful_state.hypotheses[0]!;

      expect(pair.source_packet).toContain("begins exactly 2 seconds");
      expect(pair.source_packet).toContain("10 units of compound Sol");
      expect(positive.qualifiers).toMatchObject({
        onset_seconds: 2,
        dose_units: 10,
        compound: "Sol",
        route: "intravenous",
        form: "liquid"
      });
      expect(control.qualifiers).toMatchObject({
        dose_units: 10,
        compound: "Sol",
        route: "intravenous",
        form: "liquid"
      });
      expect(positive.high_information_qualifier_keys).toContain("compound");
      expect(control.high_information_qualifier_keys).toContain("compound");
      expect(hypothesis.discriminator).toEqual({
        feature_id: pair.faithful_state.features[0]!.feature_id,
        operator: "equals",
        value: "high"
      });
      expect(hypothesis.qualifier_predictions).toEqual([]);
    }
  });

  it("makes record existence observably different from stored-value equality", () => {
    const pair = buildMutationPairsV02().find(
      ({ dimension }) => dimension === "predicate_semantics"
    )!;
    const faithful = evaluateSpecificityDiscriminatorGate(pair.faithful_state);
    const defective = evaluateSpecificityDiscriminatorGate(pair.defective_state);

    expect(faithful.status).toBe("pass");
    expect(defective.status).toBe("block");
    expect(defective.blockers.join(" ")).toContain("does not distinguish");
    expect(pair.defective_state.hypotheses[0]!.discriminator).toEqual({
      feature_id: pair.faithful_state.features[0]!.feature_id,
      operator: "present"
    });
  });

  it("uses new opaque candidate identities and reproduces the committed corpus", async () => {
    const pairs = buildMutationPairsV02();
    const candidates = pairs.flatMap(({ candidates }) => candidates);
    const manifest = await json<any>("candidate-manifest.json");
    const v01 = await json<any>("candidate-manifest.json", V01_RUN_ROOT);
    const v01Ids = new Set(v01.candidates.map((candidate: any) => candidate.candidate_id));

    expect(manifest.procedure_id).toBe(V02_PROCEDURE_ID);
    expect(manifest.candidate_count).toBe(22);
    expect(manifest.pair_count).toBe(11);
    expect(JSON.stringify(manifest)).not.toContain('"variant"');
    expect(JSON.stringify(manifest)).not.toContain('"FAITHFUL"');
    expect(JSON.stringify(manifest)).not.toContain('"DEFECTIVE"');
    expect(new Set(candidates.map(({ candidate_id }) => candidate_id)).size).toBe(22);
    for (const candidate of candidates) {
      expect(candidate.candidate_id).toMatch(/^MUTV02-[A-F0-9]{12}$/u);
      expect(v01Ids.has(candidate.candidate_id)).toBe(false);
      const path = manifest.candidates.find(
        (item: any) => item.candidate_id === candidate.candidate_id
      )!.work_package_path;
      expect(await json(path)).toEqual(candidate.work_package);
    }
  });

  it("keeps construction gold separate and binds exact source spans", async () => {
    const gold = await json<any>("gold/mutation-construction-manifest.json");
    expect(gold.phase).toBe("DEVELOPMENT_CONSTRUCTION_GOLD_DO_NOT_EXPOSE_TO_REVIEWERS");
    expect(gold.historical_v01_artifacts_modified).toBe(false);
    expect(gold.pairs).toHaveLength(11);
    for (const pair of gold.pairs) {
      expect(pair.faithful_candidate_id).toMatch(/^MUTV02-[A-F0-9]{12}$/u);
      expect(pair.defective_candidate_id).toMatch(/^MUTV02-[A-F0-9]{12}$/u);
      const candidate = await json<any>(
        `candidates/${pair.faithful_candidate_id}/work-package.json`
      );
      for (const span of pair.source_spans) {
        expect(candidate.source_packet.slice(span.start, span.end)).toBe(span.quote);
      }
    }
  });

  it("fails closed before independent source/state adjudication", async () => {
    const admission = await json<any>("pre-adjudication-admission.json");
    expect(admission.status).toBe("BLOCKED_PENDING_INDEPENDENT_ADJUDICATION");
    expect(admission.reviewer_generation_allowed).toBe(false);
    expect(admission.required_before_reviewer_generation).toMatchObject({
      candidates: 22,
      independent_source_state_only_adjudications_per_candidate: 2,
      third_adjudication_on_disagreement: true,
      adjudicator_output_freeze_before_construction_gold_access: true,
      actual_session_model_mode_provenance_required: true
    });
    expect(admission.current).toMatchObject({
      completed_independent_adjudications: 0,
      disagreements_resolved: 0,
      reviewer_outputs_generated: 0
    });
  });
});
