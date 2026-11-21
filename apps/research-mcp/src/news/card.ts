import { createHash } from "node:crypto";

import { z } from "zod";

import { canonicalJson } from "../findings/card.js";
import { firstNumberReadings, includesAbsoluteNumber, numberReadings } from "../unicode-numbers.js";

/**
 * Atlas news, stage 1 (design v4, sections 3.2 to 3.7; plan docs/superpowers/plans/2026-11-21-atlas-news-stage1.md):
 * the news card a news check sends with its finalize_research call, in later_inputs.news_card. It is read from the raw
 * call on its own, as the research dossier is, so it never holds back the answer: a card that doesn't parse, or breaks
 * a rule, is named in a note and staged nowhere. Its rules are exact, in code, and the same in any language; what its
 * fields mean against the draft is the meaning reading's judgment at the day call (3.4 step 6), never a word list here.
 */

export const NEWS_LABELS = [
  "benefit_supported", "no_meaningful_benefit_shown", "harm_signal", "evidence_uncertain", "safety_notice",
  "rule_or_approval_change",
] as const;
export const NEWS_DESIGNS = [
  "animals_or_cells_only", "people_no_comparison_group", "people_controlled_study", "review_of_studies",
  "official_notice", "no_study",
] as const;
export const NEWS_CERTAINTY = ["high", "moderate", "low", "very_low", "animals_or_cells_only", "no_study"] as const;
export const NEWS_REACH = ["over_10_million", "1_to_10_million", "100_000_to_1_million", "under_100_000", "unknown"] as const;
export const NEWS_SIZE = ["large", "moderate", "small", "none", "unknown"] as const;
export const NEWS_URGENCY = ["act_now", "soon", "no_rush"] as const;
export const NEWS_CAN_ACT = ["yes_on_their_own", "yes_with_a_doctor", "not_yet", "nothing_to_do"] as const;
export const NEWS_WHO_CAN_DO_IT = [
  "on_your_own", "with_a_pharmacist", "with_a_prescription", "not_available", "nothing_to_do",
] as const;
export const NEWS_AVAILABILITY = ["approved_or_sold", "prescription_only", "not_approved", "unknown"] as const;
/** The closed reasons a "not worth reading" line gives (the news check's own list). */
export const NEWS_SKIP_REASONS = [
  "animal_or_cell", "model_only", "early_uncontrolled", "nothing_to_do", "cannot_show_cause", "old_paper",
  "overclaims", "no_decision", "not_news",
] as const;
/** StudyReadDepthDisclosure's categories (HRP): how much of the paper was read. */
export const NEWS_READ_DEPTHS = ["full_text", "partial_text", "abstract", "conference_abstract", "secondary_only"] as const;
/** The fields a backing line may back. */
export const NEWS_BACKED_FIELDS = [
  "finding", "for", "how_much", "what_you_can_do", "other_outcomes", "harms", "limits", "who_paid", "official_action",
] as const;
export const NEWS_CARD_LIMITS = {
  findingWords: 12, finding: 200, text: 600, short: 300, backing: 16, quote: 300, sources: 5, regions: 12,
  funders: 10, declarations: 30,
} as const;

const KEY = /^[a-z][a-z0-9-]{0,59}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
const DOI = /^10\.\d{4,9}\/\S{1,300}$/u;
const text = (max: number) => z.string().trim().min(1).max(max);

export const newsCardSchema = z.object({
  item_id: z.string().regex(ID).describe("The news check's own item id."),
  check_id: z.string().regex(ID).describe("The news check's id of this full check."),
  label: z.enum(NEWS_LABELS),
  finding: text(NEWS_CARD_LIMITS.finding),
  for: text(NEWS_CARD_LIMITS.short),
  how_much: text(NEWS_CARD_LIMITS.text),
  outcome_kind: z.enum(["people_event", "scale", "none"]),
  per_100: z.object({
    treated: z.number().min(0).max(100),
    comparison: z.number().min(0).max(100),
    outcome: text(200),
    time_frame: text(100),
  }).strict().optional(),
  how_sure: z.object({ level: z.enum(NEWS_CERTAINTY), reason: text(200) }).strict(),
  what_you_can_do: text(NEWS_CARD_LIMITS.text),
  who_can_do_it: z.enum(NEWS_WHO_CAN_DO_IT),
  availability: z.array(z.object({ region: text(60), status: z.enum(NEWS_AVAILABILITY) }).strict())
    .min(1).max(NEWS_CARD_LIMITS.regions),
  design: z.enum(NEWS_DESIGNS),
  published: z.string().regex(/^(?:\d{4}-\d{2}-\d{2}|unknown)$/u),
  reach: z.enum(NEWS_REACH),
  size: z.enum(NEWS_SIZE),
  urgency: z.enum(NEWS_URGENCY),
  can_act_now: z.enum(NEWS_CAN_ACT),
  meets_our_bar: z.object({
    meets: z.boolean(),
    reason: text(NEWS_CARD_LIMITS.short),
    reason_code: z.enum(NEWS_SKIP_REASONS).optional(),
  }).strict(),
  other_outcomes: text(NEWS_CARD_LIMITS.text),
  harms: text(NEWS_CARD_LIMITS.text),
  limits: text(NEWS_CARD_LIMITS.text),
  who_paid: z.object({
    status: z.enum(["quoted", "paper_doesnt_say", "not_checked"]),
    industry_funded: z.enum(["yes", "no", "not_stated", "not_checked"]),
    funders: z.array(z.object({ name: text(200), backing: z.number().int().min(0) }).strict())
      .max(NEWS_CARD_LIMITS.funders),
    declarations: z.array(z.object({ author: text(120), declared: text(300), backing: z.number().int().min(0) }).strict())
      .max(NEWS_CARD_LIMITS.declarations),
  }).strict(),
  read: z.object({
    depth: z.enum(NEWS_READ_DEPTHS),
    method_audit: z.enum(["validated", "not_validated"]),
  }).strict(),
  sources: z.array(text(300)).min(1).max(NEWS_CARD_LIMITS.sources),
  doi: z.string().trim().toLowerCase().regex(DOI).optional(),
  official_action: text(NEWS_CARD_LIMITS.short).optional(),
  topic: z.string().regex(KEY).optional(),
  category: z.string().regex(KEY).optional(),
  backing: z.array(z.object({
    field: z.enum(NEWS_BACKED_FIELDS),
    source: text(300),
    quote: text(NEWS_CARD_LIMITS.quote),
  }).strict()).max(NEWS_CARD_LIMITS.backing),
}).strict();
export type NewsCard = z.output<typeof newsCardSchema>;

