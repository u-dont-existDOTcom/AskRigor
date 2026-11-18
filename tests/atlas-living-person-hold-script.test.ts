import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  holdForLivingPersonReview,
  planLivingPersonHolds,
  restoreLivingPersonHolds,
  type HoldScriptClient,
  type HoldScriptImages,
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

/** A row's whole image as PostgreSQL's to_jsonb gives it, for the before-images. */
const imageOf = (row: HoldScriptRow, changes: Record<string, unknown> = {}) => ({ publication_number: row.publication_number,
  state: row.state, held_because: row.held_because, state_changed_at: "2026-11-17T09:00:00+00:00", ...changes });

function fakeClient(rows = ROWS) {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const client: HoldScriptClient = {
    async query<Row extends object>(text: string, values?: unknown[]) {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      if (text.startsWith("SELECT")) {
        return { rows: rows.map((row) => ({ ...row, image: imageOf(row) })) as unknown as Row[] };
      }
      // An UPDATE returns the row as it left it.
      if (text.trim().startsWith("UPDATE") && text.includes("RETURNING")) {
        const row = rows.find(({ publication_number: number }) => number === values![0])!;
        return { rows: [{ image: imageOf(row, { state: "held", held_because: JSON.parse(values![1] as string),
          state_changed_at: "2026-11-18T09:00:00+00:00" }) }] as unknown as Row[] };
      }
      return { rows: [] as Row[] };
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
      publications: ["P-1001", "P-1002", "P-1003", "P-1004"], apply: true, at: AT, saveImages: async () => undefined });
    expect(calls.map(({ text }) => text.trim().split(/\s/u)[0])).toEqual(["BEGIN", "SET", "SELECT", "UPDATE", "UPDATE",
      "COMMIT"]);
    expect(calls[1]!.text).toBe("SET LOCAL TimeZone = 'UTC'");
    expect(calls[2]!.text).toContain("FOR UPDATE");
    expect(calls.slice(3, 5).map(({ values }) => values)).toEqual([
      ["P-1001", '["living_person_review"]', AT],
      ["P-1002", '["card_reference","living_person_review"]', AT],
    ]);
    expect(calls[3]!.text).toContain("SET state = 'held', held_because = $2::jsonb");
    expect(calls[3]!.text).toContain("WHERE publication_number = $1 AND state IN ('unreviewed', 'held')");
    expect(calls[3]!.text).not.toMatch(/kept_|shown_by/u);
    expect(result.text.split("\n").at(-1)).toBe("Held 2 for your decision; nothing else changed. The pages stop " +
      "showing them within a minute.");
  });

  // Codex's third review of 17 Nov 2026, finding 4: --apply keeps a before-image of each row it changes, saved before it
  // commits, and a guarded restore puts a row back only if nothing else changed it since.
  it("with --apply, saves each changed row's before-image before it commits, and commits nothing without them", async () => {
    const { client, calls } = fakeClient();
    let saved: HoldScriptImages | undefined;
    await holdForLivingPersonReview(client, { schema: "living_evidence", publications: ["P-1001", "P-1002", "P-1004"],
      apply: true, at: AT, saveImages: async (images) => { saved = images; calls.push({ text: "SAVED" }); } });
    expect(calls.map(({ text }) => text.trim().split(/\s/u)[0]).slice(-2)).toEqual(["SAVED", "COMMIT"]);
    expect(calls.find(({ text }) => text.trim().startsWith("UPDATE"))!.text).toContain("RETURNING to_jsonb(stored.*) AS image");
    expect(calls.find(({ text }) => text.startsWith("SELECT"))!.text).toContain("to_jsonb(stored.*) AS image");
    expect(saved).toEqual({ schema: "living_evidence", heldAt: AT, images: [
      { publication: "P-1001", before: imageOf(ROWS[0]!), after: imageOf(ROWS[0]!, { state: "held",
        held_because: ["living_person_review"], state_changed_at: "2026-11-18T09:00:00+00:00" }) },
      { publication: "P-1002", before: imageOf(ROWS[1]!), after: imageOf(ROWS[1]!, { state: "held",
        held_because: ["card_reference", "living_person_review"], state_changed_at: "2026-11-18T09:00:00+00:00" }) },
    ] });
    // Saving them fails: nothing is committed.
    const failing = fakeClient();
    await expect(holdForLivingPersonReview(failing.client, { schema: "living_evidence", publications: ["P-1001"],
      apply: true, at: AT, saveImages: async () => { throw new Error("disk full"); } })).rejects.toThrow("disk full");
    expect(failing.calls.map(({ text }) => text.trim().split(/\s/u)[0]).at(-1)).toBe("ROLLBACK");
    expect(failing.calls.some(({ text }) => text === "COMMIT")).toBe(false);
    // Without a place to save them, --apply refuses before it reads anything.
    const unsaved = fakeClient();
    await expect(holdForLivingPersonReview(unsaved.client, { schema: "living_evidence", publications: ["P-1001"],
      apply: true, at: AT })).rejects.toThrow("HOLD_SCRIPT_IMAGES_REQUIRED");
    expect(unsaved.calls).toEqual([]);
  });

  it("puts a held row back only if nothing else changed it since, and says what it did with each", async () => {
    const before = { publication_number: "P-1001", state: "unreviewed", held_because: null, state_changed_at: "2026-11-17T09:00:00+00:00" };
    const images: HoldScriptImages = { schema: "living_evidence", heldAt: AT, images: [
      { publication: "P-1001", before, after: { ...before, state: "held", held_because: ["living_person_review"],
        state_changed_at: "2026-11-18T09:00:00+00:00" } },
      { publication: "P-1002", before: { ...before, publication_number: "P-1002", state: "held",
        held_because: ["card_reference"] }, after: { ...before, publication_number: "P-1002", state: "held",
        held_because: ["card_reference", "living_person_review"], state_changed_at: "2026-11-18T09:00:00+00:00" } },
      { publication: "P-1003", before: { ...before, publication_number: "P-1003" }, after: { ...before,
        publication_number: "P-1003", state: "held", held_because: ["living_person_review"] } },
    ] };
    // As the database holds them now: P-1001 as the hold left it, P-1002 changed since (the owner accepted it), and
    // P-1003 gone.
    const now = new Map<string, Record<string, unknown>>([["P-1001", images.images[0]!.after],
      ["P-1002", { ...images.images[1]!.after, state: "accepted" }]]);
    const run = async (apply: boolean) => {
      const calls: Array<{ text: string; values?: unknown[] }> = [];
      const client: HoldScriptClient = {
        async query<Row extends object>(text: string, values?: unknown[]) {
          calls.push({ text, ...(values === undefined ? {} : { values }) });
          const row = values === undefined ? undefined : now.get(values[0] as string);
          if (text.startsWith("SELECT")) {
            return { rows: (row === undefined ? [] : [{ state: row.state,
              unchanged: JSON.stringify(row) === values![1] }]) as unknown as Row[] };
          }
          return { rows: (text.trim().startsWith("UPDATE") ? [{ state: values![1],
            held_because: values![2] === null ? null : JSON.parse(values![2] as string) }] : []) as unknown as Row[] };
        },
      };
      return { result: await restoreLivingPersonHolds(client, { images, apply }), calls };
    };
    const dry = await run(false);
    expect(dry.calls.map(({ text }) => text.trim().split(/\s/u)[0])).toEqual(["BEGIN", "SET", "SELECT", "SELECT", "SELECT",
      "ROLLBACK"]);
    expect(dry.calls[0]!.text).toBe("BEGIN READ ONLY");
    expect(dry.result.text).toBe([
      "P-1001: would be put back as it was before the hold (unreviewed).",
      "P-1002: changed since the hold (now accepted), so it stays as it is.",
      "P-1003: no such publication; unchanged.",
      "Dry run: nothing was changed. Run again with --apply to put back the 1 that would be put back.",
    ].join("\n"));
    const applied = await run(true);
    expect(applied.calls.map(({ text }) => text.trim().split(/\s/u)[0])).toEqual(["BEGIN", "SET", "SELECT", "UPDATE",
      "SELECT", "SELECT", "COMMIT"]);
    expect(applied.calls[2]!.text).toContain("FOR UPDATE");
    const update = applied.calls[3]!;
    expect(update.text).toContain("SET state = $2, held_because = $3::jsonb, state_changed_at = $4::timestamptz");
    expect(update.text).toContain("WHERE stored.publication_number = $1 AND to_jsonb(stored.*) = $5::jsonb");
    expect(update.values).toEqual(["P-1001", "unreviewed", null, "2026-11-17T09:00:00+00:00",
      JSON.stringify(images.images[0]!.after)]);
    expect(applied.result.lines.map(({ outcome }) => outcome)).toEqual(["restored", "changed_since", "not_found"]);
    expect(applied.result.text.split("\n").at(-1)).toBe("Put back 1 as it was before the hold; nothing else changed. " +
      "The pages show it as before within a minute.");
    // A file that isn't a hold's before-images is refused before anything is read.
    for (const wrong of [{ ...images, schema: "x; DROP" }, { ...images, images: [] },
      { ...images, images: [{ ...images.images[0]!, before: { ...before, state: "accepted" } }] },
      { ...images, images: [{ ...images.images[0]!, publication: "P-1002" }] }]) {
      const { client, calls } = fakeClient();
      await expect(restoreLivingPersonHolds(client, { images: wrong as HoldScriptImages, apply: true }))
        .rejects.toThrow(/HOLD_SCRIPT_(?:IMAGES_INVALID|SCHEMA_INVALID)/u);
      expect(calls).toEqual([]);
    }
  });

  // Codex's fifth review of 17 Nov 2026 (P0): a manual hold, then a save that says the finding names a living person,
  // then the restore. The table's rule keeps it held (migration 0041), and the restore says so, with the reason; the
  // PostgreSQL acceptance runs the same on the database and reads its page.
  it("keeps held, and says so, a finding a later save stored as naming a living person", async () => {
    const before = { publication_number: "P-1001", state: "unreviewed", held_because: null,
      state_changed_at: "2026-11-17T09:00:00+00:00" };
    const after = { ...before, state: "held", held_because: ["living_person_review"],
      state_changed_at: "2026-11-18T09:00:00+00:00" };
    const images: HoldScriptImages = { schema: "living_evidence", heldAt: AT, images: [{ publication: "P-1001", before, after }] };
    const run = async (apply: boolean) => {
      const calls: string[] = [];
      const client: HoldScriptClient = {
        async query<Row extends object>(text: string) {
          calls.push(text);
          if (text.startsWith("SELECT")) {
            return { rows: [{ state: "held", unchanged: true, living_person_yes: true }] as unknown as Row[] };
          }
          // As the trigger leaves it: the restore's write ends held.
          return { rows: (text.trim().startsWith("UPDATE") ? [{ state: "held", held_because: ["living_person_review"] }]
            : []) as unknown as Row[] };
        },
      };
      return { result: await restoreLivingPersonHolds(client, { images, apply }), calls };
    };
    const dry = await run(false);
    expect(dry.calls[2]).toContain("atlas_living_person_readings readings");
    expect(dry.calls[2]).toContain("stored.owner_decided_at IS NULL");
    expect(dry.result.lines).toEqual([{ publication: "P-1001", outcome: "kept_held", state: "unreviewed",
      heldBecause: ["living_person_review"] }]);
    const applied = await run(true);
    expect(applied.result.lines).toEqual([{ publication: "P-1001", outcome: "kept_held", state: "unreviewed",
      heldBecause: ["living_person_review"] }]);
    expect(applied.result.text).toBe([
      "P-1001: kept held, with no page (living_person_review): a save since the hold says it may name a living " +
        "person, and you haven't decided it. Your accept_finding or edit_finding shows it.",
      "Put back 0 as it was before the hold; nothing else changed. The pages show them as before within a minute. " +
        "1 stays held because it may name a living person.",
    ].join("\n"));
  });

  it("is named in the release with its dry run, and no migration holds anything already on the pages", async () => {
    const readme = await readFile(new URL("../infra/living-evidence-production/README.md", import.meta.url), "utf8");
    expect(readme).toContain("`DATABASE_URL=… npx tsx scripts/atlas-hold-living-person-findings.mts P-1001 …`,\nwhich " +
      "only says what it would do until run again with `--apply`.");
    // Codex's third review of 17 Nov 2026, finding 4: its undo.
    expect(readme).toContain("`--restore=FILE`");
    for (const name of ["0021_atlas_publications", "0041_atlas_show_saved_findings"]) {
      const migration = await readFile(new URL(`../packages/evidence-repository/migrations/${name}.sql`, import.meta.url), "utf8");
      // Outside the functions it defines, which run only when called (0041's hold for a later save's yes).
      const statements = migration.replace(/\$function\$[\s\S]*?\$function\$/gu, "");
      expect(statements).not.toMatch(/UPDATE atlas_publications[^;]*living_person_review/u);
      expect(statements).not.toMatch(/UPDATE atlas_publications/u);
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
