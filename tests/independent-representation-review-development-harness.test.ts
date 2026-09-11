import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const ROOT = new URL("../evaluation/epistemic-verifier/independent-review-development/runs/20260910-full-3x46/", import.meta.url);
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

async function json<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(name, ROOT), "utf8")) as T;
}

describe("independent semantic-review DEVELOPMENT harness", () => {
  it("freezes 24 natural and 22 matched mutation candidates with one explicit raw-invalid transport", async () => {
    const manifest = await json<any>("candidate-manifest.json");
    expect(manifest.candidate_count).toBe(46);
    expect(manifest.candidates.filter((item: any) => item.track === "NATURAL")).toHaveLength(24);
    expect(manifest.candidates.filter((item: any) => item.track === "MUTATION")).toHaveLength(22);
    expect(manifest.candidates.filter((item: any) => item.transport === "RAW_INVALID_V0_1")).toHaveLength(1);
    expect(new Set(manifest.candidates.map((item: any) => item.candidate_id)).size).toBe(46);
  });

  it("binds candidate work-package hashes and keeps gold out of reviewer inputs", async () => {
    const manifest = await json<any>("candidate-manifest.json");
    for (const candidate of manifest.candidates) {
      const work = await readFile(new URL(candidate.work_package_path.replace(/^.*20260910-full-3x46\//u, ""), ROOT), "utf8");
      const parsed = JSON.parse(work);
      expect(parsed.source_sha256).toBe(candidate.source_sha256);
      expect(parsed.state_sha256 ?? parsed.raw_state_sha256).toBe(candidate.state_sha256);
      const input = await readFile(new URL(candidate.input_path.replace(/^.*20260910-full-3x46\//u, ""), ROOT), "utf8");
      expect(input).not.toMatch(/faithful_or_defective_gold|prior_trial_id|expected_hard_relevance/u);
      expect(input).toContain(candidate.source_sha256);
      expect(sha256(input)).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("freezes one faithful and one defective mutation per required dimension", async () => {
    const mutations = await json<any[]>("gold/mutations/mutation-construction-manifest.json");
    expect(mutations).toHaveLength(22);
    const dimensions = new Set(mutations.map((item) => item.dimension));
    expect(dimensions).toEqual(new Set([
      "exact_target", "case_and_comparison_roles", "negative_or_tolerated_comparator",
      "high_information_qualifier", "timing", "amount_or_dose", "route_or_form",
      "feature_value", "predicate_semantics", "dependency_or_provenance", "other"
    ]));
    for (const dimension of dimensions) {
      const pair = mutations.filter((item) => item.dimension === dimension);
      expect(pair.map((item) => item.faithful_or_defective_gold).sort()).toEqual(["DEFECTIVE", "FAITHFUL"]);
      expect(new Set(pair.map((item) => item.source_sha256)).size).toBe(1);
    }
  });

  it("plans exactly three blinded review sessions per candidate", async () => {
    const order = await json<any>("dispatch-order.json");
    expect(order.review_count).toBe(138);
    expect(new Set(order.order.map((item: any) => item.sequence)).size).toBe(138);
    const counts = new Map<string, number>();
    for (const item of order.order) counts.set(item.candidate_id, (counts.get(item.candidate_id) ?? 0) + 1);
    expect(counts.size).toBe(46);
    expect([...counts.values()].every((value) => value === 3)).toBe(true);
  });

  it("freezes the complete review population before scorer unblinding", async () => {
    const freeze = await json<any>("pre-unblinding-output-freeze.json");
    const unblinding = await json<any>("scorer-unblinding-receipt.json");
    expect(freeze.eligible_review_trials_frozen).toBe(138);
    expect(freeze.population_inventory_entries).toHaveLength(138);
    expect(freeze.scorer_gold_opened_at_freeze).toBe(false);
    expect(unblinding.pre_unblinding_commit).toBe("c634ea51df349eda5db71df315daf7a455bbe2c6");
    expect(unblinding.eligible_outputs_frozen_before_access).toBe(138);
    expect(Date.parse(unblinding.opened_at)).toBeGreaterThan(Date.parse(freeze.recorded_at));
  });

  it("publishes complete individual and majority scoring without rewriting invalid reviews", async () => {
    const individual = (await readFile(new URL("results/per-trial-scoring.jsonl", ROOT), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    const majority = (await readFile(new URL("results/per-candidate-majority.jsonl", ROOT), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    const summary = await json<any>("results/aggregate-summary.json");
    const integrity = await json<any>("results/target-integrity-review.json");
    expect(individual).toHaveLength(138);
    expect(majority).toHaveLength(46);
    expect(individual.filter((row) => !row.review_valid)).toHaveLength(3);
    expect(new Set(individual.map((row) => row.provenance.conversation_identity_sha256)).size).toBe(138);
    expect(summary.population.valid_review_trials).toBe(135);
    expect(summary.metrics.overall.majority.exact_hard_defect_sensitivity).toMatchObject({
      numerator: 26,
      denominator: 27
    });
    expect(summary.metrics.overall.majority.hard_defect_false_pass_rate).toMatchObject({
      numerator: 1,
      denominator: 27
    });
    expect(integrity.historical_gold_modified).toBe(false);
    expect(integrity.classification).toBe("LOAD_BEARING_EVALUATION_TARGET_CONFLICT");
  });
});
