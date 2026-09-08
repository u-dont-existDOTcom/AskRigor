import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateEvaluatorOutputFile } from "./zero-spend-mast-four-arm-base-evaluation.mjs";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");
const opaqueResponseId = argument("--opaque-response-id");
const outputFile = argument("--output-file");

if (!mastRoot || !artifactRoot || !opaqueResponseId || !outputFile) {
  process.stderr.write("Usage: --mast-root PATH --artifact-root PATH --opaque-response-id ID --output-file RELATIVE_FILE\n");
  process.exitCode = 1;
} else {
  validateEvaluatorOutputFile({
    repositoryRoot,
    mastRoot,
    artifactRoot,
    opaqueResponseId,
    outputFile,
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown evaluator output validation failure";
    process.stderr.write(`Evaluator output validation failed: ${message}\n`);
    process.exitCode = 1;
  });
}
