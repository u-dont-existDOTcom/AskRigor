import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runPostGateEvidenceExport } from
  "./zero-spend-mast-post-gate-evidence-export-v1.mjs";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};

const repositoryRoot = resolve(argument("--repository-root")
  ?? fileURLToPath(new URL("..", import.meta.url)));
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");
const sourceDirectiveFile = argument("--source-directive");
const runtimeAdmissionFile = argument("--runtime-admission");

if (!mastRoot || !artifactRoot || !sourceDirectiveFile || !runtimeAdmissionFile) {
  process.stderr.write(
    "Usage: --repository-root PATH --mast-root PATH --artifact-root PATH "
    + "--source-directive PATH --runtime-admission PATH\n",
  );
  process.exitCode = 1;
} else {
  runPostGateEvidenceExport({
    repositoryRoot,
    mastRoot,
    artifactRoot,
    sourceDirectiveFile,
    runtimeAdmissionFile,
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(
      `Post-gate evidence export failed: ${error instanceof Error ? error.message : "unknown failure"}\n`,
    );
    process.exitCode = 1;
  });
}
