import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import { ATLAS_PUBLICATION_HOLD_REASONS } from "../packages/evidence-repository/src/index.js";

// Codex's re-review of 17 Nov 2026, finding 1, for the owner to use once he has answered question 346: findings
// already on the Atlas are touched by no migration, so this puts the ones he names in the held state with the reason
// living_person_review, as the save now holds a finding that names a living person. A held finding has no page; the
// pages' cache drops a page within a minute. Only an unreviewed finding with its texts, or one held for another reason,
// changes: what the owner has decided (accepted, edited or rejected), a withdrawn one and one whose texts are erased
// stay as they are. Each finding's kept-for-research mark and how it reached the pages stay as they are.
//
// Dry run by default: it reads and says what it would do. With --apply it does it, in one transaction that locks the
// rows first. It runs as the one-shot admin that runs migrate (DATABASE_URL), since the review role reaches the table
// only through its functions.
//
//   DATABASE_URL=… npx tsx scripts/atlas-hold-living-person-findings.mts [--apply] [--schema=living_evidence] P-1001 …

export const LIVING_PERSON_HOLD = "living_person_review";
const PUBLICATION_NUMBER = /^P-[1-9][0-9]{3,}$/u;
const SCHEMA = /^[a-z][a-z0-9_]{0,62}$/u;
/** The most publications one run names. */
export const HOLD_SCRIPT_MAX = 500;

/** A publication as the script reads it. */
export interface HoldScriptRow {
  publication_number: string;
  state: string;
  held_because: string[] | null;
  published: boolean;
}

export type HoldScriptOutcome = "held" | "reason_added" | "already_held" | "decided" | "withdrawn" | "erased" | "not_found";

export interface HoldScriptLine {
  publication: string;
  outcome: HoldScriptOutcome;
  /** The state it is in before the run. */
  state: string | null;
  /** The reasons it is held for after the run, for one this run holds. */
  heldBecause: string[] | null;
}

/** What a run does with each publication named, from the rows as they are; names it doesn't find are not_found. */
export function planLivingPersonHolds(publications: readonly string[], rows: readonly HoldScriptRow[]): HoldScriptLine[] {
  return [...new Set(publications)].map((publication) => {
    const row = rows.find(({ publication_number: number }) => number === publication);
    if (row === undefined) return { publication, outcome: "not_found", state: null, heldBecause: null };
    const line = (outcome: HoldScriptOutcome, heldBecause: string[] | null = null): HoldScriptLine =>
      ({ publication, outcome, state: row.state, heldBecause });
    if (row.state === "accepted" || row.state === "edited" || row.state === "rejected") return line("decided");
    if (row.state === "withdrawn") return line("withdrawn");
    if (!row.published) return line("erased");
    if (row.state === "held") {
      const reasons = row.held_because ?? [];
      if (reasons.includes(LIVING_PERSON_HOLD)) return line("already_held");
      const wanted = new Set([...reasons, LIVING_PERSON_HOLD]);
      return line("reason_added", ATLAS_PUBLICATION_HOLD_REASONS.filter((reason) => wanted.has(reason)));
    }
    return row.state === "unreviewed" ? line("held", [LIVING_PERSON_HOLD]) : line("decided");
  });
}

const changes = (line: HoldScriptLine) => line.outcome === "held" || line.outcome === "reason_added";

/** One line of what the run did, or would do, with a publication, as the owner reads it. */
export function holdScriptText(line: HoldScriptLine, applied: boolean): string {
  const would = (done: string, maybe: string) => applied ? done : maybe;
  switch (line.outcome) {
    case "held":
      return `${line.publication}: ${would("held", "would be held")} for your decision, with no page: it may name a living person.`;
    case "reason_added":
      return `${line.publication}: already held for another reason; ${would("now also held", "would also be held")} ` +
        "because it may name a living person.";
    case "already_held":
      return `${line.publication}: already held because it may name a living person; unchanged.`;
    case "decided":
      return `${line.publication}: you have decided it (${line.state}); unchanged.`;
    case "withdrawn":
      return `${line.publication}: withdrawn, so it has no page; unchanged.`;
    case "erased":
      return `${line.publication}: its published texts are erased, so it has no page; unchanged.`;
    case "not_found":
      return `${line.publication}: no such publication; unchanged.`;
  }
}

/** The part of a pg client the run uses. */
export interface HoldScriptClient {
  query<Row extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>;
}

/**
 * Reads the publications named and, with apply, holds those it can, in one transaction that locks their rows first,
 * so a save or an owner's action at the same moment is not overwritten. Without apply it changes nothing.
 */
export async function holdForLivingPersonReview(client: HoldScriptClient, input: {
  schema: string;
  publications: readonly string[];
  apply: boolean;
  at: string;
}): Promise<{ applied: boolean; lines: HoldScriptLine[]; text: string }> {
  if (!SCHEMA.test(input.schema)) throw new Error("HOLD_SCRIPT_SCHEMA_INVALID");
  const publications = [...new Set(input.publications)];
  if (publications.length < 1 || publications.length > HOLD_SCRIPT_MAX ||
    !publications.every((number) => PUBLICATION_NUMBER.test(number)) || Number.isNaN(Date.parse(input.at))) {
    throw new Error("HOLD_SCRIPT_INPUT_INVALID: give 1 to 500 P numbers, such as P-1001");
  }
  const select = `SELECT publication_number, state, held_because, published_json IS NOT NULL AS published
    FROM ${input.schema}.atlas_publications WHERE publication_number = ANY($1::text[])
    ORDER BY substring(publication_number FROM 3)::bigint`;
  let lines: HoldScriptLine[];
  if (!input.apply) {
    lines = planLivingPersonHolds(publications, (await client.query<HoldScriptRow>(select, [publications])).rows);
  } else {
    await client.query("BEGIN");
    try {
      lines = planLivingPersonHolds(publications,
        (await client.query<HoldScriptRow>(`${select} FOR UPDATE`, [publications])).rows);
      for (const line of lines.filter(changes)) {
        await client.query(`UPDATE ${input.schema}.atlas_publications
          SET state = 'held', held_because = $2::jsonb, state_changed_at = greatest($3::timestamptz, state_changed_at)
          WHERE publication_number = $1 AND state IN ('unreviewed', 'held')`,
        [line.publication, JSON.stringify(line.heldBecause), input.at]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
  const count = lines.filter(changes).length;
  const closing = input.apply
    ? `Held ${count} for your decision; nothing else changed. The pages stop showing them within a minute.`
    : `Dry run: nothing was changed. Run again with --apply to hold the ${count} that would be held.`;
  return { applied: input.apply, lines, text: [...lines.map((line) => holdScriptText(line, input.apply)), closing].join("\n") };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const schema = args.find((arg) => arg.startsWith("--schema="))?.slice("--schema=".length) ?? "living_evidence";
  const publications = args.filter((arg) => !arg.startsWith("--"));
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--apply" && !arg.startsWith("--schema="));
  if (unknown.length > 0) throw new Error(`HOLD_SCRIPT_OPTION_UNKNOWN: ${unknown.join(" ")}`);
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim() === "") throw new Error("DATABASE_URL_REQUIRED");
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const result = await holdForLivingPersonReview(client, { schema, publications, apply, at: new Date().toISOString() });
    process.stdout.write(`${result.text}\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
