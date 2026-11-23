import {
  ATLAS_NEWS_NUMBER,
  AtlasNewsError,
  type AtlasNewsReviewStore,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { newsCardSchema, newsPer100Words } from "./card.js";
import {
  NEWS_DAY_HANDLER_MS,
  publishNewsDay,
  type NewsDayResult,
  type NewsExpiredItem,
  type PaperStatusLookup,
} from "./day.js";

/**
 * Atlas news, stage 1: the owner's three news actions on review_research_contribution (design v4, section 3.8; no tool
 * is added, so the frozen tool lists stay as they are). publish_news_day commits the day (later_inputs.news_day);
 * withdraw_news_item withdraws one item by its N-number, or every item with "all" (later_inputs.news_number, with the
 * owner's private reason); list_news_items reads a day (later_inputs.news_date), or one item in full, draft included
 * (later_inputs.news_number), for the shadow readers and the task's read-back, and may be called after not_after, since
 * a read stores nothing. They answer only the owner's reviewer login, while the Atlas review is open and
 * ASKRIGOR_ATLAS_NEWS is not off.
 */

export const ATLAS_NEWS_ACTIONS = ["publish_news_day", "withdraw_news_item", "list_news_items"] as const;
export type AtlasNewsAction = typeof ATLAS_NEWS_ACTIONS[number];
export function isAtlasNewsAction(action: string): action is AtlasNewsAction {
  return (ATLAS_NEWS_ACTIONS as readonly string[]).includes(action);
}

/** What a news action returns, runtime-only in the review tool's result (owner answer 189a). */
export const atlasNewsResultSchema = z.object({
  action: z.enum(ATLAS_NEWS_ACTIONS),
  status: z.string(),
  result: z.record(z.string(), z.unknown()),
}).strict();
export type AtlasNewsResult = z.infer<typeof atlasNewsResultSchema>;

export interface AtlasNewsRequest {
  action: AtlasNewsAction;
  news_day?: unknown;
  news_number?: string;
  news_date?: string;
  reason?: string;
}

export interface AtlasNewsReviewDependencies {
  store: AtlasNewsReviewStore;
  now: () => Date;
  paperStatus: PaperStatusLookup;
  /** NEWS_DAY_HANDLER_MS, shorter only in tests. */
  handlerMilliseconds?: number;
}

export interface AtlasNewsActionResult {
  ok: boolean;
  text: string;
  news: AtlasNewsResult;
}

/** Why an item left the seven-day order, in words (the 23 Nov 2026 news audit). */
const EXPIRED_WORDS: Record<NewsExpiredItem["reason"], string> = {
  seven_days: "its seven days passed",
  seven_days_staged_before_v7: "its seven days passed; staged before the news check's version 7, it was never judged " +
    "by that version's bar, nor judged again",
};

const DAY_STATUS_WORDS: Record<NewsDayResult["status"], string> = {
  committed: "The day is stored, in shadow: nothing of it shows on any page.",
  replayed: "This payload was already stored for the day; nothing was stored again.",
  stale_base: "Nothing was stored: the base the payload names is not the server's latest day. Re-insert the day's " +
    "items into the latest order the result gives (digest.py publish-json --rebase), then call once more.",
  late: "Nothing was stored: the call came after not_after, or the database passed its deadline.",
  unknown: "The database didn't answer in time: whether the day was stored is unknown. Read it back with " +
    "list_news_items and the day's news_date.",
  refused: "Nothing was stored: the payload was refused.",
};

/** Every news action answers within the day call's 60 seconds, whatever the database does (design v4, 3.8). */
export async function runAtlasNewsAction(request: AtlasNewsRequest, deps: AtlasNewsReviewDependencies):
  Promise<AtlasNewsActionResult> {
  let timer: NodeJS.Timeout | undefined;
  const late: AtlasNewsActionResult = { ok: false, text: "The database didn't answer in time; nothing is known to have " +
    "changed. Read back with list_news_items.", news: { action: request.action, status: "unknown", result: {} } };
  try {
    const work = newsAction(request, deps).catch((): AtlasNewsActionResult => ({ ok: false, text: "The news store " +
      "couldn't be reached just now; nothing is known to have changed.", news: { action: request.action,
      status: "unavailable", result: {} } }));
    return await Promise.race([work, new Promise<AtlasNewsActionResult>((resolve) => {
      timer = setTimeout(() => resolve(late), deps.handlerMilliseconds ?? NEWS_DAY_HANDLER_MS);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function newsAction(request: AtlasNewsRequest, deps: AtlasNewsReviewDependencies): Promise<AtlasNewsActionResult> {
  const at = deps.now().toISOString();
  switch (request.action) {
    case "publish_news_day": {
      if (request.news_day === undefined) {
        return refused(request.action, "publish_news_day needs later_inputs.news_day: the day's publish.json, unchanged.");
      }
      const result = await publishNewsDay(request.news_day, { store: deps.store, now: deps.now,
        paperStatus: deps.paperStatus });
      const ok = result.status === "committed" || result.status === "replayed";
      const detail = result.status === "committed" || result.status === "replayed"
        ? ` ${result.day}, version ${result.version}: ${result.order.length} item(s) in the seven-day order` +
          `${result.keptBack.length === 0 ? "" : `; kept back: ${result.keptBack.map(({ number, reasons }) =>
            `${number} (${reasons.join(", ")})`).join("; ")}`}` +
          `${result.linesKeptBack.length === 0 ? "" : `; lines kept back: ${result.linesKeptBack.map(({ line, reasons }) =>
            `line ${line} (${reasons.join(", ")})`).join("; ")}`}` +
          `${(result.expired ?? []).length === 0 ? "" : `; expired from the seven-day order: ${result.expired!.map(
            ({ number, committed, reason }) => `${number} (${EXPIRED_WORDS[reason]}, first stored ${committed})`)
            .join("; ")}`}.`
        : result.status === "refused" ? ` ${result.problems.join(" ")}` : "";
      return { ok, text: `${DAY_STATUS_WORDS[result.status]}${detail}`,
        news: { action: request.action, status: result.status, result: { ...result } } };
    }
    case "withdraw_news_item": {
      const target = request.news_number;
      if (target === undefined || request.reason === undefined) {
        return refused(request.action, "withdraw_news_item needs later_inputs.news_number (an N-number, or \"all\") " +
          "and your private reason.");
      }
      try {
        const changed = await deps.store.withdraw(target, request.reason, at);
        return { ok: true, text: changed.length === 0 ? `Nothing to withdraw: ${target === "all" ? "no item"
          : target} is not stored, or is already withdrawn.`
          : `Withdrawn: ${changed.map(({ number }) => number).join(", ")}. Your reason stays private.`,
          news: { action: request.action, status: "withdrawn", result: { withdrawn: changed.map(({ number }) => number) } } };
      } catch (error) {
        if (error instanceof AtlasNewsError) return refused(request.action, "The withdrawal was refused as invalid.");
        throw error;
      }
    }
    case "list_news_items": {
      if ((request.news_date === undefined) === (request.news_number === undefined) ||
        (request.news_number !== undefined && !ATLAS_NEWS_NUMBER.test(request.news_number))) {
        return refused(request.action, "list_news_items takes later_inputs.news_date (a day, YYYY-MM-DD) or " +
          "later_inputs.news_number (one N-number, to read it in full), not both.");
      }
      if (request.news_number !== undefined) {
        const [item] = await deps.store.inspectNumbers([request.news_number], at);
        // Its people per 100 as a reader is shown them: a missing comparison as "no comparison figure", with its reason.
        const per100 = item === undefined ? undefined : newsCardSchema.safeParse(item.card).data?.per_100;
        return { ok: true, text: item === undefined ? `No news item has the number ${request.news_number}.`
          : `${item.number}: ${item.state}${item.keptReasons === null ? "" : ` (${item.keptReasons.join(", ")})`}; ` +
            `${per100 === undefined ? "" : `people per 100: ${newsPer100Words(per100)}; `}` +
            "its card, draft, receipt claims and reading are in the result.",
          news: { action: request.action, status: item === undefined ? "not_found" : "listed",
            result: item === undefined ? {} : { item } } };
      }
      const listed = await deps.store.inspectDay(request.news_date!, at);
      const summary = listed.day === null ? `No day was stored for ${request.news_date}.`
        : `${listed.day.day}, version ${listed.day.version}: ${listed.day.order.length} item(s) in the order, ` +
          `${listed.day.keptBack.length} kept back.`;
      return { ok: true, text: `${summary} ${listed.items.length} item(s) staged or committed that day.`,
        news: { action: request.action, status: "listed", result: { day: listed.day, items: listed.items } } };
    }
  }
}

function refused(action: AtlasNewsAction, message: string): AtlasNewsActionResult {
  return { ok: false, text: message, news: { action, status: "refused", result: { problems: [message] } } };
}
