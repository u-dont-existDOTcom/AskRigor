import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const RUN_ROOT = resolve("evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract");
const REPLACEMENT_ROOT = resolve(RUN_ROOT, "adjudication/replacement-v021");
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const dispatch = await readJson(resolve(REPLACEMENT_ROOT, "dispatch-order.json"));
const candidates = [...new Set(dispatch.order.map((item: any) => item.candidate_id))] as string[];
const inputByCandidate = new Map<string, any>();
for (const item of dispatch.order) inputByCandidate.set(item.candidate_id, item);

const outputRoot = resolve(REPLACEMENT_ROOT, "outputs");
const directories = await readdir(outputRoot);
const validByCandidateRound = new Map<string, { directory: string; provenance: any; receipt: any }>();
const invalid: any[] = [];
for (const directory of directories.sort()) {
  const provenancePath = resolve(outputRoot, directory, "provenance.json");
  let provenance: any;
  try {
    provenance = await readJson(provenancePath);
  } catch {
    continue;
  }
  if (!candidates.includes(provenance.candidate_id)) continue;
  try {
    const receipt = await readJson(resolve(outputRoot, directory, "ingest-receipt.json"));
    validByCandidateRound.set(`${provenance.candidate_id}|${provenance.round}`, { directory, provenance, receipt });
  } catch {
    invalid.push({ directory, candidate_id: provenance.candidate_id, round: provenance.round });
  }
}

const missing: any[] = [];
for (const candidateId of candidates) {
  for (const round of [1, 2]) {
    if (!validByCandidateRound.has(`${candidateId}|${round}`)) {
      const input = inputByCandidate.get(candidateId);
      missing.push({ candidate_id: candidateId, round, input_path: input.input_path, input_sha256: input.input_sha256 });
    }
  }
}

if (missing.length > 0) {
  const path = resolve(REPLACEMENT_ROOT, "supplemental-dispatch-order.json");
  const seed = "semantic-review-v021-replacement-supplemental-20260911";
  const order = missing
    .sort((a, b) => sha256(`${seed}|${a.round}|${a.candidate_id}`).localeCompare(sha256(`${seed}|${b.round}|${b.candidate_id}`)))
    .map((item, index) => ({ sequence: index + 1, supplemental: 1, ...item }));
  await writeFile(path, `${JSON.stringify({
    schema_version: 1,
    phase: "DEVELOPMENT_DISCOVERY_BLINDED_REPLACEMENT_SUPPLEMENTAL_ADJUDICATION",
    seed,
    planned_sessions: order.length,
    invalid_outputs_preserved: invalid,
    order
  }, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: "SUPPLEMENTAL_REQUIRED", sessions: order.length, missing }));
  process.exit(0);
}

const comparisons = candidates.map((candidateId) => {
  const first = validByCandidateRound.get(`${candidateId}|1`)!;
  const second = validByCandidateRound.get(`${candidateId}|2`)!;
  const firstTuples = first.receipt.findings.map((finding: any) => `${finding.status}|${finding.affects_hard_invariant}`);
  const secondTuples = second.receipt.findings.map((finding: any) => `${finding.status}|${finding.affects_hard_invariant}`);
  const disagreements = first.receipt.findings
    .filter((finding: any, index: number) => firstTuples[index] !== secondTuples[index])
    .map((finding: any) => finding.dimension);
  return {
    candidate_id: candidateId,
    first_directory: first.directory,
    second_directory: second.directory,
    first: first.receipt.findings,
    second: second.receipt.findings,
    exact_field_agreement: disagreements.length === 0,
    disagreement_dimensions: disagreements
  };
});
await writeFile(resolve(REPLACEMENT_ROOT, "initial-comparison.json"), `${JSON.stringify({
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_REPLACEMENT_ADJUDICATION_COMPARISON",
  candidate_count: candidates.length,
  candidates: comparisons
}, null, 2)}\n`, { flag: "wx" });

const third = comparisons.filter((item) => !item.exact_field_agreement).map((item, index) => {
  const input = inputByCandidate.get(item.candidate_id);
  return {
    sequence: index + 1,
    round: 3,
    candidate_id: item.candidate_id,
    input_path: input.input_path,
    input_sha256: input.input_sha256,
    disagreement_dimensions: item.disagreement_dimensions
  };
});
await writeFile(resolve(REPLACEMENT_ROOT, "third-dispatch-order.json"), `${JSON.stringify({
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_BLINDED_REPLACEMENT_THIRD_ADJUDICATION",
  planned_sessions: third.length,
  order: third
}, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ status: "INITIAL_ADJUDICATION_COMPLETE", third_sessions: third.length, disagreements: third.map((item) => ({ candidate_id: item.candidate_id, dimensions: item.disagreement_dimensions })) }));
