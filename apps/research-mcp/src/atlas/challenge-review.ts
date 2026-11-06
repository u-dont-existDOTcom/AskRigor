import { createHash } from "node:crypto";

import {
  ATLAS_CHALLENGE_NUMBERS_PER_CALL,
  ATLAS_CHALLENGE_SOURCE_LABEL_MAX_CHARACTERS,
  ATLAS_CHALLENGE_SOURCE_URL_MAX_CHARACTERS,
  ATLAS_CHALLENGE_USUAL_VIEW_MAX_CHARACTERS,
  ATLAS_CHALLENGE_VERDICTS,
  AtlasPublicationError,
  validChallengeMark,
  type AtlasChallengeMark,
  type AtlasChallengeVerdict,
  type AtlasChallengeView,
  type AtlasPublicationStore,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { passesPageGuard } from "./page-guard.js";
import { textHoldReasons } from "./publication.js";

/**
 * Findings that challenge the usual view (the owner, 6 November 2026: "we should also have a section for results that
 * challenge mainstream consensus even if it's available with a standard ai answer, like this one"), as runtime actions
 * of review_research_contribution (owner answer 189a). mark_challenge marks shown or kept publications, by P number,
 * with the usual view in one plain line, its source (a label and an https link) and the quick-answer test's verdict for
 * the finding; who marked it is the reviewer login, kept only as a digest; clear_challenge takes the mark off;
 * list_challenges lists every marked publication. Marking shows nothing: showing stays show_on_pages. The pages show the
 * mark of a shown finding, with its usual view and source, and list the shown ones on /atlas/challenges. A mark is
 * refused, and nothing changes, when its texts hold what the pages never show (contact details, a findings card's
 * reference or a YouTube link), so it never holds a page back; the Atlas keeps no YouTube comment data.
 */

export const ATLAS_CHALLENGE_ACTIONS = ["mark_challenge", "clear_challenge", "list_challenges"] as const;
export type AtlasChallengeAction = typeof ATLAS_CHALLENGE_ACTIONS[number];
export const ATLAS_CHALLENGE_OUTCOMES = ["challenge_marked", "challenge_cleared", "challenges_listed"] as const;
export type AtlasChallengeOutcome = typeof ATLAS_CHALLENGE_OUTCOMES[number];
/** The later inputs mark_challenge takes beside items, which nothing else takes. */
export const ATLAS_CHALLENGE_MARK_INPUTS = [
  "usual_view", "usual_view_source_url", "usual_view_source_label", "quick_answer_verdict",
] as const;

/** later_inputs on mark_challenge: the usual view, its source and the quick-answer test's verdict. */
export const challengeMarkInputShape = {
  usual_view: z.string().trim().min(1).max(ATLAS_CHALLENGE_USUAL_VIEW_MAX_CHARACTERS).optional()
    .describe("With mark_challenge: what most doctors and major guidelines currently advise for the problem, in one " +
      `plain line of at most ${ATLAS_CHALLENGE_USUAL_VIEW_MAX_CHARACTERS} characters.`),
  usual_view_source_url: z.string().trim().min(1).max(ATLAS_CHALLENGE_SOURCE_URL_MAX_CHARACTERS).optional()
    .describe("With mark_challenge: the https link to the usual view's source, such as a major guideline."),
  usual_view_source_label: z.string().trim().min(1).max(ATLAS_CHALLENGE_SOURCE_LABEL_MAX_CHARACTERS).optional()
    .describe("With mark_challenge: the words the pages show for that source, such as the guideline's name and year."),
  quick_answer_verdict: z.enum(ATLAS_CHALLENGE_VERDICTS).optional()
    .describe("With mark_challenge: the quick-answer test's verdict for the finding: pass, headline or fail."),
};

export const atlasChallengesSchema = z.object({
  items: z.array(z.object({
    publication: z.string().regex(/^P-[1-9][0-9]{3,}$/u),
    atlasNumber: z.string().regex(/^F-[1-9][0-9]{3,}$/u).nullable(),
    state: z.string(),
    kept: z.boolean(),
    usualView: z.string().nullable(),
    usualViewSourceUrl: z.string().nullable(),
    usualViewSourceLabel: z.string().nullable(),
    quickAnswerVerdict: z.enum(ATLAS_CHALLENGE_VERDICTS).nullable(),
    markedBy: z.string().nullable().describe("The reviewer login's digest, never the login."),
    markedOn: z.string().nullable(),
  }).strict()),
}).strict();
export type AtlasChallenges = z.infer<typeof atlasChallengesSchema>;

export interface AtlasChallengeRequest {
  action: AtlasChallengeAction;
  items?: string[];
  usual_view?: string;
  usual_view_source_url?: string;
  usual_view_source_label?: string;
  quick_answer_verdict?: AtlasChallengeVerdict;
  /** The reviewer login that made the call, which the mark keeps only as a digest (challengeMarker). */
  reviewer?: string;
}

export interface AtlasChallengeResult {
  ok: boolean;
  text: string;
  outcome?: AtlasChallengeOutcome;
  error?: { code: "invalid_request"; message: string };
  challenges?: AtlasChallenges;
}

/** Who marked it: the reviewer login as 16 hex characters of a domain-separated SHA-256, never the login itself. */
export function challengeMarker(reviewer: string): string {
  return `reviewer:${createHash("sha256").update("askrigor:atlas-challenge-marker:v1\0", "utf8")
    .update(reviewer, "utf8").digest("hex").slice(0, 16)}`;
}

const refused = (text: string): AtlasChallengeResult => ({ ok: false, text, error: { code: "invalid_request", message: text } });

const itemOf = (view: AtlasChallengeView): AtlasChallenges["items"][number] => ({
  publication: view.publicationNumber, atlasNumber: view.atlasNumber, state: view.state, kept: view.kept,
  usualView: view.mark?.usualView ?? null, usualViewSourceUrl: view.mark?.sourceUrl ?? null,
  usualViewSourceLabel: view.mark?.sourceLabel ?? null, quickAnswerVerdict: view.mark?.verdict ?? null,
  markedBy: view.mark?.markedBy ?? null, markedOn: view.mark?.markedAt.slice(0, 10) ?? null,
});

const PUBLICATION_NUMBER = /^P-[1-9][0-9]{3,}$/u;

export class AtlasChallengeReview {
  constructor(private readonly deps: { publications: AtlasPublicationStore; now: () => Date }) {}

  async run(request: AtlasChallengeRequest): Promise<AtlasChallengeResult> {
    const given = ATLAS_CHALLENGE_MARK_INPUTS.filter((field) => request[field] !== undefined);
    if (request.action === "list_challenges") {
      if (request.items !== undefined || given.length > 0) return refused("list_challenges takes nothing else.");
      const marked = await this.deps.publications.inspectChallenges();
      return {
        ok: true,
        outcome: "challenges_listed",
        text: marked.length === 0 ? "No publication is marked as challenging the usual view."
          : `${marked.length} publication(s) marked as challenging the usual view: ${marked.map((view) =>
            `${view.publicationNumber}${view.atlasNumber === null ? "" : ` (${view.atlasNumber})`}, ` +
            `${view.mark?.verdict ?? "no verdict"}${view.kept ? ", kept for research" : ""}`).join("; ")}.`,
        challenges: { items: marked.map(itemOf) },
      };
    }
    const mark = request.action === "mark_challenge";
    const numbers = [...new Set((request.items ?? []).map((number) => number.trim().toUpperCase()))];
    if (numbers.length === 0 || numbers.length > ATLAS_CHALLENGE_NUMBERS_PER_CALL ||
      !numbers.every((number) => PUBLICATION_NUMBER.test(number))) {
      return refused(`${request.action} needs later_inputs.items: up to ${ATLAS_CHALLENGE_NUMBERS_PER_CALL} P numbers, ` +
        "such as [\"P-1003\"]; F numbers are not taken.");
    }
    if (!mark && given.length > 0) return refused(`clear_challenge takes only items, not ${given.join(", ")}.`);
    let challenge: AtlasChallengeMark | null = null;
    let markedBy: string | null = null;
    if (mark) {
      const missing = ATLAS_CHALLENGE_MARK_INPUTS.filter((field) => request[field] === undefined);
      if (missing.length > 0) {
        return refused(`mark_challenge needs later_inputs.${missing.join(", later_inputs.")}: the usual view in one ` +
          "plain line, its source's https link and label, and the quick-answer test's verdict (pass, headline or fail).");
      }
      challenge = { usualView: request.usual_view!.trim(), sourceUrl: request.usual_view_source_url!.trim(),
        sourceLabel: request.usual_view_source_label!.trim(), verdict: request.quick_answer_verdict! };
      if (!validChallengeMark(challenge)) {
        return refused("mark_challenge needs the usual view and its source's label each on one plain line, within " +
          "their bounds, and its source's link as an https address; nothing was changed.");
      }
      // What the pages never show, in any of the mark's texts: nothing would show the mark, so none is kept.
      const texts = [challenge.usualView, challenge.sourceLabel, challenge.sourceUrl];
      if (texts.some((text) => textHoldReasons(text).length > 0 || !passesPageGuard(text))) {
        return refused("The usual view, its source or its link holds what the Atlas pages never show (contact " +
          "details, a findings card's reference or a YouTube link); nothing was changed.");
      }
      if (request.reviewer === undefined || request.reviewer === "") {
        return refused("mark_challenge needs the reviewer login that marks it; nothing was changed.");
      }
      markedBy = challengeMarker(request.reviewer);
    }
    let views: AtlasChallengeView[];
    try {
      views = await this.deps.publications.markChallenges({ publicationNumbers: numbers, mark: challenge, markedBy,
        at: this.deps.now().toISOString() });
    } catch (error) {
      if (error instanceof AtlasPublicationError && error.code === "NOT_MARKABLE") {
        return refused("One of them is held, rejected or withdrawn, so it can't be marked; nothing was changed. " +
          "list_publications shows each one's state.");
      }
      if (error instanceof AtlasPublicationError) return refused("Those numbers or texts are not valid; nothing was changed.");
      throw error;
    }
    const found = new Set(views.map((view) => view.publicationNumber));
    const missing = numbers.filter((number) => !found.has(number));
    const lines = views.map((view) => `${view.publicationNumber}${view.atlasNumber === null ? "" : ` (${view.atlasNumber})`}: ` +
      `${view.state}, ${view.kept ? "kept for research" : "on the pages"}`);
    return {
      ok: true,
      outcome: mark ? "challenge_marked" : "challenge_cleared",
      text: `${views.length} publication(s) ${mark ? "marked as challenging the usual view. Marking shows nothing: a " +
        "finding kept for research stays kept until show_on_pages" : "no longer marked as challenging the usual view"}. ` +
        `${lines.join("; ")}.${missing.length === 0 ? "" : ` Not found: ${missing.join(", ")}.`}`,
      challenges: { items: views.map(itemOf) },
    };
  }
}
