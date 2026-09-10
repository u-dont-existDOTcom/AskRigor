import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { ZodError } from "zod";

import {
  EPISTEMIC_VERIFIER_VERSION,
  epistemicStateV1Schema,
  verifyEpistemicState,
} from "../../../../../apps/research-mcp/src/epistemic-verifier.js";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseCandidate(raw: string): { value: unknown; mode: "plain_json" | "single_json_fence" } {
  const trimmed = raw.replace(/^\uFEFF/u, "").trim();
  try {
    return { value: JSON.parse(trimmed), mode: "plain_json" };
  } catch (plainError) {
    const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/u.exec(trimmed);
    if (!fence) throw plainError;
    return { value: JSON.parse(fence[1]!), mode: "single_json_fence" };
  }
}

function schemaInvalidReceipt(rawSha256: string, errors: string[]) {
  const blockers = errors.map((error) => `STATE_SCHEMA_INVALID: ${error}`);
  const gates = [
    "SPECIFICITY_DISCRIMINATOR",
    "EVIDENCE_DIRECTION",
    "TARGET_PRESERVATION",
    "PROVENANCE_DEPENDENCY",
    "SYNTHESIS_LOCK",
  ].map((gate) => ({ gate, status: "block", blockers, checked_ids: [] }));
  return {
    verifier_version: EPISTEMIC_VERIFIER_VERSION,
    state_sha256: rawSha256,
    gates,
    definitive_synthesis: false,
    synthesis_boundary: "bounded_or_uncertain_only",
    blockers,
  };
}

const inputPath = argument("--input");
const outputPath = argument("--output");
const stateOutputPath = argument("--state-output");
const metaOutputPath = argument("--meta-output");
const raw = await readFile(inputPath, "utf8");
const rawSha256 = sha256(raw);

try {
  const parsed = parseCandidate(raw);
  const state = epistemicStateV1Schema.parse(parsed.value);
  const receipt = verifyEpistemicState(state);
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await writeFile(stateOutputPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await writeFile(metaOutputPath, `${JSON.stringify({
    schema_version: 1,
    raw_sha256: rawSha256,
    raw_utf8_bytes: Buffer.byteLength(raw, "utf8"),
    parse_mode: parsed.mode,
    schema_valid: true,
    definitive_synthesis: receipt.definitive_synthesis,
    synthesis_boundary: receipt.synthesis_boundary,
  }, null, 2)}\n`, "utf8");
} catch (error) {
  const errors = error instanceof ZodError
    ? error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    : [error instanceof Error ? error.message : String(error)];
  const receipt = schemaInvalidReceipt(rawSha256, errors);
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await writeFile(stateOutputPath, raw, "utf8");
  await writeFile(metaOutputPath, `${JSON.stringify({
    schema_version: 1,
    raw_sha256: rawSha256,
    raw_utf8_bytes: Buffer.byteLength(raw, "utf8"),
    parse_mode: "invalid",
    schema_valid: false,
    deterministic_errors: errors,
    definitive_synthesis: false,
    synthesis_boundary: "bounded_or_uncertain_only",
  }, null, 2)}\n`, "utf8");
  process.exitCode = 2;
}
