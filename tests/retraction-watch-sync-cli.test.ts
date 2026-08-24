import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runRetractionWatchSyncCli } from
  "../apps/research-mcp/src/retraction-watch-sync-cli.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Retraction Watch runtime sync CLI", () => {
  it("fails usage before provider work without an explicit safe root", async () => {
    const output = captureIo();
    expect(await runRetractionWatchSyncCli([], output.io)).toBe(2);
    expect(output.stderr.join(" ")).toContain("--root must be an explicit absolute directory");
    expect(await runRetractionWatchSyncCli(["--root", "/"], output.io)).toBe(2);
  });

  it("rejects a broadly readable root before provider work", async () => {
    const root = await mkdtemp(join(tmpdir(), "askrigor-rw-cli-"));
    roots.push(root);
    await chmod(root, 0o755);
    const output = captureIo();

    expect(await runRetractionWatchSyncCli(["--root", root], output.io)).toBe(1);
    expect(output.stderr.join(" ")).toContain("permissions must be 0700 or stricter");
  });

  it("reports unavailable rollback without modifying an empty root", async () => {
    const root = await mkdtemp(join(tmpdir(), "askrigor-rw-cli-"));
    roots.push(root);
    const output = captureIo();

    expect(await runRetractionWatchSyncCli([
      "--root",
      root,
      "--rollback",
    ], output.io)).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join(" ")).toContain("sync failed");
  });
});

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    },
  };
}
