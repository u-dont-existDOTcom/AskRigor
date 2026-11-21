import { z } from "zod";

/**
 * Promise P69 (the owner, chat, 21 Nov 2026: "we should also explain to people in the answer when a guardrail is
 * preventing you from considering something at your max intelligence"). The AI declares each research step a model's
 * or app's own safety rules limited, as it observed it or as the person reported it, in finalize_research's later input
 * safety_limits; AskRigor turns each into a limit that says who reports it, so the panel lists it whatever the answer
 * says without AskRigor vouching for it, and looks the answer's own sentence up with the other declared quotes.
 *
 * Only the quote lookup and the no-links rule are exact. Whether a safety rule did it, and what it cost the answer,
 * stay the reporter's judgment, which AskRigor does not confirm (AGENTS.md: meaning goes to a model, or to an exact
 * check of what it declares). Often a model cannot see its own guardrail (a classifier stops it from outside, or an
 * app switches models without telling the next one), so AskRigor never says there was no limit and never asks for a
 * declaration of none (Codex's red team of 21 Nov 2026: an acknowledgment, not evidence of absence).
 *
 * Everything here states a limit openly. Nothing rewords, splits or disguises a request to get past a model's rules,
 * nothing points to what a model declined to give (no links in an entry), and an entry is data, never an instruction
 * for research, retries or the choice of a model (design: owner-pages askrigor/guardrails/design.md).
 *
 * Off unless ASKRIGOR_SAFETY_LIMITS is "on" (config.ts). Every finding is a note or a limit: the six blocking checks
 * stay six (owner answers 193a, 195a and 217b). Notes name an entry by its place, never its words, because the
 * findings ledger keeps notes; the entries' words go back in the result's limits only.
 */
export const SAFETY_LIMIT_KINDS = ["refused", "stopped_and_switched", "narrowed", "softened", "other"] as const;
export const SAFETY_LIMIT_LEFT_OUT_HOW = ["not_examined", "examined_not_reported", "unknown"] as const;
export const SAFETY_LIMIT_REDONE = ["no", "same_model", "another_model"] as const;
export const SAFETY_LIMIT_RECOVERED = ["yes", "partly", "no", "unknown"] as const;
export const SAFETY_LIMIT_IMPACTS = ["detail", "confidence", "conclusion", "no_loss_identified", "unknown"] as const;
export const SAFETY_LIMIT_REPORTERS = ["ai", "person"] as const;
export const SAFETY_LIMITS_MAX = 20;

/** The fixed words every safety limit AskRigor writes carries after who reports it; the panel counts its own by them. */
export const SAFETY_LIMIT_MARK = "a model's safety rules limited a research step";
const REPORTED_BY: Readonly<Record<(typeof SAFETY_LIMIT_REPORTERS)[number], string>> = {
  ai: "As the AI reports, ",
  person: "As the person reports, ",
};
/** Each start a safety limit of AskRigor's can have. */
export const SAFETY_LIMIT_PREFIXES: readonly string[] = Object.values(REPORTED_BY).map((by) => by + SAFETY_LIMIT_MARK);

// A link or an address in an entry would point to what a model declined to give. Refused only in the forms whose shape
// is unambiguous (an exact, structural test): a scheme ("https://", "ftp://", "file:/", "mailto:"), a protocol-relative
// "//host", "www." and a DOI. A bare host name ("example.org") can't be told from ordinary text ("mg.kg", "dott.ssa") by
// its shape, nor a numeric IP address from a section number ("1.2.3.4"), so neither is tested: three rounds of review
// found such patterns either missing addresses or dropping ordinary words (Codex's review and rechecks of 21 Nov 2026),
// and AGENTS.md leaves a question of meaning to a model, not a longer pattern. The input's description asks for no address of any kind, and the limit is
// shown only to the person whose AI wrote it, in words attributed to that AI. A version written like a DOI
// ("10.1234/5") is refused; that entry is not used, and its note names the field to reword.
const LINK = /[a-z][a-z0-9+.-]*:\/\/|\bfile:\/|\bmailto:\S|(?:^|[^\w:/])\/\/[^\s/]|\bwww\.|\b10\.\d{4,9}\/\S/iu;
const words = (max: number) => z.string().trim().min(1).max(max)
  .refine((text) => !LINK.test(text), "No links, web addresses or DOIs: name the kind of content only.");

