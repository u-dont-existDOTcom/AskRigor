/**
 * How the Atlas reads a text and a link for its guards (the review of #422): a text as a reader sees it, without
 * Unicode's format characters, which show nothing, so a zero-width space or joiner inside "youtube.com", an e-mail
 * address or a card's number can't hide it; and a link by the host a browser opens it at. The research server's
 * write-time checks and its pages' last check (apps/research-mcp/src/atlas/page-guard.ts) read them as the stores do.
 */

// Unicode's format characters (Cf), which show nothing themselves: a zero-width space or joiner, a direction mark, a
// soft hyphen and the like.
const FORMAT_CHARACTER = /\p{Cf}/gu;

/** A text as a reader sees it: without its format characters, which show nothing. */
export function withoutFormatCharacters(text: string): string {
  return text.replace(FORMAT_CHARACTER, "");
}

// The hosts that serve YouTube, each with its subdomains: youtube.com, youtu.be, youtube-nocookie.com, and
// youtube.googleapis.com, the address of its older embedded player (the review of #422, third round).
const YOUTUBE_HOST = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com|youtube\.googleapis\.com)$/u;

/**
 * Whether a link opens YouTube, by its parsed host, as a browser reads it, and again once the link is in Unicode's
 * compatibility form (NFKC) without its format characters: one of YOUTUBE_HOST's hosts, or any of their subdomains. A
 * percent-encoded full stop (youtube%2Ecom), full-width letters (ｙｏｕｔｕｂｅ.com) or a
 * zero-width joiner name the same host, which the words alone don't show (the review of #422). A relative link is read
 * against the Atlas's own origin. A limit: only the host a link names is read, never where it leads, so a link
 * shortener's or a site's own redirect to YouTube (bit.ly, t.co, a page's ?url=) isn't seen.
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
