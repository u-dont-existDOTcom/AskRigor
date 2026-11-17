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
// Decision 171, section 4B: migration 0021's six functions for the Atlas publications, in the grant script's order.
const ATLAS_PUBLICATION_FUNCTIONS = [
  "inspect_atlas_publications", "publish_atlas_findings", "decide_atlas_publications", "edit_atlas_publications",
  "withdraw_atlas_publications", "erase_atlas_publication_texts",
];
// Decision 171, section 4E: migration 0022's five moderation functions for the review role and seven participation
// functions for the access role, in the grant scripts' order.
const ATLAS_MODERATION_FUNCTIONS = [
  "inspect_atlas_comments", "moderate_atlas_comment", "set_atlas_commenter_stopped", "set_atlas_home_picks",
  "inspect_atlas_home_picks",
];
// Owner answers 229a and 231a: migration 0024's two functions for findings kept for research, for the review role.
const ATLAS_KEPT_FUNCTIONS = ["keep_atlas_publications", "inspect_atlas_kept_publications"];
// Owner answer 229a: migration 0025's two placement functions, for the review role.
const ATLAS_PLACEMENT_FUNCTIONS = ["set_atlas_placements", "inspect_atlas_placements"];
// Owner answer 229a: migration 0026's report functions, four for the access role and two for the review role.
const ATLAS_REPORT_ACCESS_FUNCTIONS = ["submit_atlas_report", "take_down_atlas_report", "set_atlas_report_answer",
  "forget_atlas_reports"];
const ATLAS_REPORT_REVIEW_FUNCTIONS = ["inspect_atlas_reports", "decide_atlas_report"];
// The owner, 3 Nov: migration 0027's three functions for a problem's rows at a glance, for the review role.
const ATLAS_GLANCE_FUNCTIONS = ["propose_atlas_glance_row", "set_atlas_glance_row_state", "inspect_atlas_glance_rows"];
// The owner, 6 Nov: migration 0030's two functions for findings that challenge the usual view, for the review role.
const ATLAS_CHALLENGE_FUNCTIONS = ["mark_atlas_challenges", "inspect_atlas_challenges"];
// Codex's third review of 17 Nov 2026, finding 1 (migration 0041): a later save's living-person yes.
const ATLAS_LIVING_PERSON_FUNCTIONS = ["hold_atlas_publications_for_living_person", "inspect_atlas_living_person_notes"];
const ATLAS_PARTICIPATION_FUNCTIONS = [
  "inspect_atlas_participant", "set_atlas_display_name", "set_atlas_vote", "post_atlas_comment", "delete_atlas_comment",
  "report_atlas_comment", "end_atlas_sessions", "atlas_session_current", "forget_atlas_participant",
];

