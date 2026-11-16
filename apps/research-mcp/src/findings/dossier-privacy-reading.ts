import { z } from "zod";

/**
 * AskRigor#477 stage 1, off by default (ASKRIGOR_DOSSIER_PRIVACY_READING=on is the owner's decision; Codex's final
 * check): a meaning-based reading of a research dossier's text fields before it is stored, after the deterministic
 * screen (dossier-privacy.ts) has passed them. It runs on the research planner's own Claude API path
 * (research-planner.ts: the same key file, client, daily cap and spending record), with the smallest model that path
 * prices, and answers pass, or refuse with a reason from a fixed list and the field's path, never words of the text.
 * With the setting on, a dossier is saved only after a pass: a refusal, and a reading that cannot be made (the planner
 * off, a text too long for one call, the day's cap reached, a timeout, an error, a declined or unreadable reply), keep
 * it unsaved. Nothing is retried.
 */
export const DOSSIER_PRIVACY_READING_MODEL = "claude-haiku-5-5";

/**
 * One call's bounds: the request's characters, the reply's tokens and the wait. A typical dossier's text fields come
 * to about 7,500 characters; 64,000 holds one with 30 long conclusions and 40 studies described in full, and only a
 * dossier near the schema's every limit (some 144,000) is too long, and so not saved while the reading is on.
 */
export const DOSSIER_PRIVACY_READING_LIMITS = Object.freeze({ characters: 64_000, outputTokens: 1_024, timeoutMs: 8_000 });

/**
 * Held against the planner's day's cap while a reading runs, settled with its real cost: more than the dearest reading
 * can cost at the model's list price (64,000 characters at most one token each, the rubric and 1,024 reply tokens:
 * about USD 0.0069).
 */
export const DOSSIER_PRIVACY_READING_RESERVED_USD = 0.01;

export const DOSSIER_PRIVACY_REFUSALS = [
  "names_a_person", "birth_date", "where_someone_lives", "contact_details", "personal_health_story",
  "relative_or_household", "copied_conversation", "other_personal_detail",
] as const;
export const DOSSIER_PRIVACY_UNAVAILABLE = [
  "off", "too_long", "daily_budget", "timeout", "error", "refusal", "unreadable",
] as const;

export type DossierPrivacyReading =
  | { status: "pass" }
  | { status: "refuse"; reason: typeof DOSSIER_PRIVACY_REFUSALS[number]; path?: string }
  | { status: "unavailable"; reason: typeof DOSSIER_PRIVACY_UNAVAILABLE[number] };

/** One text field of a dossier, by its path, as the deterministic screen reads it. */
export interface DossierText { path: string; text: string }

export type DossierPrivacyReader = (texts: readonly DossierText[]) => Promise<DossierPrivacyReading>;

export const DOSSIER_PRIVACY_READING_RUBRIC = [
  "You read the text fields of a research dossier before AskRigor stores it privately for its owner. A dossier must",
  "describe research in general terms and nothing about any particular person. Each field comes with its path.",
  "",
  "Refuse the dossier when any field holds personal content about a particular person: a private individual's name",
  "(a study's author, an eponym or a trial's name is not one); a date of birth given as a value; where a particular",
  "person lives, works or is treated; contact details; the asker's own or a relative's health story, symptoms,",
  "treatments, doses taken or circumstances, in the first or the third person, reworded or not; what a household or",
  "a family member tried or felt; text copied from a conversation.",
  "",
  "Pass research text: study populations and their sizes, outcomes, numbers, doses studied, authors before \"et al.\",",
  "a field's name such as \"date of birth was recorded as a covariate\", the researchers' own \"we\", a published case",
  "report described as research. When unsure, refuse.",
  "",
  "Answer only with the JSON object the schema asks for: decision pass or refuse; reason none for a pass, otherwise",
  "the one category that fits best; path the refused field's path exactly as given, or an empty string for a pass.",
].join("\n");

export const DOSSIER_PRIVACY_READING_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["decision", "reason", "path"],
  properties: {
    decision: { type: "string", enum: ["pass", "refuse"] },
    reason: { type: "string", enum: ["none", ...DOSSIER_PRIVACY_REFUSALS] },
    path: { type: "string" },
  },
});

const replySchema = z.object({
  decision: z.enum(["pass", "refuse"]),
  reason: z.enum(["none", ...DOSSIER_PRIVACY_REFUSALS]),
  path: z.string().max(300),
}).strict();

/**
 * The request's text, or undefined when it is longer than one call may send (then nothing is sent, and the dossier is
 * not saved): the fields by path, as JSON.
 */
export function dossierPrivacyReadingRequest(texts: readonly DossierText[]): string | undefined {
  const body = JSON.stringify({ texts: texts.map(({ path, text }) => ({ path, text })) });
  return body.length > DOSSIER_PRIVACY_READING_LIMITS.characters ? undefined : body;
}

/**
 * The reading from a reply, or undefined for a reply that is not one: not the schema's object, a pass that names a
 * category, or a refusal that names none. A refused field's path is kept only when it is one of the paths sent.
 */
export function dossierPrivacyReadingOf(reply: unknown, paths: ReadonlySet<string>): DossierPrivacyReading | undefined {
  const parsed = replySchema.safeParse(reply);
  if (!parsed.success) return undefined;
  const { decision, reason, path } = parsed.data;
  if (decision === "pass") return reason === "none" ? { status: "pass" } : undefined;
  if (reason === "none") return undefined;
  return { status: "refuse", reason, ...(paths.has(path) ? { path } : {}) };
}
