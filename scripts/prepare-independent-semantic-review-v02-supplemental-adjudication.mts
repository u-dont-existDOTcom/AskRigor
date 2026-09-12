import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const RUN_ROOT = resolve("evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract");
const readJson = async (path: string) => JSON.parse(await readFile(resolve(path), "utf8"));
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const dispatch = await readJson(resolve(RUN_ROOT, "adjudication/dispatch-order.json"));
const outputRoot = resolve(RUN_ROOT, "adjudication/outputs");
const directories = (await readdir(outputRoot)).filter((name) => /^\d{3}-r[12]-MUTV02-[A-F0-9]+$/.test(name));
if (directories.length !== dispatch.planned_sessions_before_disagreement_resolution) {
  throw new Error(`Expected ${dispatch.planned_sessions_before_disagreement_resolution} initial attempts, found ${directories.length}`);
}

const invalid: any[] = [];
for (const directory of directories) {
  const provenance = await readJson(resolve(outputRoot, directory, "provenance.json"));
  try {
    await readFile(resolve(outputRoot, directory, "ingest-receipt.json"));
  } catch {
    const error = await readJson(resolve(outputRoot, directory, "ingest-error.json"));
    const source = dispatch.order.find((item: any) => item.sequence === provenance.sequence);
    if (!source || error.counts_as_valid_adjudication !== false) throw new Error(`Invalid supplemental source for ${directory}`);
    invalid.push({
      original_sequence: provenance.sequence,
      original_round: provenance.round,
      candidate_id: provenance.candidate_id,
      input_path: source.input_path,
      input_sha256: source.input_sha256,
      reason: error.status
    });
  }
}

const order = invalid
  .sort((a, b) => sha256(`semantic-review-v02-supplemental|${a.candidate_id}|${a.original_round}`).localeCompare(sha256(`semantic-review-v02-supplemental|${b.candidate_id}|${b.original_round}`)))
  .map((item, index) => ({ sequence: dispatch.planned_sessions_before_disagreement_resolution + index + 1, supplemental: 1, ...item }));
await writeFile(resolve(RUN_ROOT, "adjudication/supplemental-dispatch-order.json"), `${JSON.stringify({
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_SUPPLEMENTAL_ADJUDICATION",
  trigger: "STRUCTURALLY_INVALID_INITIAL_ADJUDICATION_OUTPUT",
  original_invalid_outputs_preserved: true,
  content_retry: false,
  purpose: "OBTAIN_TWO_VALID_INDEPENDENT_ADJUDICATIONS_BEFORE_GOLD_ADMISSION",
  planned_sessions: order.length,
  order
}, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ initial_attempts: directories.length, supplemental_adjudications: order.length }));
