import {
  ATLAS_KEEP_NUMBERS_PER_CALL,
  AtlasPublicationError,
  type AtlasChallengeVerdict,
  type AtlasKeptView,
  type AtlasPublicationStore,
} from "@askrigor/evidence-repository";
import { z } from "zod";

/**
 * Findings kept for AskRigor's research only (owner answers 229a and 231a, 3 Nov 2026: "the atlas can have answers
 * that askrigor can draw from btw that was also the point, to not -redo research that was already done, but the public
 * facing display should not just be all the stored research, we want to give humans only what's high value they can't
 * easily find elsewhere"), as runtime actions of review_research_contribution (owner answer 189a). keep_for_research
 * keeps publications, by P number or by F number (every publication naming it), with the owner's private reason: each
 * stays in the research lookup and keeps its page, which says so and is kept out of search engines, but no list, topic,
 * home page, search, map or sitemap shows it; an unpublished card comes back that way. show_on_pages shows them again;
 * list_kept lists them with their reasons. Held, rejected, forgotten, set-aside and replaced publications can't be
 * kept: they stay out of the lookup as before.
 *
 * Codex's third review of 17 Nov 2026, finding 2: show_on_pages records how it shows each kept one, at that moment.
 * Nothing is read from the reason it was kept for. Its fourth review (P1s): the owner and the scheduled test use the
 * same review login, so who acts is said, never assumed: later_inputs.shown_by is owner, recorded as the owner's
 * decision, apart from the route, which no later showing replaces; or quick_answer_test, with
 * later_inputs.quick_answer_verdict (docs/atlas-quick-answer-test.md, step 5), recorded as the test's route with that
 * verdict. A show_on_pages that doesn't say is refused, and changes nothing.
 */

export const ATLAS_KEEP_ACTIONS = ["keep_for_research", "show_on_pages", "list_kept"] as const;
export type AtlasKeepAction = typeof ATLAS_KEEP_ACTIONS[number];
export const ATLAS_KEEP_OUTCOMES = ["kept_for_research", "shown_on_pages", "kept_listed"] as const;
export type AtlasKeepOutcome = typeof ATLAS_KEEP_OUTCOMES[number];
/** Who shows publications with show_on_pages (later_inputs.shown_by): the owner, or the quick-answer test. */
export const ATLAS_SHOWN_BY = ["owner", "quick_answer_test"] as const;
export type AtlasShownBy = typeof ATLAS_SHOWN_BY[number];

const NUMBER = /^[PF]-[1-9][0-9]{3,}$/u;

/** later_inputs.items on keep_for_research and show_on_pages: P and F numbers, up to 100. */
export const keepItemsInputSchema = z.array(z.string().trim().toUpperCase().regex(NUMBER))
  .min(1).max(ATLAS_KEEP_NUMBERS_PER_CALL);

export const atlasKeptSchema = z.object({
  items: z.array(z.object({
    publication: z.string().regex(/^P-[1-9][0-9]{3,}$/u),
    atlasNumber: z.string().regex(/^F-[1-9][0-9]{3,}$/u).nullable(),
    state: z.string(),
    kept: z.boolean(),
    reason: z.string().nullable().describe("The owner's private reason, from list_kept."),
    keptOn: z.string().nullable(),
  }).strict()),
}).strict();
export type AtlasKept = z.infer<typeof atlasKeptSchema>;

export interface AtlasKeepRequest {
  action: AtlasKeepAction;
  publication?: string;
  atlasNumber?: string;
  items?: string[];
  reason?: string;
  /** show_on_pages: the quick-answer test's verdict, which only the test's own showing gives. */
  quick_answer_verdict?: AtlasChallengeVerdict;
  /** show_on_pages: who shows them, which it needs (Codex's fourth review of 17 Nov 2026). */
  shown_by?: AtlasShownBy;
}

export interface AtlasKeepResult {
  ok: boolean;
  text: string;
  outcome?: AtlasKeepOutcome;
  error?: { code: "invalid_request"; message: string };
  kept?: AtlasKept;
}

const refused = (text: string): AtlasKeepResult => ({ ok: false, text, error: { code: "invalid_request", message: text } });

const itemOf = (view: AtlasKeptView): AtlasKept["items"][number] => ({ publication: view.publicationNumber,
  atlasNumber: view.atlasNumber, state: view.state, kept: view.kept, reason: view.reason,
  keptOn: view.keptAt === null ? null : view.keptAt.slice(0, 10) });

export class AtlasKeptReview {
  constructor(private readonly deps: { publications: AtlasPublicationStore; now: () => Date }) {}

