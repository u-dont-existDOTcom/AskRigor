import {
  ATLAS_KEEP_NUMBERS_PER_CALL,
  AtlasPublicationError,
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
 */

export const ATLAS_KEEP_ACTIONS = ["keep_for_research", "show_on_pages", "list_kept"] as const;
export type AtlasKeepAction = typeof ATLAS_KEEP_ACTIONS[number];
export const ATLAS_KEEP_OUTCOMES = ["kept_for_research", "shown_on_pages", "kept_listed"] as const;
export type AtlasKeepOutcome = typeof ATLAS_KEEP_OUTCOMES[number];

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
    let views: AtlasKeptView[];
    try {
      views = await this.deps.publications.keep({
        publicationNumbers: numbers.filter((number) => number.startsWith("P-")),
        atlasNumbers: numbers.filter((number) => number.startsWith("F-")),
        keep, reason: keep ? reason! : null, at: this.deps.now().toISOString(),
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
    const lines = views.map((view) => `${view.publicationNumber}${view.atlasNumber === null ? "" : ` (${view.atlasNumber})`}: ` +
      `${view.state}, ${view.kept ? "kept for research" : "on the pages"}`);
    return {
      ok: true,
      outcome: keep ? "kept_for_research" : "shown_on_pages",
      text: `${views.length} publication(s) ${keep ? "kept for AskRigor's research: each stays in the research lookup " +
        "and keeps its page, and no list, topic, search, map or sitemap shows it" : "shown on the pages again"}. ` +
        `${lines.join("; ")}.${missing.length === 0 ? "" : ` Not found: ${missing.join(", ")}.`}`,
      kept: { items: views.map(itemOf) },
    };
  }
}
