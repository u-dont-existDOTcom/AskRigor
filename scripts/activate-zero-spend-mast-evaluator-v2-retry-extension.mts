import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { activateEvaluatorV2RetryExtension } from "./zero-spend-mast-four-arm-base-evaluation-v2.mjs";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactRoot = argument("--artifact-root");

if (!artifactRoot) {
  process.stderr.write("Usage: --artifact-root ABSOLUTE_PRIVATE_ARTIFACT_ROOT\n");
  process.exitCode = 1;
} else {
  activateEvaluatorV2RetryExtension({ repositoryRoot, artifactRoot }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`Evaluator v2 retry-extension activation failed: ${error instanceof Error ? error.message : "unknown failure"}\n`);
    process.exitCode = 1;
  });
}
