import { createHash } from "node:crypto";

import {
  isSourceIdentifier,
  isYouTubeVideoId,
  normalizedFindingsText,
  screenFindingsText,
} from "./card.js";

/**
 * A findings card that wasn't saved, kept for a second look (the owner, 4 November 2026: "when a finding is not
 * accepted, it's put into a review queue anyway to check it so we don't lose findings on technicalities"). The final
 * check refuses a card for its form: a quote the answer doesn't show, a source this call didn't verify, a field too
 * long. None of that says the finding is worthless, and the refused card used to be forgotten.
 *
 * The copy goes to the same private repository as saved cards, under a label of its own, so no card list, publisher or
 * page reads it. It stays inside what the free contributor notice covers, with the same exact screens a saved card
 * passes: each text goes through the privacy screen and one that fails is left out, a source that isn't a public
 * paper's identifier is left out (a link to a forum or a video is never stored, nor a forum signal's thread links), and a
 * finding resting on YouTube comments stays out of the copy, as it stays out of a saved card. A card declared personal
 * only is not kept.
 *
 * It works on whatever the call gave, since a card that doesn't read is one of the cases: only field names and values
 * of the expected kinds are copied, within limits.
 */

export const UNSAVED_CARD_WHYS = ["refused", "malformed", "answer_not_ready", "save_failed"] as const;
export type UnsavedCardWhy = typeof UNSAVED_CARD_WHYS[number];

/** What findings_card.saved.reason says when a private copy was kept. */
export const KEPT_FOR_REVIEW = "kept_for_review";

const MOST_TEXT_CHARACTERS = 2_000;
const MOST_LIST_ENTRIES = 20;
const MOST_FIELDS = 40;
const DEEPEST = 6;
// Every text of a copy together: well inside GitHub's limit on an issue's body.
const MOST_COPY_CHARACTERS = 40_000;
const MOST_VALUES = 2_000;
const MOST_LINES_LEFT_OUT = 50;
// A shorter string could be any part of a sentence, so it isn't taken out of the check's problems.
const SHORTEST_SOURCE_TO_TAKE_OUT = 4;
const MOST_PROBLEMS = 30;
const MOST_PROBLEM_CHARACTERS = 1_000;
const FIELD_NAME = /^[a-z][a-z0-9_]{0,39}$/u;
const LEFT_OUT = "[left out]";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Whether a finding, read as the call gave it, rests on YouTube comments: what the card shows (a video among its
 * sources, community_checked), its declaration, or, once comments were read, the lack of a declaration that it doesn't.
 * The same rule a save holds a finding apart by (owner answers 170, 173 and 219b), in the safe direction.
 */
export function restsOnYouTubeComments(finding: unknown, commentsRead: boolean): boolean {
  if (!isObject(finding)) return commentsRead;
  const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
  return list(finding.sources).some((source) => typeof source === "string" && isYouTubeVideoId(source)) ||
    list(finding.tags).includes("community_checked") || finding.draws_on_youtube_comments === true ||
    (commentsRead && finding.draws_on_youtube_comments !== false);
}

/** Whether the card declares that its findings would help no one but the person asking (owner answer 156a). */
export function declaredPersonalOnly(card: unknown): boolean {
  return isObject(card) && isObject(card.public_value) && card.public_value.scope === "personal_only";
}

/** One claim as a later saved card's is compared with it: exact, with Unicode form, spacing and case set aside. */
export function unsavedClaimKey(claim: string): string {
  return createHash("sha256").update(normalizedFindingsText(claim), "utf8").digest("hex").slice(0, 32);
}

export interface UnsavedCardCopy {
  /** The card's fields as far as they could be kept. */
  card: Record<string, unknown>;
  /** The question, unless it was left out. */
  question?: string;
  /** What the copy leaves out, by field and reason; never the text itself. */
  leftOut: string[];
  /** Each kept finding's claim key. */
  claims: string[];
  /** The places, from 0, of the findings kept. */
  kept: number[];
  /** The source strings left out, which the check's problems may repeat. */
  sourcesLeftOut: string[];
}

class CopyWalk {
  readonly leftOut: string[] = [];
  readonly sourcesLeftOut: string[] = [];
  private remaining = MOST_COPY_CHARACTERS;
  private values = 0;