describe("production living-evidence deployment", () => {
  it("ships migration 0024, the findings kept for research, granted to the review role alone (owner answers 229a and 231a)", async () => {
    const migration = await read("packages/evidence-repository/migrations/0024_atlas_kept_for_research.sql");
    const access = await read("infra/living-evidence-production/provision-research-access-role.sh");
    const review = await read("infra/living-evidence-production/provision-research-review-role.sh");
    const signature = (text: string, prefix: string) => {
      const start = text.indexOf(prefix) + prefix.length;
      return text.slice(start, text.indexOf(")", start)).replace(/\s+/gu, " ").trim();
    };
    // Two columns on the publications and two new functions; no existing function changes its shape.
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS kept_for_research_at timestamptz");
    expect(migration).not.toMatch(/DROP FUNCTION|inspect_atlas_publications\(/u);
    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf("(")), header: chunk.slice(0, chunk.indexOf("AS $")) }));
    expect(functions.map(({ name }) => name)).toEqual(ATLAS_KEPT_FUNCTIONS);
    for (const { name, header } of functions) {
      expect(header).toContain("SECURITY DEFINER");
      expect(header).toContain("SET search_path = __SCHEMA__, pg_catalog, pg_temp");
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
      expect(signature(review, `GRANT EXECUTE ON FUNCTION living_evidence.${name}(`), name)
        .toBe(signature(migration, `REVOKE ALL ON FUNCTION ${name}(`));
      expect(access).not.toContain(`living_evidence.${name}(`);
    }
  });

  it("ships migration 0030, the findings that challenge the usual view, granted to the review role alone (the owner, 6 Nov 2026)", async () => {
    const migration = await read("packages/evidence-repository/migrations/0030_atlas_challenges.sql");
    const access = await read("infra/living-evidence-production/provision-research-access-role.sh");
    const review = await read("infra/living-evidence-production/provision-research-review-role.sh");
    const signature = (text: string, prefix: string) => {
      const start = text.indexOf(prefix) + prefix.length;
      return text.slice(start, text.indexOf(")", start)).replace(/\s+/gu, " ").trim();
    };
    // Six nullable columns on the publications, held together by one check, and two new functions; no existing
    // function changes its shape, and no table is created.
    for (const column of ["challenge_usual_view text", "challenge_source_url text", "challenge_source_label text",
      "challenge_verdict text", "challenge_marked_by text", "challenge_marked_at timestamptz"]) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column};`);
    }
    expect(migration).toContain("ADD CONSTRAINT atlas_publications_v1_challenge_check CHECK (");
    expect(migration).toContain("challenge_verdict IN ('pass', 'headline', 'fail')");
    expect(migration).toContain("challenge_marked_by ~ '^reviewer:[0-9a-f]{16}$'");
    expect(migration).not.toMatch(/DROP FUNCTION|CREATE TABLE|inspect_atlas_publications\(|keep_atlas_publications\(/u);
    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf("(")), header: chunk.slice(0, chunk.indexOf("AS $")) }));
    expect(functions.map(({ name }) => name)).toEqual(ATLAS_CHALLENGE_FUNCTIONS);
    for (const { name, header } of functions) {
      expect(header).toContain("SECURITY DEFINER");
      expect(header).toContain("SET search_path = __SCHEMA__, pg_catalog, pg_temp");
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
      expect(signature(review, `GRANT EXECUTE ON FUNCTION living_evidence.${name}(`), name)
        .toBe(signature(migration, `REVOKE ALL ON FUNCTION ${name}(`));
      expect(access).not.toContain(`living_evidence.${name}(`);
    }
    // The pages read the mark's usual view, source and verdict, never who marked it.
    const pages = await read("packages/evidence-repository/src/atlas-pages.ts");
    const columns = pages.slice(pages.indexOf("const PAGE_PUBLICATION_COLUMNS"), pages.indexOf("function publicationsSql"));
    expect(columns).toContain("listed.challenge_usual_view");
    expect(columns).not.toContain("challenge_marked_by");
  });

  it("ships migrations 0025, 0026 and 0027, the placements, people's reports and the rows at a glance, granted function by function (owner answer 229a)", async () => {
    const access = await read("infra/living-evidence-production/provision-research-access-role.sh");
    const review = await read("infra/living-evidence-production/provision-research-review-role.sh");
    const signature = (text: string, prefix: string) => {
      const start = text.indexOf(prefix) + prefix.length;
      return text.slice(start, text.indexOf(")", start)).replace(/\s+/gu, " ").trim();
    };
    for (const [file, roles] of [
      ["0025_atlas_placements", [[ATLAS_PLACEMENT_FUNCTIONS, review, access]]],
      ["0026_atlas_reports", [[ATLAS_REPORT_ACCESS_FUNCTIONS, access, review], [ATLAS_REPORT_REVIEW_FUNCTIONS, review, access]]],
      ["0027_atlas_glance_rows", [[ATLAS_GLANCE_FUNCTIONS, review, access]]],
    ] as const) {
      const migration = await read(`packages/evidence-repository/migrations/${file}.sql`);
      // Nothing about a person but the derived participant key: no address, subject or account key.
      const tables = migration.slice(migration.indexOf("CREATE TABLE"), migration.indexOf("COMMENT ON TABLE"));
      expect(tables).not.toMatch(/email|subject|account_key|oauth|ip_address|address text/iu);
      const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
        name: chunk.slice(0, chunk.indexOf("(")),
        header: chunk.slice(0, chunk.indexOf("AS $")),
      }));
      expect(functions.map(({ name }) => name).sort()).toEqual(roles.flatMap(([names]) => [...names]).sort());
      for (const { name, header } of functions) {
        expect(header).toContain("SECURITY DEFINER");
        expect(header).toContain("SET search_path = __SCHEMA__, pg_catalog, pg_temp");
        expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
      }
      for (const [names, script, other] of roles) {
        for (const name of names) {
          expect(signature(script, `GRANT EXECUTE ON FUNCTION living_evidence.${name}(`), name)
            .toBe(signature(migration, `REVOKE ALL ON FUNCTION ${name}(`));
          expect(other).not.toContain(`living_evidence.${name}(`);
        }
      }
    }
  });
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

  it("gives research-mcp the owner's maps folder read-only from the overlay, which every release installs (#418)", async () => {
    const compose = await read("infra/living-evidence-production/compose.yaml");
    const runbook = await read("infra/living-evidence-production/README.md");
    // research-mcp's own volumes: from its volumes key to the next key at the same depth.
    const service = compose.slice(compose.indexOf("  research-mcp:\n"), compose.indexOf("\n  living-evidence-postgres:\n"));
    const volumes = service.slice(service.indexOf("    volumes:\n") + "    volumes:\n".length);
    const mounts = [...volumes.slice(0, volumes.search(/^ {4}\S/mu)).matchAll(/^ {6}- (\S+)$/gmu)].map(([, mount]) => mount);
    expect(mounts).toEqual([
      "/opt/askrigor/state/reddit-reader:/run/askrigor-reddit-reader:ro",
      "/opt/askrigor/state/private-comment-maps:/var/lib/askrigor-private-comment-maps:ro",
      // Owner answers 221 and 298b: the Claude API key file of AskRigor's own planning call, read-only.
      "/opt/askrigor/state/claude-api:/run/askrigor-claude-api:ro",
      // The planning call's count of the day's spend and of each account's plans, kept across a restart: the one
      // folder of these the service writes, so it is not read-only.
      "/opt/askrigor/state/research-planner:/run/askrigor-research-planner",
    ]);
    expect(runbook).toContain(`\`${mounts[2]}\``);
    expect(runbook).toContain("`ASKRIGOR_RESEARCH_PLANNER_KEY_FILE=/run/askrigor-claude-api/key`");
    expect(runbook).toContain(`\`${mounts[3]}\``);
    expect(runbook).toContain("`ASKRIGOR_RESEARCH_PLANNER_STATE_FILE=/run/askrigor-research-planner/state.json`");
    // The runbook quotes that mount, adds none by hand, and its setting names a file inside it.
    expect(runbook).toContain(`\`${mounts[1]}\``);
    expect(runbook).toContain("Add no mount by hand");
    expect(runbook).not.toContain("Add to the `research-mcp` service a read-only bind mount");
    expect(runbook).toContain(
      "`ASKRIGOR_PRIVATE_COMMENT_MAPS_FILE=/var/lib/askrigor-private-comment-maps/comment-maps.json`");
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
    // The three contribution functions, then migration 0017's five Atlas functions (Atlas phase 2), migration 0019's
    // six held YouTube findings functions (owner answer 173), migration 0021's six publication functions and migration
    // 0022's five moderation functions (decision 171), and since then 0024's, 0025's, 0026's, 0027's and 0030's, and
    // 0037's dossier erasure (AskRigor#477 stage 1).
    expect(provision.match(/GRANT EXECUTE ON FUNCTION/gu)).toHaveLength(39);
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
      "GRANT SELECT, INSERT ON TABLE living_evidence.research_use_accounts",
    );
    expect(provision).toContain(
      "GRANT UPDATE (status, mode, notice_version, agreement_json, activated_at, revoked_at, updated_at,\n" +
      "  plain_answer_note, detailed_lesson_reports, findings_save, notice_accepted_by, notice_accepted_at,\n" +
      "  research_style, check_back_minutes, adjustment_detail, learn_menu_choices)\n" +
      "  ON TABLE living_evidence.research_use_accounts",
    );
    expect(provision).not.toContain("GRANT SELECT, INSERT, UPDATE ON TABLE living_evidence.research_use_accounts");
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
    // the role's settings grant covers; a report itself is stored only in the private lessons repository.
    const lessonReports = await read("packages/evidence-repository/migrations/0015_research_detailed_lesson_reports.sql");
    expect(lessonReports).toContain("ADD COLUMN IF NOT EXISTS detailed_lesson_reports boolean NOT NULL DEFAULT false");
    expect(lessonReports).not.toMatch(/CREATE TABLE|GRANT|DROP|DELETE|UPDATE/iu);
    const findingsSave = await read("packages/evidence-repository/migrations/0023_research_findings_save_switch.sql");
    expect(findingsSave).toContain("ADD COLUMN IF NOT EXISTS findings_save boolean NOT NULL DEFAULT true");
    expect(findingsSave).toContain("A setting only; no findings card is stored here.");
    expect(findingsSave).not.toMatch(/CREATE TABLE|GRANT|DROP|DELETE|UPDATE/iu);
    expect(await read("packages/evidence-repository/src/postgres.ts"))
      .toContain('"0022_atlas_votes_comments",\n      "0023_research_findings_save_switch",');
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
    const noticeV4 = await read("packages/evidence-repository/migrations/0020_research_use_notice_v4.sql");
    expect(noticeV4).toContain(
      "notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30', 'free-contributor-v3-2026-10-22', 'free-contributor-v4-2026-10-25')",
    );
    expect(noticeV4).toContain("pg_get_constraintdef(oid) NOT LIKE '%free-contributor-v4-2026-10-25%'");
    expect(noticeV4.match(/research_use_accounts_free_notice_check/gu)).toHaveLength(4);
    expect(noticeV4).toContain("IF NOT EXISTS");
    expect(noticeV4).not.toMatch(/CREATE TABLE|GRANT|DELETE|UPDATE/iu);
    // Owner answer 253a: and now v1 to v5, under the same idempotence guard.
    const noticeV5 = await read("packages/evidence-repository/migrations/0028_research_use_notice_v5.sql");
    expect(noticeV5).toContain(
      "notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30', 'free-contributor-v3-2026-10-22', 'free-contributor-v4-2026-10-25', 'free-contributor-v5-2026-11-05')",
    );
    expect(noticeV5).toContain("pg_get_constraintdef(oid) NOT LIKE '%free-contributor-v5-2026-11-05%'");
    expect(noticeV5.match(/research_use_accounts_free_notice_check/gu)).toHaveLength(4);
    expect(noticeV5).toContain("IF NOT EXISTS");
    expect(noticeV5).not.toMatch(/CREATE TABLE|GRANT|DELETE|UPDATE/iu);
    // Owner answer 307b (a card may link a YouTube video that a person named): and now v1 to v6, under the same
    // idempotence guard, with 0028 among the migrations every migrate applies again first.
    const noticeV6 = await read("packages/evidence-repository/migrations/0036_research_use_notice_v6.sql");
    expect(noticeV6).toContain(
      "notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30', 'free-contributor-v3-2026-10-22', 'free-contributor-v4-2026-10-25', 'free-contributor-v5-2026-11-05', 'free-contributor-v6-2026-11-15')",
    );
    expect(noticeV6).toContain("pg_get_constraintdef(oid) NOT LIKE '%free-contributor-v6-2026-11-15%'");
    expect(noticeV6.match(/research_use_accounts_free_notice_check/gu)).toHaveLength(4);
    expect(noticeV6).toContain("IF NOT EXISTS");
    expect(noticeV6).not.toMatch(/CREATE TABLE|GRANT|DELETE|UPDATE/iu);
    expect(noticeV6).toContain("Every migrate applies 0011, 0016, 0020 and 0028 again first");
    expect(noticeV6).toContain("Owner answer 307b (15 November 2026)");
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

  // Owner answer 307b (15 November 2026): notice version 6, for a rollback to an image that reads only v1 to v5.
  it("ships the v6 hold/restore pair and its disposable PostgreSQL acceptance (owner answer 307b)", async () => {
    const hold = await read("infra/living-evidence-production/research-use-notice-v6-hold.sql");
    const restore = await read("infra/living-evidence-production/research-use-notice-v6-restore.sql");
    expect(hold).toContain("CREATE TABLE IF NOT EXISTS research_use_notice_v6_hold");
    expect(hold).toContain("REVOKE ALL ON TABLE research_use_notice_v6_hold FROM PUBLIC");
    expect(hold).toContain("acl.grantee <> class.relowner");
    expect(hold).toContain("ON CONFLICT (account_key) DO NOTHING");
    expect(hold).toContain("WHERE notice_version = 'free-contributor-v6-2026-11-15'");
    expect(hold).toContain("AND account.notice_version = 'free-contributor-v6-2026-11-15'");
    expect(hold).toContain("GREATEST(now(), created_at, updated_at)");
    expect(hold).toContain("SET status = 'REVOKED'");
    expect(hold).not.toMatch(/DELETE FROM|UPDATE research_contribution_proposals|UPDATE atlas_/u);
    for (const guard of [
      "account.status = 'REVOKED'", "account.mode IS NULL", "account.notice_version IS NULL",
      "account.revoked_at = hold.held_at", "account.updated_at = hold.held_at",
    ]) expect(restore).toContain(guard);
    expect(restore).toContain("DELETE FROM research_use_notice_v6_hold");
    expect(restore).toContain("\\if :hold_exists");
    // The statements are the v5 pair's with only the version changed, so what the v5 pair's Docker acceptance showed
    // of them holds here too.
    const statements = (sql: string) => sql.split("\n").filter((line) => !line.startsWith("--")).join("\n");
    const asV6 = (sql: string) => statements(sql)
      .replaceAll("free-contributor-v5-2026-11-05", "free-contributor-v6-2026-11-15")
      .replaceAll("v5", "v6").replaceAll("v1 to v4", "v1 to v5");
    const v5Hold = await read("infra/living-evidence-production/research-use-notice-v5-hold.sql");
    const v5Restore = await read("infra/living-evidence-production/research-use-notice-v5-restore.sql");
    expect(statements(hold)).toBe(asV6(v5Hold));
    expect(statements(restore)).toBe(asV6(v5Restore));
    // How the notice was accepted (migration 0031) is left to the account table's trigger: no statement of either
    // script names the pair, the hold says so, and the acceptance checks that the hold clears it and the restore leaves
    // it not recorded, for a person's yes and for the owner's standing instruction alike.
    for (const script of [hold, restore]) expect(statements(script)).not.toMatch(/notice_accepted_(?:by|at)/u);
    expect(hold).toContain("How the notice was accepted (notice_accepted_by and notice_accepted_at,");
    expect(restore).toContain("a restored\n-- account's way of acceptance reads as not recorded.");
    const runner = await read("scripts/run-research-use-notice-v6-rollback-acceptance.sh");
    expect(runner).toContain("phase seed\nrun_sql \"$hold\"\nrun_sql \"$hold\"\nphase after-hold\nphase reenroll-v5\nrun_sql \"$restore\"\nrun_sql \"$restore\"\nphase after-restore");
    const acceptance = await read("scripts/research-use-notice-v6-rollback-acceptance.mts");
    expect(acceptance).toContain("[V1, V2, V3, V4, V5]");
    expect(acceptance).toContain('const V6 = "free-contributor-v6-2026-11-15"');
    expect(acceptance).toContain('const STANDING = "OWNER_STANDING_INSTRUCTION_2026_11_06"');
    for (const check of ["NEWER_ROW_OVERWRITTEN", "NOT_RESTORED_EXACTLY", "HOLD_NOT_EMPTIED", "SETTINGS_CHANGED",
      "HOLD_READABLE_BY_RUNTIME_ROLE", "HOLD_READABLE_BY_READER", "OTHER_TABLE_CHANGED_", "ACCEPTANCE_NOT_CLEARED",
      "ACCEPTANCE_NOT_LEFT_UNRECORDED"]) {
      expect(acceptance).toContain(check);
    }
    expect(await read("package.json")).toContain('"contributor-access:notice-v6-rollback-acceptance": "bash scripts/run-research-use-notice-v6-rollback-acceptance.sh"');
    expect(await read("infra/living-evidence-production/README.md")).toContain("Undo no migration: 0036 stays");
  });

  it("ships the v5 hold/restore pair and its disposable PostgreSQL acceptance (owner answer 253a)", async () => {
    const hold = await read("infra/living-evidence-production/research-use-notice-v5-hold.sql");
    const restore = await read("infra/living-evidence-production/research-use-notice-v5-restore.sql");
    expect(hold).toContain("CREATE TABLE IF NOT EXISTS research_use_notice_v5_hold");
    expect(hold).toContain("REVOKE ALL ON TABLE research_use_notice_v5_hold FROM PUBLIC");
    expect(hold).toContain("acl.grantee <> class.relowner");
    expect(hold).toContain("ON CONFLICT (account_key) DO NOTHING");
    expect(hold).toContain("WHERE notice_version = 'free-contributor-v5-2026-11-05'");
    expect(hold).toContain("AND account.notice_version = 'free-contributor-v5-2026-11-05'");
    expect(hold).toContain("GREATEST(now(), created_at, updated_at)");
    expect(hold).not.toMatch(/DELETE FROM|UPDATE research_contribution_proposals|UPDATE atlas_/u);
    for (const guard of [
      "account.status = 'REVOKED'", "account.mode IS NULL", "account.notice_version IS NULL",
      "account.revoked_at = hold.held_at", "account.updated_at = hold.held_at",
    ]) expect(restore).toContain(guard);
    expect(restore).toContain("DELETE FROM research_use_notice_v5_hold");
    const runner = await read("scripts/run-research-use-notice-v5-rollback-acceptance.sh");
    expect(runner).toContain("phase seed\nrun_sql \"$hold\"\nrun_sql \"$hold\"\nphase after-hold\nphase reenroll-v4\nrun_sql \"$restore\"\nrun_sql \"$restore\"\nphase after-restore");
    const acceptance = await read("scripts/research-use-notice-v5-rollback-acceptance.mts");
    expect(acceptance).toContain("[V1, V2, V3, V4]");
    expect(acceptance).toContain('const V5 = "free-contributor-v5-2026-11-05"');
    expect(await read("package.json")).toContain('"contributor-access:notice-v5-rollback-acceptance": "bash scripts/run-research-use-notice-v5-rollback-acceptance.sh"');
  });

  // Owner answers 254a and 255a: forum reading is a verified basis, and an Atlas version keeps the research behind it,
  // which an erasure removes whole.
  it("ships migration 0029, the research behind each finding, with its erasure", async () => {
    const migration = await read("packages/evidence-repository/migrations/0029_atlas_research_behind.sql");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS research jsonb");
    expect(migration).toContain('verified_bases <@ \'["full_text_audit", "bounded_absence", "research_correction", "forum_read"]\'::jsonb');
    expect(migration).toContain('"research_correction", "forum_read"]\'::jsonb');
    expect(migration).toContain("research = NULL");
    expect(migration).toContain("OR erased.research IS NOT NULL");
    expect(migration).toContain("research_columns := ARRAY['research']");
    expect(migration).not.toMatch(/CREATE TABLE|GRANT|DELETE FROM|SECURITY DEFINER/u);
    expect(migration).toContain("Renumber this migration when the Atlas stack next takes");
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
    expect(await read("infra/living-evidence-production/README.md")).toContain("Undo no migration: 0020 stays");
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

    // Atlas migrations follow 0016; 0019 holds the findings drawn from YouTube comments (owner answer 173), 0020
    // widens the notice constraint for v4, 0021 adds the publications, 0022 the votes and comments, 0023 the
    // findings save switch (decision 171), 0024 the findings kept for research (owner answers 229a and 231a), 0025 the
    // placements under Health, 0026 people's reports (owner answer 229a), 0027 a problem's rows at a glance, 0028
    // notice version 5 (owner answer 253a), 0029 the research behind each finding (owner answers 254a and 255a) and
    // 0030 the findings that challenge the usual view (the owner, 6 November 2026). After the account migrations 0031
    // to 0035 comes 0036, notice version 6 (owner answer 307b).
    expect(repository).toContain(
      '"0016_research_use_notice_v3",\n      "0017_atlas_findings",\n      "0018_atlas_card_fields",\n      ' +
      '"0019_held_youtube_findings",\n      "0020_research_use_notice_v4",\n      "0021_atlas_publications",\n      ' +
      '"0022_atlas_votes_comments",\n      "0023_research_findings_save_switch",\n      "0024_atlas_kept_for_research",\n      ' +
      '"0025_atlas_placements",\n      "0026_atlas_reports",\n      "0027_atlas_glance_rows",\n      ' +
      '"0028_research_use_notice_v5",\n      "0029_atlas_research_behind",\n      "0030_atlas_challenges",\n      ' +
      '"0031_research_notice_acceptance",\n      "0032_research_call_record",\n      "0033_research_steering",\n      ' +
      '"0034_research_call_record_plan_next",\n      "0035_research_menu_learning",\n      ' +
      '"0036_research_use_notice_v6",\n      "0037_research_dossiers",\n      ' +
      '"0038_research_proposal_idempotency_index",\n      "0041_atlas_show_saved_findings",\n    ]');
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
      .toEqual([...ATLAS_REVIEW_FUNCTIONS, ...ATLAS_PUBLICATION_FUNCTIONS, ...ATLAS_MODERATION_FUNCTIONS,
        ...ATLAS_KEPT_FUNCTIONS, ...ATLAS_PLACEMENT_FUNCTIONS, ...ATLAS_REPORT_REVIEW_FUNCTIONS, ...ATLAS_GLANCE_FUNCTIONS,
        ...ATLAS_CHALLENGE_FUNCTIONS, ...ATLAS_LIVING_PERSON_FUNCTIONS]);
    // With the three contribution functions, migration 0019's six (owner answer 173) and 0037's dossier erasure.
    expect(granted).toHaveLength(39);
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
    // Owner answer 255a: 0029 redefines both last, so its bodies are in force.
    expect(defining.get("atlas_redaction_permits")).toEqual(["0017_atlas_findings", "0018_atlas_card_fields",
      "0029_atlas_research_behind"]);
    expect(defining.get("erase_atlas_wording")).toEqual(["0017_atlas_findings", "0018_atlas_card_fields",
      "0029_atlas_research_behind"]);
    const cardFields = sources.get("0018_atlas_card_fields")!;
    const inForce = sources.get("0029_atlas_research_behind")!;
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
    for (const [sql, versionErased, scope, research] of [
      [migration, versionColumns, false, false],
      [cardFields, [...versionColumns, "search_scope"].sort(), true, false],
      // Owner answer 255a: the research behind a finding is removed whole with the wording.
      [inForce, [...versionColumns, "search_scope", "research"].sort(), true, true],
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
      expect(permits).toContain(research
        ? "IF (old_row - text_columns - key_columns - label_columns - scope_columns - research_columns) IS DISTINCT FROM\n" +
          "     (new_row - text_columns - key_columns - label_columns - scope_columns - research_columns) THEN"
        : scope
        ? "IF (old_row - text_columns - key_columns - label_columns - scope_columns) IS DISTINCT FROM\n" +
          "     (new_row - text_columns - key_columns - label_columns - scope_columns) THEN"
        : "IF (old_row - text_columns - key_columns - label_columns) IS DISTINCT FROM\n" +
          "     (new_row - text_columns - key_columns - label_columns) THEN");
      if (research) {
        expect(permits).toContain("AND new_row -> column_name IS DISTINCT FROM 'null'::jsonb THEN");
        expect(erase).toContain("research = NULL");
      }
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

  // Owner answer 173 (25 Oct): the findings drawn from YouTube comments that a saved card leaves out are held for the
  // owner's review and kept until deleted (the owner's rule, 25 Oct: "don't delete the summaries unless YT tells us to
  // do that"): no expiry and no purge. Insert at a save (the research-access role); read, delete a card's or a save's,
  // and delete every one at once for the owner's review (the review role); no table grant to anyone. A card whose
  // findings all rest on YouTube comments is not saved as a card, and its findings are held with no card number, with
  // the card's question and topic.
  it("ships migration 0019's held YouTube findings, reached only through six functions the two roles get exactly", async () => {
    const migration = await read("packages/evidence-repository/migrations/0019_held_youtube_findings.sql");
    const access = await read("infra/living-evidence-production/provision-research-access-role.sh");
    const review = await read("infra/living-evidence-production/provision-research-review-role.sh");
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const runbook = (await read("infra/living-evidence-production/README.md")).replace(/\s+/gu, " ");

    // 0019 runs right after 0018; the build's 0020 to 0023 follow it.
    expect(repository).toContain('"0018_atlas_card_fields",\n      "0019_held_youtube_findings",\n      ' +
      '"0020_research_use_notice_v4",\n');
    // Safe to run again, as every migration runs on each start.
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS held_youtube_findings (");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS held_youtube_findings_without_card_idx\n" +
      "  ON held_youtube_findings (saved_at DESC, card_sha256) WHERE card_number IS NULL;");
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|CREATE ROLE|CREATE SEQUENCE|GRANT /u);
    // No expiry, no purge, and nothing that deletes by age or by the clock.
    expect(migration).not.toMatch(/expir|purge|interval|720/iu);
    // Only AskRigor's texts and fixed values: no column for a source, a link, the answer quote, a thread or account,
    // or any comment, name, channel or video.
    const start = migration.indexOf("CREATE TABLE IF NOT EXISTS held_youtube_findings (");
    const table = migration.slice(start, migration.indexOf("\n);", start));
    const columns = [...table.matchAll(/^ {2}([a-z][a-z0-9_]*) /gmu)].map(([, column]) => column);
    expect(columns).toEqual([
      "card_number", "card_sha256", "finding_number", "question", "topic_key", "topic_label", "claim", "certainty",
      "applies_to", "why_not_usual", "what_would_change_it", "kind", "subject", "direction", "tags", "verified_bases",
      "saved_at",
    ]);
    expect(table).not.toMatch(/source|link|url|quote|thread|account|contributor|comment_text|author|channel|video_id/iu);
    // A saved card names its findings; a card not saved as a card brings its question, and its whole topic or none.
    expect(table).toContain("card_number integer CHECK (card_number IS NULL OR card_number > 0),");
    expect(table).toContain("(card_number IS NOT NULL AND question IS NULL AND topic_key IS NULL AND topic_label IS NULL)\n" +
      "    OR (card_number IS NULL AND question IS NOT NULL AND (topic_key IS NULL) = (topic_label IS NULL))");
    // One row per finding of one save, with or without a card (no card has number 0).
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS held_youtube_findings_key\n" +
      "  ON held_youtube_findings ((coalesce(card_number, 0)), card_sha256, finding_number);");
    // Nothing else reads it: every grant but its owner's goes, the reader's default-privilege SELECT included.
    expect(migration).toContain("REVOKE ALL ON TABLE held_youtube_findings FROM PUBLIC;");
    expect(migration).toContain("EXECUTE format('REVOKE ALL ON TABLE held_youtube_findings FROM %s', grantee_role);");
    expect(migration).toContain("AND acl.grantee <> class.relowner");

    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf("(")),
      header: chunk.slice(0, chunk.indexOf("AS $")),
      body: chunk.slice(chunk.indexOf("AS $function$"), chunk.indexOf("$function$;")),
    }));
    expect(functions.map(({ name }) => name)).toEqual([
      "hold_youtube_findings", "inspect_held_youtube_findings", "inspect_cardless_held_youtube_findings",
      "delete_held_youtube_findings", "delete_cardless_held_youtube_findings", "delete_all_held_youtube_findings",
    ]);
    for (const { name, header } of functions) {
      expect(header).toContain("SECURITY DEFINER");
      expect(header).toContain("SET search_path = __SCHEMA__, pg_catalog");
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
    }
    const body = (name: string) => functions.find((candidate) => candidate.name === name)!.body;
    // Every read returns every held row: a card's whole, and the saves with no card a page at a time, by save.
    expect(body("inspect_held_youtube_findings")).toContain("WHERE held.card_number = ANY(target_card_numbers)\n" +
      "   ORDER BY held.card_number, held.saved_at, held.card_sha256, held.finding_number;");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION inspect_cardless_held_youtube_findings(\n" +
      "  after_saved_at timestamptz,\n  after_card_sha256 text,\n  save_limit integer\n)");
    expect(body("inspect_cardless_held_youtube_findings")).toContain("IF save_limit IS NULL OR save_limit NOT BETWEEN 1 AND 100");
    expect(body("inspect_cardless_held_youtube_findings")).toContain(
      "OR (held.saved_at = after_saved_at AND held.card_sha256::text > after_card_sha256))\n" +
      "     ORDER BY saved DESC, digest\n     LIMIT save_limit");
    // A card-less save's deletion never deletes a saved card's findings, nor a card's a card-less one's; deleting them
    // all takes every row, of both.
    expect(body("delete_cardless_held_youtube_findings")).toContain("WHERE held.card_number IS NULL");
    expect(body("delete_held_youtube_findings")).toContain("WHERE held.card_number = ANY(target_card_numbers)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION delete_all_held_youtube_findings()\nRETURNS integer");
    expect(body("delete_all_held_youtube_findings")).toContain("DELETE FROM held_youtube_findings held WHERE true;");
    // A hold refuses any other key, keeps the save time to the millisecond, and never refreshes one held before.
    expect(body("hold_youtube_findings")).toContain("WHERE supplied_key.name NOT IN ('finding_number', 'claim'");
    expect(body("hold_youtube_findings")).toContain(
      "stored_saved_at := date_trunc('milliseconds', LEAST(saved_time, now()));");
    expect(body("hold_youtube_findings")).toContain("ON CONFLICT DO NOTHING");
    expect(body("hold_youtube_findings")).not.toContain("DELETE");
    expect(body("hold_youtube_findings")).toContain("OR (target_card_number IS NULL AND card_question IS NULL)");

    // The grants: the research-access role only holds at a save; the review role holds moved findings, reads, deletes
    // a card's or a save's, and deletes them all. Neither gets the table, and each grant names the function's exact
    // signature.
    const granted = (script: string) =>
      [...script.matchAll(/GRANT EXECUTE ON FUNCTION living_evidence\.([a-z_]+)\(/gu)].map(([, name]) => name!);
    expect(granted(access).filter((name) => name.includes("youtube"))).toEqual(["hold_youtube_findings"]);
    expect(granted(review).filter((name) => name.includes("youtube"))).toEqual([
      "hold_youtube_findings", "inspect_held_youtube_findings", "inspect_cardless_held_youtube_findings",
      "delete_held_youtube_findings", "delete_cardless_held_youtube_findings", "delete_all_held_youtube_findings",
    ]);
    const signature = (text: string, prefix: string) => {
      const from = text.indexOf(prefix) + prefix.length;
      return text.slice(from, text.indexOf(")", from)).replace(/\s+/gu, " ").trim();
    };
    for (const [script, names] of [
      [access, ["hold_youtube_findings"]],
      [review, functions.map(({ name }) => name)],
    ] as const) {
      for (const name of names) {
        expect(signature(script, `GRANT EXECUTE ON FUNCTION living_evidence.${name}(`))
          .toBe(signature(migration, `REVOKE ALL ON FUNCTION ${name}(`));
      }
      expect(script).not.toContain("held_youtube_findings TO");
      expect(script).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|ALL)\s+ON\s+(?:TABLE\s+)?living_evidence\.held/iu);
    }
    // With the pending-withdrawal function, migration 0022's nine participation functions (decision 171, 4E) and
    // migration 0037's three dossier functions (AskRigor#477 stage 1).
    expect(granted(access)).toHaveLength(18);
    expect(access).not.toContain("purge");
    expect(review).not.toContain("purge");
    // The release: migrate first, then both provisioning scripts, before the image serves.
    expect(runbook).toContain("Migration `0019_held_youtube_findings` adds");
    expect(runbook).toContain("re-run `/usr/local/bin/provision-research-access-role` and " +
      "`/usr/local/bin/provision-research-review-role`");
  });

  it("ships migration 0021's publications with exactly the six review-role functions it grants (decision 171)", async () => {
    const migration = await read("packages/evidence-repository/migrations/0021_atlas_publications.sql");
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const provision = await read("infra/living-evidence-production/provision-research-review-role.sh");

    // 0021 runs after 0018 on every migrate (0019, the held YouTube findings, and 0020, notice version 4, go between
    // them).
    const migrate = repository.slice(repository.indexOf("async migrate()"), repository.indexOf("].map(async (migrationId)"));
    const order = [...migrate.matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)].map(([, id]) => id!);
    expect(order.indexOf("0021_atlas_publications")).toBeGreaterThan(order.indexOf("0018_atlas_card_fields"));
    // Decision 171: 0022, the votes and comments, comes right after it, then 0023, the findings save switch, then
    // 0024, the findings kept for research (owner answers 229a and 231a), then 0025, the placements under Health, 0026,
    // people's reports (owner answer 229a), 0027, a problem's rows at a glance, 0028, notice version 5 (owner answer
    // 253a), 0029, the research behind each finding (owner answers 254a and 255a), and 0030, the findings that challenge
    // the usual view (the owner, 6 November 2026). After the account migrations 0031 to 0035 comes 0036, notice
    // version 6 (owner answer 307b), then 0037, the private research dossiers (AskRigor#477 stage 1), 0038, the index
    // for the proposal lookup by idempotency key, and last 0041, how a publication reached the pages (Codex's review of
    // 17 Nov 2026, finding 4; 0039 and 0040 are other branches').
    expect(order.slice(-19)).toEqual(["0021_atlas_publications", "0022_atlas_votes_comments",
      "0023_research_findings_save_switch", "0024_atlas_kept_for_research", "0025_atlas_placements", "0026_atlas_reports",
      "0027_atlas_glance_rows", "0028_research_use_notice_v5", "0029_atlas_research_behind", "0030_atlas_challenges",
      "0031_research_notice_acceptance", "0032_research_call_record",
      "0033_research_steering", "0034_research_call_record_plan_next", "0035_research_menu_learning",
      "0036_research_use_notice_v6", "0037_research_dossiers", "0038_research_proposal_idempotency_index",
      "0041_atlas_show_saved_findings"]);
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
      expect(header).toContain("SET search_path = __SCHEMA__, pg_catalog, pg_temp");
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

    // Six tables and one sequence, safe to run again.
    expect(migration.match(/CREATE TABLE IF NOT EXISTS (\w+)/gu)).toEqual([
      "CREATE TABLE IF NOT EXISTS atlas_participants", "CREATE TABLE IF NOT EXISTS atlas_votes",
      "CREATE TABLE IF NOT EXISTS atlas_comments", "CREATE TABLE IF NOT EXISTS atlas_comment_reports",
      "CREATE TABLE IF NOT EXISTS atlas_home_picks", "CREATE TABLE IF NOT EXISTS atlas_session_ends",
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
      expect(header).toContain("SET search_path = __SCHEMA__, pg_catalog, pg_temp");
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
    for (const helper of ["atlas_publication_open", "atlas_forget_idle_participant", "atlas_comment_number_seq",
      "atlas_session_key_hash", "atlas_end_sessions("]) {
      expect(review).not.toContain(helper);
      expect(access).not.toContain(helper);
    }
    // With the pending-withdrawal function, migration 0019's hold of YouTube findings (owner answer 173) and migration
    // 0037's three dossier functions (AskRigor#477 stage 1).
    expect(access.match(/GRANT EXECUTE ON FUNCTION/gu)).toHaveLength(18);
    expect(access).not.toMatch(/GRANT[^;]*atlas_(?:participants|votes|comments|comment_reports|home_picks|session_ends)/u);
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
    expect(registry).toContain("Expected 35 research operations");
    expect(registry).toContain('registerTool(\n    "get_research_frontier"');
  });

  // Owner answer 303a (14 Nov 2026): learn mode, a dev account's own menu choices; and the plan's lane in the call record.
  it("ships migration 0035's learn mode and plan lane, safe to run again, kept from every role but the access role", async () => {
    const migration = await read("packages/evidence-repository/migrations/0035_research_menu_learning.sql");
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const access = await read("infra/living-evidence-production/provision-research-access-role.sh");
    const review = await read("infra/living-evidence-production/provision-research-review-role.sh");
    const gaps = await read("infra/living-evidence-production/provision-evidence-gap-role.sh");
    const reader = await read("infra/living-evidence-production/init-reader.sh");
    // Right after 0034 in the migrate list; only 0036 (notice version 6, owner answer 307b), 0037, 0038 and 0041 follow it.
    const migrate = repository.slice(repository.indexOf("async migrate()"), repository.indexOf("].map(async (migrationId)"));
    const order = [...migrate.matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)].map(([, id]) => id!);
    expect(order.slice(-6)).toEqual(["0034_research_call_record_plan_next", "0035_research_menu_learning",
      "0036_research_use_notice_v6", "0037_research_dossiers", "0038_research_proposal_idempotency_index",
      "0041_atlas_show_saved_findings"]);
    // Safe to run again: the columns, the table and the index come once, and every check is added by its name only
    // when it is missing.
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS learn_menu_choices boolean NOT NULL DEFAULT false");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS research_menu_choices (");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS research_menu_choices_account_chosen_at\n" +
      "  ON research_menu_choices (account_key, chosen_at DESC);");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS plan_lane text");
    const checks = [...migration.matchAll(/ADD CONSTRAINT (\w+) CHECK/gu)].map(([, name]) => name!);
    expect(checks).toEqual(["research_menu_choices_lane_check", "research_menu_choices_tasks_check",
      "research_menu_choices_reason_check", "research_call_record_plan_lane_check"]);
    for (const name of checks) expect(migration).toContain(`WHERE conname = '${name}'`);
    expect(migration).not.toMatch(/DROP |CREATE TABLE research|ADD COLUMN (?!IF NOT EXISTS)/u);
    expect(migration).toContain("CHECK (lane IS NULL OR lane IN ('research', 'light'))");
    expect(migration).toContain("CHECK (jsonb_typeof(tasks) = 'array')");
    expect(migration).toContain("CHECK (reason IS NULL OR char_length(reason) <= 300)");
    expect(migration).toContain("plan_lane IN ('research', 'light', 'aside')");
    expect(migration).toContain("AND action = 'register_plain_answer'");
    // The table holds no research target, task wording or answer, and refers to nothing that holds a question.
    const start = migration.indexOf("CREATE TABLE IF NOT EXISTS research_menu_choices (");
    const table = migration.slice(start, migration.indexOf("\n);", start));
    expect([...table.matchAll(/^ {2}(\w+) /gmu)].map(([, column]) => column)).toEqual(
      ["account_key", "chosen_at", "lane", "you_decide", "tasks", "reason"]);
    expect(migration).not.toMatch(/REFERENCES|FOREIGN KEY|research_target|question_text|answer_text/iu);
    // A comment on every new column.
    for (const column of ["research_use_accounts.learn_menu_choices", "research_menu_choices.account_key",
      "research_menu_choices.chosen_at", "research_menu_choices.lane", "research_menu_choices.you_decide",
      "research_menu_choices.tasks", "research_menu_choices.reason", "research_call_record.plan_lane"]) {
      expect(migration).toContain(`COMMENT ON COLUMN ${column} IS`);
    }
    // Kept from PUBLIC and the canonical reader, whose default grants would otherwise read it, as the call record is.
    expect(reader).toContain("GRANT SELECT ON TABLES TO askrigor_reader");
    expect(migration).toContain("REVOKE ALL ON TABLE research_menu_choices FROM PUBLIC;");
    expect(migration).toContain("REVOKE ALL ON TABLE research_menu_choices FROM askrigor_reader;");
    expect(migration).toContain("REVOKE ALL ON TABLE research_call_record FROM askrigor_reader;");
    // The access role inserts, reads and deletes the rows, as it does the call record's, and sets the switch; the
    // review and evidence-gap roles revoke every table and are granted nothing on it.
    expect(access).toContain("GRANT INSERT, SELECT, DELETE ON TABLE living_evidence.research_menu_choices\n" +
      "  TO askrigor_research_access;");
    expect(access).toContain("adjustment_detail, learn_menu_choices)\n  ON TABLE living_evidence.research_use_accounts");
    expect(access.match(/research_menu_choices/gu)).toHaveLength(1);
    for (const script of [review, gaps]) {
      expect(script).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA living_evidence FROM");
      expect(script).not.toMatch(/research_menu_choices|learn_menu_choices|research_call_record/u);
    }
  });

  // AskRigor#477 stage 1 (owner answer 329a, 16 Nov 2026): the private research dossiers.
  it("ships migration 0037's private research dossiers, additive, safe to run again, reached only through role functions", async () => {
    const migration = await read("packages/evidence-repository/migrations/0037_research_dossiers.sql");
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const access = await read("infra/living-evidence-production/provision-research-access-role.sh");
    const review = await read("infra/living-evidence-production/provision-research-review-role.sh");
    const gaps = await read("infra/living-evidence-production/provision-evidence-gap-role.sh");
    const runbook = await read("infra/living-evidence-production/README.md");
    const migrate = repository.slice(repository.indexOf("async migrate()"), repository.indexOf("].map(async (migrationId)"));
    const order = [...migrate.matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)].map(([, id]) => id!);
    expect(order.slice(-3)).toEqual(["0037_research_dossiers", "0038_research_proposal_idempotency_index",
      "0041_atlas_show_saved_findings"]);
    // Additive: new objects only, each made once; nothing existing is dropped or altered but one trigger it owns.
    expect(migration).not.toMatch(/DROP (?!TRIGGER IF EXISTS)|ALTER TABLE|CREATE TABLE (?!IF NOT EXISTS)/u);
    expect([...migration.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gu)].map(([, name]) => name)).toEqual([
      "research_dossiers", "research_dossier_versions", "research_dossier_identifiers", "research_dossier_requests",
      "research_dossier_events"]);
    expect(migration).toContain("CREATE SEQUENCE IF NOT EXISTS research_dossier_number_seq");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS research_dossier_one_first_version");
    // Every request and the version it got, the deduplicated ones too, so a retry finds its own (Codex's review, 5).
    expect(migration).toContain("request_key char(64) PRIMARY KEY");
    expect(migration.match(/INSERT INTO research_dossier_requests/gu)).toHaveLength(2);
    // ARD numbers keep every digit past four (Codex's review, 8): lpad would cut ARD-10000 to ARD-1000.
    expect(migration).toContain("lpad(next_dossier::text, greatest(4, length(next_dossier::text)), '0')");
    expect(migration).not.toMatch(/lpad\(nextval/u);
    expect(migration).toContain("previous_version_id uuid UNIQUE REFERENCES research_dossier_versions(version_id)");
    // What a stored dossier never holds: no column for an answer, a question's text, a person or a YouTube id.
    expect(migration).not.toMatch(/answer_text|asked|research_target text|subject|email|youtube|video_id/iu);
    // Every function that touches the tables is SECURITY DEFINER and revoked from PUBLIC; the guard keeps rows fixed.
    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf("(")),
      header: chunk.slice(0, chunk.indexOf("AS $")),
    }));
    expect(functions.map(({ name }) => name)).toEqual(["research_dossier_version_guard",
      "append_research_dossier_version", "latest_research_dossier_version", "read_research_dossier_version",
      "erase_research_dossiers", "withdraw_research_dossiers_on_revocation"]);
    for (const { name, header } of functions) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
      if (name !== "research_dossier_version_guard") expect(header).toContain("SECURITY DEFINER");
    }
    // Revocation withdraws pending versions in the database itself, so an earlier image's revocation does too.
    // And a person's own revocation of an account a notice rollback hold already marked revoked: a new revoked_at
    // (Codex's second pass), so the hold's trigger-off steps never lose it.
    expect(migration).toContain("CREATE TRIGGER research_dossiers_withdraw_on_revocation\n" +
      "  AFTER UPDATE OF status, revoked_at ON research_use_accounts\n" +
      "  FOR EACH ROW WHEN (NEW.status = 'REVOKED'\n" +
      "    AND (OLD.status IS DISTINCT FROM 'REVOKED' OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at))");
    // The account is read in the append's own transaction, under a lock a revocation, a mode change or the saving
    // switch waits for (Codex's review, 4): active, free, notice v6, card saving on.
    expect(migration).toContain("WHERE account.account_key = target_account_key\n   FOR NO KEY UPDATE;");
    expect(migration).not.toContain("FOR KEY SHARE");
    expect(migration).toContain("account_row.notice_version IS DISTINCT FROM 'free-contributor-v6-2026-11-15'");
    expect(migration).toContain("account_row.findings_save IS NOT TRUE");
    // Nothing for PUBLIC or the canonical reader, whose default table grants would otherwise read the tables.
    for (const table of ["research_dossiers", "research_dossier_versions", "research_dossier_identifiers",
      "research_dossier_requests", "research_dossier_events"]) {
      expect(migration).toContain(`REVOKE ALL ON TABLE ${table} FROM PUBLIC;`);
      expect(migration).toContain(`REVOKE ALL ON TABLE ${table} FROM askrigor_reader;`);
    }
    expect(migration).toContain("REVOKE ALL ON SEQUENCE research_dossier_number_seq FROM PUBLIC;");
    // The access role appends, finds the newest version and reads back; the review role erases; no table right.
    const signatures = (script: string) => [...script.matchAll(/GRANT EXECUTE ON FUNCTION living_evidence\.(\w+)\(([^)]*)\)/gu)]
      .filter(([, name]) => name!.includes("research_dossier"))
      .map(([, name, args]) => `${name}(${args!.replace(/\s+/gu, " ").trim()})`);
    expect(signatures(access)).toEqual([
      "append_research_dossier_version(text, text, text, text, text, jsonb, text, integer, jsonb, uuid, uuid, timestamptz)",
      "latest_research_dossier_version(text, text)",
      "read_research_dossier_version(text, uuid)",
    ]);
    // Erasure by the forgotten research thread's key alone, never by a card number (Codex's review, 1).
    expect(signatures(review)).toEqual(["erase_research_dossiers(text, timestamptz)"]);
    expect(migration).toContain("CREATE OR REPLACE FUNCTION erase_research_dossiers(target_thread_key text, change_time timestamptz)");
    expect(migration).not.toMatch(/card_number = ANY|target_card_numbers/u);
    for (const script of [access, review, gaps]) {
      expect(script).not.toMatch(/(?:SELECT|INSERT|UPDATE|DELETE|USAGE)[^;]*ON (?:TABLE |SEQUENCE )?living_evidence\.research_dossier/iu);
    }
    expect(gaps).not.toContain("research_dossier");
    // The runbook names the release order, what an earlier image cannot read, and read-only counts.
    expect(runbook).toContain("0037_research_dossiers");
    // And the two rollback hazards (Codex's review, finding 7): the v6 hold's revocations would withdraw pending
    // versions for good, so the trigger is off around it with research-mcp stopped, or the rollback stops at ce1d677a;
    // an earlier image's forget_card strips the thread key, so it is recovered from the card's marker and its
    // dossiers erased by it first. No card number erases a dossier.
    const hazards = runbook.slice(runbook.indexOf("Image rollback hazards (Codex's review of 16 November 2026, finding 7)"));
    expect(hazards).toContain("Roll back no lower than `ce1d677a` when you can");
    expect(hazards).toContain("ALTER TABLE living_evidence.research_use_accounts DISABLE TRIGGER " +
      "research_dossiers_withdraw_on_revocation;\n   -- here, research-use-notice-v6-hold.sql, as above\n" +
      "   ALTER TABLE living_evidence.research_use_accounts ENABLE TRIGGER research_dossiers_withdraw_on_revocation;");
    expect(hazards).toContain("stop `research-mcp` before\n   each run of the hold");
    expect(hazards).toContain("<!-- askrigor-findings-card:<data> -->");
    expect(hazards).toContain("SELECT living_evidence.erase_research_dossiers('<thread key>', now());");
    expect(hazards).toContain("SELECT count(*) FROM living_evidence.research_dossiers WHERE thread_key = '<thread key>';");
    expect(runbook).not.toMatch(/erase_research_dossiers\([^)]*integer\[\]/u);
    const v6Hold = await read("infra/living-evidence-production/research-use-notice-v6-hold.sql");
    expect(v6Hold).toContain("marking an account REVOKED here fires research_dossiers_withdraw_on_revocation,");
    const acceptance = await read("scripts/research-contributor-access-postgres-acceptance.mts");
    expect(acceptance).toContain("DISABLE TRIGGER research_dossiers_withdraw_on_revocation");
    expect(acceptance).toContain("DOSSIER_NOTICE_HOLD_WITHDREW");
    expect(acceptance).toContain("DOSSIER_REVOCATION_DURING_HOLD_LOST");
    expect(hazards).toContain("the\n   trigger also fires when a revoked account is revoked again at a new time");
    expect(runbook).toContain("SELECT count(*) FROM living_evidence.research_dossier_versions");
    expect(runbook).toContain("ASKRIGOR_RESEARCH_DOSSIERS=enabled");
  });

  // 16 Nov 2026: nine server-built analyses' lookups by idempotency key, each reading every proposal's payload, all hit
  // the research-access role's five-second statement timeout. The index answers that lookup.
  it("ships migration 0038's index for the proposal lookup by idempotency key, an index only, matching the lookup", async () => {
    const migration = await read("packages/evidence-repository/migrations/0038_research_proposal_idempotency_index.sql");
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const store = await read("packages/evidence-repository/src/research-contributor-access.ts");
    const contracts = await read("packages/evidence-repository/src/contracts.ts");
    const runbook = await read("infra/living-evidence-production/README.md");
    const migrate = repository.slice(repository.indexOf("async migrate()"), repository.indexOf("].map(async (migrationId)"));
    const order = [...migrate.matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)].map(([, id]) => id!);
    expect(order.slice(-2)).toEqual(["0038_research_proposal_idempotency_index", "0041_atlas_show_saved_findings"]);
    // One index, made once; no table, row, constraint, trigger, function or grant, and not CONCURRENTLY, which migrate()'s
    // single transaction cannot run.
    const statements = migration.replace(/--[^\n]*\n/gu, "").split(";").map((part) => part.trim()).filter(Boolean);
    expect(statements).toEqual(["SET search_path TO __SCHEMA__, public",
      "CREATE INDEX IF NOT EXISTS research_contribution_proposals_idempotency_idx\n" +
      "  ON research_contribution_proposals (account_key, proposal_kind, (payload_json ->> 'idempotencyKey'))\n" +
      "  WHERE status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED')"]);
    // The index's columns, expression and predicate are the lookup's own, so the planner can answer it from the index.
    const lookup = store.slice(store.lastIndexOf("async findOwnProposalByIdempotencyKey("));
    expect(lookup.slice(0, lookup.indexOf("return result"))).toContain(
      "WHERE account_key = $1 AND proposal_kind = $2\n" +
      "          AND payload_json ->> 'idempotencyKey' = $3\n" +
      "          AND status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED')");
    // Every proposal kind's key is at most 200 characters, far within a B-tree entry, so no insert can fail on it.
    expect(contracts.match(/idempotencyKey: z\.string\(\)\.regex\(\/\^\[a-zA-Z0-9\]\[a-zA-Z0-9\._:-\]\{0,199\}\$\/u\)/gu))
      .toHaveLength(3);
    // The runbook gives the lock, what an earlier image does with the index, the rollback and read-only checks.
    const section = runbook.slice(runbook.indexOf("Migration `0038_research_proposal_idempotency_index`"));
    expect(section).toContain("SHARE lock");
    expect(section).toContain("Leave the index in place on a rollback");
    expect(section).toContain("SELECT count(*), pg_size_pretty(pg_total_relation_size('living_evidence.research_contribution_proposals'))");
    expect(section).toContain("research_contribution_proposals_idempotency_idx");
  });
});

