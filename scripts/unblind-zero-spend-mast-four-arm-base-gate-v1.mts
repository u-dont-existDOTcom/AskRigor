import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runDeterministicUnblindGate } from
  "./zero-spend-mast-four-arm-base-unblind-gate-v1.mjs";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};

const repositoryRoot = resolve(argument("--repository-root")
  ?? fileURLToPath(new URL("..", import.meta.url)));
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");
const sourceResponseFile = argument("--source-response");
const runtimeAdmissionFile = argument("--runtime-admission");

if (!mastRoot || !artifactRoot || !sourceResponseFile || !runtimeAdmissionFile) {
  process.stderr.write(
    "Usage: --repository-root PATH --mast-root PATH --artifact-root PATH "
    + "--source-response PATH --runtime-admission PATH\n",
  );
  process.exitCode = 1;
} else {
  runDeterministicUnblindGate({
    repositoryRoot,
    mastRoot,
    artifactRoot,
    sourceResponseFile,
    runtimeAdmissionFile,
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(
      `Deterministic unblind/gate execution failed: ${error instanceof Error ? error.message : "unknown failure"}\n`,
    );
    process.exitCode = 1;
  });
}
