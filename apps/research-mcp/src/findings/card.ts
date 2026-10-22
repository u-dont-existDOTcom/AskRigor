import { createHash } from "node:crypto";

import { z } from "zod";

import {
  containsSecretLikeData,
  screenPrivateText,
  type PrivacyScreenReasonCode
} from "../lessons/privacy-screen.js";

/**
 * A findings card: the best findings of one checked answer, for AskRigor's
 * findings library (owner decisions Q9 to Q11, 2026-09-30). finalize_research
 * checks a card against the answer and the research it verified in the same
 * call, and signs the card's digest into its finalization receipt. For a free
 * contributor account the server then saves the card whose digest that
 * receipt signed; for a paid-private account the answer offers the save, and
 * save_research_findings saves it only after the user says yes. The owner
 * reviews every saved card. A card whose findings would help no one but the
 * person asking is neither saved nor offered (owner answer 156a, 2026-10-22).
 */

export const FINDING_CERTAINTIES = ["high", "moderate", "low", "very_low"] as const;
export const FINDING_TAGS = [
  "full_text_read",
  "community_checked",
  "contradicts_common_answer",
  "overlooked_study",
  "documented_absence"
] as const;

/**
 * Whom a card's findings would help, as the model declares it (owner answer 156a, 2026-10-22): other people, so the
 * card may go to the owner's review for the Atlas, or only the person asking, so it stays out of the library.
 */
export const PUBLIC_VALUE_SCOPES = ["public", "personal_only"] as const;
export type PublicValueScope = typeof PUBLIC_VALUE_SCOPES[number];

const cardText = (max: number) => z.string().trim().min(1).max(max);

export const findingsCardSchema = z.object({
  question: cardText(300).describe("The question in general terms, with no personal details."),
  usual_answer: cardText(400).describe("What a quick, ordinary AI answer would say."),
  findings: z.array(z.object({
    claim: cardText(500),
    certainty: z.enum(FINDING_CERTAINTIES),
    applies_to: cardText(300).describe("Who or what the finding holds for."),
    answer_quote: cardText(1_000)
      .describe("The answer's sentence that states this finding, copied exactly from answer_draft."),
    sources: z.array(cardText(300)).min(1).max(10)
      .describe("DOI, PMID or PMCID of a key source verified in this call, or the ID of a video audited here. No " +
        "tool verifies a trial registration yet, so cite a trial through its published paper."),
    why_not_usual: cardText(300).describe("Why the usual answer misses this."),
    tags: z.array(z.enum(FINDING_TAGS)).max(FINDING_TAGS.length).default([])
      .describe("full_text_read needs a source read with a full-text method audit here; community_checked, a video " +
        "whose comments were audited here."),
    what_would_change_it: cardText(300)
  }).strict()).min(1).max(5),
  // Owner answer 156a (2026-10-22): the library feeds the Atlas, which holds what other people would benefit from, not
  // every answer better than a quick one ("why do I get tired when cooking", traced to the person's childhood, stays
  // out). The model declares, by the owner's four-part test, who else the findings would help and why, or that they
  // are personal only; the server checks only that the declaration is made, and keeps personal-only findings out of
  // the library. One object rather than two alternatives, so that ChatGPT's app shows the model its fields (as for
  // full_text_search). Optional here, so that a call from an app whose tool list predates it still parses: the final
  // check rejects a card without it, and a rejected card holds back nothing.
  public_value: z.object({
    scope: z.enum(PUBLIC_VALUE_SCOPES)
      .describe("public when all four hold: other people face it (it is about a condition, symptom, test, " +
        "treatment, supplement, product, food or practice, and holds without this person's history); it rests on what " +
        "the research checked here, not on what this person reported; it could change what someone does or believes; " +
        "and it adds something to well-known guidance. personal_only otherwise, as for a cause found only in this " +
        "person's own past or routine."),
    who_else: cardText(300).optional()
      .describe("With scope public: who else faces it, in general terms with no personal details, such as adults with " +
        "hip osteoarthritis weighing surgery."),
    what_it_changes: cardText(300).optional()
      .describe("With scope public: what it could change in what they do or believe, beyond well-known guidance, " +
        "such as an effect in absolute numbers, a harm with its basis, an overlooked option with real evidence, a " +
        "correction of a widely repeated claim or a search that found nothing.")
  }).strict().optional()
    .describe("Whether these findings would help anyone beyond this person. Findings declared personal_only are not " +
      "saved to AskRigor's findings library or offered for it. When the answer holds both kinds, put only the general " +
      "findings on the card, written without the person, and declare them public."),
  open_leads: z.array(cardText(200)).max(6).default([])
}).strict();

