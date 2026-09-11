import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const RUN_ROOT = resolve("evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract");
const readJson = async (path: string) => JSON.parse(await readFile(resolve(path), "utf8"));
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const tuple = (finding: any) => `${finding.status}|${finding.affects_hard_invariant}`;

const comparisonBytes = await readFile(resolve(RUN_ROOT, "adjudication/initial-comparison.json"));
const comparison = JSON.parse(comparisonBytes.toString("utf8"));
const thirdDispatch = await readJson(resolve(RUN_ROOT, "adjudication/third-dispatch-order.json"));
const outputRoot = resolve(RUN_ROOT, "adjudication/outputs");
const directories = await readdir(outputRoot);
const thirdDirectories = directories.filter((name) => /^\d{3}-r3-MUTV02-[A-F0-9]+$/.test(name));
if (thirdDirectories.length !== thirdDispatch.planned_sessions) {
  throw new Error(`Expected ${thirdDispatch.planned_sessions} third adjudications, found ${thirdDirectories.length}`);
}

const thirdByCandidate = new Map<string, any>();
for (const directory of thirdDirectories) {
  const provenance = await readJson(resolve(outputRoot, directory, "provenance.json"));
  thirdByCandidate.set(provenance.candidate_id, await readJson(resolve(outputRoot, directory, "ingest-receipt.json")));
}

const reconciled: any[] = [];
for (const candidate of comparison.candidates) {
  const third = thirdByCandidate.get(candidate.candidate_id);
  if (!candidate.exact_field_agreement && !third) throw new Error(`Missing required third adjudication for ${candidate.candidate_id}`);
  const majorityFindings = candidate.first.map((first: any, index: number) => {
    const second = candidate.second[index];
    const thirdFinding = third?.findings[index];
    if (first.dimension !== second.dimension || (thirdFinding && first.dimension !== thirdFinding.dimension)) {
      throw new Error(`Dimension order mismatch for ${candidate.candidate_id}`);
    }
    const values = [first, second, ...(thirdFinding ? [thirdFinding] : [])];
    const counts = new Map<string, number>();
    for (const value of values) counts.set(tuple(value), (counts.get(tuple(value)) ?? 0) + 1);
    const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!winner || winner[1] < 2) throw new Error(`No field majority for ${candidate.candidate_id}/${first.dimension}`);
    const selected = values.find((value) => tuple(value) === winner[0]);
    return { dimension: selected.dimension, status: selected.status, affects_hard_invariant: selected.affects_hard_invariant };
  });
  const defective = majorityFindings.some((finding: any) => ["missing", "distorted"].includes(finding.status));
  const uncertain = majorityFindings.some((finding: any) => finding.status === "uncertain");
  const hardDefect = majorityFindings.some((finding: any) => finding.affects_hard_invariant && ["missing", "distorted"].includes(finding.status));
  const hardUncertain = majorityFindings.some((finding: any) => finding.affects_hard_invariant && finding.status === "uncertain");
  reconciled.push({
    candidate_id: candidate.candidate_id,
    semantic_representation_adjudication: defective ? "DEFECTIVE" : uncertain ? "UNCERTAIN" : "FAITHFUL",
    hard_relevance_adjudication: hardDefect ? "HARD_DEFECT" : hardUncertain ? "HARD_UNCERTAIN" : "NO_HARD_DEFECT",
    third_adjudication_used: Boolean(third),
    majority_findings: majorityFindings
  });
}

// This is the first read of construction labels in the execution path. It is
// deliberately below the complete initial/third-output checks above.
const constructionPath = resolve(RUN_ROOT, "gold/mutation-construction-manifest.json");
const constructionBytes = await readFile(constructionPath);
const construction = JSON.parse(constructionBytes.toString("utf8"));
const constructionByCandidate = new Map(construction.map((item: any) => [item.opaque_candidate_id, item]));
const conflicts: any[] = [];
for (const item of reconciled) {
  const expected: any = constructionByCandidate.get(item.candidate_id);
  if (!expected) throw new Error(`Missing construction record for ${item.candidate_id}`);
  const expectedClass = expected.faithful_or_defective_gold;
  const dimensionFinding = item.majority_findings.find((finding: any) => finding.dimension === expected.dimension);
  const aligned = expectedClass === "FAITHFUL"
    ? item.semantic_representation_adjudication === "FAITHFUL"
    : Boolean(dimensionFinding && ["missing", "distorted"].includes(dimensionFinding.status) && dimensionFinding.affects_hard_invariant);
  if (!aligned) conflicts.push({
    candidate_id: item.candidate_id,
    construction_class: expectedClass,
    construction_dimension: expected.dimension,
    adjudicated_class: item.semantic_representation_adjudication,
    adjudicated_hard_relevance: item.hard_relevance_adjudication,
    dimension_finding: dimensionFinding ?? null
  });
  item.construction_class = expectedClass;
  item.construction_dimension = expected.dimension;
  item.gold_alignment = aligned ? "ALIGNED" : "CONFLICT";
}

const accessReceipt = {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_CONSTRUCTION_GOLD_UNBLINDING",
  opened_at: new Date().toISOString(),
  all_initial_adjudications_frozen: comparison.candidate_count === 22,
  all_required_third_adjudications_frozen: thirdDirectories.length === thirdDispatch.planned_sessions,
  initial_comparison_sha256: sha256(comparisonBytes),
  construction_gold_path: "evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract/gold/mutation-construction-manifest.json",
  construction_gold_sha256: sha256(constructionBytes),
  conflict_count: conflicts.length
};
await writeFile(resolve(RUN_ROOT, "gold/construction-gold-access-receipt.json"), `${JSON.stringify(accessReceipt, null, 2)}\n`, { flag: "wx" });
await writeFile(resolve(RUN_ROOT, "gold/adjudicated-gold.json"), `${JSON.stringify({
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_RECONCILED_GOLD",
  candidate_count: reconciled.length,
  conflict_count: conflicts.length,
  candidates: reconciled,
  conflicts
}, null, 2)}\n`, { flag: "wx" });

const reviewerAllowed = conflicts.length === 0;
await writeFile(resolve(RUN_ROOT, "post-adjudication-admission.json"), `${JSON.stringify({
  schema_version: 1,
  procedure_id: "askrigor_independent_semantic_representation_review_procedure_v0_2",
  status: reviewerAllowed ? "ADMITTED_FOR_BLINDED_REVIEWER_GENERATION" : "BLOCKED_PENDING_GOLD_CONFLICT_RESOLUTION",
  reviewer_generation_allowed: reviewerAllowed,
  adjudicated_candidates: reconciled.length,
  third_adjudications: thirdDirectories.length,
  construction_adjudication_conflicts: conflicts.length
}, null, 2)}\n`, { flag: "wx" });

if (!reviewerAllowed) throw new Error(`${conflicts.length} construction/adjudication conflicts require resolution before reviewer generation`);
console.log(JSON.stringify({ candidates: reconciled.length, third_adjudications: thirdDirectories.length, conflicts: 0, reviewer_generation_allowed: true }));
