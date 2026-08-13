import { createHash } from "node:crypto";
import type { LessonCandidate } from "./contracts.js";

export type PrivacyScreenReasonCode =
  | "secret_like_data"
  | "direct_identifier"
  | "personal_narrative"
  | "raw_conversation"
  | "unsafe_url"
  | "quoted_material"
  | "control_or_markup"
  | "prompt_injection_like_text";

export type PrivacyScreenResult =
  | { safe: true; candidate: LessonCandidate }
  | { safe: false; reasonCode: PrivacyScreenReasonCode };

export interface CanonicalLesson {
  category: LessonCandidate["category"];
  general_lesson: string;
  expected_behavior: string;
}

const disallowedInvisibleCharacters = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const invisibleCharacters = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;
const forbiddenControlCharacters = /[\u0000-\u001F\u007F]/u;
const urlPattern = /https?:\/\/[^\s<>()\[\]{}]+/gu;
const markdownOrHtmlLinkPattern = /\[[^\]]*\]\([^)]*\)|<\/?[A-Za-z][^>]*>/u;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const phonePattern = /(?:\+?\d[\d .()-]{6,}\d)/u;
const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/u,
  /\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/u,
  /\bAIza[A-Za-z0-9_-]{16,}\b/u,
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u,
];
const addressPattern = /\b\d{1,5}\s+[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,3}\s+(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|court|ct\.?)\b/iu;
const postalAddressPattern = /\b(?:postal\s+code|zip\s+code)\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{2,9}\b/iu;
const rawConversationPattern = /<\|\s*(?:user|assistant|system|tool)\s*\|>|(?:^|\n)\s*(?:user|assistant|system|tool)\s*:/iu;
const longCopiedMaterialPattern = /(?:["“][^"”\n]{280,}["”]|['‘][^'’\n]{280,}['’]|(?:^|\n)\s*>\s*[\s\S]{280,}|```[\s\S]{280,}(?:```|$))/u;
const firstPersonMedicalPattern = /\b(?:i|my|me)\b.{0,100}\b(?:diagnosed|diagnosis|medical|medication|treatment|condition|symptom|hospital|doctor|therapy|disease|illness)\b/iu;
const personalAgeOrDatePattern = /\b(?:i\s+(?:am|was)\s+\d{1,3}\s+years?\s+old|i\b.{0,80}\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}))\b/iu;
const promptInjectionPattern = /\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system)\s+instructions?\b|\b(?:tell|instruct|direct|command|ask)\b.{0,80}\b(?:privacy\s+model|github(?:\s+service)?)\b|\b(?:submit|create|write|send|open|publish|forward|approve|mark)\b.{0,80}\b(?:privacy\s+model|github(?:\s+service)?)\b|\b(?:privacy\s+model|github(?:\s+service)?)\b.{0,80}\b(?:approve|mark|submit|create|write|send|open|publish|forward)\b/iu;

/**
 * Reject unsafe content without attempting to redact or salvage it. This exact
 * same screen is used before and after model generalization.
 */
export function screenLessonCandidate(candidate: LessonCandidate): PrivacyScreenResult {
  for (const value of candidateTextValues(candidate)) {
    const reasonCode = screenText(value);
    if (reasonCode) return { safe: false, reasonCode };
  }

  return { safe: true, candidate };
}

/** Normalizes the only fields used to create the private duplicate key. */
export function canonicalizeLesson(candidate: LessonCandidate): CanonicalLesson {
  return {
    category: candidate.category,
    general_lesson: normalizeForFingerprint(candidate.general_lesson),
    expected_behavior: normalizeForFingerprint(candidate.expected_behavior),
  };
}

/** Returns a lowercase 64-hex SHA-256 fingerprint for the canonical tuple. */
export function lessonFingerprint(canonical: CanonicalLesson): string {
  const fingerprintInput = JSON.stringify([
    canonical.category,
    canonical.general_lesson.toLocaleLowerCase("en-US"),
    canonical.expected_behavior.toLocaleLowerCase("en-US"),
  ]);
  return createHash("sha256").update(fingerprintInput, "utf8").digest("hex");
}

function candidateTextValues(candidate: LessonCandidate): string[] {
  return [
    candidate.general_lesson,
    candidate.expected_behavior,
    candidate.failure_reason,
    candidate.synthetic_regression_example,
    ...(candidate.askrigor_version ? [candidate.askrigor_version] : []),
    ...(candidate.protocol_identities?.flatMap((identity) => [identity.name, identity.version]) ?? []),
  ];
}

function screenText(value: string): PrivacyScreenReasonCode | undefined {
  if (forbiddenControlCharacters.test(value) || disallowedInvisibleCharacters.test(value) || markdownOrHtmlLinkPattern.test(value)) {
    return "control_or_markup";
  }

  if (hasUnsafeUrl(value)) return "unsafe_url";
  if (secretPatterns.some((pattern) => pattern.test(value))) return "secret_like_data";
  if (rawConversationPattern.test(value)) return "raw_conversation";
  if (longCopiedMaterialPattern.test(value)) return "quoted_material";
  if (firstPersonMedicalPattern.test(value) || personalAgeOrDatePattern.test(value)) return "personal_narrative";
  if (emailPattern.test(value) || phonePattern.test(value) || addressPattern.test(value) || postalAddressPattern.test(value)) {
    return "direct_identifier";
  }
  if (promptInjectionPattern.test(value)) return "prompt_injection_like_text";
  return undefined;
}

function hasUnsafeUrl(value: string): boolean {
  return [...value.matchAll(urlPattern)].some((match) => !isAllowedCanonicalUrl(trimTrailingPunctuation(match[0])));
}

function isAllowedCanonicalUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port) return false;

  if (url.hostname === "youtube.com") {
    return url.pathname === "/watch" && /^\?v=[A-Za-z0-9_-]{11}$/.test(url.search);
  }

  return (
    ["askrigor.com", "pubmed.ncbi.nlm.nih.gov", "doi.org", "clinicaltrials.gov"].includes(url.hostname) &&
    url.search === ""
  );
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?]+$/u, "");
}

function normalizeForFingerprint(value: string): string {
  return value.normalize("NFKC").replace(invisibleCharacters, "").replace(/\s+/gu, " ").trim();
}