export type FindingsCard = z.output<typeof findingsCardSchema>;

/** The sentence a paid-private answer's offer ends with, as the owner worded it (139c): the save waits for a yes. */
export const FINDINGS_SAVE_OFFER =
  "If you want them saved to AskRigor's findings library for review, say yes; nothing is saved otherwise.";

/**
 * This research's map as the answer names it (owner answer 143a, 2026-10-21, in the words of question 143): the
 * RESEARCH_FRONTIER proposal of its searches, the studies they found and the leads left open, never the chat.
 */
export const RESEARCH_MAP = "this research's map (the searches, the studies found and the leads left open, never " +
  "this chat)";

/**
 * The offer's sentence when it also asks to file this research's map (owner answer 143a: "ask on paid private
 * accounts, in the same sentence as the save offer, so one yes saves the findings card and files the map").
 */
export const FINDINGS_AND_MAP_SAVE_OFFER = "If you want them saved to AskRigor's findings library for review, and " +
  `${RESEARCH_MAP} filed to AskRigor's shared research repository for review, say yes; nothing is saved or filed ` +
  "otherwise.";

/**
 * The sentence after a paid-private answer's offer, with or without the map, before the user's yes (owner answers 159,
 * 1b and 7, and 160b, 2026-10-22): what the owner accepts from saved findings may be published, as the free
 * contributor notice says.
 */
export const FINDINGS_ATLAS_SENTENCE = "Saved findings that AskRigor's owner accepts may be published in AskRigor's " +
  "public Atlas, written without you.";

/**
 * Work a quick answer cannot do, which finalize_research derives for each finding of a checked card from that call's
 * receipts and declarations (owner answer 139c, 2026-10-20): a source audited in full text, a video whose comments
 * were read, a sentence that is a checked absence claim, or a correction the research itself found. It shows depth,
 * not that a finding is better; why_not_usual stays the model's, for the owner's review.
 */
export const VERIFIED_BASES = ["full_text_audit", "comment_audit", "bounded_absence", "research_correction"] as const;
export type VerifiedBasis = typeof VERIFIED_BASES[number];

/** What the bases of a card's findings rest on, counted once each across the card. */
export interface VerifiedWork {
  /** Studies audited in full text, each paper once whichever of its identifiers a finding cites. */
  studies: number;
  /** Videos whose comments were read. */
  videos: number;
  /** Absence claims a finding's sentence states. */
  absences: number;
  /** Corrections the research found that a finding's sentence states. */
  corrections: number;
}

