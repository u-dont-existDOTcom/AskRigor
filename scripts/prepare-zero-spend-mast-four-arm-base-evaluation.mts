import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareEvaluationArtifacts } from "./zero-spend-mast-four-arm-base-evaluation.mjs";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");

if (!mastRoot || !artifactRoot) {
  process.stderr.write("Usage: --mast-root ABSOLUTE_PINNED_MAST_ROOT --artifact-root ABSOLUTE_PRIVATE_ARTIFACT_ROOT\n");
  process.exitCode = 1;
} else {
  prepareEvaluationArtifacts(repositoryRoot, mastRoot, artifactRoot).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown evaluation preflight failure";
    process.stderr.write(`Blinded evaluation preflight failed: ${message}\n`);
    process.exitCode = 1;
  });
}
