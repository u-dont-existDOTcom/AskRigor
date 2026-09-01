import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXPECTED_FILES = [
  "packages/evidence-repository/migrations/0009_research_contributor_access.sql",
  "packages/evidence-repository/src/research-contributor-access.ts",
  "apps/research-mcp/src/research-contributor-access-tool.ts",
  "infra/living-evidence-production/provision-research-access-role.sh",
  "docs/research-contributor-access.md",
  "site/privacy/index.html",
  "site/terms/index.html",
  "skills/askrigor/SKILL.md",
] as const;

async function main(): Promise<void> {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  execFileSync("npm", [
    "run",
    "test:run",
    "--",
    "tests/research-contributor-access.test.ts",
    "tests/research-contributor-config.test.ts",
    "tests/public-gap-oauth-review.test.ts",
    "tests/living-evidence-production-deployment.test.ts",
    "tests/public-site.test.ts",
    "tests/plugin-package.test.ts",
  ], {
    cwd: root,
    stdio: "inherit",
  });

  const files = await Promise.all(EXPECTED_FILES.map(async (path) => ({
    path,
    text: await readFile(join(root, path), "utf8"),
  })));
  const migration = files.find(({ path }) => path.includes("0009_"))!.text;
  for (const table of [
    "research_use_accounts",
    "research_private_entitlements",
    "research_contribution_proposals",
  ]) {
    if (!migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      throw new Error(`CONTRIBUTOR_ACCESS_TABLE_MISSING table=${table}`);
    }
  }
  if (/\b(?:email|raw_oauth_subject|raw_chat|health_narrative)\b/iu.test(migration)) {
    throw new Error("CONTRIBUTOR_ACCESS_PROHIBITED_COLUMN");
  }
  const skill = files.find(({ path }) => path === "skills/askrigor/SKILL.md")!.text;
  const privacy = files.find(({ path }) => path === "site/privacy/index.html")!.text;
  const terms = files.find(({ path }) => path === "site/terms/index.html")!.text;
  for (const [name, text] of [["skill", skill], ["privacy", privacy], ["terms", terms]] as const) {
    for (const required of [
      "free contributor",
      "paid private",
      "raw chat",
      "deidentified",
    ]) {
      if (!text.toLowerCase().includes(required)) {
        throw new Error(`CONTRIBUTOR_ACCESS_DISCLOSURE_MISSING file=${name} phrase=${required}`);
      }
    }
  }
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    files_checked: files.length,
    focused_test_files: 6,
    tables: 3,
    deterministic_layer: true,
    postgres_acceptance: "runs_next_via_contributor-access:acceptance",
    canonical_promotion: "separate_review_required",
    paid_checkout_available: false,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message :
    "unknown contributor-access acceptance failure";
  process.stderr.write(`Contributor-access acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