  async run(request: AtlasKeepRequest): Promise<AtlasKeepResult> {
    if (request.action === "list_kept") {
      const kept = await this.deps.publications.inspectKept();
      return {
        ok: true,
        outcome: "kept_listed",
        text: kept.length === 0 ? "No publication is kept for research only." : `${kept.length} publication(s) kept ` +
          `for research only: ${kept.map((view) => `${view.publicationNumber}${view.atlasNumber === null ? ""
            : ` (${view.atlasNumber})`}`).join(", ")}.`,
        kept: { items: kept.map(itemOf) },
      };
    }
    const keep = request.action === "keep_for_research";
    const given = [request.publication, request.atlasNumber, ...(request.items ?? [])]
      .flatMap((number) => number === undefined ? [] : [number.trim().toUpperCase()]);
    const numbers = [...new Set(given)];
    if (numbers.length === 0 || numbers.length > ATLAS_KEEP_NUMBERS_PER_CALL || !numbers.every((number) => NUMBER.test(number))) {
      return refused(`${request.action} needs publication (P-1003), atlasNumber (F-1007) or later_inputs.items: up to ` +
        `${ATLAS_KEEP_NUMBERS_PER_CALL} of them.`);
    }
    const reason = request.reason?.trim();
    if (keep && (reason === undefined || reason.length === 0)) {
      return refused("keep_for_research needs reason: the owner's private reason, such as \"owner answer 229a\".");
    }
    if (!keep && reason !== undefined) return refused("show_on_pages takes no reason.");
    const verdict = request.quick_answer_verdict;
    if (keep && verdict !== undefined) return refused("keep_for_research takes no quick_answer_verdict.");
    if (keep && request.shown_by !== undefined) return refused("keep_for_research takes no shown_by.");
    if (!keep && request.shown_by === undefined) {
      return refused("show_on_pages needs later_inputs.shown_by: owner when AskRigor's owner shows them, or " +
        "quick_answer_test, with later_inputs.quick_answer_verdict, when the quick-answer test does. Nothing was changed.");
    }
    if (request.shown_by === "owner" && verdict !== undefined) {
      return refused("show_on_pages by the owner takes no quick_answer_verdict: only the quick-answer test gives one. " +
        "Nothing was changed.");
    }
    if (request.shown_by === "quick_answer_test" && verdict === undefined) {
      return refused("show_on_pages by the quick-answer test needs later_inputs.quick_answer_verdict: pass, headline or " +
        "fail. Nothing was changed.");
    }
    let views: AtlasKeptView[];
    try {
      views = await this.deps.publications.keep({
        publicationNumbers: numbers.filter((number) => number.startsWith("P-")),
        atlasNumbers: numbers.filter((number) => number.startsWith("F-")),
        keep, reason: keep ? reason! : null, at: this.deps.now().toISOString(),
        ...(keep ? {} : { route: request.shown_by === "owner" ? { by: "owner_action" as const }
          : { by: "quick_answer_test" as const, verdict: verdict! } }),
      });
    } catch (error) {
      if (error instanceof AtlasPublicationError && error.code === "NOT_KEEPABLE") {
        return refused("One of them is held, rejected, forgotten, set aside or replaced, so it can't be kept for " +
          "research; nothing was changed. list_publications shows each one's state.");
      }
      if (error instanceof AtlasPublicationError) return refused("Those numbers are not valid; nothing was changed.");
      throw error;
    }
    const found = new Set(views.flatMap((view) => [view.publicationNumber, ...(view.atlasNumber === null ? [] : [view.atlasNumber])]));
    const missing = numbers.filter((number) => !found.has(number));
    // Codex's fifth review of 17 Nov 2026 (P1): what the database stored after the showing, read back, is what the
    // answer says. A showing never lifts a hold, and the table holds a finding a save stored as naming a living person
    // that the owner hasn't decided, whoever shows it: such a one has no page, and the answer never says it shows.
    const paged = (view: AtlasKeptView) => !view.kept && ["unreviewed", "accepted", "edited"].includes(view.state);
    const unpaged = keep ? [] : views.filter((view) => !paged(view));
    const reasons = new Map<string, readonly string[]>();
    if (unpaged.some(({ state }) => state === "held")) {
      for (const row of await this.deps.publications.inspect({
        publicationNumbers: unpaged.map(({ publicationNumber }) => publicationNumber), limit: unpaged.length })) {
        reasons.set(row.publicationNumber, row.heldBecause ?? []);
      }
    }
    const noPage = (view: AtlasKeptView) => view.state === "held"
      ? (reasons.get(view.publicationNumber) ?? []).includes("living_person_review")
        ? "held, with no page: it may name a living person, and only your accept_finding or edit_finding shows it"
        : "held, with no page: a showing doesn't lift a hold; your accept_finding, edit_finding or reject_finding decides it"
      : view.kept ? "still kept for research" : `${view.state}, with no page`;
    const lines = views.map((view) => `${view.publicationNumber}${view.atlasNumber === null ? "" : ` (${view.atlasNumber})`}: ` +
      `${!keep && !paged(view) ? noPage(view) : `${view.state}, ${view.kept ? "kept for research" : "on the pages"}`}`);
    if (unpaged.length > 0) {
      const shown = views.length - unpaged.length;
      return {
        ok: false,
        text: `${shown} of ${views.length} publication(s) shown on the pages again; ${unpaged.length} not, so ` +
          `${unpaged.length === 1 ? "its page answers" : "their pages answer"} not found. ${lines.join("; ")}.` +
          `${missing.length === 0 ? "" : ` Not found: ${missing.join(", ")}.`}`,
        kept: { items: views.map(itemOf) },
      };
    }
    return {
      ok: true,
      outcome: keep ? "kept_for_research" : "shown_on_pages",
      text: `${views.length} publication(s) ${keep ? "kept for AskRigor's research: each stays in the research lookup " +
        "and keeps its page, and no list, topic, search, map or sitemap shows it" : "shown on the pages again"}. ` +
        `${lines.join("; ")}.${missing.length === 0 ? "" : ` Not found: ${missing.join(", ")}.`}` +
        (keep ? "" : request.shown_by === "owner" ? " Each is recorded as shown by AskRigor's owner, his decision, which " +
          "a later save never undoes."
          : ` Each is recorded as shown by the quick-answer test, with its verdict: ${verdict}.`),
      kept: { items: views.map(itemOf) },
    };
  }
}
