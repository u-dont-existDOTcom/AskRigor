import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

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
// Codex's third review of 17 Nov 2026, finding 4: show_on_pages can't undo a hold, so --apply saves a before-image of
// each row it changes, and the row as the hold left it, to a file (--images=FILE, or one named for the time in the
// current directory) before it commits; if the file can't be written, nothing is changed. --restore=FILE puts each row
// back as it was before the hold, only if nothing else changed it since (it is still exactly as the hold left it), and
// says what it would do until run again with --apply.
//
//   DATABASE_URL=… npx tsx scripts/atlas-hold-living-person-findings.mts [--apply [--images=FILE]] [--schema=…] P-1001 …
//   DATABASE_URL=… npx tsx scripts/atlas-hold-living-person-findings.mts --restore=FILE [--apply]

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
  /** The whole row, as PostgreSQL's to_jsonb gives it in UTC; read with --apply, for its before-image. */
  image?: Record<string, unknown>;
}

/** What --apply saves before it commits: each row it changed, as it was before and as the hold left it. */
export interface HoldScriptImages {
  schema: string;
  heldAt: string;
  images: Array<{ publication: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
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
  /** With apply: saves the changed rows' before-images; called before the commit, and its failure changes nothing. */
  saveImages?: (images: HoldScriptImages) => Promise<void>;
}): Promise<{ applied: boolean; lines: HoldScriptLine[]; text: string }> {
  if (!SCHEMA.test(input.schema)) throw new Error("HOLD_SCRIPT_SCHEMA_INVALID");
  const publications = [...new Set(input.publications)];
  if (publications.length < 1 || publications.length > HOLD_SCRIPT_MAX ||
    !publications.every((number) => PUBLICATION_NUMBER.test(number)) || Number.isNaN(Date.parse(input.at))) {
    throw new Error("HOLD_SCRIPT_INPUT_INVALID: give 1 to 500 P numbers, such as P-1001");
  }
  if (input.apply && input.saveImages === undefined) throw new Error("HOLD_SCRIPT_IMAGES_REQUIRED");
  const select = `SELECT publication_number, state, held_because, published_json IS NOT NULL AS published
    FROM ${input.schema}.atlas_publications WHERE publication_number = ANY($1::text[])
    ORDER BY substring(publication_number FROM 3)::bigint`;
  let lines: HoldScriptLine[];
  if (!input.apply) {
    lines = planLivingPersonHolds(publications, (await client.query<HoldScriptRow>(select, [publications])).rows);
  } else {
    await client.query("BEGIN");
    try {
      // Every image in UTC, so a restore in another session compares it exactly.
      await client.query("SET LOCAL TimeZone = 'UTC'");
      const rows = (await client.query<HoldScriptRow>(`SELECT publication_number, state, held_because,
        published_json IS NOT NULL AS published, to_jsonb(stored.*) AS image
        FROM ${input.schema}.atlas_publications stored WHERE publication_number = ANY($1::text[])
        ORDER BY substring(publication_number FROM 3)::bigint FOR UPDATE`, [publications])).rows;
      lines = planLivingPersonHolds(publications, rows);
      const images: HoldScriptImages = { schema: input.schema, heldAt: input.at, images: [] };
      for (const line of lines.filter(changes)) {
        const after = (await client.query<{ image: Record<string, unknown> }>(`UPDATE ${input.schema}.atlas_publications stored
          SET state = 'held', held_because = $2::jsonb, state_changed_at = greatest($3::timestamptz, state_changed_at)
          WHERE publication_number = $1 AND state IN ('unreviewed', 'held')
          RETURNING to_jsonb(stored.*) AS image`,
        [line.publication, JSON.stringify(line.heldBecause), input.at])).rows[0]?.image;
        const before = rows.find(({ publication_number: number }) => number === line.publication)?.image;
        if (before === undefined || after === undefined) throw new Error("HOLD_SCRIPT_IMAGE_MISSING");
        images.images.push({ publication: line.publication, before, after });
      }
      if (images.images.length > 0) await input.saveImages!(images);
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

export type RestoreScriptOutcome = "restored" | "kept_held" | "changed_since" | "not_found";

export interface RestoreScriptLine {
  publication: string;
  outcome: RestoreScriptOutcome;
  /**
   * Its state before the hold, for one put back or kept held; its state now, for one changed since; null when not
   * found.
   */
  state: string | null;
  /**
   * For one kept held (Codex's fifth review of 17 Nov 2026): the reasons it stays held for, living_person_review among
   * them, since a save stored that it names a living person and the owner hasn't decided it.
   */
  heldBecause?: string[];
}

const imageObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a file read is a hold's before-images, each a row the hold changed from unreviewed or held. */
function validImages(images: HoldScriptImages): boolean {
  return imageObject(images) && typeof images.heldAt === "string" && Array.isArray(images.images) &&
    images.images.length >= 1 && images.images.length <= HOLD_SCRIPT_MAX &&
    new Set(images.images.map(({ publication }) => publication)).size === images.images.length &&
    images.images.every(({ publication, before, after }) => typeof publication === "string" &&
      PUBLICATION_NUMBER.test(publication) && imageObject(before) && imageObject(after) &&
      before.publication_number === publication && after.publication_number === publication &&
      (before.state === "unreviewed" ? before.held_because === null
        : before.state === "held" && Array.isArray(before.held_because) && before.held_because.length >= 1 &&
          before.held_because.every((reason) => (ATLAS_PUBLICATION_HOLD_REASONS as readonly unknown[]).includes(reason))) &&
      typeof before.state_changed_at === "string" && !Number.isNaN(Date.parse(before.state_changed_at)));
}

/** One line of what a restore did, or would do, with a publication, as the owner reads it. */
export function restoreScriptText(line: RestoreScriptLine, applied: boolean): string {
  switch (line.outcome) {
    case "restored":
      return `${line.publication}: ${applied ? "put" : "would be put"} back as it was before the hold (${line.state}).`;
    case "kept_held":
      return `${line.publication}: ${applied ? "kept" : "would be kept"} held, with no page (${(line.heldBecause ?? [])
        .join(", ")}): a save since the hold says it may name a living person, and you haven't decided it. Your ` +
        "accept_finding or edit_finding shows it.";
    case "changed_since":
      return `${line.publication}: changed since the hold (now ${line.state}), so it stays as it is.`;
    case "not_found":
      return `${line.publication}: no such publication; unchanged.`;
  }
}

/**
 * Codex's third review of 17 Nov 2026, finding 4: puts each row a hold changed back as its before-image has it (its
 * state, reasons and time of change, the only columns the hold changes), only if nothing else changed it since: the
 * whole row must still be exactly as the hold left it. In one transaction that locks each row first; without apply it
 * reads only, and changes nothing.
 */
export async function restoreLivingPersonHolds(client: HoldScriptClient, input: { images: HoldScriptImages; apply: boolean }):
  Promise<{ applied: boolean; lines: RestoreScriptLine[]; text: string }> {
  const { images } = input;
  if (!imageObject(images) || typeof images.schema !== "string" || !SCHEMA.test(images.schema)) {
    throw new Error("HOLD_SCRIPT_SCHEMA_INVALID");
  }
  if (!validImages(images)) throw new Error("HOLD_SCRIPT_IMAGES_INVALID: not the before-images a hold saved");
  const lines: RestoreScriptLine[] = [];
  await client.query(input.apply ? "BEGIN" : "BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL TimeZone = 'UTC'");
    for (const { publication, before, after } of images.images) {
      // Codex's fifth review of 17 Nov 2026 (P0): the restore passes the table's rule (migration 0041's
      // atlas_publications_living_person_hold), as every writer does: a row a save has since stored as naming a living
      // person, that the owner hasn't decided, stays held. It reads that here for a dry run, and from the row the
      // restore wrote with --apply.
      const [now] = (await client.query<{ state: string; unchanged: boolean; living_person_yes: boolean }>(`SELECT
        stored.state, to_jsonb(stored.*) = $2::jsonb AS unchanged,
        stored.owner_decided_at IS NULL AND EXISTS (SELECT 1 FROM ${images.schema}.atlas_living_person_readings readings
          WHERE readings.card_number = stored.card_number AND readings.claim_key = stored.claim_key
            AND readings.reading = 'yes') AS living_person_yes
        FROM ${images.schema}.atlas_publications stored
        WHERE stored.publication_number = $1${input.apply ? " FOR UPDATE" : ""}`, [publication, JSON.stringify(after)])).rows;
      if (now === undefined) {
        lines.push({ publication, outcome: "not_found", state: null });
      } else if (now.unchanged !== true) {
        lines.push({ publication, outcome: "changed_since", state: now.state });
      } else {
        const beforeReasons = Array.isArray(before.held_because) ? before.held_because as string[] : [];
        let stays: string[] | undefined;
        if (input.apply) {
          const put = await client.query<{ state: string; held_because: string[] | null }>(`UPDATE
            ${images.schema}.atlas_publications stored
            SET state = $2, held_because = $3::jsonb, state_changed_at = $4::timestamptz
            WHERE stored.publication_number = $1 AND to_jsonb(stored.*) = $5::jsonb
            RETURNING stored.state, stored.held_because`,
          [publication, before.state, before.held_because === null ? null : JSON.stringify(before.held_because),
            before.state_changed_at, JSON.stringify(after)]);
          if (put.rows.length !== 1) throw new Error("HOLD_SCRIPT_RESTORE_RACED");
          const [written] = put.rows;
          if (written!.state !== before.state || !isDeepStrictEqual(written!.held_because, before.held_because)) {
            stays = written!.held_because ?? [];
          }
        } else if (now.living_person_yes && !beforeReasons.includes(LIVING_PERSON_HOLD)) {
          stays = [...beforeReasons, LIVING_PERSON_HOLD];
        }
        lines.push(stays === undefined ? { publication, outcome: "restored", state: String(before.state) }
          : { publication, outcome: "kept_held", state: String(before.state), heldBecause: stays });
      }
    }
    await client.query(input.apply ? "COMMIT" : "ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  const count = lines.filter(({ outcome }) => outcome === "restored").length;
  const held = lines.filter(({ outcome }) => outcome === "kept_held").length;
  const keptHeld = held === 0 ? "" : ` ${held} ${input.apply ? held === 1 ? "stays" : "stay" : "would stay"} held because ${held === 1 ? "it" : "they"} ` +
    "may name a living person.";
  const closing = input.apply
    ? `Put back ${count} as it was before the hold; nothing else changed. The pages show ${count === 1 ? "it" : "them"} ` +
      `as before within a minute.${keptHeld}`
    : `Dry run: nothing was changed. Run again with --apply to put back the ${count} that would be put back.${keptHeld}`;
  return { applied: input.apply, lines, text: [...lines.map((line) => restoreScriptText(line, input.apply)), closing].join("\n") };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);
  const schema = option("schema") ?? "living_evidence";
  const restore = option("restore");
  const publications = args.filter((arg) => !arg.startsWith("--"));
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--apply" &&
    !["--schema=", "--images=", "--restore="].some((prefix) => arg.startsWith(prefix)));
  if (unknown.length > 0) throw new Error(`HOLD_SCRIPT_OPTION_UNKNOWN: ${unknown.join(" ")}`);
  if (restore !== undefined && (publications.length > 0 || option("images") !== undefined || option("schema") !== undefined)) {
    throw new Error("HOLD_SCRIPT_RESTORE_TAKES_ONLY_ITS_FILE: --restore=FILE [--apply]");
  }
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim() === "") throw new Error("DATABASE_URL_REQUIRED");
  const at = new Date().toISOString();
  const imagesFile = resolve(option("images") ?? `atlas-living-person-holds-${at.replace(/[:.]/gu, "-")}.json`);
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    if (restore !== undefined) {
      const images = JSON.parse(await readFile(resolve(restore), "utf8")) as HoldScriptImages;
      process.stdout.write(`${(await restoreLivingPersonHolds(client, { images, apply })).text}\n`);
      return;
    }
    let saved = false;
    const result = await holdForLivingPersonReview(client, { schema, publications, apply, at,
      // Never over another file; readable by its owner alone, since a row holds the owner's private reasons.
      saveImages: async (images) => {
        await writeFile(imagesFile, `${JSON.stringify(images, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        saved = true;
      } });
    process.stdout.write(`${result.text}\n`);
    if (saved) {
      process.stdout.write(`Each changed row as it was before is saved in ${imagesFile}. Keep that file: ` +
        `--restore=${imagesFile} puts back each one nothing else has changed since.\n`);
    }
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