export const safetyLimitEntrySchema = z.object({
  step: words(200).describe("Which research step, in a few words, such as the search for people's reports or reading a study's tables."),
  kind: z.enum(SAFETY_LIMIT_KINDS).describe(
    "refused: a model declined the step or part of it. stopped_and_switched: a safety stop, and another model went on. " +
    "narrowed: the model said it would leave something out. softened: a finding came out weaker than its source " +
    "says, because of a safety rule. other: another change a safety rule made."),
  left_out: words(300).describe(
    "What was left out, in neutral words: the kind of content (such as dose amounts from the trial tables, or named " +
    "people's alleged misconduct), never the withheld content itself, an accusation, a link or how to find it."),
  left_out_how: z.enum(SAFETY_LIMIT_LEFT_OUT_HOW).describe(
    "not_examined: it was not read or weighed. examined_not_reported: it was read and weighed, but not reported. unknown."),
  redone: z.enum(SAFETY_LIMIT_REDONE).describe("Whether the step was done again: no, by the same model, or by another model."),
  recovered: z.enum(SAFETY_LIMIT_RECOVERED).describe("Whether doing it again recovered what was left out: yes, partly, no, or unknown (no when it was not done again)."),
  could_change: z.enum(SAFETY_LIMIT_IMPACTS).describe(
    "What the gap could change: a detail, the confidence, the conclusion, no_loss_identified (such as a model switch " +
    "with no known loss), or unknown."),
  affects: words(200).optional().describe("Which conclusion of the answer it could change, in a few words."),
  reported_by: z.enum(SAFETY_LIMIT_REPORTERS).describe(
    "ai: you observed it (a refusal you gave, a step you narrowed, a switch you saw). person: the person reported it, such as an app's prompt to switch models."),
  answer_quote: words(600).describe("The answer's own sentence saying it, in its limits note, copied exactly from answer_draft."),
}).strict();

export const safetyLimitsSchema = z.array(safetyLimitEntrySchema).min(1).max(SAFETY_LIMITS_MAX)
  .describe("At most 20: steps limited the same way go in one entry.");
export type SafetyLimitEntry = z.output<typeof safetyLimitEntrySchema>;
export type SafetyLimits = z.output<typeof safetyLimitsSchema>;
const ENTRY_FIELDS: ReadonlySet<string> = new Set(Object.keys(safetyLimitEntrySchema.shape));

const KIND_WORDS: Readonly<Record<SafetyLimitEntry["kind"], string>> = {
  refused: "a model refused it",
  stopped_and_switched: "a safety stop switched the model",
  narrowed: "the model narrowed it",
  softened: "a finding came out weaker than its source",
  other: "a safety rule changed it",
};
const LEFT_OUT_WORDS: Readonly<Record<SafetyLimitEntry["left_out_how"], string>> = {
  not_examined: "Left out, not examined:",
  examined_not_reported: "Examined but not reported:",
  unknown: "Left out:",
};
const REDONE_WORDS: Readonly<Record<SafetyLimitEntry["redone"], string>> = {
  no: "Not done again.",
  same_model: "Done again by the same model",
  another_model: "Done again by another model",
};
const RECOVERED_WORDS: Readonly<Record<SafetyLimitEntry["recovered"], string>> = {
  yes: ", which recovered it.",
  partly: ", which recovered part of it.",
  no: ", which did not recover it.",
  unknown: "; whether that recovered it is not known.",
};
const IMPACT_WORDS: Readonly<Record<SafetyLimitEntry["could_change"], string>> = {
  detail: "It could change a detail",
  confidence: "It could change the confidence",
  conclusion: "It could change the conclusion",
  no_loss_identified: "No loss was identified",
  unknown: "What it could change is not known",
};

/** The reporter's words inside a sentence of AskRigor's: one line, without the closing stop the sentence adds. */
const inline = (text: string): string => text.replace(/\s+/gu, " ").trim().replace(/[\s.;:!?]+$/u, "");

/** One declared limit in AskRigor's fixed words, saying who reports it, with the reporter's step and topic inside. */
export function safetyLimitSentence(entry: SafetyLimitEntry): string {
  const redone = entry.redone === "no" ? REDONE_WORDS.no : REDONE_WORDS[entry.redone] + RECOVERED_WORDS[entry.recovered];
  const impact = IMPACT_WORDS[entry.could_change] +
    (entry.affects === undefined || entry.could_change === "no_loss_identified" ? "." : ` in: ${inline(entry.affects)}.`);
  return `${REPORTED_BY[entry.reported_by]}${SAFETY_LIMIT_MARK} (${KIND_WORDS[entry.kind]}): ${inline(entry.step)}. ` +
    `${LEFT_OUT_WORDS[entry.left_out_how]} ${inline(entry.left_out)}. ${redone} ${impact}`;
}

