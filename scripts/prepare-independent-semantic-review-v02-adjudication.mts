import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const RUN_ROOT = "evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract";
const PROMPT_PATH = "evaluation/epistemic-verifier/independent-review-development/v02/independent-representation-review-prompt.txt";
const CANDIDATE_MANIFEST_PATH = `${RUN_ROOT}/candidate-manifest.json`;
const SOURCE_DIRECTIVE_PATH = "evaluation/epistemic-verifier/independent-review-development/runs/20260910-full-3x46/project-manager-directive.json";
const SOURCE_RECEIPT = {
  messageId: "c3fea205-8b0a-43ca-a43c-7d25ec82d07a",
  exactBodySha256: "b3218dab2a0e942abcd6be27dba33338caf2c89f737008866723b8c5ca28c7f4",
  claimedSurface: "CHATGPT_PROJECT_MANAGER",
  observedSurface: "CHATGPT_PROJECT_MANAGER",
  provenanceStatus: "VERIFIED"
};
const SEED = "semantic-review-v02-independent-adjudication-20260911";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
};
const writeText = async (path: string, value: string) => {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), value, { flag: "wx" });
};

const prompt = await readFile(resolve(PROMPT_PATH), "utf8");
const manifestBytes = await readFile(resolve(CANDIDATE_MANIFEST_PATH));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const sourceDirectiveBytes = await readFile(resolve(SOURCE_DIRECTIVE_PATH));

const inputs: Array<{ candidate_id: string; input_path: string; input_sha256: string }> = [];
for (const candidate of manifest.candidates) {
  const workPath = `${RUN_ROOT}/${candidate.work_package_path}`;
  const workBytes = await readFile(resolve(workPath));
  const input = `${prompt}\n\nWORK PACKAGE\n${workBytes.toString("utf8")}`;
  const inputPath = `${RUN_ROOT}/adjudication/inputs/${candidate.candidate_id}.txt`;
  await writeText(inputPath, input);
  inputs.push({ candidate_id: candidate.candidate_id, input_path: inputPath, input_sha256: sha256(input) });
}

const order: Array<{ sequence: number; round: 1 | 2; candidate_id: string; input_path: string; input_sha256: string }> = [];
let sequence = 0;
for (const round of [1, 2] as const) {
  const sorted = [...inputs].sort((a, b) =>
    sha256(`${SEED}|${round}|${a.candidate_id}`).localeCompare(sha256(`${SEED}|${round}|${b.candidate_id}`))
  );
  for (const item of sorted) order.push({ sequence: ++sequence, round, ...item });
}

await writeJson(`${RUN_ROOT}/adjudication/dispatch-order.json`, {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_BLINDED_GOLD_ADJUDICATION",
  seed: SEED,
  candidate_count: inputs.length,
  required_independent_rounds: 2,
  planned_sessions_before_disagreement_resolution: order.length,
  order
});
await writeJson(`${RUN_ROOT}/run-config.json`, {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY",
  procedure_id: "askrigor_independent_semantic_representation_review_procedure_v0_2",
  repository: "u-dont-existDOTcom/AskRigor",
  merged_main_baseline: "e578a85c5fb26d99274eb83994a3d53e9ad27278",
  v02_reviewed_head: "36830b44372eccf81bab6daaee67ebe4ec3c2946",
  merged_worktree_parent: "5fe82504c0d97bd2610235440c0d136e3469568c",
  model_surface: "CHATGPT_CONSUMER_UI",
  requested_model: "GPT-5.6 Sol",
  requested_reasoning_setting: "Extra High (4 of 5)",
  actual_model_mode_must_be_controller_observed_per_session: true,
  temporary_chat: true,
  max_concurrent_tabs: 1,
  minimum_seconds_between_accepted_submissions: 60,
  content_retries: false,
  model_api_spend_usd: 0,
  adjudication: {
    candidates: inputs.length,
    independent_source_state_only_rounds: 2,
    third_round_trigger: "ANY_DIMENSION_STATUS_OR_HARD_RELEVANCE_DISAGREEMENT",
    construction_gold_access_before_initial_adjudication_freeze: false
  },
  prospective_review: {
    reviews_per_candidate: 3,
    reviewer_sessions_planned: inputs.length * 3,
    blocked_until_adjudicated_gold_frozen: true
  }
});
await writeJson(`${RUN_ROOT}/authority-gate-request.json`, {
  requestId: "issue-208-independent-semantic-review-v02-prospective-development-evaluation",
  actor: "CODEX",
  action: "EXECUTE_SOURCE_BOUND_BOUNDED_DIRECTIVE",
  sourceReceipt: SOURCE_RECEIPT,
  sourceDirectivePath: SOURCE_DIRECTIVE_PATH,
  sourceDirectiveSha256: sha256(sourceDirectiveBytes),
  selectedFrozenStrategy: "STOP_AND_IMPROVE_REVIEWER_CONTRACT",
  modelApiSpendUsd: 0,
  boundedExecution: true,
  taskRequiresExecutionOutsideChat: true,
  internalRoute: null
});
await writeJson(`${RUN_ROOT}/pre-generation-freeze.json`, {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_PRE_GENERATION_FREEZE",
  frozen_at: new Date().toISOString(),
  prompt_path: PROMPT_PATH,
  prompt_sha256: sha256(prompt),
  candidate_manifest_path: CANDIDATE_MANIFEST_PATH,
  candidate_manifest_sha256: sha256(manifestBytes),
  candidate_count: inputs.length,
  adjudication_dispatch_path: `${RUN_ROOT}/adjudication/dispatch-order.json`,
  adjudication_sessions_planned_before_disagreement_resolution: order.length,
  construction_gold_path: `${RUN_ROOT}/gold/mutation-construction-manifest.json`,
  construction_gold_opened_by_execution_controller: false,
  reviewer_generation_allowed: false,
  original_candidates_unchanged: true
});

console.log(JSON.stringify({ candidates: inputs.length, adjudications: order.length, prompt_sha256: sha256(prompt) }));
