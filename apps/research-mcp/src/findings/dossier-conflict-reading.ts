import { z } from "zod";

import { DOSSIER_PRIVACY_READING_MODEL } from "./dossier-privacy-reading.js";

/**
 * AskRigor#477 stage 2 (Codex's review of stage 2, findings 3 and 4): the meaning-based comparison of a new public
 * dossier's findings with those of the dossiers already shown on the same or a linked topic, made only while public
 * dossiers are on and only when some shown dossier is a candidate. It runs on the research planner's own Claude API
 * path (research-planner.ts: the same key file, client, daily cap and spending record) with the smallest model that
 * path prices, as the privacy reading does, and answers which pairs of findings conflict, by their ids, never words.
 * "Benefit against harm on the same outcome" counts. A reading that cannot be made (the planner off, a request too
 * long for one call, the day's cap reached, a timeout, an error, a declined or unreadable reply) holds the copy,
 * waiting for the conflict check. Nothing is retried, and no call starts once the save's outer deadline has passed
 * (Codex's re-review of stage 2: the save stops waiting then, so a later call would be paid for nothing).
 */
export const DOSSIER_CONFLICT_READING_MODEL = DOSSIER_PRIVACY_READING_MODEL;

/** One call's bounds: the request's characters, the reply's tokens and the wait. Larger sets go in several calls. */
export const DOSSIER_CONFLICT_READING_LIMITS = Object.freeze({ characters: 64_000, outputTokens: 2_048, timeoutMs: 15_000 });

/** Held against the planner's day's cap while a call runs, settled with its real cost (more than its dearest call). */
export const DOSSIER_CONFLICT_READING_RESERVED_USD = 0.02;

export const DOSSIER_CONFLICT_UNAVAILABLE = [
  "off", "too_long", "daily_budget", "timeout", "error", "refusal", "unreadable",
] as const;

/** A finding as the reader is given it: what it claims, of what kind, for whom, for which form, and how much it matters. */
export interface DossierConflictFinding {
  id: string;
  claim: string;
  kind: string;
  applies_to: string;
  form?: string;
  importance: string;
}

export interface DossierConflictSide {
  topic: string;
  other_names: string[];
  forms: string[];
  findings: DossierConflictFinding[];
}

/** The new dossier, and each candidate shown dossier by its public number. */
export interface DossierConflictRequest {
  dossier: DossierConflictSide;
  shown: Array<DossierConflictSide & { dossier: string }>;
}

/** A finding of the new dossier, the shown dossier and its finding that conflicts with it. */
export interface DossierConflict { finding: string; dossier: string; theirs: string }

export type DossierConflictReading =
  | { status: "read"; conflicts: DossierConflict[] }
  | { status: "unavailable"; reason: typeof DOSSIER_CONFLICT_UNAVAILABLE[number] };

export type DossierConflictReader = (request: DossierConflictRequest) => Promise<DossierConflictReading>;

/** One call of the planner's path: the reply's JSON, or why there is none. */
export type DossierConflictCall = (body: string) => Promise<
  | { status: "reply"; reply: unknown }
  | { status: "unavailable"; reason: typeof DOSSIER_CONFLICT_UNAVAILABLE[number] }>;

export const DOSSIER_CONFLICT_READING_RUBRIC = [
  "You compare the findings of a new research dossier with the findings of research dossiers already shown on the",
  "same or a linked topic. Each finding comes with its id, its claim, its kind, the people it applies to, its form",
  "and how much it matters. Forms and topics may go by other names; treat another name for the same form as the same",
  "form.",
  "",
  "Report every pair of a new finding and a shown finding that conflict: both cannot be right for the same option",
  "(the same form, or a form that includes it), the same outcome and overlapping people. These count as conflicts: a",
  "benefit against a harm on the same outcome; helps or harms against no measured difference; opposite directions",
  "of effect; a claim that something is safe against one that it harms; one finding correcting what the other",
  "claims.",
  "",
  "These are not conflicts: findings about clearly different outcomes, people or forms; a finding that something is",
  "not known beside one that reports a result; findings that agree in direction but differ in size or certainty.",
  "When unsure whether a pair conflicts, report it.",
  "",
  "Answer only with the JSON object the schema asks for: conflicts, a list of {finding, dossier, theirs}: the new",
  "finding's id, the shown dossier's number and the shown finding's id, exactly as given; an empty list when none.",
].join("\n");