// Codex's review of 17 Nov 2026, finding 4: how a publication reached the pages, stored with it.
describe("migration 0041", () => {
  it("adds how a publication reached the pages, written only by publish_atlas_findings in its own shape, read by the pages", async () => {
    const migration = await read("packages/evidence-repository/migrations/0041_atlas_show_saved_findings.sql");
    const original = await read("packages/evidence-repository/migrations/0021_atlas_publications.sql");
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const review = await read("infra/living-evidence-production/provision-research-review-role.sh");
    const migrate = repository.slice(repository.indexOf("async migrate()"), repository.indexOf("].map(async (migrationId)"));
    const order = [...migrate.matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)].map(([, id]) => id!);
    expect(order.at(-1)).toBe("0041_atlas_show_saved_findings");
    // One nullable column, held to its one value by a check added by name; no table, and nothing dropped.
    expect(migration).toContain("ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS shown_by text;");
    // Codex's re-review of 17 Nov 2026, finding 4: four routes stored apart, NULL being not recorded (older rows).
    expect(migration).toContain("ADD CONSTRAINT atlas_publications_v1_shown_by_check CHECK (\n  shown_by IS NULL OR " +
      "shown_by IN ('owner_action', 'quick_answer_test', 'automatic_showing')\n);");
    expect(migration).not.toMatch(/CREATE TABLE|DROP FUNCTION|DROP COLUMN/u);
    // publish_atlas_findings and keep_atlas_publications are replaced, each with its own arguments and result (0021's
    // and 0024's), so their grants stand as they were; the functions it adds are revoked from PUBLIC and granted to the
    // review role alone, each by its exact signature.
    const kept = await read("packages/evidence-repository/migrations/0024_atlas_kept_for_research.sql");
    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1);
    expect(functions.map((chunk) => chunk.slice(0, chunk.indexOf("(")))).toEqual(["publish_atlas_findings",
      "keep_atlas_publications", ...ATLAS_LIVING_PERSON_FUNCTIONS]);
    for (const [name, args] of [["hold_atlas_publications_for_living_person", "text[], timestamptz"],
      ["inspect_atlas_living_person_notes", "text[]"]] as const) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${name}(${args}) FROM PUBLIC;`);
      expect(review).toContain(`GRANT EXECUTE ON FUNCTION living_evidence.${name}(${args})\n  TO askrigor_research_review;`);
    }
    expect(migration.split("SECURITY DEFINER\nSET search_path = __SCHEMA__, pg_catalog, pg_temp")).toHaveLength(5);
    const header = (text: string, name: string) => {
      const start = text.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      return text.slice(start, text.indexOf("LANGUAGE plpgsql", start));
    };
    expect(header(migration, "publish_atlas_findings")).toBe(header(original, "publish_atlas_findings"));
    expect(header(migration, "keep_atlas_publications")).toBe(header(kept, "keep_atlas_publications"));
    expect(migration).toContain("SECURITY DEFINER\nSET search_path = __SCHEMA__, pg_catalog, pg_temp");
    expect(migration).toContain("REVOKE ALL ON FUNCTION publish_atlas_findings(integer, text, jsonb, timestamptz, boolean) FROM PUBLIC;");
    expect(migration).toContain("REVOKE ALL ON FUNCTION keep_atlas_publications(text[], text[], boolean, text, timestamptz) FROM PUBLIC;");
    expect(review).toContain("GRANT EXECUTE ON FUNCTION living_evidence.publish_atlas_findings(integer, text, jsonb, timestamptz, boolean)");
    expect(review).toContain("GRANT EXECUTE ON FUNCTION living_evidence.keep_atlas_publications(text[], text[], boolean, text, timestamptz)");
    // A draft may say it is shown at once only when unreviewed, or published by the owner only when it shows; never
    // that the quick-answer test showed it, which only showing a finding the test kept with its pass records.
    expect(migration).toContain("OR (draft_shown_by IS NOT NULL AND NOT (\n             (draft_shown_by = " +
      "'\"automatic_showing\"'::jsonb AND draft_state = 'unreviewed')\n             OR (draft_shown_by = " +
      "'\"owner_action\"'::jsonb AND draft_state IN ('unreviewed', 'accepted', 'edited'))))");
    // Publishing a withdrawn finding again takes the owner's route when its draft gives one, and otherwise leaves it.
    const revive = migration.slice(migration.indexOf("ELSIF revive_withdrawn"), migration.indexOf("outcomes := outcomes || jsonb_build_object(draft_number::text, 'revived')"));
    expect(revive).toContain("shown_by = coalesce(draft_shown_by #>> '{}', stored.shown_by),");
    expect(revive).not.toMatch(/kept_/u);
    // Showing a kept finding again records who showed it: the test, from its own pass reason, or the owner.
    expect(migration).toContain("WHEN target.kept_reason = 'owner answer 240a: quick-answer test, passed'\n" +
      "                 OR target.kept_reason LIKE 'owner answer 240a: quick-answer test, passed,%' THEN 'quick_answer_test'");
    // Finding 1: a finding kept for the owner is kept in the same write, by 0024's columns, only when unreviewed.
    expect(migration).toContain("held_because, published_at, state_changed_at, shown_by, kept_for_research_at, kept_reason)");
    expect(migration).toContain("draft_shown_by #>> '{}', CASE WHEN draft_kept IS NULL THEN NULL ELSE publish_time END, draft_kept #>> '{}')");
    expect(migration).toContain("OR (draft_kept IS NOT NULL AND (jsonb_typeof(draft_kept) <> 'string' OR draft_state <> 'unreviewed'");
    // No hold reason is added: 0021 replaces its own list on every run, so a new one would stop migrate.
    expect(migration).not.toContain("atlas_publications_v1_held_check");
    // The pages read it.
    const pages = await read("packages/evidence-repository/src/atlas-pages.ts");
    const columns = pages.slice(pages.indexOf("const PAGE_PUBLICATION_COLUMNS"), pages.indexOf("function publicationsSql"));
    expect(columns).toContain("listed.shown_by");
  });
});

// Codex's re-review of 17 Nov 2026, finding 1: the living-person hold reason is added in 0021, whose one edit migrate
// admits by its digests, and the release says what that means for a rollback image.
describe("migration 0021's admitted edit", () => {
  it("adds the reason in 0021 alone, records the new digest in migrate's transaction, and says which image can roll back", async () => {
    const repository = await read("packages/evidence-repository/src/postgres.ts");
    const migrate = repository.slice(repository.indexOf("async migrate()"), repository.indexOf("async contribute("));
    expect(migrate).toContain('outcome === "admitted_edit"');
    expect(migrate).toContain("UPDATE schema_migrations SET migration_sha256 = $2 WHERE migration_id = $1 AND migration_sha256 = $3");
    expect(migrate.indexOf('await client.query("BEGIN")')).toBeLessThan(migrate.indexOf("UPDATE schema_migrations"));
    // No later migration touches the closed list, which 0021 would narrow again at the next start.
    const order = [...repository.slice(repository.indexOf("async migrate()"), repository.indexOf("].map(async (migrationId)"))
      .matchAll(/"(\d{4}_[a-z0-9_]+)"/gu)].map(([, id]) => id!);
    for (const id of order.filter((id) => id > "0021_atlas_publications")) {
      expect(await read(`packages/evidence-repository/migrations/${id}.sql`), id).not.toContain("atlas_publications_v1_held_check");
    }
    const readme = await read("infra/living-evidence-production/README.md");
    expect(readme).toContain("`MIGRATION_SHA256_MISMATCH migration=0021_atlas_publications` and changes\nnothing, so the " +
      "rollback image must be one built with this 0021");
    expect(readme).toContain("(`living_person_review`), with no page, until the owner decides, whatever the\nsetting.");
  });

  // Codex's re-review of 17 Nov 2026, finding 4 and its P2: the PostgreSQL acceptance reads the route the pages read,
  // and runs 0041's new fields, 0021's edit and the hold script against a real database.
  it("has the PostgreSQL acceptance read and run the routes, the kept reason, the hold and 0021's edit", async () => {
    const acceptance = await read("scripts/research-contributor-access-postgres-acceptance.mts");
    expect(acceptance).toContain('"atlasNumber,challenge,kept,publicationNumber,published,publishedAt,shownBy,state,stateChangedAt"');
    for (const check of [
      "migration_0021_admits_only_its_verified_edit_takes_living_person_review_and_replays_unchanged",
      "earlier_image_or_unknown_0021_digest_stops_migrate_and_changes_nothing",
      "atlas_routes_stored_apart_by_the_review_functions_and_a_page_says_the_test_happened_only_from_the_record",
      "hold_script_dry_run_changes_nothing_and_apply_holds_only_unreviewed_findings_for_living_person_review",
    ]) expect(acceptance).toContain(`checks.push("${check}")`);
    expect(acceptance).toContain("await verifyLivingPersonHoldMigration({ adminUrl, schema: SCHEMA, checks });");
  });

  // Codex's re-review of 17 Nov 2026, finding 4: an earlier image reads its pages from the setting, not the route, and
  // with the setting off would say the quick-answer test happened for a finding shown at once.
  it("says how a rollback image's pages stay true about the quick-answer test", async () => {
    const readme = await read("infra/living-evidence-production/README.md");
    expect(readme).toContain("edit is recorded (below), so a rollback image is this release or a later one,\nwhose " +
      "pages read the route.");
  });
});

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), "utf8");
}
