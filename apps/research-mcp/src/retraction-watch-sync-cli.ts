import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildRetractionWatchSnapshot,
  fetchOfficialRetractionWatchSource,
  installRetractionWatchSnapshot,
  retractionWatchSnapshotIdForSource,
  rollbackRetractionWatchSnapshot,
} from "@askrigor/sources";

interface CliOptions {
  rootDirectory: string;
  rollback: boolean;
}

export interface RetractionWatchSyncIo {
  stdout(value: string): void;
  stderr(value: string): void;
}

export async function runRetractionWatchSyncCli(
  args: readonly string[],
  io: RetractionWatchSyncIo = {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  },
): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArguments(args);
  } catch (error) {
    io.stderr(`Retraction Watch sync usage error: ${errorMessage(error)}\n`);
    io.stderr("Usage: retraction-watch-sync --root /absolute/path [--rollback]\n");
    return 2;
  }

  try {
    if (options.rollback) {
      const pointer = await rollbackRetractionWatchSnapshot({
        rootDirectory: options.rootDirectory,
      });
      io.stdout(`${JSON.stringify({
        status: "rolled_back",
        snapshot_id: pointer.current_snapshot_id,
        previous_snapshot_id: pointer.previous_snapshot_id,
        activated_at: pointer.activated_at,
      })}\n`);
      return 0;
    }

    await mkdir(options.rootDirectory, { recursive: true, mode: 0o700 });
    const rootMetadata = await lstat(options.rootDirectory);
    if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
      throw new Error("--root must resolve to a real directory, not a symlink or file");
    }
    if ((rootMetadata.mode & 0o077) !== 0) {
      throw new Error("--root permissions must be 0700 or stricter");
    }
    const verifiedRoot = await realpath(options.rootDirectory);
    const source = await fetchOfficialRetractionWatchSource({
      temporaryParent: tmpdir(),
    });
    let buildRoot: string | undefined;
    try {
      // Build inside the verified activation root so the final snapshot rename
      // remains atomic even when /tmp is a separate filesystem.
      buildRoot = await mkdtemp(join(verifiedRoot, ".askrigor-rw-build-"));
      const snapshotId = retractionWatchSnapshotIdForSource({
        sourceCommit: source.commit,
        sourceFileSha256: source.sourceFileSha256,
      });
      const builtSnapshotDirectory = join(buildRoot, snapshotId);
      const manifest = await buildRetractionWatchSnapshot({
        csvPath: source.csvPath,
        snapshotDirectory: builtSnapshotDirectory,
        source: {
          sourceCommit: source.commit,
          sourceCommittedAt: source.committedAt,
          sourceFileSha256: source.sourceFileSha256,
          sourceFileBytes: source.sourceFileBytes,
          syncedAt: source.syncedAt,
        },
      });
      const pointer = await installRetractionWatchSnapshot({
        rootDirectory: verifiedRoot,
        builtSnapshotDirectory,
        sourceCheckedAt: source.syncedAt,
      });
      io.stdout(`${JSON.stringify({
        status: "installed",
        snapshot_id: pointer.current_snapshot_id,
        previous_snapshot_id: pointer.previous_snapshot_id,
        source_commit: manifest.source_commit,
        source_file_sha256: manifest.source_file_sha256,
        source_file_bytes: manifest.source_file_bytes,
        row_count: manifest.row_count,
        source_checked_at: pointer.source_checked_at,
      })}\n`);
      return 0;
    } finally {
      await source.cleanup();
      if (buildRoot !== undefined) {
        await rm(buildRoot, { recursive: true, force: true });
      }
    }
  } catch (error) {
    io.stderr(`Retraction Watch sync failed: ${errorMessage(error)}\n`);
    return 1;
  }
}

function parseArguments(args: readonly string[]): CliOptions {
  let rootDirectory: string | undefined;
  let rollback = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root") {
      const value = args[index + 1];
      if (value === undefined) throw new Error("--root requires an absolute directory");
      rootDirectory = value;
      index += 1;
      continue;
    }
    if (argument === "--rollback") {
      rollback = true;
      continue;
    }
    throw new Error(`unknown argument: ${argument ?? ""}`);
  }
  if (rootDirectory === undefined || !isAbsolute(rootDirectory)) {
    throw new Error("--root must be an explicit absolute directory");
  }
  const normalized = resolve(rootDirectory);
  if (normalized === "/") throw new Error("--root cannot be the filesystem root");
  return { rootDirectory: normalized, rollback };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown bounded failure";
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  process.exitCode = await runRetractionWatchSyncCli(process.argv.slice(2));
}
