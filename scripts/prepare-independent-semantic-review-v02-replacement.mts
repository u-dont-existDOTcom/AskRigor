import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildHighInformationReplacementPairV021,
  valueAt
} from "../evaluation/epistemic-verifier/independent-review-development/v02/mutation-fixtures.js";

const RUN_ROOT = resolve("evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract");
const PROMPT_PATH = resolve("evaluation/epistemic-verifier/independent-review-development/v02/independent-representation-review-prompt.txt");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
};

const conflict = JSON.parse(await readFile(resolve(RUN_ROOT, "gold/construction-conflict-analysis.json"), "utf8"));
if (conflict.status !== "REJECTED_PAIR_REPLACEMENT_REQUIRED") {
  throw new Error("The preserved construction conflict does not authorize replacement generation");
}

const originalManifest = JSON.parse(await readFile(resolve(RUN_ROOT, "candidate-manifest.json"), "utf8"));
const originalGold = JSON.parse(await readFile(resolve(RUN_ROOT, "gold/mutation-construction-manifest.json"), "utf8"));
const rejectedPair = originalGold.pairs.find((pair: any) => pair.defective_candidate_id === conflict.candidate_id);
if (!rejectedPair || rejectedPair.dimension !== "high_information_qualifier") {
  throw new Error("Cannot identify the rejected high-information-qualifier pair");
}

const pair = buildHighInformationReplacementPairV021();
const prompt = await readFile(PROMPT_PATH, "utf8");
const candidates = pair.candidates;
for (const candidate of candidates) {
  const workPath = resolve(RUN_ROOT, "candidates", candidate.candidate_id, "work-package.json");
  await writeJson(workPath, candidate.work_package);
  const input = `${prompt}\n\nWORK PACKAGE\n${JSON.stringify(candidate.work_package, null, 2)}\n`;
  const inputPath = resolve(RUN_ROOT, "adjudication/replacement-v021/inputs", `${candidate.candidate_id}.txt`);
  await mkdir(dirname(inputPath), { recursive: true });
  await writeFile(inputPath, input, { flag: "wx" });
}

const activeCandidates = originalManifest.candidates.filter(
  (candidate: any) => candidate.pair_id !== rejectedPair.pair_id
).concat(candidates.map((candidate) => ({
  candidate_id: candidate.candidate_id,
  pair_id: candidate.pair_id,
  dimension: candidate.dimension,
  source_sha256: candidate.source_sha256,
  state_sha256: candidate.state_sha256,
  work_package_path: `candidates/${candidate.candidate_id}/work-package.json`
})));

await writeJson(resolve(RUN_ROOT, "candidate-manifest-v021-corrected.json"), {
  schema_version: 1,
  procedure_id: "askrigor_independent_semantic_representation_review_procedure_v0_2_1_fixture_correction",
  phase: "PROSPECTIVE_DEVELOPMENT_CANDIDATE_CORPUS_APPEND_ONLY_CORRECTION",
  supersedes_for_reviewer_scoring: "candidate-manifest.json",
  preserved_rejected_pair_id: rejectedPair.pair_id,
  replacement_pair_id: pair.pair_id,
  candidate_count: activeCandidates.length,
  pair_count: 11,
  candidates: activeCandidates
});

const sourceStart = pair.source_packet.indexOf(pair.source_quote);
if (sourceStart < 0) throw new Error("Replacement source quote is absent");
await writeJson(resolve(RUN_ROOT, "gold/replacement-v021-construction-manifest.json"), {
  schema_version: 1,
  procedure_id: "askrigor_independent_semantic_representation_review_procedure_v0_2_1_fixture_correction",
  phase: "DEVELOPMENT_CONSTRUCTION_GOLD_DO_NOT_EXPOSE_TO_ADJUDICATORS_OR_REVIEWERS",
  replaces_pair_id: rejectedPair.pair_id,
  replacement_reason: conflict.causal_finding,
  pair: {
    pair_id: pair.pair_id,
    dimension: pair.dimension,
    source_sha256: candidates[0].source_sha256,
    faithful_candidate_id: candidates[0].candidate_id,
    defective_candidate_id: candidates[1].candidate_id,
    changed_json_pointers: pair.changed_json_pointers,
    mutation_diff: pair.changed_json_pointers.map((pointer) => ({
      pointer,
      before: valueAt(pair.faithful_state, pointer),
      after: valueAt(pair.defective_state, pointer)
    })),
    source_spans: [{ start: sourceStart, end: sourceStart + pair.source_quote.length, quote: pair.source_quote }]
  }
});

const seed = "semantic-review-v021-replacement-adjudication-20260911";
const hashedInputs = [];
for (const candidate of candidates) {
  const inputPath = `evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract/adjudication/replacement-v021/inputs/${candidate.candidate_id}.txt`;
  hashedInputs.push({
    candidate_id: candidate.candidate_id,
    input_path: inputPath,
    input_sha256: sha256(await readFile(resolve(inputPath)))
  });
}
const order: any[] = [];
let sequence = 0;
for (const round of [1, 2]) {
  const sorted = [...hashedInputs].sort((a, b) =>
    sha256(`${seed}|${round}|${a.candidate_id}`).localeCompare(sha256(`${seed}|${round}|${b.candidate_id}`))
  );
  for (const input of sorted) order.push({ sequence: ++sequence, round, ...input });
}
await writeJson(resolve(RUN_ROOT, "adjudication/replacement-v021/dispatch-order.json"), {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_BLINDED_REPLACEMENT_GOLD_ADJUDICATION",
  seed,
  candidate_count: 2,
  required_independent_rounds: 2,
  planned_sessions_before_disagreement_resolution: 4,
  order
});
await writeJson(resolve(RUN_ROOT, "adjudication/replacement-v021/pre-generation-freeze.json"), {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_REPLACEMENT_PRE_GENERATION_FREEZE",
  candidate_manifest_sha256: sha256(await readFile(resolve(RUN_ROOT, "candidate-manifest-v021-corrected.json"))),
  replacement_dispatch_sha256: sha256(await readFile(resolve(RUN_ROOT, "adjudication/replacement-v021/dispatch-order.json"))),
  prior_adjudications_preserved: 51,
  additional_sessions_planned: 4,
  third_required_on_any_field_disagreement: true,
  replacement_construction_gold_must_not_be_exposed: true,
  reviewer_generation_allowed: false
});

console.log(JSON.stringify({ rejected_pair: rejectedPair.pair_id, replacement_pair: pair.pair_id, candidates: candidates.map((candidate) => candidate.candidate_id), adjudication_sessions: 4 }));
