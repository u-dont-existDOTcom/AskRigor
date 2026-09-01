import { execFileSync } from "node:child_process";

import { validateBenchmarkGovernance } from "../evaluation/governance/src/validate.js";

function gitRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

validateBenchmarkGovernance(gitRoot())
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown benchmark-governance validation failure";
    process.stderr.write(`Benchmark-governance validation failed: ${message}\n`);
    process.exitCode = 1;
  });
