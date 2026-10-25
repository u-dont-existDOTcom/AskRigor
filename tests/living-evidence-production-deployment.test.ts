import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const ATLAS_CANONICAL_TABLES = [
  "atlas_intent_applications", "atlas_findings", "atlas_finding_versions", "atlas_finding_links",
  "atlas_finding_link_withdrawals", "atlas_finding_changes", "atlas_source_checks", "atlas_redactions",
];
const ATLAS_REVIEW_FUNCTIONS = [
  "inspect_atlas_cards", "decide_atlas_card_item", "record_atlas_finding_intent", "inspect_atlas_finding_intents",
  "forget_atlas_cards",
];
// Decision 171, section 4B: migration 0020's six functions for the Atlas publications, in the grant script's order.
const ATLAS_PUBLICATION_FUNCTIONS = [
  "inspect_atlas_publications", "publish_atlas_findings", "decide_atlas_publications", "edit_atlas_publications",
  "withdraw_atlas_publications", "erase_atlas_publication_texts",
];
// Decision 171, section 4E: migration 0022's five moderation functions for the review role and six participation
// functions for the access role, in the grant scripts' order.
const ATLAS_MODERATION_FUNCTIONS = [
  "inspect_atlas_comments", "moderate_atlas_comment", "set_atlas_commenter_stopped", "set_atlas_home_picks",
  "inspect_atlas_home_picks",
];
const ATLAS_PARTICIPATION_FUNCTIONS = [
  "inspect_atlas_participant", "set_atlas_display_name", "set_atlas_vote", "post_atlas_comment", "delete_atlas_comment",
  "report_atlas_comment", "forget_atlas_participant",
];

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
    // The three contribution functions, then migration 0017's five Atlas functions (Atlas phase 2), migration 0020's
    // six publication functions and migration 0022's five moderation functions (decision 171).
    expect(provision.match(/GRANT EXECUTE ON FUNCTION/gu)).toHaveLength(19);
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
    // Owner answer 171: the same constraint now admits exactly v1 to v4, under the same idempotence guard.
    const noticeV4 = await read("packages/evidence-repository/migrations/0019_research_use_notice_v4.sql");
    expect(noticeV4).toContain(
      "notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30', 'free-contributor-v3-2026-10-22', 'free-contributor-v4-2026-10-25')",
    );
    expect(noticeV4).toContain("pg_get_constraintdef(oid) NOT LIKE '%free-contributor-v4-2026-10-25%'");
    expect(noticeV4.match(/research_use_accounts_free_notice_check/gu)).toHaveLength(4);
    expect(noticeV4).toContain("IF NOT EXISTS");
    expect(noticeV4).not.toMatch(/CREATE TABLE|GRANT|DELETE|UPDATE/iu);
    expect(await read("packages/evidence-repository/src/postgres.ts"))
      .toContain('"0015_research_detailed_lesson_reports",\n      "0016_research_use_notice_v3",\n      "0017_atlas_findings",\n');
    expect(provision).not.toMatch(
      /GRANT\s+(?:DELETE|TRUNCATE|CREATE)\b/iu,
    );
    expect(provision).not.toContain("GRANT INSERT ON TABLE living_evidence.research_private_entitlements");
    expect(provision).not.toContain("GRANT SELECT ON ALL TABLES");
    expect(provision).not.toContain("analysis_versions");
    expect(provision).not.toContain("frontier_contributions");
    expect(provision).not.toContain("set -x");
  });

  it("ships the v4 hold/restore pair and its disposable PostgreSQL acceptance", async () => {
    const hold = await read("infra/living-evidence-production/research-use-notice-v4-hold.sql");
    const restore = await read("infra/living-evidence-production/research-use-notice-v4-restore.sql");
    expect(hold).toContain("CREATE TABLE IF NOT EXISTS research_use_notice_v4_hold");
    expect(hold).toContain("REVOKE ALL ON TABLE research_use_notice_v4_hold FROM PUBLIC");
    expect(hold).toContain("acl.grantee <> class.relowner");
    expect(hold).toContain("ON CONFLICT (account_key) DO NOTHING");
    expect(hold).toContain("WHERE notice_version = 'free-contributor-v4-2026-10-25'");
    expect(hold).toContain("AND account.notice_version = 'free-contributor-v4-2026-10-25'");
    expect(hold).toContain("GREATEST(now(), created_at, updated_at)");
    expect(hold).toContain("SET status = 'REVOKED'");
    expect(hold).not.toMatch(/DELETE FROM|UPDATE research_contribution_proposals|UPDATE atlas_/u);
    for (const guard of [
      "account.status = 'REVOKED'", "account.mode IS NULL", "account.notice_version IS NULL",
      "account.revoked_at = hold.held_at", "account.updated_at = hold.held_at",
    ]) expect(restore).toContain(guard);
    expect(restore).toContain("DELETE FROM research_use_notice_v4_hold");
    expect(restore).toContain("\\if :hold_exists");
    const runner = await read("scripts/run-research-use-notice-v4-rollback-acceptance.sh");
    expect(runner).toContain("phase seed\nrun_sql \"$hold\"\nrun_sql \"$hold\"\nphase after-hold\nphase reenroll-v3\nrun_sql \"$restore\"\nrun_sql \"$restore\"\nphase after-restore");
    const acceptance = await read("scripts/research-use-notice-v4-rollback-acceptance.mts");
    expect(acceptance).toContain("[V1, V2, V3]");
    expect(acceptance).toContain('const V4 = "free-contributor-v4-2026-10-25"');
    for (const check of ["NEWER_ROW_OVERWRITTEN", "NOT_RESTORED_EXACTLY", "HOLD_NOT_EMPTIED", "SETTINGS_CHANGED",
      "HOLD_READABLE_BY_RUNTIME_ROLE", "HOLD_READABLE_BY_READER", "OTHER_TABLE_CHANGED_"]) {
      expect(acceptance).toContain(check);
    }
    expect(await read("package.json")).toContain('"contributor-access:notice-v4-rollback-acceptance": "bash scripts/run-research-use-notice-v4-rollback-acceptance.sh"');
    expect(await read("infra/living-evidence-production/README.md")).toContain("Undo no migration: 0019 stays");
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

  it("ships migration 0017's append-only Atlas tables after 0016, with private review state (Atlas phase 2)", async () => {
    const migration = await read("packages/evidence-repository/migrations/0017_atlas_findings.sql");
    const repository = await read("packages/evidence-repository/src/postgres.ts");

    // Atlas migrations follow 0016; 0019 widens the notice constraint for v4, 0020 adds the publications, and 0022 the
    // votes and comments.
    expect(repository).toContain(
      '"0016_research_use_notice_v3",\n      "0017_atlas_findings",\n      "0018_atlas_card_fields",\n      "0019_research_use_notice_v4",\n      "0020_atlas_publications",\n');
    // append_only_guard on exactly the eight canonical tables; the two private review tables are not among them.
    const guarded = migration.slice(migration.indexOf("FOREACH table_name IN ARRAY ARRAY["));
    expect([...guarded.slice(0, guarded.indexOf("] LOOP")).matchAll(/'([a-z_]+)'/gu)].map(([, table]) => table))
      .toEqual(ATLAS_CANONICAL_TABLES);
    expect(migration).toContain(
      "'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation()'",
    );
    for (const table of [...ATLAS_CANONICAL_TABLES, "atlas_card_decisions", "atlas_finding_intents"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    }
    // Canonical rows never hold a card reference, a thread key, a receipt, an account, an answer quote, or YouTube
    // or community data.
    for (const table of ATLAS_CANONICAL_TABLES) {
      const start = migration.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
      const block = migration.slice(start, migration.indexOf("\n);", start));
      expect(block).not.toMatch(/card_number|card_sha256|thread|account|receipt|answer_quote|youtube|comment/iu);
    }
    expect(migration).toContain("CREATE SEQUENCE IF NOT EXISTS atlas_public_number_seq AS bigint START WITH 1001");
    expect(migration).toContain("CREATE OR REPLACE VIEW atlas_finding_current AS");
    expect(migration).toContain("CONSTRAINT atlas_finding_intents_v1_state_check CHECK (");
  });

  it("keeps the living-evidence acceptance's pinned migration chain equal to the migrate list and the migration files", async () => {
    // CI's database step compares the migrations a fresh database records with the chain pinned in the acceptance
    // script. Twice (0017, 0018) a new migration was missing from that pin and only CI found it; this check runs in
    // verify. The pin stays an exact list: the pin, migrate's list and the migration files must name the same
    // migrations in the same order (down migrations aside).
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const acceptance = await read("scripts/living-evidence-task-acceptance.mts");
    const migrate = repository.slice(repository.indexOf("async migrate(): Promise<void>"));
    const migrateList = [...migrate.slice(0, migrate.indexOf("].map(")).matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)]
      .map(([, id]) => id);
    const pinned = acceptance.match(/"(0001_living_evidence(?:,\d{4}_[a-z0-9_]+)*)"/u)?.[1]?.split(",");
    const files = (await readdir(new URL("packages/evidence-repository/migrations/", root)))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name) && !name.endsWith("_down.sql"))
      .map((name) => name.slice(0, -".sql".length))
      .sort();
    expect(migrateList.length).toBeGreaterThanOrEqual(19);
    expect(pinned).toEqual(migrateList);
    expect(files).toEqual(migrateList);
  });

  it("grants the review role exactly migration 0017's five SECURITY DEFINER functions, revoked from PUBLIC", async () => {
    const migration = await read("packages/evidence-repository/migrations/0017_atlas_findings.sql");
    const provision = await read("infra/living-evidence-production/provision-research-review-role.sh");

    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf("(")),
      header: chunk.slice(0, chunk.indexOf("AS $")),
    }));
    expect(functions.filter(({ header }) => header.includes("SECURITY DEFINER")).map(({ name }) => name).sort())
      .toEqual([...ATLAS_REVIEW_FUNCTIONS].sort());
    for (const { name } of functions) {
      // 0001's trigger function keeps the ACL 0001 gives it.
      if (name === "reject_living_evidence_mutation") continue;
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
    }
    const granted = [...provision.matchAll(/GRANT EXECUTE ON FUNCTION living_evidence\.([a-z_]+)\(/gu)].map(([, name]) => name);
    expect(granted.filter((name) => name!.includes("atlas")))
      .toEqual([...ATLAS_REVIEW_FUNCTIONS, ...ATLAS_PUBLICATION_FUNCTIONS, ...ATLAS_MODERATION_FUNCTIONS]);
    expect(granted).toHaveLength(19);
    // Each grant names the function's exact signature, as the migration's REVOKE does.
    const signature = (text: string, prefix: string) => {
      const start = text.indexOf(prefix) + prefix.length;
      return text.slice(start, text.indexOf(")", start)).replace(/\s+/gu, " ").trim();
    };
    for (const name of ATLAS_REVIEW_FUNCTIONS) {
      expect(signature(provision, `GRANT EXECUTE ON FUNCTION living_evidence.${name}(`))
        .toBe(signature(migration, `REVOKE ALL ON FUNCTION ${name}(`));
    }
    for (const writerOnly of ["erase_atlas_wording", "atlas_redaction_permits", "atlas_question_erasable",
      "atlas_numbers_without_labels", "validate_atlas_finding_version", "atlas_public_number_seq"]) {
      expect(provision).not.toContain(writerOnly);
    }
    expect(provision).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|USAGE|ALL)\s+ON\s+(?:TABLE|SEQUENCE|ALL)/iu);
  });

  it("keeps the redaction branch in the guard body in force, for exactly erase_atlas_wording's text columns (decision 7)", async () => {
    const migration = await read("packages/evidence-repository/migrations/0017_atlas_findings.sql");
    const repository = await read("packages/evidence-repository/src/postgres.ts");

    // Every migrate runs 0001 first, which restores the plain guard; the last migration that redefines the guard
    // decides the body in force, and it must keep the branch.
    const migrate = repository.slice(repository.indexOf("async migrate()"), repository.indexOf("].map(async (migrationId)"));
    const order = [...migrate.matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)].map(([, id]) => id!);
    const redefining: string[] = [];
    // Atlas phase 3: the migrations that define the redaction exception's two functions, in migrate order; the last
    // one's bodies are those in force.
    const defining = new Map<string, string[]>([["atlas_redaction_permits", []], ["erase_atlas_wording", []]]);
    const sources = new Map<string, string>();
    for (const id of order) {
      const sql = await read(`packages/evidence-repository/migrations/${id}.sql`);
      sources.set(id, sql);
      if (sql.includes("CREATE OR REPLACE FUNCTION reject_living_evidence_mutation()")) redefining.push(id);
      for (const [name, ids] of defining) if (sql.includes(`CREATE OR REPLACE FUNCTION ${name}(`)) ids.push(id);
    }
    expect(redefining).toEqual(["0001_living_evidence", "0017_atlas_findings"]);
    expect(defining.get("atlas_redaction_permits")).toEqual(["0017_atlas_findings", "0018_atlas_card_fields"]);
    expect(defining.get("erase_atlas_wording")).toEqual(["0017_atlas_findings", "0018_atlas_card_fields"]);
    const inForce = sources.get("0018_atlas_card_fields")!;
    const guard = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION reject_living_evidence_mutation()"));
    const body = guard.slice(0, guard.indexOf("$$;"));
    // The tables erase_atlas_wording changes (Atlas phase 2 part D, decision 7): the version's own rows, the finding's
    // links and their withdrawals, and the question.
    const tables = [
      "claim_versions", "atlas_finding_versions", "atlas_finding_changes", "atlas_finding_links",
      "atlas_finding_link_withdrawals", "questions",
    ];
    expect(body).toContain("IF TG_OP = 'UPDATE'");
    expect(body).toContain("AND TG_TABLE_SCHEMA = '__SCHEMA__'");
    const guarded = body.slice(body.indexOf("AND TG_TABLE_NAME IN ("), body.indexOf(")", body.indexOf("AND TG_TABLE_NAME IN (")));
    expect([...guarded.matchAll(/'([a-z_]+)'/gu)].map(([, table]) => table)).toEqual(tables);
    expect(body).toContain("AND __SCHEMA__.atlas_redaction_permits(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN");
    expect(body).toContain("RAISE EXCEPTION 'APPEND_ONLY_TABLE mutation rejected for %', TG_TABLE_NAME");
    expect(body).not.toContain("DELETE");

    // The exception permits a change to exactly the columns erase_atlas_wording replaces, table by table, and only
    // while erase_atlas_wording names the redaction row it applies: in 0017's pair, which an earlier image's migrate
    // puts back, and in 0018's, which this image's migrate leaves in force (Atlas phase 3: the searches' queries too).
    const pairOf = (sql: string) => ({
      permits: sql.slice(
        sql.indexOf("CREATE OR REPLACE FUNCTION atlas_redaction_permits"),
        sql.indexOf("REVOKE ALL ON FUNCTION atlas_redaction_permits"),
      ),
      erase: sql.slice(
        sql.indexOf("CREATE OR REPLACE FUNCTION erase_atlas_wording"),
        sql.indexOf("REVOKE ALL ON FUNCTION erase_atlas_wording"),
      ),
    });
    const versionColumns = [
      "accepted_wording_key", "card_wording_key", "numbers", "usual_answer", "what_it_changes", "what_would_change_it",
      "who_else", "why_not_usual",
    ];
    for (const [sql, versionErased, scope] of [
      [migration, versionColumns, false],
      [inForce, [...versionColumns, "search_scope"].sort(), true],
    ] as const) {
      const { permits, erase } = pairOf(sql);
      const permitted = (table: string) => {
        const start = permits.indexOf(`target_table = '${table}' THEN`);
        const branch = permits.slice(start, permits.indexOf("ELS", start + 1));
        return [...branch.matchAll(/ARRAY\[([^\]]*)\]/gu)]
          .flatMap(([, list]) => [...list!.matchAll(/'([a-z_]+)'/gu)].map(([, column]) => column!)).sort();
      };
      const erased = (table: string) => {
        const start = erase.indexOf(`UPDATE ${table} erased`);
        const clause = erase.slice(erase.indexOf("SET", start), erase.indexOf("WHERE", start));
        return [...clause.matchAll(/(?:SET|,)\s+([a-z_]+) =/gu)].map(([, column]) => column!).sort();
      };
      const branches = [...permits.matchAll(/target_table = '([a-z_]+)' THEN/gu)].map(([, table]) => table);
      const updates = [...erase.matchAll(/UPDATE ([a-z_]+) erased/gu)].map(([, table]) => table);
      expect(branches).toEqual(tables);
      expect(updates).toEqual(tables);
      for (const table of tables) {
        expect(erased(table).length).toBeGreaterThan(0);
        expect(erased(table)).toEqual(permitted(table));
      }
      expect(erased("atlas_finding_versions")).toEqual(versionErased);
      expect(erased("claim_versions")).toContain("program_or_exposure");
      expect(erased("atlas_finding_links")).toEqual(["rationale"]);
      expect(erased("atlas_finding_link_withdrawals")).toEqual(["public_note"]);
      expect(erased("questions")).toEqual(["normalized_question"]);
      // A question is erased only while no other finding or research uses it, the guard checking the same rule.
      expect(erase).toContain("IF atlas_question_erasable(redaction.finding_id) THEN");
      expect(permits).toContain("OR NOT atlas_question_erasable(redaction.finding_id) THEN");
      expect(erase).toContain("PERFORM set_config('askrigor.atlas_erasing_redaction', target_redaction_id::text, true);");
      expect(erase).toContain("PERFORM set_config('askrigor.atlas_erasing_redaction', '', true);");
      expect(permits).toContain("current_setting('askrigor.atlas_erasing_redaction', true)");
      expect(permits).toContain("SELECT * INTO redaction FROM atlas_redactions WHERE redaction_id = erasing::uuid;");
      expect(permits).toContain(scope
        ? "IF (old_row - text_columns - key_columns - label_columns - scope_columns) IS DISTINCT FROM\n" +
          "     (new_row - text_columns - key_columns - label_columns - scope_columns) THEN"
        : "IF (old_row - text_columns - key_columns - label_columns) IS DISTINCT FROM\n" +
          "     (new_row - text_columns - key_columns - label_columns) THEN");
      expect(permits).toContain("OR new_row -> column_name IS DISTINCT FROM to_jsonb('[wording removed]'::text)) THEN");
      expect(permits).toContain(
        "AND new_row -> column_name IS DISTINCT FROM atlas_numbers_without_labels(old_row -> column_name) THEN",
      );
      if (scope) {
        expect(permits).toContain(
          "AND new_row -> column_name IS DISTINCT FROM atlas_search_scope_without_queries(old_row -> column_name) THEN",
        );
        expect(erase).toContain("search_scope = atlas_search_scope_without_queries(erased.search_scope)");
      }
    }
  });

  it("ships migration 0018's card fields as nullable Atlas version columns, erased with the wording (Atlas phase 3)", async () => {
    const migration = await read("packages/evidence-repository/migrations/0018_atlas_card_fields.sql");
    const provision = await read("infra/living-evidence-production/provision-research-review-role.sh");

    // Three nullable columns on a table 0017's append_only_guard already covers, added only when missing.
    for (const column of ["kind text", "subject_type text", "search_scope jsonb"]) {
      expect(migration).toContain(`ALTER TABLE atlas_finding_versions ADD COLUMN IF NOT EXISTS ${column};`);
    }
    // Their values, replaced on every run; a NULL kind admits no searches, which only nothing_found holds.
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS atlas_finding_versions_card_fields_check;");
    expect(migration).toContain(
      "kind IN ('effect', 'harm', 'overlooked_option', 'correction', 'nothing_found', 'tested_vs_sold')");
    expect(migration).toContain(
      "'condition', 'symptom', 'test', 'treatment', 'supplement', 'product', 'food', 'practice'");
    expect(migration).toContain("kind IS NOT NULL AND kind = 'nothing_found'");
    expect(migration).toContain(
      "CASE WHEN jsonb_typeof(search_scope) = 'array' THEN jsonb_array_length(search_scope) BETWEEN 1 AND 10");
    // No table, role, grant or sequence, nothing for the review role, and no row written outside the erase function.
    expect(migration).not.toMatch(/CREATE TABLE|CREATE ROLE|CREATE SEQUENCE|GRANT |SECURITY DEFINER|DROP TABLE|DROP COLUMN/u);
    const outsideFunctions = migration.replace(/AS \$function\$[\s\S]*?\$function\$;/gu, "");
    expect(outsideFunctions).not.toMatch(/\b(?:INSERT INTO|UPDATE \w+ SET|DELETE FROM|TRUNCATE)\b/u);
    const functions = [...migration.matchAll(/CREATE OR REPLACE FUNCTION ([a-z_]+)\(/gu)].map(([, name]) => name!);
    expect(functions).toEqual(["atlas_search_scope_without_queries", "atlas_redaction_permits", "erase_atlas_wording"]);
    for (const name of functions) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
      expect(provision).not.toContain(name);
    }
    // The guard itself is not redefined here: 0017's body, with its redaction branch, stays in force.
    expect(migration).not.toContain("reject_living_evidence_mutation");
  });

  it("ships migration 0020's publications with exactly the six review-role functions it grants (decision 171)", async () => {
    const migration = await read("packages/evidence-repository/migrations/0020_atlas_publications.sql");
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const provision = await read("infra/living-evidence-production/provision-research-review-role.sh");

    // 0020 runs after 0018 on every migrate (0019, notice version 4, goes between them on the build branch).
    const migrate = repository.slice(repository.indexOf("async migrate()"), repository.indexOf("].map(async (migrationId)"));
    const order = [...migrate.matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)].map(([, id]) => id!);
    expect(order.indexOf("0020_atlas_publications")).toBeGreaterThan(order.indexOf("0018_atlas_card_fields"));
    // Decision 171, section 4E: 0022, the votes and comments, comes right after it.
    expect(order.slice(-2)).toEqual(["0020_atlas_publications", "0022_atlas_votes_comments"]);
    // One table and its sequence, safe to run again; the reason lists replaced on every run.
    expect(migration).toContain("CREATE SEQUENCE IF NOT EXISTS atlas_publication_number_seq AS bigint START WITH 1001");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS atlas_publications (");
    expect(migration.match(/CREATE TABLE/gu)).toHaveLength(1);
    expect(migration).toContain("publication_number text PRIMARY KEY CHECK (publication_number ~ '^P-[1-9][0-9]{3,}$')");
    expect(migration).toContain("ALTER TABLE atlas_publications DROP CONSTRAINT IF EXISTS atlas_publications_v1_held_check;");
    expect(migration).toContain(
      "ALTER TABLE atlas_publications DROP CONSTRAINT IF EXISTS atlas_publications_v1_withdrawn_reason_check;");
    expect(migration).toContain("ON atlas_publications (card_sha256, finding_number)\n  WHERE card_sha256 IS NOT NULL;");
    // The row never holds an account, a thread key, a receipt, an answer quote or a contributor: only the card's number
    // and digest, for moderation and idempotency.
    const table = migration.slice(migration.indexOf("CREATE TABLE IF NOT EXISTS atlas_publications ("),
      migration.indexOf("\n);", migration.indexOf("CREATE TABLE IF NOT EXISTS atlas_publications (")));
    expect(table).not.toMatch(/account|thread|receipt|answer_quote|contributor|surface|model|youtube/iu);
    // The six SECURITY DEFINER functions, each revoked from PUBLIC and granted to the review role with its signature.
    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf("(")),
      header: chunk.slice(0, chunk.indexOf("AS $")),
    }));
    expect(functions.map(({ name }) => name)).toEqual(ATLAS_PUBLICATION_FUNCTIONS);
    for (const { name, header } of functions) {
      expect(header).toContain("SECURITY DEFINER");
      expect(header).toContain("SET search_path = __SCHEMA__, pg_catalog");
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
    }
    const signature = (text: string, prefix: string) => {
      const start = text.indexOf(prefix) + prefix.length;
      return text.slice(start, text.indexOf(")", start)).replace(/\s+/gu, " ").trim();
    };
    for (const name of ATLAS_PUBLICATION_FUNCTIONS) {
      expect(signature(provision, `GRANT EXECUTE ON FUNCTION living_evidence.${name}(`))
        .toBe(signature(migration, `REVOKE ALL ON FUNCTION ${name}(`));
    }
    expect(migration).toContain("REVOKE ALL ON SEQUENCE atlas_publication_number_seq FROM PUBLIC;");
    expect(provision).not.toContain("atlas_publication_number_seq");
    // Writes happen only inside the six functions; the canonical guard and the canonical tables are not touched.
    const outsideFunctions = migration.replace(/AS \$function\$[\s\S]*?\$function\$;/gu, "");
    expect(outsideFunctions).not.toMatch(/\b(?:INSERT INTO|UPDATE \w+ SET|DELETE FROM|TRUNCATE|GRANT )\b/u);
    expect(migration).not.toMatch(/reject_living_evidence_mutation|claim_versions|atlas_finding_versions|CREATE ROLE/u);
  });

  it("ships migration 0022's votes and comments with exactly the functions each role is granted (decision 171, 4E)", async () => {
    const migration = await read("packages/evidence-repository/migrations/0022_atlas_votes_comments.sql");
    const review = await read("infra/living-evidence-production/provision-research-review-role.sh");
    const access = await read("infra/living-evidence-production/provision-research-access-role.sh");

    // Five tables and one sequence, safe to run again.
    expect(migration.match(/CREATE TABLE IF NOT EXISTS (\w+)/gu)).toEqual([
      "CREATE TABLE IF NOT EXISTS atlas_participants", "CREATE TABLE IF NOT EXISTS atlas_votes",
      "CREATE TABLE IF NOT EXISTS atlas_comments", "CREATE TABLE IF NOT EXISTS atlas_comment_reports",
      "CREATE TABLE IF NOT EXISTS atlas_home_picks",
    ]);
    expect(migration).toContain("CREATE SEQUENCE IF NOT EXISTS atlas_comment_number_seq AS bigint START WITH 1001");
    // A participant is a derived key, never an email address, a subject or an account; a report never holds an address.
    const tables = migration.slice(migration.indexOf("CREATE TABLE"), migration.indexOf("COMMENT ON TABLE"));
    expect(tables).not.toMatch(/email|subject|account_key|oauth|ip_address|address text/iu);
    expect(migration).toContain("reporter_key text NOT NULL CHECK (reporter_key ~ '^[pa]:[a-f0-9]{64}$')");
    expect(migration).toContain("participant_key text PRIMARY KEY CHECK (participant_key ~ '^[a-f0-9]{64}$')");
    // The SECURITY DEFINER functions are the participation and moderation ones, each revoked from PUBLIC and granted
    // with its signature to its role only; the two helpers are granted to no one.
    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf("(")),
      header: chunk.slice(0, chunk.indexOf("AS $")),
    }));
    expect(functions.filter(({ header }) => header.includes("SECURITY DEFINER")).map(({ name }) => name))
      .toEqual([...ATLAS_PARTICIPATION_FUNCTIONS, ...ATLAS_MODERATION_FUNCTIONS]);
    for (const { name, header } of functions) {
      expect(header).toContain("SET search_path = __SCHEMA__, pg_catalog");
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
    }
    const signature = (text: string, prefix: string) => {
      const start = text.indexOf(prefix) + prefix.length;
      return text.slice(start, text.indexOf(")", start)).replace(/\s+/gu, " ").trim();
    };
    for (const [names, script, other] of [[ATLAS_PARTICIPATION_FUNCTIONS, access, review],
      [ATLAS_MODERATION_FUNCTIONS, review, access]] as const) {
      for (const name of names) {
        expect(signature(script, `GRANT EXECUTE ON FUNCTION living_evidence.${name}(`), name)
          .toBe(signature(migration, `REVOKE ALL ON FUNCTION ${name}(`));
        expect(other).not.toContain(`living_evidence.${name}(`);
      }
    }
    for (const helper of ["atlas_publication_open", "atlas_forget_idle_participant", "atlas_comment_number_seq"]) {
      expect(review).not.toContain(helper);
      expect(access).not.toContain(helper);
    }
    expect(access.match(/GRANT EXECUTE ON FUNCTION/gu)).toHaveLength(8);
    expect(access).not.toMatch(/GRANT[^;]*atlas_(?:participants|votes|comments|comment_reports|home_picks)/u);
    // Writes happen only inside the functions; nothing outside them touches a table or grants a role.
    const outsideFunctions = migration.replace(/AS \$function\$[\s\S]*?\$function\$;/gu, "");
    expect(outsideFunctions).not.toMatch(/\b(?:INSERT INTO|UPDATE \w+ SET|DELETE FROM|TRUNCATE|GRANT )\b/u);
    expect(migration).not.toMatch(/reject_living_evidence_mutation|claim_versions|atlas_finding_versions|CREATE ROLE/u);
  });

  it("runs the Atlas runner after the contribution runner in promote-accepted, with the units unchanged", async () => {
    const admin = await read("apps/research-mcp/src/living-evidence-admin.ts");
    const runbook = (await read("infra/living-evidence-production/README.md")).replace(/\s+/gu, " ");
    const scheduler = (await read("docs/research-contribution-promotion-scheduler.md")).replace(/\s+/gu, " ");

    expect(admin).toContain("new AtlasFindingPromotionRunner(new PostgresAtlasPromotionStore(config))");
    expect(admin).toContain("await promoteAtlasFindings(config);\n      if (contributionError !== undefined) throw contributionError;");
    expect(admin.indexOf("new PostgresResearchContributionPromotionRunner("))
      .toBeLessThan(admin.indexOf("await promoteAtlasFindings(config);"));
    expect(admin).toContain('queue: "atlas_findings"');
    expect(runbook).toContain("Migration `0017_atlas_findings` adds:");
    expect(runbook).toContain("expect `no_pending_promotion` for both queues");
    expect(runbook).toContain("an earlier image never selects an Atlas intent");
    expect(runbook).toContain("Re-run `/usr/local/bin/provision-research-review-role`");
    // Atlas phase 3: 0018's release and a rollback that drains the Atlas queue and keeps the owner's actions closed.
    expect(runbook).toContain("Migration `0018_atlas_card_fields` adds three nullable columns");
    expect(runbook).toContain("expect `no_pending_promotion` for the Atlas queue");
    expect(runbook).toContain("Keep the owner's Atlas actions closed while the earlier image serves");
    expect(runbook).toContain("Undo no migration: 0018 stays");
    // Review finding 5: the restored runtime.env opens the actions again unless its line goes, and an app whose tool
    // list was refreshed for phase 3 sends card fields the earlier image refuses.
    expect(runbook).toContain("remove its `ASKRIGOR_ATLAS_REVIEW=enabled` line before recreating `research-mcp`");
    expect(runbook).toContain("answers `input_invalid` until the model leaves them out");
    expect(runbook).toContain("each user refreshes the app's tool list again");
    expect(scheduler).toContain("## Atlas findings queue");
    expect(scheduler).toContain("Strictly first in, first out");
    expect(scheduler).toContain("`FOR UPDATE NOWAIT`");
    expect(scheduler).toContain("One Atlas intent per activation (choice 7)");
    expect(scheduler).toContain("The systemd units are unchanged.");
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
