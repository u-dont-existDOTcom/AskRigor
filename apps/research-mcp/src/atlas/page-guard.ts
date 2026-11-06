/**
 * The Atlas pages' escaping and their last check (decision 171, sections 4C and 4E). Every text a page shows is
 * escaped; a rendered page that still holds a script, a findings card's reference or a YouTube link is not served.
 * The same check, applied to one text as a page would write it (passesPageGuard), decides what a participant may write
 * and which stored rows a page leaves out, so that no one's comment or name can stop a whole page from being served.
 */

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
 * Whether a link opens YouTube, by its parsed host, as a browser reads it, and again once the link is in Unicode's
 * compatibility form (NFKC): youtube.com, youtu.be or youtube-nocookie.com, or any of their subdomains. A percent-encoded
 * full stop (youtube%2Ecom) or full-width letters (ｙｏｕｔｕｂｅ.com) name the same host, which the words alone don't show
 * (the review of #422). A relative link is read against the Atlas's own origin.
 */
export function opensYouTube(link: string): boolean {
  for (const form of [link, link.normalize("NFKC")]) {
    let host: string;
    try {
      host = new URL(form, "https://askrigor.com").hostname.toLowerCase().replace(/\.$/u, "");
    } catch {
      continue;
    }
    if (/(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/u.test(host)) return true;
  }
  return false;
}

// Each link a rendered page holds, as its attribute writes it (the pages write every one double-quoted and escaped).
const PAGE_HREF = /\bhref="([^"]*)"/gu;
const unescaped = (value: string) => value.replace(/&quot;/gu, "\"").replace(/&#39;/gu, "'").replace(/&lt;/gu, "<")
  .replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");

/** What the last check finds in a rendered page: a YouTube link by its words, or by the host one of its links opens. */
export function atlasPageProblems(page: string): AtlasPageProblem[] {
  const youtube = PAGE_YOUTUBE.test(page) ||
    [...page.matchAll(PAGE_HREF)].some(([, href]) => opensYouTube(unescaped(href!)));
  return [
    ...(PAGE_SCRIPT.test(page) ? ["script" as const] : []),
    ...(PAGE_CARD_REFERENCE.test(page) ? ["card_reference" as const] : []),
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