/** The fields a reader sees as text, and so the ones the numbers floor and the meaning reading cover. */
export const NEWS_PUBLIC_FIELDS = [
  "finding", "for", "how_much", "how_sure", "what_you_can_do", "other_outcomes", "harms", "limits", "who_paid",
  "meets_our_bar", "official_action",
] as const;
export type NewsPublicField = typeof NEWS_PUBLIC_FIELDS[number];

export const NEWS_CARD_PROBLEM_CODES = [
  "card_unreadable", "finding_too_long", "per_100_missing", "per_100_not_in_how_much", "safety_notice_not_official",
  "bar_design", "reason_code_missing", "backing_line_missing", "backing_source_unknown", "who_paid_inconsistent",
  "doi_not_a_source",
] as const;
export type NewsCardProblemCode = typeof NEWS_CARD_PROBLEM_CODES[number];
export interface NewsCardProblem { code: NewsCardProblemCode; message: string }

export type CheckedNewsCard =
  | { status: "checked"; card: NewsCard; digest: string }
  | { status: "rejected"; problems: NewsCardProblem[] };

/** The digest finalize_research signs (claim `news`): sha256 of the card's canonical JSON, as a findings card's is. */
export function newsCardDigest(card: NewsCard): string {
  return createHash("sha256").update(canonicalJson(card), "utf8").digest("hex");
}

const WORDS = new Intl.Segmenter(undefined, { granularity: "word" });

/** Words as a reader counts them, in any script (Intl's word segments that are words, numbers included). */
export function wordCount(value: string): number {
  let count = 0;
  for (const segment of WORDS.segment(value)) if (segment.isWordLike === true) count += 1;
  return count;
}

