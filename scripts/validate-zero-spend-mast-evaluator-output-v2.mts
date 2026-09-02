import { validateEvaluatorV2OutputFile } from "./zero-spend-mast-four-arm-base-evaluation-v2.mjs";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");
const opaqueResponseId = argument("--opaque-response-id");
const outputFile = argument("--output-file");

if (!mastRoot || !artifactRoot || !opaqueResponseId || !outputFile) {
  process.stderr.write("Usage: --mast-root PATH --artifact-root PATH --opaque-response-id ID --output-file RELATIVE_FILE\n");
  process.exitCode = 1;
} else {
  validateEvaluatorV2OutputFile({ mastRoot, artifactRoot, opaqueResponseId, outputFile }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`Evaluator v2 output validation failed: ${error instanceof Error ? error.message : "unknown failure"}\n`);
    process.exitCode = 1;
  });
}
