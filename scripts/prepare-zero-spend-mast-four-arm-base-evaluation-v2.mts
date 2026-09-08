import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareEvaluationV2Artifacts } from "./zero-spend-mast-four-arm-base-evaluation-v2.mjs";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");

if (!mastRoot || !artifactRoot) {
  process.stderr.write("Usage: --mast-root ABSOLUTE_PINNED_MAST_ROOT --artifact-root ABSOLUTE_PRIVATE_ARTIFACT_ROOT\n");
  process.exitCode = 1;
} else {
  prepareEvaluationV2Artifacts({ repositoryRoot, mastRoot, artifactRoot }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`Evaluator v2 preflight failed: ${error instanceof Error ? error.message : "unknown failure"}\n`);
    process.exitCode = 1;
  });
}
