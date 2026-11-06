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
// The hosts that serve YouTube, each with its subdomains: youtube.com, youtu.be, youtube-nocookie.com, and
// youtube.googleapis.com, the address of its older embedded player (the review of #422, third round).
const YOUTUBE_HOST = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com|youtube\.googleapis\.com)$/u;
// Unicode's format characters (Cf), which show nothing themselves: a zero-width joiner, a direction mark and the like.
const FORMAT_CHARACTER = /\p{Cf}/gu;

/** A text as the checks here read it: as a reader sees it, without the format characters, which show nothing. */
export function withoutFormatCharacters(text: string): string {
  return text.replace(FORMAT_CHARACTER, "");
}

export type AtlasPageProblem = "script" | "card_reference" | "youtube_link";

/**
 * Whether a link opens YouTube, by its parsed host, as a browser reads it, and again once the link is in Unicode's
 * compatibility form (NFKC) without its format characters: one of YOUTUBE_HOST's hosts, or any of their subdomains. A
 * percent-encoded full stop (youtube%2Ecom), full-width letters (ｙｏｕｔｕｂｅ.com) or a zero-width joiner name the same
 * host, which the words alone don't show (the review of #422). A relative link is read against the Atlas's own origin.
 * A limit: only the host a link names is read, never where it leads, so a link shortener's or a site's own redirect
 * to YouTube (bit.ly, t.co, a page's ?url=) isn't seen.
 */
export function opensYouTube(link: string): boolean {
  for (const form of new Set([link, link.normalize("NFKC"), withoutFormatCharacters(link).normalize("NFKC")])) {
    let host: string;
    try {
      host = new URL(form, "https://askrigor.com").hostname.toLowerCase().replace(/\.$/u, "");
    } catch {
      continue;
    }
    if (YOUTUBE_HOST.test(host)) return true;
  }
  return false;
}

// Each link a rendered page holds, as its attribute writes it (the pages write every one double-quoted and escaped).
const PAGE_HREF = /\bhref="([^"]*)"/gu;
const unescaped = (value: string) => value.replace(/&quot;/gu, "\"").replace(/&#39;/gu, "'").replace(/&lt;/gu, "<")
  .replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");

/**
 * What the last check finds in a rendered page, read as a reader sees it, without its format characters (so a
 * zero-width joiner inside "youtube.com" doesn't hide it): a script, a findings card's reference, or a YouTube link by
 * its words or by the host one of its links opens.
 */
export function atlasPageProblems(page: string): AtlasPageProblem[] {
  const shown = withoutFormatCharacters(page);
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
