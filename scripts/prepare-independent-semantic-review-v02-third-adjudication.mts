import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const RUN_ROOT = resolve("evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract");
const readJson = async (path: string) => JSON.parse(await readFile(resolve(path), "utf8"));
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const dispatch = await readJson(resolve(RUN_ROOT, "adjudication/dispatch-order.json"));
const outputRoot = resolve(RUN_ROOT, "adjudication/outputs");
const directories = await readdir(outputRoot);
const initial = directories.filter((name) => /^\d{3}-r[12]-MUTV02-[A-F0-9]+$/.test(name));
if (initial.length !== dispatch.planned_sessions_before_disagreement_resolution) {
  throw new Error(`Expected ${dispatch.planned_sessions_before_disagreement_resolution} frozen initial adjudications, found ${initial.length}`);
}

const supplemental = directories.filter((name) => /^\d{3}-s\d+-r[12]-MUTV02-[A-F0-9]+$/.test(name));
const supplementalByRound = new Map<string, any>();
for (const directory of supplemental) {
  const provenance = await readJson(resolve(outputRoot, directory, "provenance.json"));
  supplementalByRound.set(`${provenance.candidate_id}|${provenance.round}`, await readJson(resolve(outputRoot, directory, "ingest-receipt.json")));
}

const byCandidate = new Map<string, Map<number, any>>();
for (const directory of initial) {
  const provenance = await readJson(resolve(outputRoot, directory, "provenance.json"));
  let receipt: any;
  try {
    receipt = await readJson(resolve(outputRoot, directory, "ingest-receipt.json"));
  } catch {
    receipt = supplementalByRound.get(`${provenance.candidate_id}|${provenance.round}`);
    if (!receipt) throw new Error(`Missing valid supplemental adjudication for ${provenance.candidate_id} round ${provenance.round}`);
  }
  if (!byCandidate.has(provenance.candidate_id)) byCandidate.set(provenance.candidate_id, new Map());
  byCandidate.get(provenance.candidate_id)!.set(provenance.round, receipt);
}

const signature = (receipt: any) => receipt.findings.map((finding: any) => ({
  dimension: finding.dimension,
  status: finding.status,
  affects_hard_invariant: finding.affects_hard_invariant
}));
const comparisons: any[] = [];
for (const [candidateId, rounds] of [...byCandidate.entries()].sort()) {
  const first = rounds.get(1);
  const second = rounds.get(2);
  if (!first || !second) throw new Error(`Missing independent round for ${candidateId}`);
  const firstSignature = signature(first);
  const secondSignature = signature(second);
  const disagreementDimensions = firstSignature
    .filter((finding: any, index: number) => JSON.stringify(finding) !== JSON.stringify(secondSignature[index]))
    .map((finding: any) => finding.dimension);
  comparisons.push({
    candidate_id: candidateId,
    first: firstSignature,
    second: secondSignature,
    exact_field_agreement: disagreementDimensions.length === 0,
    disagreement_dimensions: disagreementDimensions
  });
}

const disagreements = comparisons.filter((candidate) => !candidate.exact_field_agreement);
const order = disagreements
  .sort((a, b) => sha256(`semantic-review-v02-third|${a.candidate_id}`).localeCompare(sha256(`semantic-review-v02-third|${b.candidate_id}`)))
  .map((candidate, index) => ({
    sequence: dispatch.planned_sessions_before_disagreement_resolution + supplemental.length + index + 1,
    round: 3,
    candidate_id: candidate.candidate_id,
    input_path: dispatch.order.find((item: any) => item.candidate_id === candidate.candidate_id).input_path,
    input_sha256: dispatch.order.find((item: any) => item.candidate_id === candidate.candidate_id).input_sha256,
    disagreement_dimensions: candidate.disagreement_dimensions
  }));

await writeFile(resolve(RUN_ROOT, "adjudication/initial-comparison.json"), `${JSON.stringify({
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_POST_INITIAL_ADJUDICATION",
  candidate_count: comparisons.length,
  exact_agreement_count: comparisons.length - disagreements.length,
  disagreement_count: disagreements.length,
  construction_gold_opened: false,
  supplemental_adjudications_used: supplemental.length,
  candidates: comparisons
}, null, 2)}\n`, { flag: "wx" });
await writeFile(resolve(RUN_ROOT, "adjudication/third-dispatch-order.json"), `${JSON.stringify({
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_THIRD_ADJUDICATION",
  trigger: "ANY_DIMENSION_STATUS_OR_HARD_RELEVANCE_DISAGREEMENT",
  planned_sessions: order.length,
  order
}, null, 2)}\n`, { flag: "wx" });

console.log(JSON.stringify({ candidates: comparisons.length, exact_agreements: comparisons.length - disagreements.length, third_adjudications: disagreements.length }));