  value(value: unknown, path: string, depth: number): unknown {
    this.values += 1;
    if (this.values > MOST_VALUES) return undefined;
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return this.text(value, path);
    if (depth >= DEEPEST) return undefined;
    if (Array.isArray(value)) {
      if (value.length > MOST_LIST_ENTRIES) this.leftOut.push(`${path}: the entries after the first ${MOST_LIST_ENTRIES}`);
      return value.slice(0, MOST_LIST_ENTRIES).flatMap((entry, index) => {
        const copied = this.value(entry, `${path}[${index}]`, depth + 1);
        return copied === undefined ? [] : [copied];
      });
    }
    if (!isObject(value)) return undefined;
    const copy: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(value).slice(0, MOST_FIELDS)) {
      if (!FIELD_NAME.test(name)) continue;
      const at = path === "" ? name : `${path}.${name}`;
      // Owner answer 252a: a forum signal's thread links stay out, as a saved card leaves them out (the free notice's
      // community summary holds no links); its counts and words are copied as any other field.
      if (name === "threads" && path.endsWith(".forum_signal")) {
        if (Array.isArray(field) && field.length > 0) this.leftOut.push(`${at}: forum thread links, which stay out of this copy`);
        continue;
      }
      // The literature search's query that found no study is checked, never kept (the review of #417, finding 7).
      if (name === "search_query" && path.endsWith(".forum_signal")) {
        if (typeof field === "string") this.leftOut.push(`${at}: the literature search's query, which is checked, never kept`);
        continue;
      }
      const copied = name === "sources" ? this.sources(field, at) : this.value(field, at, depth + 1);
      if (copied !== undefined) copy[name] = copied;
    }
    return copy;
  }

  /** Only a public paper's identifier is kept as a source: a link or a video never is. */
  sources(sources: unknown, path: string): string[] {
    if (!Array.isArray(sources)) return [];
    return sources.slice(0, MOST_LIST_ENTRIES).flatMap((source, index) => {
      if (typeof source === "string" && isSourceIdentifier(source) && !isYouTubeVideoId(source)) return [source];
      if (typeof source === "string" && source.length >= SHORTEST_SOURCE_TO_TAKE_OUT) this.sourcesLeftOut.push(source);
      this.leftOut.push(`${path}[${index}]: not a DOI, PMID, PMCID or NCT id`);
      return [];
    });
  }

  private text(value: string, path: string): string {
    const reason = screenFindingsText(value);
    if (reason !== undefined) {
      this.leftOut.push(`${path}: ${reason}`);
      return LEFT_OUT;
    }
    const kept = [...value].slice(0, Math.max(0, Math.min(MOST_TEXT_CHARACTERS, this.remaining))).join("");
    if (kept.length < value.length) this.leftOut.push(`${path}: too long, so cut`);
    this.remaining -= kept.length;
    return kept;
  }
}

/** The copy of a card, or undefined when it holds nothing to keep. */
export function unsavedCardCopy(raw: unknown, commentsRead: boolean): UnsavedCardCopy | undefined {
  if (!isObject(raw)) return undefined;
  const walk = new CopyWalk();
  const { findings: given, ...rest } = raw;
  const card = walk.value(rest, "", 0) as Record<string, unknown>;
  const findings: unknown[] = [];
  const claims: string[] = [];
  const kept: number[] = [];
  (Array.isArray(given) ? given : []).slice(0, MOST_LIST_ENTRIES).forEach((finding: unknown, index) => {
    if (restsOnYouTubeComments(finding, commentsRead)) {
      walk.leftOut.push(`findings[${index}]: rests on YouTube comments, which stay out of this copy`);
      if (isObject(finding)) walk.sources(finding.sources, `findings[${index}].sources`);
      return;
    }
    const copied = walk.value(finding, `findings[${index}]`, 1);
    if (!isObject(copied)) return;
    findings.push(copied);
    kept.push(index);
    if (isObject(finding) && typeof finding.claim === "string") claims.push(unsavedClaimKey(finding.claim));
  });
  if (findings.length === 0) return undefined;
  const question = typeof card.question === "string" && card.question !== LEFT_OUT ? card.question : undefined;
  return {
    card: { ...card, findings },
    ...(question === undefined ? {} : { question }),
    leftOut: walk.leftOut.slice(0, MOST_LINES_LEFT_OUT),
    claims,
    kept,
    sourcesLeftOut: walk.sourcesLeftOut,
  };
}

/**
 * What stopped a card, as the copy shows it. A problem may quote the card, so the sources left out are taken out of it
 * and it passes the same screen, or it is left out too.
 */
export function unsavedCardProblems(problems: readonly string[], sourcesLeftOut: readonly string[]): string[] {
  return problems.slice(0, MOST_PROBLEMS).map((problem) => {
    const clean = sourcesLeftOut.reduce((text, source) => text.replaceAll(source, LEFT_OUT), problem)
      .slice(0, MOST_PROBLEM_CHARACTERS);
    const reason = screenFindingsText(clean);
    return reason === undefined ? clean : `${LEFT_OUT} (${reason})`;
  });
}

/** Why the card wasn't saved, for a person reading the queue. */
export const UNSAVED_CARD_WHY_SENTENCES: Readonly<Record<UnsavedCardWhy, string>> = {
  refused: "The final check refused this card.",
  malformed: "This card didn't read as a findings card, so the final check dropped it.",
  answer_not_ready: "This card passed its checks, but the answer it came with hadn't passed the final check, so no save " +
    "was tried.",
  save_failed: "This card passed the final check, but saving it failed.",
};

/** What the AI is told once a copy is kept. */
export function unsavedCardNote(cardId: string): string {
  return `AskRigor kept a private copy of this findings card, ${cardId}, for review, so its findings aren't lost. It ` +
    "isn't saved or public. A card's checks are about its form, not a finding's worth, so don't drop a finding because " +
    "its card was refused, and don't invent a citation to pass them. If a later card from this research carries the " +
    "same findings, the copy closes by itself.";
}

/** The line a passing answer ends with, so the person can name the copy, as they can a saved card. */
export function findingsKeptLine(cardId: string): string {
  return `A private copy of this research's findings card was kept for review as ${cardId}.`;
}