export const DOSSIER_CONFLICT_READING_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["conflicts"],
  properties: {
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["finding", "dossier", "theirs"],
        properties: { finding: { type: "string" }, dossier: { type: "string" }, theirs: { type: "string" } },
      },
    },
  },
});

const replySchema = z.object({
  conflicts: z.array(z.object({ finding: z.string(), dossier: z.string(), theirs: z.string() }).strict()).max(500),
}).strict();

/**
 * The request in calls of at most DOSSIER_CONFLICT_READING_LIMITS.characters each: the new dossier with as many shown
 * dossiers as fit. Undefined when the new dossier with one shown dossier is already too long for a call.
 */
export function dossierConflictBatches(request: DossierConflictRequest): DossierConflictRequest[] | undefined {
  const size = (batch: DossierConflictRequest) => JSON.stringify(batch).length;
  const batches: DossierConflictRequest[] = [];
  let current: DossierConflictRequest = { dossier: request.dossier, shown: [] };
  for (const shown of request.shown) {
    const next = { dossier: request.dossier, shown: [...current.shown, shown] };
    if (size(next) <= DOSSIER_CONFLICT_READING_LIMITS.characters) {
      current = next;
      continue;
    }
    if (current.shown.length === 0) return undefined;
    batches.push(current);
    current = { dossier: request.dossier, shown: [shown] };
    if (size(current) > DOSSIER_CONFLICT_READING_LIMITS.characters) return undefined;
  }
  if (current.shown.length > 0) batches.push(current);
  return batches;
}

/**
 * The conflicts in a reply, or undefined for a reply that is not a reading: not the schema's object, or naming a
 * finding or a dossier the request did not give (then the comparison could not be trusted, and the copy is held).
 */
export function dossierConflictsOf(reply: unknown, batch: DossierConflictRequest): DossierConflict[] | undefined {
  const parsed = replySchema.safeParse(reply);
  if (!parsed.success) return undefined;
  const mine = new Set(batch.dossier.findings.map(({ id }) => id));
  const theirs = new Map(batch.shown.map((shown) => [shown.dossier, new Set(shown.findings.map(({ id }) => id))]));
  const conflicts: DossierConflict[] = [];
  for (const conflict of parsed.data.conflicts) {
    if (!mine.has(conflict.finding) || theirs.get(conflict.dossier)?.has(conflict.theirs) !== true) return undefined;
    conflicts.push(conflict);
  }
  return conflicts;
}

/**
 * The whole comparison, one call per batch on the planner's path; any call that cannot be made makes it unavailable,
 * and so does the outer deadline (stopAt, a time in milliseconds): once it has passed, no further batch starts.
 */
export async function readDossierConflicts(request: DossierConflictRequest, call: DossierConflictCall,
  options: { stopAt?: number; now?: () => number } = {}): Promise<DossierConflictReading> {
  if (request.shown.length === 0) return { status: "read", conflicts: [] };
  const batches = dossierConflictBatches(request);
  if (batches === undefined) return { status: "unavailable", reason: "too_long" };
  const now = options.now ?? Date.now;
  const conflicts: DossierConflict[] = [];
  for (const batch of batches) {
    if (options.stopAt !== undefined && now() >= options.stopAt) return { status: "unavailable", reason: "timeout" };
    const answered = await call(JSON.stringify(batch));
    if (answered.status === "unavailable") return answered;
    const found = dossierConflictsOf(answered.reply, batch);
    if (found === undefined) return { status: "unavailable", reason: "unreadable" };
    conflicts.push(...found);
  }
  return { status: "read", conflicts };
}

/**
 * The conflict reader a save uses: the planner's path, starting no batch once the save's outer deadline (stopAt) has
 * passed; with the planner off there is no reading. Either way the copy is then held, waiting for the conflict check.
 */
export function deadlineConflictReader(call: DossierConflictCall | undefined, stopAt: number,
  now: () => number = Date.now): DossierConflictReader {
  return async (request) => call === undefined ? { status: "unavailable", reason: "off" }
    : await readDossierConflicts(request, call, { stopAt, now });
}
