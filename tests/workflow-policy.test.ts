import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const workflowPath = resolve(root, ".github/workflows/repository-workflow-policy.yml");

function policyScript(): string {
  const workflow = readFileSync(workflowPath, "utf8");
  const marker = "        run: |\n";
  const start = workflow.indexOf(marker);
  if (start === -1) throw new Error("workflow policy run block is missing");

  return workflow
    .slice(start + marker.length)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n");
}

function runPolicy(cwd: string) {
  return spawnSync("bash", ["-c", policyScript()], {
    cwd,
    encoding: "utf8"
  });
}

describe("repository workflow policy", () => {
  it("passes against its own committed workflows", () => {
    const result = runPolicy(root);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("workflow policy passed");
  });

  it("rejects an actual pull_request_target checkout", () => {
    const temporary = mkdtempSync(join(tmpdir(), "askrigor-workflow-policy-"));
    try {
      const workflows = join(temporary, ".github", "workflows");
      mkdirSync(workflows, { recursive: true });
      writeFileSync(join(workflows, "unsafe.yml"), `name: Unsafe review
on:
  pull_request_target:
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
`);

      const result = runPolicy(temporary);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toContain(
        "pull_request_target must not check out or execute untrusted pull-request code"
      );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
