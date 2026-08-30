import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { PostgresEvidenceRepository, sha256 } from "../packages/evidence-repository/src/index.js";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  if (process.env.ASKRIGOR_LIVING_EVIDENCE_SOURCE_SCHEMA_WIPED !== "true") {
    throw new Error("SOURCE_SCHEMA_WIPE_RECEIPT_REQUIRED");
  }
  const outputDirectory = resolve(process.env.ASKRIGOR_LIVING_EVIDENCE_OUTPUT ?? "/tmp/askrigor-living-evidence-pilot");
  const manifestPath = join(outputDirectory, "living-evidence-pilot-review.manifest.json");
  const dumpPath = join(outputDirectory, "living-evidence-pilot.dump");
  const expected = JSON.parse(await readFile(manifestPath, "utf8")) as {
    repository_canonical_sha256: string;
    source_family_count: number;
    claim_version_count: number;
    analysis_count: number;
    frontier_count: number;
    frontier_contribution_count: number;
    discovery_pass_count: number;
  };
  const dumpBytes = await readFile(dumpPath);
  const repository = new PostgresEvidenceRepository({ connectionString, schema: "living_evidence" });
  try {
    const restored = await repository.exportRepository();
    if (restored.canonical_sha256 !== expected.repository_canonical_sha256) {
      throw new Error(`RESTORE_CANONICAL_SHA256_MISMATCH expected=${expected.repository_canonical_sha256} actual=${restored.canonical_sha256}`);
    }
    const inventory = restored.inventory as Record<string, number>;
    if (
      inventory.source_families !== expected.source_family_count ||
      inventory.claim_versions !== expected.claim_version_count ||
      inventory.analyses !== expected.analysis_count ||
      inventory.research_frontiers !== expected.frontier_count ||
      inventory.frontier_contributions !== expected.frontier_contribution_count ||
      inventory.discovery_passes !== expected.discovery_pass_count
    ) {
      throw new Error("RESTORE_INVENTORY_MISMATCH");
    }
    const receipt = {
      receipt_schema: "askrigor.living-evidence.restore-receipt.v1",
      status: "PASS",
      checked_at: new Date().toISOString(),
      dump_sha256: sha256(dumpBytes),
      dump_bytes: dumpBytes.byteLength,
      restored_repository_canonical_sha256: restored.canonical_sha256,
      inventory,
      source_schema_wiped_before_restore: true,
      raw_source_content_included: false,
      community_data_included: false,
      target: "disposable local PostgreSQL pilot schema",
    };
    const receiptPath = join(outputDirectory, "living-evidence-pilot-restore-receipt.json");
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    process.stdout.write(`RESTORE RECEIPT: ${receiptPath}\n`);
  } finally {
    await repository.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown restore verification failure";
  process.stderr.write(`Living-evidence restore verification failed: ${message}\n`);
  process.exitCode = 1;
});