/** The work, in the words the answer shows: "full-text audits of 2 studies and audited comments on 3 videos". */
export function verifiedWorkPhrase(work: VerifiedWork): string {
  const counted = (count: number, one: string, many: string) => count === 1 ? one : many.replace("#", String(count));
  const parts = [
    ...(work.studies === 0 ? [] : [counted(work.studies, "a full-text audit of 1 study", "full-text audits of # studies")]),
    ...(work.videos === 0 ? [] : [counted(work.videos, "audited comments on 1 video", "audited comments on # videos")]),
    ...(work.absences === 0 ? [] : [counted(work.absences, "a check of what the evidence does not show",
      "# checks of what the evidence does not show")]),
    ...(work.corrections === 0 ? [] : [counted(work.corrections, "a correction the research made to an earlier statement",
      "# corrections the research made to earlier statements")])
  ];
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * The caveat a paid-private answer carries when a finding of its checked card rests on work a quick answer cannot do,
 * naming that work with the server's counts (the owner's example, 139c: "These findings rest on full-text audits of 2
 * studies and audited comments on 3 videos, work a quick answer does not do. If you want them saved ..."), and ending
 * with the sentence on the public Atlas (FINDINGS_ATLAS_SENTENCE).
 */
export function findingsSaveOffer(work: VerifiedWork): string {
  return `These findings rest on ${verifiedWorkPhrase(work)}, work a quick answer does not do. ${FINDINGS_SAVE_OFFER} ` +
    FINDINGS_ATLAS_SENTENCE;
}

/** The same caveat when its offer sentence also asks to file this research's map (owner answer 143a). */
export function findingsAndMapSaveOffer(work: VerifiedWork): string {
  return `These findings rest on ${verifiedWorkPhrase(work)}, work a quick answer does not do. ` +
    `${FINDINGS_AND_MAP_SAVE_OFFER} ${FINDINGS_ATLAS_SENTENCE}`;
}

/** The line a free answer ends with, just before the check line, once the server's save of its card confirms (139c). */
export function findingsSavedLine(cardId: string): string {
  return `Saved to AskRigor's findings library for review as ${cardId}.`;
}

/**
 * The line a free answer ends with when a map of this research was filed in it (owner answer 143a: "the free answer's
 * last line says what was saved"): with the card's id when its save confirmed, or the map alone.
 */
export function researchMapSavedLine(cardId: string | undefined): string {
  const map = `${RESEARCH_MAP} was filed to AskRigor's shared research repository for review.`;
  return cardId === undefined
    ? `${map.charAt(0).toUpperCase()}${map.slice(1)}`
    : `Saved to AskRigor's findings library for review as ${cardId}; ${map}`;
}

/**
 * A finding's bases as the finalization receipt signs them: the basis names joined by "." in VERIFIED_BASES order, or
 * "none". The receipt's list holds one per finding, in the card's order.
 */
export function signedFindingBases(bases: readonly VerifiedBasis[]): string {
  return bases.length === 0 ? "none" : VERIFIED_BASES.filter((basis) => bases.includes(basis)).join(".");
}

/** The bases a receipt signed for each of a card's findings, or undefined when it signed none or a different card. */
export function findingBasesFromReceipt(
  signed: string | string[] | undefined,
  findings: number
): VerifiedBasis[][] | undefined {
  if (!Array.isArray(signed) || signed.length !== findings) return undefined;
  const bases: VerifiedBasis[][] = [];
  for (const entry of signed) {
    const names = entry === "none" ? [] : entry.split(".");
    if (!names.every((name): name is VerifiedBasis => (VERIFIED_BASES as readonly string[]).includes(name)) ||
      new Set(names).size !== names.length) {
      return undefined;
    }
    bases.push(names);
  }
  return bases;
}

/**
 * JSON with each object's keys sorted and no spacing, so one card has one text
 * and one digest however its fields were ordered.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => item === undefined ? "null" : canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The digest finalize_research signs into its receipt: sha256 of the card's canonical JSON. */
export function findingsCardDigest(card: FindingsCard): string {
  return createHash("sha256").update(canonicalJson(card), "utf8").digest("hex");
}

const INVISIBLE_CHARACTERS = /[­͏؜᠎​-‏‪-‮⁠⁦-⁩﻿]/gu;

/**
 * The library's duplicate key: the question and the claims, with Unicode
 * form, invisible characters, spacing, case and the claims' order set aside.
 */
export function findingsCardFingerprint(card: FindingsCard): string {
  const normalized = (text: string) =>
    text.normalize("NFKC").replace(INVISIBLE_CHARACTERS, "").replace(/\s+/gu, " ").trim().toLowerCase();
  const claims = card.findings.map(({ claim }) => normalized(claim)).sort();
  return createHash("sha256")
    .update(JSON.stringify(["askrigor-findings-v1", normalized(card.question), claims]), "utf8")
    .digest("hex");
}

export type FindingsPrivacyReason = PrivacyScreenReasonCode | "not_a_source_identifier";

export interface FindingsPrivacyProblem {
  field: string;
  reasonCode: FindingsPrivacyReason;
}

/**
 * The lesson queue's deterministic privacy screen over each text field of a
 * card, with no model call. The screen was written for lessons, so a
 * findings field first has the forms a study summary legitimately carries
 * set aside; each is exact and structural: study and video references (DOI,
 * PMID, PMCID and NCT forms, and links to their pages), numbers shaped like
 * statistics (a decimal with at most three digits on each side, a year range),
 * apostrophes inside words, and quotation marks around the whole field. The
 * screen's other rules stand as they are, including its English-only reading
 * of first-person health words and street addresses: a numeral or abbreviation
 * can trip them (Roman numeral I or ME near a medical word), and then the
 * field is reworded. Sources are checked as identifiers, not as text.
 */
export function screenFindingsCard(card: FindingsCard): FindingsPrivacyProblem[] {
  const problems: FindingsPrivacyProblem[] = [];
  for (const [field, value] of cardTexts(card)) {
    const reasonCode = screenPrivateText(withoutStudyForms(withoutWrappingQuotes(value)));
    if (reasonCode !== undefined) problems.push({ field, reasonCode });
  }
  card.findings.forEach(({ sources }, index) => {
    sources.forEach((source, at) => {
      if (!isSourceIdentifier(source)) {
        problems.push({ field: `findings[${index}].sources[${at}]`, reasonCode: "not_a_source_identifier" });
      }
    });
  });
  return problems;
}

/**
 * The model name the app reports is a short label: letters and digits of any
 * script, spaces and . _ : ( ) / + -, with no link and nothing shaped like a
 * key. Dated model names look like phone numbers to the text screen, so it
 * is checked by its form instead.
 */
export function isSafeReportedModel(value: string): boolean {
  return /^[\p{L}\p{N}][\p{L}\p{N} ._:()/+-]{0,79}$/u.test(value) && !value.includes("://") &&
    !containsSecretLikeData(value);
}

/** A finding as the library stores it: its YouTube videos counted, not named. */
export type StoredFinding = Omit<FindingsCard["findings"][number], "sources"> & {
  sources: string[];
  /** Videos whose audited comments back this finding; their IDs are not stored. */
  youtube_videos?: number;
  /** The work a quick answer cannot do that this finding rests on, as the finalization receipt signed it. */
  verified_bases?: VerifiedBasis[];
};

/** A card as the library stores it. */
export type StoredFindingsCard = Omit<FindingsCard, "findings"> & { findings: StoredFinding[] };

const YOUTUBE_PAGE =
  "https?://(?:(?:www\\.|m\\.)?youtube\\.com/watch\\?v=[A-Za-z0-9_-]{11}(?:&t=\\d{1,6}s?)?" +
  "|youtu\\.be/[A-Za-z0-9_-]{11}(?:\\?t=\\d{1,6}s?)?)";
const YOUTUBE_LINK = new RegExp(`\\[([^[\\]\\n]{0,500})\\]\\(${YOUTUBE_PAGE}\\)`, "gu");
const YOUTUBE_URL = new RegExp(YOUTUBE_PAGE, "gu");

/**
 * The card without YouTube video IDs or links, which AskRigor does not store
 * while its YouTube API compliance review is open: each finding keeps the
 * number of its videos, and a link keeps its text. The gate still checked the
 * videos; the saved record keeps the digest it signed.
 */
export function withoutYouTubeData(card: FindingsCard): { card: StoredFindingsCard; omitted: boolean } {
  let omitted = false;
  const text = (value: string): string => {
    const stored = value.replace(YOUTUBE_LINK, "$1 (YouTube video)").replace(YOUTUBE_URL, "(YouTube video)");
    if (stored !== value) omitted = true;
    return stored;
  };
  const findings = card.findings.map(({ sources, ...finding }): StoredFinding => {
    const videos = sources.filter(isYouTubeVideoId).length;
    if (videos > 0) omitted = true;
    return {
      ...finding,
      claim: text(finding.claim),
      applies_to: text(finding.applies_to),
      answer_quote: text(finding.answer_quote),
      why_not_usual: text(finding.why_not_usual),
      what_would_change_it: text(finding.what_would_change_it),
      sources: sources.filter((source) => !isYouTubeVideoId(source)),
      ...(videos === 0 ? {} : { youtube_videos: videos })
    };
  });
  const declared = card.public_value;
  return {
    card: {
      ...card,
      question: text(card.question),
      usual_answer: text(card.usual_answer),
      findings,
      ...(declared === undefined ? {} : {
        public_value: {
          ...declared,
          ...(declared.who_else === undefined ? {} : { who_else: text(declared.who_else) }),
          ...(declared.what_it_changes === undefined ? {} : { what_it_changes: text(declared.what_it_changes) })
        }
      }),
      open_leads: card.open_leads.map(text)
    },
    omitted
  };
}

/** A YouTube video ID, as a card's source: 11 URL-safe characters that are not a study identifier. */
export function isYouTubeVideoId(value: string): boolean {
  return YOUTUBE_VIDEO_ID.test(value) && !STUDY_IDENTIFIER.test(value);
}

/** A DOI, PMID, PMCID or NCT id (any case, with or without its usual prefix), or a YouTube video id. */
export function isSourceIdentifier(value: string): boolean {
  return STUDY_IDENTIFIER.test(value) || YOUTUBE_VIDEO_ID.test(value);
}

const STUDY_IDENTIFIER = new RegExp(
  "^(?:(?:https?://(?:dx\\.)?doi\\.org/|doi:\\s*)?10\\.\\d{4,9}/\\S+" +
    "|(?:pmid:?\\s*)?\\d{1,9}" +
    "|(?:pmcid:?\\s*)?pmc\\d{1,9}" +
    "|nct\\d{8})$",
  "iu"
);
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;

function cardTexts(card: FindingsCard): Array<[string, string]> {
  // The public-value declaration's words are stored with a saved card (owner answer 156a), so they are screened too,
  // whatever its scope.
  const declared = card.public_value;
  return [
    ["question", card.question],
    ["usual_answer", card.usual_answer],
    ...card.findings.flatMap((finding, index): Array<[string, string]> => [
      [`findings[${index}].claim`, finding.claim],
      [`findings[${index}].applies_to`, finding.applies_to],
      [`findings[${index}].answer_quote`, finding.answer_quote],
      [`findings[${index}].why_not_usual`, finding.why_not_usual],
      [`findings[${index}].what_would_change_it`, finding.what_would_change_it]
    ]),
    ...(declared?.who_else === undefined ? [] : [["public_value.who_else", declared.who_else] as [string, string]]),
    ...(declared?.what_it_changes === undefined ? []
      : [["public_value.what_it_changes", declared.what_it_changes] as [string, string]]),
    ...card.open_leads.map((lead, index): [string, string] => [`open_leads[${index}]`, lead])
  ];
}

// A link's destination may hold one level of parentheses, as many DOIs do.
const MARKDOWN_LINK = /\[([^[\]\n]{0,500})\]\(((?:[^\s()[\]]|\([^\s()[\]]{0,200}\)){1,2048})\)/gu;
const BARE_URL = /https?:\/\/(?:[^\s<>()[\]{}]|\([^\s<>()[\]{}]{0,200}\)){1,2048}/gu;
// A DOI standing on its own, not inside a link; it may hold one level of parentheses.
const DOI = /(?<![\w/.-])10\.\d{4,9}\/(?:[^\s"<>()[\]{}]|\([^\s"<>()[\]{}]{0,200}\))+/gu;
const LABELED_IDENTIFIER = /\b(?:PMID:?\s*\d{1,9}|PMC\d{1,9}|NCT\d{8})\b/giu;
// A decimal on its own, not one link of a dotted chain such as 01.23.45.67.
const DECIMAL = /(?<![\d.])\d{1,3}\.\d{1,3}(?!\d|\.\d)/gu;
const YEAR_RANGE = /(?<!\d)(?:1[89]|20)\d{2} ?- ?(?:1[89]|20)\d{2}(?!\d)/gu;
const APOSTROPHE_IN_WORD = /(?<=\p{L})['’](?=\p{L})/gu;
const WRAPPING_QUOTE = /["'\p{Pi}\p{Pf}]/u;
const PLACEHOLDER = "SOURCE";

function withoutStudyForms(text: string): string {
  return text
    .replace(MARKDOWN_LINK, (link, label: string, target: string) => isStudyLink(target) ? label : link)
    .replace(BARE_URL, (url) => {
      const bare = url.replace(/[.,;:!?]+$/u, "");
      return isStudyLink(bare) ? `${PLACEHOLDER}${url.slice(bare.length)}` : url;
    })
    .replace(DOI, PLACEHOLDER)
    .replace(LABELED_IDENTIFIER, PLACEHOLDER)
    .replace(YEAR_RANGE, "YEARS")
    .replace(DECIMAL, "N")
    .replace(APOSTROPHE_IN_WORD, "");
}

function withoutWrappingQuotes(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && WRAPPING_QUOTE.test(text.charAt(start))) start += 1;
  while (end > start && WRAPPING_QUOTE.test(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

/** A link to a study's or a video's own page: a DOI, PubMed, PubMed Central, Europe PMC, a trial record or YouTube. */
function isStudyLink(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "" ||
    url.port !== "" || url.hash !== "") {
    return false;
  }
  const path = url.pathname;
  const noQuery = url.search === "";
  switch (url.hostname.toLowerCase()) {
    case "doi.org":
    case "dx.doi.org":
      return noQuery && /^\/10\.\d{4,9}\/./u.test(path);
    case "pubmed.ncbi.nlm.nih.gov":
      return noQuery && /^\/\d{1,9}\/?$/u.test(path);
    case "www.ncbi.nlm.nih.gov":
      return noQuery && /^\/pmc\/articles\/PMC\d{1,9}\/?$/iu.test(path);
    case "pmc.ncbi.nlm.nih.gov":
      return noQuery && /^\/articles\/PMC\d{1,9}\/?$/iu.test(path);
    case "europepmc.org":
      return noQuery && /^\/(?:article|abstract)\/(?:MED\/\d{1,9}|PMC\/PMC\d{1,9})\/?$/iu.test(path);
    case "clinicaltrials.gov":
    case "www.clinicaltrials.gov":
      return noQuery && /^\/(?:study|ct2\/show)\/NCT\d{8}\/?$/iu.test(path);
    case "youtube.com":
    case "www.youtube.com":
    case "m.youtube.com":
      return path === "/watch" && /^\?v=[A-Za-z0-9_-]{11}(?:&t=\d{1,6}s?)?$/u.test(url.search);
    case "youtu.be":
      return /^\/[A-Za-z0-9_-]{11}$/u.test(path) && /^(?:\?t=\d{1,6}s?)?$/u.test(url.search);
    default:
      return false;
  }
}
