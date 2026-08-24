import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import {
  buildRetractionWatchSnapshot,
  fetchOfficialRetractionWatchSource,
  installRetractionWatchSnapshot,
  retractionWatchSnapshotIdForSource,
  rollbackRetractionWatchSnapshot,
} from "../packages/sources/src/index.js";

interface CliOptions {
  rootDirectory: string;
  rollback: boolean;
}

const options = parseArguments(process.argv.slice(2));

if (options.rollback) {
  const pointer = await rollbackRetractionWatchSnapshot({
    rootDirectory: options.rootDirectory,
  });
  process.stdout.write(`${JSON.stringify({
    status: "rolled_back",
    snapshot_id: pointer.current_snapshot_id,
    previous_snapshot_id: pointer.previous_snapshot_id,
    activated_at: pointer.activated_at,
  })}\n`);
} else {
  await mkdir(options.rootDirectory, { recursive: true, mode: 0o700 });
  const rootMetadata = await lstat(options.rootDirectory);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    fail("--root must resolve to a real directory, not a symlink or file");
  }
  const verifiedRoot = await realpath(options.rootDirectory);
  const source = await fetchOfficialRetractionWatchSource({
    temporaryParent: tmpdir(),
  });
  let buildRoot: string | undefined;
  try {
    // Build inside the verified activation root so the final snapshot rename
    // is atomic and cannot fail merely because the system temporary directory
    // is mounted on a different filesystem.
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
    process.stdout.write(`${JSON.stringify({
      status: "installed",
      snapshot_id: pointer.current_snapshot_id,
      previous_snapshot_id: pointer.previous_snapshot_id,
      source_commit: manifest.source_commit,
      source_file_sha256: manifest.source_file_sha256,
      source_file_bytes: manifest.source_file_bytes,
      row_count: manifest.row_count,
      source_checked_at: pointer.source_checked_at,
    })}\n`);
  } finally {
    await source.cleanup();
    if (buildRoot !== undefined) {
      await rm(buildRoot, { recursive: true, force: true });
    }
  }
}

function parseArguments(args: string[]): CliOptions {
  let rootDirectory: string | undefined;
  let rollback = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root") {
      const value = args[index + 1];
      if (value === undefined) fail("--root requires an absolute directory");
      rootDirectory = value;
      index += 1;
      continue;
    }
    if (argument === "--rollback") {
      rollback = true;
      continue;
    }
    fail(`unknown argument: ${argument ?? ""}`);
  }
  if (rootDirectory === undefined || !isAbsolute(rootDirectory)) {
    fail("--root must be an explicit absolute directory");
  }
  const normalized = resolve(rootDirectory);
  if (normalized === "/") fail("--root cannot be the filesystem root");
  return { rootDirectory: normalized, rollback };
}

function fail(message: string): never {
  process.stderr.write(`Retraction Watch sync usage error: ${message}\n`);
  process.stderr.write("Usage: npm run sync:retraction-watch -- --root /absolute/path [--rollback]\n");
  process.exit(2);
}
