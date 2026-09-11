import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { normalizeRenderedReviewJson } from "../evaluation/epistemic-verifier/independent-review-development/normalize-rendered-review-json.js";

const rawPath = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !rawPath.endsWith("raw-output.txt")) {
  throw new Error("usage: tsx scripts/normalize-independent-semantic-review-output.mts <raw-output.txt>");
}

const raw = await readFile(rawPath, "utf8");
const normalized = normalizeRenderedReviewJson(raw);
const normalizedPath = resolve(dirname(rawPath), "normalized-output.json");
const receiptPath = resolve(dirname(rawPath), "serialization-repair.json");
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const repositoryPath = (value: string) => relative(process.cwd(), value).replaceAll("\\", "/");

const receipt = {
  schema_version: 1,
  repair_kind: "CHATGPT_MARKDOWN_RENDERED_JSON_ESCAPE_RESTORATION",
  semantics_changed: false,
  original_path: repositoryPath(rawPath),
  original_sha256: sha256(raw),
  normalized_path: repositoryPath(normalizedPath),
  normalized_sha256: sha256(normalized),
  algorithm: "ROLE_AWARE_JSON_STRING_BOUNDARY_V2",
  original_preserved: true
};

await writeFile(normalizedPath, normalized, { encoding: "utf8", flag: "wx" });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify(receipt));
