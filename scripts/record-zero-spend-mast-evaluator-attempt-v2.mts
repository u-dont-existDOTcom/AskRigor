import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";

import { recordEvaluatorV2Attempt } from "./zero-spend-mast-four-arm-base-evaluation-v2.mjs";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");
const receiptFile = argument("--receipt-file");

if (!mastRoot || !artifactRoot || !receiptFile) {
  process.stderr.write("Usage: --mast-root PATH --artifact-root PATH --receipt-file PRIVATE_JSON_FILE\n");
  process.exitCode = 1;
} else {
  Promise.all([realpath(artifactRoot), realpath(receiptFile)]).then(async ([artifactReal, receiptReal]) => {
    const rel = relative(artifactReal, receiptReal);
    const info = await lstat(receiptReal);
    if (!isAbsolute(artifactRoot) || rel.startsWith("..") || isAbsolute(rel)
      || !info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
      throw new Error("EVALUATOR_V2_RECEIPT_FILE_INVALID");
    }
    return recordEvaluatorV2Attempt({
      mastRoot,
      artifactRoot: artifactReal,
      receiptValue: JSON.parse(await readFile(receiptReal, "utf8")),
    });
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`Evaluator v2 attempt recording failed: ${error instanceof Error ? error.message : "unknown failure"}\n`);
    process.exitCode = 1;
  });
}
