/**
 * The Atlas pages' escaping and their last check (decision 171, sections 4C and 4E). Every text a page shows is
 * escaped; a rendered page that still holds a script, a findings card's reference or a YouTube link is not served.
 * The same check, applied to one text as a page would write it (passesPageGuard), decides what a participant may write
 * and which stored rows a page leaves out, so that no one's comment or name can stop a whole page from being served.
 */

import { ATLAS_NAMED_VIDEO_LINK, opensYouTube, withoutFormatCharacters } from "@askrigor/evidence-repository";

// How the Atlas reads a text and a link for its guards, shared with the stores' and the write-time checks (the review
// of #422, fourth round): a text without its format characters, a link by the host a browser opens it at.
export { opensYouTube, withoutFormatCharacters };

/** Text made safe for HTML content and double- or single-quoted attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

// What a page never holds, whatever its data: a script, a findings card's reference (ARF- and four digits or more, as
// the Atlas's own guards read one) or a YouTube link. The stores already refuse each of them; a page that holds one is
// not served.
const PAGE_SCRIPT = /<script\b/iu;
const PAGE_CARD_REFERENCE = /ARF-\d{4}/iu;
const PAGE_YOUTUBE = /(?:youtube(?:-nocookie)?\.com|youtu\.be)/iu;

export type AtlasPageProblem = "script" | "card_reference" | "youtube_link";

/**
 * Owner answer 307b (15 November 2026): the one YouTube link a public page may hold. A finding's page links a video
 * that a person named, exactly as namedVideoAnchor writes it: the video's watch page by its 11-character ID, under
 * fixed words, with nothing else of the video. The last check sets each such link aside and reads the rest of the page
 * as before, so any other YouTube text or link, a script or a card's reference still stops the page. Every text a page
 * shows is escaped, so no stored text can write this link.
 */
export const NAMED_VIDEO_ANCHOR_WORDS = "Watch the video on YouTube";
const NAMED_VIDEO_ANCHOR = new RegExp('<a class="named-video" href="https://www\\.youtube\\.com/watch\\?v=[A-Za-z0-9_-]{11}" ' +
  `rel="noopener nofollow">${NAMED_VIDEO_ANCHOR_WORDS}</a>`, "gu");

/** A named video's link as a page writes it, the only form the last check sets aside; undefined for any other link. */
export function namedVideoAnchor(link: string): string | undefined {
  return ATLAS_NAMED_VIDEO_LINK.test(link)
    ? `<a class="named-video" href="${link}" rel="noopener nofollow">${NAMED_VIDEO_ANCHOR_WORDS}</a>`
    : undefined;
}

// Each link a rendered page holds, as its attribute writes it (the pages write every one double-quoted and escaped).
const PAGE_HREF = /\bhref="([^"]*)"/gu;
const unescaped = (value: string) => value.replace(/&quot;/gu, "\"").replace(/&#39;/gu, "'").replace(/&lt;/gu, "<")
  .replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");

/**
 * What the last check finds in a rendered page, read as a reader sees it, without its format characters (so a
 * zero-width joiner inside "youtube.com" doesn't hide it): a script, a findings card's reference, or a YouTube link by
 * its words or by the host one of its links opens, other than a named video's link as the pages write it.
 */
export function atlasPageProblems(page: string): AtlasPageProblem[] {
  // Owner answer 307b: a named video's link, exactly as the pages write it, is set aside before the rest is read.
  const shown = withoutFormatCharacters(page).replace(NAMED_VIDEO_ANCHOR, "<a></a>");
  const youtube = PAGE_YOUTUBE.test(shown) ||
    [...shown.matchAll(PAGE_HREF)].some(([, href]) => opensYouTube(unescaped(href!)));
  return [
    ...(PAGE_SCRIPT.test(shown) ? ["script" as const] : []),
    ...(PAGE_CARD_REFERENCE.test(shown) ? ["card_reference" as const] : []),
    ...(youtube ? ["youtube_link" as const] : []),
  ];
}

/** What the last check would find in one text, written onto a page as the pages write every text: escaped. */
export function pageGuardProblems(text: string): AtlasPageProblem[] {
  return atlasPageProblems(escapeHtml(text));
}

/** Whether a text, written onto a page, leaves the page servable. */
export function passesPageGuard(text: string): boolean {
  return pageGuardProblems(text).length === 0;
}

/**
 * Whether every text a stored row holds, at any depth of its lists and fields, leaves a page servable, as
 * passesPageGuard reads one. A row that fails is left out of every page that would show it (the review of #422, fourth
 * round: a published claim holding "you" and "tube.com" with a zero-width space between them made every page that
 * listed it answer 503), so that no stored text can stop a page; the page's last check stays.
 */
export function rowPassesPageGuard(row: unknown): boolean {
  const texts: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(row);
  // One line each: none of the last check's patterns spans a line break, so the texts pass together exactly when each
  // passes alone, and the row is read once.
  return passesPageGuard(texts.join("\n"));
}
