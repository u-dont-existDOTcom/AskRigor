import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

describe("production living-evidence deployment", () => {
  it("keeps PostgreSQL private, non-root, bounded, and on a separate internal network", async () => {
    const compose = await read("infra/living-evidence-production/compose.yaml");

    expect(compose).toContain("postgres:17.6-alpine@sha256:");
    expect(compose).toContain('user: "70:70"');
    expect(compose).toContain("ports: []");
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("cap_drop: [ALL]");
    expect(compose).toContain("security_opt: [no-new-privileges:true]");
    expect(compose).toContain("cpus: 0.50");
    expect(compose).toContain("mem_limit: 512m");
    expect(compose).toContain(
      "POSTGRES_INITDB_ARGS: --auth-host=scram-sha-256 --auth-local=scram-sha-256",
    );
    expect(compose).not.toContain("--auth-local=peer");
    expect(compose).toContain("PGPASSWORD=\"$$(tr -d");
    expect(compose).toContain("psql -h 127.0.0.1 -U askrigor_migrator");
    expect(compose).toContain("-Atqc 'SELECT 1'");
    expect(compose).not.toContain("test: [CMD-SHELL, pg_isready");
    expect(compose).toMatch(/living_evidence_private:\n\s+internal: true/u);
    expect(compose).not.toContain("annas-postgres");
  });

  it("creates a dedicated default-read-only role with no mutation grant", async () => {
    const init = await read("infra/living-evidence-production/init-reader.sh");

    expect(init).toContain("CREATE ROLE askrigor_reader LOGIN PASSWORD");
    expect(init).toContain("default_transaction_read_only = on");
    expect(init).toContain("GRANT USAGE ON SCHEMA living_evidence TO askrigor_reader");
    expect(init).toContain("GRANT SELECT ON TABLES TO askrigor_reader");
    expect(init).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE)\b/iu);
    expect(init).not.toContain("set -x");
  });

  it("separates the public reader from the one-shot writer and declares rollback", async () => {
    const compose = await read("infra/living-evidence-production/compose.yaml");
    const config = await read("apps/research-mcp/src/config.ts");
    const registration = await read("apps/research-mcp/src/register-tools.ts");
    const runbook = await read("infra/living-evidence-production/README.md");

    expect(compose).toContain("living-evidence-admin:");
    expect(compose).toContain("profiles: [living-evidence-admin]");
    expect(compose).toContain("/opt/askrigor/living-evidence-writer.env");
    expect(config).toContain("ASKRIGOR_LIVING_EVIDENCE_READER_DATABASE_URL");
    expect(registration).not.toContain("ASKRIGOR_LIVING_EVIDENCE_WRITER_DATABASE_URL");
    expect(runbook).toContain("Automatic public-run write-through is not part of this release.");
    expect(runbook).toContain("Repository rows are retained.");
    expect(runbook).toContain("The unrelated annas-postgres-1 service is never used.");
    expect(runbook).toContain("root-owned, group 70, mode 0440");
  });

  it("ships the append-only formal frontier migration, writer-only import, and dedicated read-only public query", async () => {
    const migration = await read("packages/evidence-repository/migrations/0002_research_frontier.sql");
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const admin = await read("apps/research-mcp/src/living-evidence-admin.ts");
    const registry = await read("apps/research-mcp/src/register-tools.ts");
    const runbook = await read("infra/living-evidence-production/README.md");

    for (const table of [
      "research_frontiers",
      "frontier_lanes",
      "frontier_contributions",
      "discovery_passes",
      "frontier_candidates",
      "frontier_candidate_versions",
      "frontier_trails",
      "frontier_trail_versions",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("FRONTIER_GAP_TRAIL_REQUIRED");
    expect(migration).toContain("FRONTIER_LANE_COVERAGE_BASIS_MISMATCH");
    expect(migration).toContain("FRONTIER_CANDIDATE_SCOPE_MISMATCH");
    expect(migration).toContain("FRONTIER_CANDIDATE_SOURCE_IDENTITY_MISMATCH");
    expect(migration).toContain("FRONTIER_TRAIL_SCOPE_MISMATCH");
    expect(migration).toContain("CREATE CONSTRAINT TRIGGER frontier_contribution_integrity_guard");
    expect(repository).toContain('"0002_research_frontier"');
    expect(repository).toContain('askrigor.living-evidence.repository-export.v2');
    expect(repository).toContain("community_data_included: false");
    expect(admin).toContain('command === "import-frontier"');
    expect(admin).toContain("prepareResearchFrontierImport");
    expect(runbook).toContain("Requested and confirmed");
    expect(registry).toContain("Expected 22 research operations");
    expect(registry).toContain('registerTool(\n    "get_research_frontier"');
  });
});

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), "utf8");
}
