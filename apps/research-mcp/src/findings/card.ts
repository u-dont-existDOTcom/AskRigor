import { createHash } from "node:crypto";

import { z } from "zod";

import {
  containsSecretLikeData,
  screenPrivateText,
  type PrivacyScreenReasonCode
} from "../lessons/privacy-screen.js";

/**
 * A findings card: the best findings of one checked answer, for AskRigor's
 * findings library (owner decisions Q9 and Q10, 2026-09-30). finalize_research
 * checks a card against the answer and the research it verified in the same
 * call, and signs the card's digest into its finalization receipt;
 * save_research_findings saves only a card whose digest that receipt signed,
 * and only after the user says yes. The owner reviews every saved card.
 */

export const FINDING_CERTAINTIES = ["high", "moderate", "low", "very_low"] as const;
export const FINDING_TAGS = [
  "full_text_read",
  "community_checked",
  "contradicts_common_answer",
  "overlooked_study",
  "documented_absence"
] as const;

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
      .describe("DOI, PMID, PMCID, NCT id or YouTube video id, each verified in this call: a key source, or a video " +
        "audited here."),
    why_not_usual: cardText(300).describe("Why the usual answer misses this."),
    tags: z.array(z.enum(FINDING_TAGS)).max(FINDING_TAGS.length).default([])
      .describe("full_text_read needs a source read with a full-text method audit here; community_checked, a video " +
        "whose comments were audited here."),
    what_would_change_it: cardText(300)
  }).strict()).min(1).max(5),
  open_leads: z.array(cardText(200)).max(6).default([])
}).strict();

export type FindingsCard = z.output<typeof findingsCardSchema>;

/** The one sentence a checked card adds to the answer's caveats. */
export const FINDINGS_SAVE_OFFER =
  "If you want these findings saved to AskRigor's findings library for review, say yes; nothing is saved otherwise.";

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
