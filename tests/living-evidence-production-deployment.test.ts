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

  it("provisions a table-scoped evidence-gap intake role without create or delete access", async () => {
    const compose = await read("infra/living-evidence-production/compose.yaml");
    const provision = await read(
      "infra/living-evidence-production/provision-evidence-gap-role.sh",
    );

    expect(compose).toMatch(
      /secrets:\n\s+- living_evidence_migrator_password\n\s+- living_evidence_reader_password\n\s+- evidence_gap_intake_password\n\s+- research_access_password\n\s+- research_review_password/u,
    );
    expect(compose).toContain(
      "ASKRIGOR_EVIDENCE_GAP_INTAKE_PASSWORD_FILE: /run/secrets/evidence_gap_intake_password",
    );
    expect(compose).toContain(
      "/opt/askrigor/living-evidence/provision-evidence-gap-role.sh:/usr/local/bin/provision-evidence-gap-role:ro",
    );
    expect(provision).toContain(
      "CREATE ROLE askrigor_evidence_gap_intake LOGIN PASSWORD",
    );
    expect(provision).toContain(
      "REVOKE ALL ON ALL TABLES IN SCHEMA living_evidence FROM askrigor_evidence_gap_intake",
    );
    expect(provision).toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE living_evidence.evidence_gap_submissions",
    );
    expect(provision).toContain(
      "REVOKE TEMPORARY ON DATABASE askrigor_living_evidence FROM PUBLIC",
    );
    expect(provision).toContain("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    expect(provision).not.toMatch(/GRANT\s+(?:DELETE|TRUNCATE|CREATE)\b/iu);
    expect(provision).not.toContain("GRANT SELECT ON ALL TABLES");
    expect(provision).not.toContain("set -x");
  });

  it("provisions a function-only owner review role without table or writer grants", async () => {
    const compose = await read("infra/living-evidence-production/compose.yaml");
    const provision = await read(
      "infra/living-evidence-production/provision-research-review-role.sh",
    );
    const migration = await read(
      "packages/evidence-repository/migrations/0010_research_contribution_review.sql",
    );

    expect(compose).toContain(
      "ASKRIGOR_RESEARCH_REVIEW_PASSWORD_FILE: /run/secrets/research_review_password",
    );
    expect(compose).toContain(
      "/opt/askrigor/living-evidence/provision-research-review-role.sh:/usr/local/bin/provision-research-review-role:ro",
    );
    expect(provision).toContain(
      "CREATE ROLE askrigor_research_review LOGIN PASSWORD",
    );
    expect(provision).toContain(
      "REVOKE ALL ON ALL TABLES IN SCHEMA living_evidence FROM askrigor_research_review",
    );
    expect(provision).toContain(
      "GRANT EXECUTE ON FUNCTION living_evidence.inspect_research_contribution_proposal",
    );
    expect(provision).toContain(
      "GRANT EXECUTE ON FUNCTION living_evidence.decide_research_contribution_proposal",
    );
    expect(provision).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|CREATE)\s+ON\s+TABLE/iu);
    expect(provision).not.toContain("GRANT SELECT ON ALL TABLES");
    expect(provision).not.toContain("set -x");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS research_contribution_promotions");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("RESEARCH_CONTRIBUTION_REVIEW_PAYLOAD_MISMATCH");
    expect(migration).toContain("RESEARCH_CONTRIBUTION_REVIEW_CONFLICT");
  });

  it("adds the FAILED promotion state and one review context function, still function-only (owner answer 138b)", async () => {
    const provision = await read(
      "infra/living-evidence-production/provision-research-review-role.sh",
    );
    const migration = await read(
      "packages/evidence-repository/migrations/0012_research_contribution_merging.sql",
    );

    expect(await read("packages/evidence-repository/src/postgres.ts")).toContain('"0012_research_contribution_merging"');
    expect(provision).toContain(
      "GRANT EXECUTE ON FUNCTION living_evidence.inspect_research_contribution_context(uuid)\n  TO askrigor_research_review;",
    );
    expect(provision.match(/GRANT EXECUTE ON FUNCTION/gu)).toHaveLength(3);
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS failure_code text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS failed_at timestamptz");
    expect(migration).toContain("(status = 'FAILED' AND completed_at IS NULL");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION inspect_research_contribution_context(uuid) FROM PUBLIC;");
  });

  it("provisions a proposal-only reciprocal research role without canonical writer authority", async () => {
    const compose = await read("infra/living-evidence-production/compose.yaml");
    const provision = await read(
      "infra/living-evidence-production/provision-research-access-role.sh",
    );

    expect(compose).toContain(
      "ASKRIGOR_RESEARCH_ACCESS_PASSWORD_FILE: /run/secrets/research_access_password",
    );
    expect(compose).toContain(
      "/opt/askrigor/living-evidence/provision-research-access-role.sh:/usr/local/bin/provision-research-access-role:ro",
    );
    expect(provision).toContain(
      "CREATE ROLE askrigor_research_access LOGIN PASSWORD",
    );
    expect(provision).toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE living_evidence.research_use_accounts",
    );
    expect(provision).toContain(
      "GRANT SELECT ON TABLE living_evidence.research_private_entitlements",
    );
    expect(provision).toContain(
      "GRANT SELECT, INSERT ON TABLE living_evidence.research_contribution_proposals",
    );
    expect(provision).toContain(
      "GRANT EXECUTE ON FUNCTION living_evidence.withdraw_pending_research_contribution_proposals",
    );
    const migration = await read(
      "packages/evidence-repository/migrations/0009_research_contributor_access.sql",
    );
    expect(migration).toContain("research_contribution_proposal_account_guard");
    expect(migration).toContain("RESEARCH_PROPOSAL_ACCOUNT_NOT_FREE_ACTIVE");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION enforce_research_contribution_proposal_account()",
    );
    // Owner decision Q11 (2026-09-30): the second free contributor notice, next to the first.
    const notice = await read("packages/evidence-repository/migrations/0011_research_use_notice_v2.sql");
    expect(notice).toContain(
      "notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30')",
    );
    expect(notice).toContain("IF NOT EXISTS");
    expect(await read("packages/evidence-repository/src/postgres.ts")).toContain('"0011_research_use_notice_v2"');
    // Owner answer 140b (2026-10-20): the plain-answer note is a choice on the account row, on by default, which the
    // role's table grant already covers; the plain answer itself is never stored.
    const noteSetting = await read("packages/evidence-repository/migrations/0013_research_plain_answer_note.sql");
    expect(noteSetting).toContain("ADD COLUMN IF NOT EXISTS plain_answer_note boolean NOT NULL DEFAULT true");
    expect(noteSetting).not.toMatch(/CREATE TABLE|GRANT/iu);
    expect(await read("packages/evidence-repository/src/postgres.ts")).toContain('"0013_research_plain_answer_note"');
    // Owner answer 143a (2026-10-21): a paid private account's research map is filed only with the user's yes, whose
    // finalization receipt's digest it carries; one yes files one map, and the receipt itself is never stored.
    const mapConsent = await read("packages/evidence-repository/migrations/0014_research_map_consent.sql");
    expect(mapConsent).toContain("ADD COLUMN IF NOT EXISTS consent_receipt_sha256 char(64)");
    expect(mapConsent).toContain("consent_receipt_sha256 IS NULL\n        OR (consent_receipt_sha256 ~ '^[a-f0-9]{64}$' AND proposal_kind = 'RESEARCH_FRONTIER')");
    expect(mapConsent).toContain("CREATE UNIQUE INDEX IF NOT EXISTS research_contribution_proposals_consent_idx");
    expect(mapConsent).toContain("NEW.proposal_kind <> 'RESEARCH_FRONTIER' OR NEW.consent_receipt_sha256 IS NULL");
    expect(mapConsent).not.toMatch(/CREATE TABLE|GRANT/iu);
    expect(await read("packages/evidence-repository/src/postgres.ts")).toContain('"0014_research_map_consent"');
    // Owner question 154 (2026-10-21): detailed lesson reports are a choice on the account row, off by default, which
    // the role's table grant already covers; a report itself is stored only in the private lessons repository.
    const lessonReports = await read("packages/evidence-repository/migrations/0015_research_detailed_lesson_reports.sql");
    expect(lessonReports).toContain("ADD COLUMN IF NOT EXISTS detailed_lesson_reports boolean NOT NULL DEFAULT false");
    expect(lessonReports).not.toMatch(/CREATE TABLE|GRANT|DROP|DELETE|UPDATE/iu);
    // Owner answers 159 (1b and 7) and 160b (2026-10-22): the third free contributor notice, next to the first two.
    // It replaces 0011's constraint under 0011's name, so 0011 run again neither drops nor re-adds it, and only while
    // the constraint lacks the third version.
    const noticeV3 = await read("packages/evidence-repository/migrations/0016_research_use_notice_v3.sql");
    expect(noticeV3).toContain(
      "notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30', 'free-contributor-v3-2026-10-22')",
    );
    expect(noticeV3).toContain("pg_get_constraintdef(oid) NOT LIKE '%free-contributor-v3-2026-10-22%'");
    expect(noticeV3.match(/research_use_accounts_free_notice_check/gu)).toHaveLength(4);
    expect(noticeV3).toContain("IF NOT EXISTS");
    expect(noticeV3).not.toMatch(/CREATE TABLE|GRANT|DELETE|UPDATE/iu);
    expect(await read("packages/evidence-repository/src/postgres.ts"))
      .toContain('"0015_research_detailed_lesson_reports",\n      "0016_research_use_notice_v3",\n    ]');
    expect(provision).not.toMatch(
      /GRANT\s+(?:DELETE|TRUNCATE|CREATE)\b/iu,
    );
    expect(provision).not.toContain("GRANT INSERT ON TABLE living_evidence.research_private_entitlements");
    expect(provision).not.toContain("GRANT SELECT ON ALL TABLES");
    expect(provision).not.toContain("analysis_versions");
    expect(provision).not.toContain("frontier_contributions");
    expect(provision).not.toContain("set -x");
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
    expect(runbook).toContain("Automatic public-run canonical write-through is not part of this");
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
    expect(registry).toContain("Expected 33 research operations");
    expect(registry).toContain('registerTool(\n    "get_research_frontier"');
  });
});

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), "utf8");
}
