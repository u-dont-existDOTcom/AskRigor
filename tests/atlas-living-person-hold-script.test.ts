import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  holdForLivingPersonReview,
  planLivingPersonHolds,
  type HoldScriptClient,
  type HoldScriptRow,
} from "../scripts/atlas-hold-living-person-findings.mts";

// Codex's re-review of 17 Nov 2026, finding 1: findings already on the Atlas are touched by no migration; this script,
// for the owner to use once he has answered question 346, holds those he names with the reason living_person_review.
// Dry run by default. The Docker acceptance runs it against PostgreSQL.

const ROWS: HoldScriptRow[] = [
  { publication_number: "P-1001", state: "unreviewed", held_because: null, published: true },
  { publication_number: "P-1002", state: "held", held_because: ["card_reference"], published: true },
  { publication_number: "P-1003", state: "held", held_because: ["living_person_review"], published: true },
  { publication_number: "P-1004", state: "accepted", held_because: null, published: true },
  { publication_number: "P-1005", state: "withdrawn", held_because: null, published: false },
];
const AT = "2026-11-18T09:00:00.000Z";

function fakeClient(rows = ROWS) {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const client: HoldScriptClient = {
    async query<Row extends object>(text: string, values?: unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return { rows: (text.startsWith("SELECT") ? rows : []) as unknown as Row[] };
    },
  };
  return { client, calls };
}

describe("holding named findings for the owner's decision on a living person", () => {
  it("plans each named publication: holds an unreviewed one, adds the reason to a held one, leaves the rest", () => {
    expect(planLivingPersonHolds(["P-1001", "P-1002", "P-1003", "P-1004", "P-1005", "P-1099", "P-1001"], ROWS)
      .map(({ publication, outcome, heldBecause }) => [publication, outcome, heldBecause])).toEqual([
      ["P-1001", "held", ["living_person_review"]],
      ["P-1002", "reason_added", ["card_reference", "living_person_review"]],
      ["P-1003", "already_held", null],
      ["P-1004", "decided", null],
      ["P-1005", "withdrawn", null],
      ["P-1099", "not_found", null],
    ]);
  });

  it("changes nothing in a dry run, which is the default, and says what it would do", async () => {
    const { client, calls } = fakeClient();
    const result = await holdForLivingPersonReview(client, { schema: "living_evidence",
      publications: ["P-1001", "P-1002", "P-1004"], apply: false, at: AT });
    expect(calls.map(({ text }) => text.split(/\s/u)[0])).toEqual(["SELECT"]);
    expect(calls[0]!.text).not.toContain("FOR UPDATE");
    expect(result.text).toBe([
      "P-1001: would be held for your decision, with no page: it may name a living person.",
      "P-1002: already held for another reason; would also be held because it may name a living person.",
      "P-1004: you have decided it (accepted); unchanged.",
      "Dry run: nothing was changed. Run again with --apply to hold the 2 that would be held.",
    ].join("\n"));
    const source = await readFile(new URL("../scripts/atlas-hold-living-person-findings.mts", import.meta.url), "utf8");
    expect(source).toContain('const apply = args.includes("--apply");');
  });

  it("with --apply, holds them in one transaction that locks their rows first", async () => {
    const { client, calls } = fakeClient();
    const result = await holdForLivingPersonReview(client, { schema: "living_evidence",
      publications: ["P-1001", "P-1002", "P-1003", "P-1004"], apply: true, at: AT });
    expect(calls.map(({ text }) => text.trim().split(/\s/u)[0])).toEqual(["BEGIN", "SELECT", "UPDATE", "UPDATE", "COMMIT"]);
    expect(calls[1]!.text).toContain("FOR UPDATE");
    expect(calls.slice(2, 4).map(({ values }) => values)).toEqual([
      ["P-1001", '["living_person_review"]', AT],
      ["P-1002", '["card_reference","living_person_review"]', AT],
    ]);
    expect(calls[2]!.text).toContain("SET state = 'held', held_because = $2::jsonb");
    expect(calls[2]!.text).toContain("WHERE publication_number = $1 AND state IN ('unreviewed', 'held')");
    expect(calls[2]!.text).not.toMatch(/kept_|shown_by/u);
    expect(result.text.split("\n").at(-1)).toBe("Held 2 for your decision; nothing else changed. The pages stop " +
      "showing them within a minute.");
  });

  it("is named in the release with its dry run, and no migration holds anything already on the pages", async () => {
    const readme = await readFile(new URL("../infra/living-evidence-production/README.md", import.meta.url), "utf8");
    expect(readme).toContain("`DATABASE_URL=… npx tsx scripts/atlas-hold-living-person-findings.mts P-1001 …`,\nwhich " +
      "only says what it would do until run again with `--apply`.");
    for (const name of ["0021_atlas_publications", "0041_atlas_show_saved_findings"]) {
      const migration = await readFile(new URL(`../packages/evidence-repository/migrations/${name}.sql`, import.meta.url), "utf8");
      expect(migration).not.toMatch(/UPDATE atlas_publications[^;]*living_person_review/u);
    }
  });

  it("refuses what isn't a list of P numbers, or a schema name, before it reads anything", async () => {
    for (const publications of [[], ["F-1001"], ["P-1"], ["ARF-0042"]]) {
      const { client, calls } = fakeClient();
      await expect(holdForLivingPersonReview(client, { schema: "living_evidence", publications, apply: false, at: AT }))
        .rejects.toThrow("HOLD_SCRIPT_INPUT_INVALID");
      expect(calls).toEqual([]);
    }
    const { client } = fakeClient();
    await expect(holdForLivingPersonReview(client, { schema: "living_evidence; DROP", publications: ["P-1001"],
      apply: false, at: AT })).rejects.toThrow("HOLD_SCRIPT_SCHEMA_INVALID");
  });
});
