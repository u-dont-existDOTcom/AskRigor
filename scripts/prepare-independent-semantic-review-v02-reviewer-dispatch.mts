import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const RUN_ROOT = resolve("evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract");
const readJson = async (path: string) => JSON.parse(await readFile(resolve(path), "utf8"));
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const admissionBytes = await readFile(resolve(RUN_ROOT, "post-adjudication-admission.json"));
const admission = JSON.parse(admissionBytes.toString("utf8"));
if (admission.reviewer_generation_allowed !== true) throw new Error("Reviewer generation remains blocked by adjudication admission");

const goldBytes = await readFile(resolve(RUN_ROOT, "gold/adjudicated-gold.json"));
const gold = JSON.parse(goldBytes.toString("utf8"));
if (gold.conflict_count !== 0 || gold.candidate_count !== 22) throw new Error("Adjudicated gold is incomplete or conflicted");
const initialDispatch = await readJson(resolve(RUN_ROOT, "adjudication/dispatch-order.json"));
const uniqueInputs = new Map<string, any>();
for (const item of initialDispatch.order) uniqueInputs.set(item.candidate_id, item);
if (uniqueInputs.size !== 22) throw new Error(`Expected 22 candidate inputs, found ${uniqueInputs.size}`);

const seed = "semantic-review-v02-prospective-reviewer-20260911";
const order: any[] = [];
let sequence = 0;
for (const replicate of [1, 2, 3]) {
  const sorted = [...uniqueInputs.values()].sort((a, b) =>
    sha256(`${seed}|${replicate}|${a.candidate_id}`).localeCompare(sha256(`${seed}|${replicate}|${b.candidate_id}`))
  );
  for (const item of sorted) order.push({
    sequence: ++sequence,
    replicate,
    candidate_id: item.candidate_id,
    input_path: item.input_path,
    input_sha256: item.input_sha256
  });
}

await writeFile(resolve(RUN_ROOT, "reviewer/dispatch-order.json"), `${JSON.stringify({
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_BLINDED_PROSPECTIVE_REVIEW",
  seed,
  candidate_count: uniqueInputs.size,
  replicate_count: 3,
  planned_sessions: order.length,
  order
}, null, 2)}\n`, { flag: "wx" });
await writeFile(resolve(RUN_ROOT, "reviewer/pre-generation-freeze.json"), `${JSON.stringify({
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_REVIEWER_PRE_GENERATION_FREEZE",
  frozen_at: new Date().toISOString(),
  admission_sha256: sha256(admissionBytes),
  adjudicated_gold_sha256: sha256(goldBytes),
  reviewer_gold_opened_by_consumer_sessions: false,
  candidate_count: uniqueInputs.size,
  reviewer_sessions_planned: order.length,
  model_api_spend_usd: 0,
  max_concurrent_tabs: 1,
  minimum_seconds_between_accepted_submissions: 60
}, null, 2)}\n`, { flag: "wx" });

console.log(JSON.stringify({ candidates: uniqueInputs.size, reviewer_sessions: order.length }));
