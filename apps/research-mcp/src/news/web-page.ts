import { readForumPage, type ForumPage } from "@askrigor/sources";

import { forumTextDigest, isRedditLink } from "../forum-thread-links.js";
import {
  quoteFinder,
  quoteTooShort,
  SOURCE_LINE_REASONS,
  SOURCE_LINE_TEXTS,
  webPageBlocks,
  type Finder,
  type SourceLineLookup,
  type SourceLineRequest,
} from "../source-lines.js";
import type { NewsCard } from "./card.js";

/**
 * Atlas news (the 24 Nov 2026 news audit): a news card's quote from an official page is looked up in that page. An
 * official notice has no paper, so every quote from gov.uk or fda.gov came back unchecked (`u:none`) and its card was
 * always kept back (N-1001, N-1013), although its check had read the page whole with read_forum_thread. Nothing holds
 * that page's text, so once the check passes AskRigor's server reads the page again, with the reader the tool uses (its
 * limits, its own name, robots.txt, never Reddit, no way around a bot check), and looks the quotes up in it by the news
 * matching, only when the text is the one a verified forum_thread_read receipt signed (`tx`). The text is held for this
 * check alone and kept nowhere; only the news card's lines that rest on a web address, and on no paper's text or record,
 * are looked up so.
 */

/** A news card's line is looked up in any line's texts, or in a web page its check read: never a paper's text. */
export const NEWS_LINE_TEXTS = [...SOURCE_LINE_TEXTS, "web_page"] as const;
/** Why a news card's line wasn't looked up: any line's reasons, or a page that no longer reads as its check read it. */
export const NEWS_LINE_REASONS = [...SOURCE_LINE_REASONS, "text_changed"] as const;

/** What looking one of a news card's lines up found, as finalize_research signs it (news/claims.ts). */
export type NewsLineLookup = Omit<SourceLineLookup, "text" | "reason"> & {
  text?: typeof NEWS_LINE_TEXTS[number] | undefined;
  reason?: typeof NEWS_LINE_REASONS[number] | undefined;
};

/** A web page a check read: its address as a key source gives it, and the digest of its text each verified read signed. */
export interface NewsWebPage {
  url: string;
  texts: readonly string[];
}

/** Where a news card's line may be looked up: as any line, or in the page its key source's address was read as. */
export interface NewsLineRequest extends SourceLineRequest {
  page?: NewsWebPage | undefined;
}
export type NewsPageRequest = NewsLineRequest & { page: NewsWebPage };

/** A request for a page, not for a paper's text. */
export const onNewsPage = (request: NewsLineRequest): request is NewsPageRequest => request.page !== undefined;

/** One of a news card's backing lines as it is looked up. */
export interface NewsLine {
  source: string;
  sentence: string;
  field: NewsCard["backing"][number]["field"];
}

/** At most this many pages are read again for one check. */
export const NEWS_PAGE_LIMIT = 3;
/** What each page has to be read again in, within the final check's eight seconds for the news card's lines. */
export const NEWS_PAGE_MILLISECONDS = 7_000;

/** The fields whose quotes the day call asks found, whose pages come first. */
const FIELDS_REQUIRED_FIRST: readonly NewsLine["field"][] = ["official_action", "how_much", "who_paid"];

/** A page read again whose text is the one signed, as quotes are looked up in it; or why it can't be. */
type PageText = { find: Finder; cut: boolean } | "text_changed" | "text_unavailable";

/**
 * Looks each line up in the page its key source's address was read as, all pages read again at once. A page whose text
 * is another than the one signed leaves its lines unchecked (`text_changed`), as one that can't be read again in time
 * does (`text_unavailable`). A quote not in a page the reader cut at its size limit isn't called missing.
 */
export async function lookUpNewsPages(
  lines: readonly NewsLine[],
  requests: readonly NewsPageRequest[],
  read: (url: string) => Promise<ForumPage> = readForumPage,
  milliseconds = NEWS_PAGE_MILLISECONDS
): Promise<NewsLineLookup[]> {
  const order = ({ line }: NewsPageRequest) => {
    const place = FIELDS_REQUIRED_FIRST.indexOf(lines[line]!.field);
    return place < 0 ? FIELDS_REQUIRED_FIRST.length : place;
  };
  const pages = new Map<string, Promise<PageText>>();
  for (const { page } of requests.filter(({ line }) => !quoteTooShort(lines[line]!.sentence))
    .sort((left, right) => order(left) - order(right))) {
    if (!pages.has(page.url) && pages.size < NEWS_PAGE_LIMIT) pages.set(page.url, readAgain(page, read, milliseconds));
  }
  return await Promise.all(requests.map(async ({ line, page }): Promise<NewsLineLookup> => {
    const { source, sentence } = lines[line]!;
    const unchecked = (reason: NewsLineLookup["reason"]): NewsLineLookup =>
      ({ source, sentence: "not_checked", conclusion: "not_checked", reason });
    if (quoteTooShort(sentence)) return unchecked("too_short");
    const text = await (pages.get(page.url) ?? "text_unavailable" as const);
    if (typeof text === "string") return unchecked(text);
    const { found, section } = text.find(sentence);
    return {
      source,
      sentence: found ? "found" : text.cut ? "not_checked" : "not_found",
      ...(section === undefined ? {} : { sentence_section: section }),
      conclusion: "not_checked",
      text: "web_page",
      // What follows a page's cut can't be read here, so a quote may be in it.
      ...(!found && text.cut ? { reason: "text_unavailable" as const } : {})
    };
  }));
}

/** A page read again, when its text is one the check's reads signed. Never throws, and waits no longer than it may. */
async function readAgain(
  { url, texts }: NewsWebPage,
  read: (url: string) => Promise<ForumPage>,
  milliseconds: number
): Promise<PageText> {
  // Reddit is read by its own reader alone, whose reads sign no page text.
  if (isRedditLink(url)) return "text_unavailable";
  let timer: NodeJS.Timeout | undefined;
  try {
    const page = await Promise.race([
      read(url),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(resolve, milliseconds, undefined);
        timer.unref();
      })
    ]);
    if (page?.access_state !== "read" || page.page_text === undefined) return "text_unavailable";
    if (!texts.includes(forumTextDigest(page.page_text))) return "text_changed";
    return { find: quoteFinder(webPageBlocks(page.page_text), "news"), cut: page.truncated === true };
  } catch {
    return "text_unavailable";
  } finally {
    clearTimeout(timer);
  }
}
