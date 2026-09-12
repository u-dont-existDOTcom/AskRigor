import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const RUN_ROOT = resolve("evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract");
const REPLACEMENT_ROOT = resolve(RUN_ROOT, "adjudication/replacement-v021");
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const tuple = (finding: any) => `${finding.status}|${finding.affects_hard_invariant}`;

const priorBytes = await readFile(resolve(RUN_ROOT, "gold/adjudicated-gold.json"));
const prior = JSON.parse(priorBytes.toString("utf8"));
const conflict = await readJson(resolve(RUN_ROOT, "gold/construction-conflict-analysis.json"));
const originalConstruction = await readJson(resolve(RUN_ROOT, "gold/mutation-construction-manifest.json"));
const rejectedPair = originalConstruction.pairs.find((pair: any) => pair.defective_candidate_id === conflict.candidate_id);
if (!rejectedPair) throw new Error("Rejected pair is absent from original construction gold");

const comparison = await readJson(resolve(REPLACEMENT_ROOT, "initial-comparison.json"));
const thirdDispatch = await readJson(resolve(REPLACEMENT_ROOT, "third-dispatch-order.json"));
const outputRoot = resolve(REPLACEMENT_ROOT, "outputs");
const directories = await readdir(outputRoot);
const thirdByCandidate = new Map<string, any>();
for (const item of thirdDispatch.order) {
  const directory = directories.find((name) => name.includes(`-r3-${item.candidate_id}`));
  if (!directory) throw new Error(`Missing third adjudication for ${item.candidate_id}`);
  thirdByCandidate.set(item.candidate_id, await readJson(resolve(outputRoot, directory, "ingest-receipt.json")));
}

const replacementCandidates = comparison.candidates.map((candidate: any) => {
  const third = thirdByCandidate.get(candidate.candidate_id);
  const majorityFindings = candidate.first.map((first: any, index: number) => {
    const second = candidate.second[index];
    const values = [first, second, ...(third ? [third.findings[index]] : [])];
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
  return {
    candidate_id: candidate.candidate_id,
    semantic_representation_adjudication: defective ? "DEFECTIVE" : uncertain ? "UNCERTAIN" : "FAITHFUL",
    hard_relevance_adjudication: hardDefect ? "HARD_DEFECT" : hardUncertain ? "HARD_UNCERTAIN" : "NO_HARD_DEFECT",
    third_adjudication_used: Boolean(third),
    majority_findings: majorityFindings
  };
});

const constructionBytes = await readFile(resolve(RUN_ROOT, "gold/replacement-v021-construction-manifest.json"));
const construction = JSON.parse(constructionBytes.toString("utf8")).pair;
const conflicts: any[] = [];
for (const candidate of replacementCandidates) {
  const expectedClass = candidate.candidate_id === construction.faithful_candidate_id ? "FAITHFUL" :
    candidate.candidate_id === construction.defective_candidate_id ? "DEFECTIVE" : null;
  if (!expectedClass) throw new Error(`Replacement construction identity missing for ${candidate.candidate_id}`);
  const finding = candidate.majority_findings.find((item: any) => item.dimension === construction.dimension);
  const aligned = expectedClass === "FAITHFUL"
    ? candidate.semantic_representation_adjudication === "FAITHFUL"
    : Boolean(finding && ["missing", "distorted"].includes(finding.status) && finding.affects_hard_invariant);
  if (!aligned) conflicts.push({ candidate_id: candidate.candidate_id, expected_class: expectedClass, adjudicated_class: candidate.semantic_representation_adjudication, hard_relevance: candidate.hard_relevance_adjudication, dimension_finding: finding });
  candidate.construction_class = expectedClass;
  candidate.construction_dimension = construction.dimension;
  candidate.gold_alignment = aligned ? "ALIGNED" : "CONFLICT";
}

const preserved = prior.candidates.filter((candidate: any) =>
  ![rejectedPair.faithful_candidate_id, rejectedPair.defective_candidate_id].includes(candidate.candidate_id)
);
const candidates = [...preserved, ...replacementCandidates];
if (candidates.length !== 22) throw new Error(`Expected 22 corrected candidates, found ${candidates.length}`);
const gold = {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_RECONCILED_GOLD_APPEND_ONLY_FIXTURE_CORRECTION",
  supersedes_for_reviewer_scoring: "gold/adjudicated-gold.json",
  prior_adjudicated_gold_sha256: sha256(priorBytes),
  replacement_construction_gold_sha256: sha256(constructionBytes),
  rejected_pair_preserved_at: "gold/construction-conflict-analysis.json",
  candidate_count: candidates.length,
  conflict_count: conflicts.length,
  candidates,
  conflicts
};
await writeFile(resolve(RUN_ROOT, "gold/adjudicated-gold-v021-corrected.json"), `${JSON.stringify(gold, null, 2)}\n`, { flag: "wx" });
const allowed = conflicts.length === 0;
await writeFile(resolve(RUN_ROOT, "post-adjudication-admission-v021-corrected.json"), `${JSON.stringify({
  schema_version: 1,
  procedure_id: "askrigor_independent_semantic_representation_review_procedure_v0_2_1_fixture_correction",
  status: allowed ? "ADMITTED_FOR_BLINDED_REVIEWER_GENERATION" : "BLOCKED_PENDING_REPLACEMENT_GOLD_CONFLICT_RESOLUTION",
  reviewer_generation_allowed: allowed,
  candidate_count: candidates.length,
  replacement_construction_adjudication_conflicts: conflicts.length,
  prior_rejected_pair_excluded_from_scoring: true
}, null, 2)}\n`, { flag: "wx" });
if (!allowed) throw new Error(`${conflicts.length} replacement construction/adjudication conflicts remain`);
console.log(JSON.stringify({ candidates: candidates.length, conflicts: 0, reviewer_generation_allowed: true }));
