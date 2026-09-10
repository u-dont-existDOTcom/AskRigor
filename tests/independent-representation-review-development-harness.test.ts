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
});
