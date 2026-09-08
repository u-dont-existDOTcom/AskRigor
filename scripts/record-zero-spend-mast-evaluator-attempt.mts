import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { recordPrimaryEvaluatorAttempt } from "./zero-spend-mast-four-arm-base-evaluation.mjs";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");
const receiptFile = argument("--receipt-file");

if (!mastRoot || !artifactRoot || !receiptFile) {
  process.stderr.write(
    "Usage: --mast-root ABSOLUTE_PINNED_MAST_ROOT --artifact-root ABSOLUTE_PRIVATE_ARTIFACT_ROOT --receipt-file PRIVATE_JSON_FILE\n",
  );
  process.exitCode = 1;
} else {
  Promise.all([realpath(artifactRoot), realpath(receiptFile)]).then(
    async ([artifactReal, receiptReal]) => {
      const rel = relative(artifactReal, receiptReal);
      if (!isAbsolute(artifactRoot)
        || rel.startsWith("..")
        || isAbsolute(rel)) {
        throw new Error("EVALUATION_CAPTURE_RECEIPT_FILE_OUTSIDE_ARTIFACT_ROOT");
      }
      const info = await lstat(receiptReal);
      if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
        throw new Error("EVALUATION_CAPTURE_RECEIPT_FILE_MODE_INVALID");
      }
      const receiptValue: unknown = JSON.parse(await readFile(receiptReal, "utf8"));
      return recordPrimaryEvaluatorAttempt({
        repositoryRoot,
        mastRoot,
        artifactRoot: artifactReal,
        receiptValue,
      });
    },
  ).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown evaluator-attempt recording failure";
    process.stderr.write(`Evaluator attempt recording failed: ${message}\n`);
    process.exitCode = 1;
  });
}