export interface SafetyLimitReview {
  /** AskRigor's fixed-word limit for each usable entry, in the order given, each once. */
  limits: string[];
  /** Each usable entry's answer_quote, at its place, for the draft's declared-quote check. */
  quotes: Array<{ at: string; quote: string }>;
  /** Content-free notes: an entry not used, by its place and the schema's own field names, never a value or a key given. */
  notes: string[];
}

/** Why an entry is not used, in the schema's own words: its fields as the schema names them, never a key given. */
function unusedReason(issues: readonly z.core.$ZodIssue[]): string {
  const fields = new Set<string>();
  let unknown = false;
  let link = false;
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") { unknown = true; continue; }
    const field = issue.path[0];
    if (typeof field === "string" && ENTRY_FIELDS.has(field)) fields.add(field);
    if (issue.code === "custom") link = true;
  }
  const parts = [
    ...(fields.size === 0 ? [] : [`check ${[...fields].join(", ")}`]),
    ...(link ? ["take out the link, web address or DOI"] : []),
    ...(unknown ? ["leave out fields it doesn't take"] : []),
  ];
  return parts.length === 0 ? "give an object with its fields" : parts.join("; ");
}

/**
 * What the final check does with the declaration, when the switch is on: read here, entry by entry, so the input's
 * later shape takes any value and a call with the switch off parses and notes nothing (Codex's review of 21 Nov 2026).
 * A usable entry becomes a limit; one that isn't is a note by its place; nothing is asked when none was given.
 */
export function reviewSafetyLimits(declared: unknown): SafetyLimitReview {
  if (declared === undefined) return { limits: [], quotes: [], notes: [] };
  if (!Array.isArray(declared) || declared.length === 0) {
    return { limits: [], quotes: [], notes: [`later_inputs.safety_limits: not used: give a list of 1 to ${SAFETY_LIMITS_MAX} entries.`] };
  }
  const notes: string[] = [];
  const usable: Array<{ entry: SafetyLimitEntry; index: number }> = [];
  for (const [index, given] of declared.slice(0, SAFETY_LIMITS_MAX).entries()) {
    const parsed = safetyLimitEntrySchema.safeParse(given);
    if (parsed.success) usable.push({ entry: parsed.data, index });
    else notes.push(`later_inputs.safety_limits[${index}]: not used: ${unusedReason(parsed.error.issues)}.`);
  }
  if (declared.length > SAFETY_LIMITS_MAX) {
    notes.push(`later_inputs.safety_limits: only the first ${SAFETY_LIMITS_MAX} entries are used; put steps limited the same way in one entry.`);
  }
  return {
    limits: [...new Set(usable.map(({ entry }) => safetyLimitSentence(entry)))],
    quotes: usable.map(({ entry, index }) => ({ at: `safety_limits[${index}].answer_quote`, quote: entry.answer_quote })),
    notes,
  };
}

/**
 * What the meaning judge reads in a safety limit's place: the AI's own words stay in the result (Codex's review of 21
 * Nov 2026), and the list keeps its numbering, by which the check reads the judge's verdicts on limits.
 */
export const SAFETY_LIMIT_FOR_JUDGE = "A limit the AI reports about a model's safety rules; its words are not shown here.";

/** The call without safety_limits, at its top level and in later_inputs, for a check with the switch off. */
export function withoutSafetyLimits(raw: unknown): unknown {
  const plain = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!plain(raw)) return raw;
  const { safety_limits: _top, ...rest } = raw;
  // later_inputs sent as text stays text, without the key, so every other reading of the call is as it was.
  const asText = typeof rest.later_inputs === "string";
  let later: unknown = rest.later_inputs;
  if (asText) {
    try { later = JSON.parse(rest.later_inputs as string); } catch { later = undefined; }
  }
  if (plain(later) && "safety_limits" in later) {
    const { safety_limits: _later, ...others } = later;
    return { ...rest, later_inputs: asText ? JSON.stringify(others) : others };
  }
  return "safety_limits" in raw ? rest : raw;
}

/** Whether a limit is one of AskRigor's safety limits, by its fixed start. */
export function isSafetyLimit(limit: unknown): boolean {
  return typeof limit === "string" && SAFETY_LIMIT_PREFIXES.some((prefix) => limit.startsWith(prefix));
}

/** How many of a result's limits are AskRigor's safety limits. */
export function safetyLimitCount(limits: readonly unknown[]): number {
  return limits.filter(isSafetyLimit).length;
}
