import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  V02_PROCEDURE_ID,
  buildMutationPairsV02,
  valueAt
} from "../evaluation/epistemic-verifier/independent-review-development/v02/mutation-fixtures.js";

const outputFlagIndex = process.argv.indexOf("--output-root");
if (outputFlagIndex < 0 || !process.argv[outputFlagIndex + 1]) {
  throw new Error("Usage: tsx scripts/prepare-independent-semantic-review-v02-development.mts --output-root <new-empty-directory>");
}
const outputRoot = resolve(process.argv[outputFlagIndex + 1]!);

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

const pairs = buildMutationPairsV02();
const candidates = pairs.flatMap(({ candidates }) => candidates);

function sourceSpan(source: string, quote: string) {
  const start = source.indexOf(quote);
  if (start < 0) throw new Error(`Missing source quote: ${quote}`);
  return { start, end: start + quote.length, quote };
}

for (const candidate of candidates) {
  await writeJson(
    `${outputRoot}/candidates/${candidate.candidate_id}/work-package.json`,
    candidate.work_package
  );
}

await writeJson(`${outputRoot}/candidate-manifest.json`, {
  schema_version: 1,
  procedure_id: V02_PROCEDURE_ID,
  phase: "PROSPECTIVE_DEVELOPMENT_CANDIDATE_CORPUS",
  candidate_count: candidates.length,
  pair_count: pairs.length,
  candidates: candidates.map((candidate) => ({
    candidate_id: candidate.candidate_id,
    pair_id: candidate.pair_id,
    dimension: candidate.dimension,
    source_sha256: candidate.source_sha256,
    state_sha256: candidate.state_sha256,
    work_package_path: `candidates/${candidate.candidate_id}/work-package.json`
  }))
});

await writeJson(`${outputRoot}/gold/mutation-construction-manifest.json`, {
  schema_version: 1,
  procedure_id: V02_PROCEDURE_ID,
  phase: "DEVELOPMENT_CONSTRUCTION_GOLD_DO_NOT_EXPOSE_TO_REVIEWERS",
  historical_v01_artifacts_modified: false,
  faithful_base_repairs: [
    "The named compound Sol is preserved in both source-grounded observations.",
    "The source and state both represent onset as exactly 2 seconds.",
    "The Quartz hypothesis contains no unsupported dose modifier or timing prediction."
  ],
  pairs: pairs.map((pair) => ({
    pair_id: pair.pair_id,
    dimension: pair.dimension,
    source_sha256: pair.candidates[0].source_sha256,
    faithful_candidate_id: pair.candidates[0].candidate_id,
    defective_candidate_id: pair.candidates[1].candidate_id,
    changed_json_pointers: pair.changed_json_pointers,
    mutation_diff: pair.changed_json_pointers.map((pointer) => ({
      pointer,
      before: valueAt(pair.faithful_state, pointer),
      after: valueAt(pair.defective_state, pointer)
    })),
    source_spans: [sourceSpan(pair.source_packet, pair.source_quote)]
  }))
});

await writeJson(`${outputRoot}/pre-adjudication-admission.json`, {
  schema_version: 1,
  procedure_id: V02_PROCEDURE_ID,
  status: "BLOCKED_PENDING_INDEPENDENT_ADJUDICATION",
  reviewer_generation_allowed: false,
  required_before_reviewer_generation: {
    candidates: candidates.length,
    independent_source_state_only_adjudications_per_candidate: 2,
    third_adjudication_on_disagreement: true,
    adjudicator_output_freeze_before_construction_gold_access: true,
    actual_session_model_mode_provenance_required: true
  },
  current: {
    completed_independent_adjudications: 0,
    disagreements_resolved: 0,
    reviewer_outputs_generated: 0
  },
  reason: "The v0.1 target-integrity review requires independent full semantic adjudication of each faithful and defective candidate before a new reviewer run."
});

console.log(JSON.stringify({
  output_root: outputRoot,
  procedure_id: V02_PROCEDURE_ID,
  pairs: pairs.length,
  candidates: candidates.length,
  reviewer_generation_allowed: false
}, null, 2));