const NUMBER_TOKEN = /\p{Nd}[\p{Nd},.  '٬٫·]*/gu;

/** Every number in a text, each with its readings ("1,234" reads as 1.234 and as 1234). */
export function numbersIn(value: string): number[][] {
  return [...value.normalize("NFKC").matchAll(NUMBER_TOKEN)]
    .map(([token]) => firstNumberReadings(token.replace(/[,.  '٬٫·]+$/u, "")))
    .filter((readings) => readings.length > 0);
}

/** Whether every number in `field` appears, by one of its readings, among the numbers of `draft`. */
export function numbersMissingFrom(field: string, draft: string): string[] {
  const inDraft = numberReadings(draft.normalize("NFKC"));
  return numbersIn(field).filter((readings) => !readings.some((reading) => includesAbsoluteNumber(inDraft, reading)))
    .map((readings) => String(readings[0]));
}

/** Each public field's text as a reader would see it, for the numbers floor and the reading's coverage. */
export function newsPublicTexts(card: NewsCard): Record<NewsPublicField, string> {
  return {
    finding: card.finding,
    for: card.for,
    how_much: card.how_much,
    how_sure: card.how_sure.reason,
    what_you_can_do: card.what_you_can_do,
    other_outcomes: card.other_outcomes,
    harms: card.harms,
    limits: card.limits,
    who_paid: [...card.who_paid.funders.map(({ name }) => name),
      ...card.who_paid.declarations.map(({ author, declared }) => `${author}: ${declared}`)].join("\n"),
    meets_our_bar: card.meets_our_bar.reason,
    official_action: card.official_action ?? "",
  };
}

const normalizedSource = (value: string) => value.trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//u, "").replace(/^doi:\s*/u, "");

/** 3.4 step 2: the card's rules, in code. Empty when the card keeps every one. */
export function newsCardProblems(card: NewsCard): NewsCardProblem[] {
  const problems: NewsCardProblem[] = [];
  const add = (code: NewsCardProblemCode, message: string) => problems.push({ code, message });
  const words = wordCount(card.finding);
  if (words > NEWS_CARD_LIMITS.findingWords) {
    add("finding_too_long", `news_card.finding has ${words} words; at most ${NEWS_CARD_LIMITS.findingWords}, naming ` +
      "who it applies to (the label is shown in front as a tag and isn't counted).");
  }
  if (card.outcome_kind === "people_event") {
    if (card.per_100 === undefined) {
      add("per_100_missing", "news_card.outcome_kind is people_event, so news_card.per_100 gives both groups in people " +
        "per 100, with the outcome and the time frame.");
    } else {
      const inHowMuch = numberReadings(card.how_much.normalize("NFKC"));
      const missing = [card.per_100.treated, card.per_100.comparison]
        .filter((value) => !includesAbsoluteNumber(inHowMuch, value));
      if (missing.length > 0) {
        add("per_100_not_in_how_much", `news_card.how_much doesn't show ${missing.join(" and ")} of news_card.per_100; ` +
          "it gives both groups in people per 100.");
      }
    }
  }
  const official = card.design === "official_notice" || card.official_action !== undefined;
  if (card.label === "safety_notice" && card.design !== "official_notice") {
    add("safety_notice_not_official", "news_card.label safety_notice is for an official notice or a recall only " +
      "(news_card.design official_notice).");
  }
  if (card.meets_our_bar.meets && !official && (card.design === "animals_or_cells_only" ||
    (card.design === "people_no_comparison_group" && card.availability.every(({ status }) => status === "not_approved")))) {
    add("bar_design", "A main item can't rest on work in animals or cells only, or on people with no comparison group " +
      "for something approved nowhere, unless an official body acted: news_card.meets_our_bar.meets is false for it.");
  }
  if (!card.meets_our_bar.meets && card.meets_our_bar.reason_code === undefined) {
    add("reason_code_missing", "news_card.meets_our_bar.meets is false, so it gives reason_code, one of the closed " +
      `reasons: ${NEWS_SKIP_REASONS.join(", ")}.`);
  }
  const sources = new Set(card.sources.map(normalizedSource));
  card.backing.forEach((line, place) => {
    if (!sources.has(normalizedSource(line.source))) {
      add("backing_source_unknown", `news_card.backing[${place}].source isn't one of news_card.sources.`);
    }
  });
  const backs = (field: typeof NEWS_BACKED_FIELDS[number]) => card.backing.some((line) => line.field === field);
  if (numbersIn(card.how_much).length > 0 && !backs("how_much")) {
    add("backing_line_missing", "news_card.how_much gives numbers, so a backing line with field how_much quotes the " +
      "paper's sentence behind them.");
  }
  if (card.official_action !== undefined && !backs("official_action")) {
    add("backing_line_missing", "news_card.official_action needs a backing line with field official_action quoting the " +
      "agency's action.");
  }
  for (const [kind, entries] of [["funders", card.who_paid.funders], ["declarations", card.who_paid.declarations]] as const) {
    entries.forEach((entry, place) => {
      if (card.backing[entry.backing]?.field !== "who_paid") {
        add("backing_line_missing", `news_card.who_paid.${kind}[${place}].backing is the place of a backing line with ` +
          "field who_paid, quoting it.");
      }
    });
  }
  const named = card.who_paid.funders.length + card.who_paid.declarations.length;
  if ((card.who_paid.status === "quoted") !== (named > 0) ||
    (card.who_paid.status === "paper_doesnt_say" && card.read.depth !== "full_text")) {
    add("who_paid_inconsistent", "news_card.who_paid: quoted names funders or declarations, each quoted; " +
      "paper_doesnt_say only when the full text was read; otherwise not_checked, naming nobody.");
  }
  if (card.doi !== undefined && !sources.has(normalizedSource(card.doi))) {
    add("doi_not_a_source", "news_card.doi is one of news_card.sources.");
  }
  return problems;
}

/** A news card as finalize_research reads it: parsed, then held to its rules. */
export function checkNewsCard(raw: unknown): CheckedNewsCard {
  const parsed = newsCardSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "rejected", problems: parsed.error.issues.slice(0, 8).map((issue) => ({
      code: "card_unreadable" as const,
      message: `news_card${issue.path.map((part) => typeof part === "number" ? `[${part}]` : `.${String(part)}`).join("")}: ` +
        issue.message,
    })) };
  }
  const problems = newsCardProblems(parsed.data);
  return problems.length === 0 ? { status: "checked", card: parsed.data, digest: newsCardDigest(parsed.data) }
    : { status: "rejected", problems };
}

/** later_inputs.news_card, read from the raw call on its own, or undefined when the call doesn't give one. */
export function newsCardFromCall(raw: unknown): unknown {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(raw)) return undefined;
  let later = raw.later_inputs;
  if (typeof later === "string") {
    try { later = JSON.parse(later); } catch { later = undefined; }
  }
  if (object(later) && Object.hasOwn(later, "news_card")) return later.news_card;
  return Object.hasOwn(raw, "news_card") ? raw.news_card : undefined;
}
