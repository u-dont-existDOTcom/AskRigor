import { extractHtmlText } from "./candidate-full-text.js";
import { DiscoveredDocumentError, fetchDiscoveredDocument, UpstreamHttpError, type DiscoveredDocumentFetchRuntime } from "./http.js";
import { parseRobotsTxt, robotsTxtAllows, type RobotsGroup } from "./robots-txt.js";

export const FORUM_READER_USER_AGENT = "AskRigor/0.1 (research thread check; +https://askrigor.com)";
const MAXIMUM_BYTES = 3 * 1024 * 1024;
const MAXIMUM_CHARACTERS = 60_000;
const ROBOTS_CACHE_LIMIT = 256;
// A host's robots.txt as it answered: its rules, or true for none (a 4xx answer), kept for an hour. A robots.txt that
// couldn't be reached is no answer and isn't kept (the review of #421).
const robotsCache = new Map<string, { expires: number; rules: RobotsGroup[] | true }>();
const robotsPending = new Map<string, Promise<RobotsGroup[] | true | RobotsFailure>>();
/** A robots.txt fetch with no answer: unreached (transport, DNS, timeout, 5xx, a redirect's refusal), or refused by the
 * reader itself before any request to the host. */
type RobotsFailure = "unreached" | "refused";
const hostRequests = new Map<string, { tail: Promise<void>; last: number; pending: number }>();

export interface ForumPageRuntime {
  fetchDocument?: typeof fetchDiscoveredDocument;
  documentFetchRuntime?: DiscoveredDocumentFetchRuntime;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface ForumPage {
  url: string;
  /**
   * What came of the read, by exact signals only (the review of #421). robots_disallowed: the site's robots.txt, fetched
   * and parsed, disallows the page. login_required: the page answered 401. blocked: it answered 403 or 451, or served a
   * bot challenge, known by its markup (Cloudflare's), never by its title's words. not_found: 404 or 410.
   * unavailable: anything else that stopped it, a robots.txt that couldn't be reached and a refusal on a redirect from
   * the site among them. invalid: the reader refused the link itself before any request (not https, a port or
   * credentials, not a URL, or an address outside the public internet), so the site said nothing.
   */
  access_state: "read" | "robots_disallowed" | "blocked" | "login_required" | "needs_a_browser" | "not_found" |
    "unavailable" | "invalid";
  title?: string;
  page_text?: string;
  truncated?: boolean;
  /** The next page, when the page's markup links one the reader can follow. */
  next_page?: string;
  /**
   * Whether the page's markup marks a page before it or after it (any rel="prev" or rel="next" tag, followable or not),
   * so a read of it is no whole thread (the review of #421).
   */
  page_before?: boolean;
  page_after?: boolean;
  /**
   * The page's links, on its own host, to a page after the first by the page its link picks (start>0, page>1,
   * /page-N>1), at most 50: a pager without rel tags (MyBB's, vBulletin 3's, phpBB 3.0's, a "Weiter ›" link). The caller
   * keeps those of the page's own thread (the review of #421).
   */
  later_page_links?: string[];
}

// The parameters, and the path's end, that pick a page of a thread: phpBB's start, vBulletin's and Discourse's page, a
// page count or offset elsewhere, XenForo's /page-2.
const PAGE_PARAMETER = /^(?:start|page|pg|offset)$/iu;

/**
 * Whether a link picks a page of its thread after the first, by the parameter or the path's end that picks a page
 * (phpBB's start=30, vBulletin's or Discourse's page=2, XenForo's /page-2): exact and structural. A page picked some
 * other way (a site's own ?p=2) is known only by the page's own rel tags (the review of #421).
 */
export function pagePickedAfterFirst(url: string): boolean {
  let link: URL;
  try {
    link = new URL(url.trim());
  } catch {
    return false;
  }
  const after = (key: string, value: string): boolean => {
    if (!/^[0-9]{1,9}$/u.test(value)) return false;
    const number = Number(value);
    return /^(?:start|offset)$/iu.test(key) ? number > 0 : number > 1;
  };
  if ([...link.searchParams].some(([key, value]) => PAGE_PARAMETER.test(key) && after(key, value))) return true;
  const suffix = /\/page[-/]?([0-9]{1,9})\/?$/iu.exec(link.pathname)?.[1];
  return suffix !== undefined && Number(suffix) > 1;
}

export async function readForumPage(value: string, runtime: ForumPageRuntime = {}): Promise<ForumPage> {
  let url: URL;
  try {
    url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return { url: value, access_state: "invalid" };
    url.hash = "";
  } catch { return { url: value, access_state: "invalid" }; }
  let robotsDenied = false;
  let requested = false;
  try {
    const robots = await robotsAnswer(url, runtime);
    // The reader refused the site's own address before any request to it; a robots.txt that couldn't be reached, or a
    // refusal on its redirect, is no answer from the site's rules: unavailable, and the page isn't fetched.
    if (robots === "refused") return { url: url.toString(), access_state: "invalid" };
    if (robots === "unreached") return { url: url.toString(), access_state: "unavailable" };
    if (robots === "disallowed") return { url: url.toString(), access_state: "robots_disallowed" };
    const fetched = await fetchDocument(url.toString(), runtime, async (destination) => {
      const answer = await robotsAnswer(destination, runtime);
      if (answer === "disallowed") {
        robotsDenied = true;
        throw new Error("Forum destination disallowed by robots.txt");
      }
      if (answer !== "allowed") throw new Error("Forum destination's robots.txt could not be reached");
      requested = true;
    });
    const contentType = fetched.contentType?.split(";", 1)[0]!.trim().toLowerCase();
    if (contentType !== undefined && !["text/html", "application/xhtml+xml", "text/plain"].includes(contentType)) {
      return { url: fetched.finalUrl, access_state: "unavailable" };
    }
    const html = new TextDecoder().decode(fetched.bytes);
    const extracted = contentType === "text/plain" ? { text: html.trim() } : extractHtmlText(html);
    const titleMarkup = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu)?.[1];
    const title = titleMarkup === undefined ? extracted.title : extractHtmlText(`<h1>${titleMarkup}</h1>`).title;
    // A bot challenge, by its markup only: never by a title's words, which a real thread may have ("Just a moment of
    // dizziness…", the review of #421).
    if (challengeMarkup(html)) return { url: fetched.finalUrl, access_state: "blocked" };
    if (extracted.text.length < 1_500) return { url: fetched.finalUrl, access_state: "needs_a_browser" };
    const next = contentType === "text/plain" ? undefined : linkedPage(html, new URL(fetched.finalUrl));
    const marked = contentType === "text/plain" ? { before: false, after: false } : pagesMarked(html);
    const later = contentType === "text/plain" ? [] : laterPageLinks(html, new URL(fetched.finalUrl));
    return { url: fetched.finalUrl, access_state: "read", ...(title === undefined ? {} : { title }),
      page_text: extracted.text.slice(0, MAXIMUM_CHARACTERS), truncated: extracted.text.length > MAXIMUM_CHARACTERS,
      ...(next === undefined ? {} : { next_page: next }), ...(marked.before ? { page_before: true } : {}),
      ...(marked.after ? { page_after: true } : {}), ...(later.length === 0 ? {} : { later_page_links: later }) };
  } catch (error) {
    if (robotsDenied) return { url: url.toString(), access_state: "robots_disallowed" };
    // Only exact refusals: 401 asks for a login; 403 refuses the reader, and 451 the page for legal reasons. A busy or
    // failing site (429, 503 and the rest) is unavailable (the review of #421).
    const state = error instanceof UpstreamHttpError
      ? error.status === 401 ? "login_required" : [403, 451].includes(error.status) ? "blocked"
        : [404, 410].includes(error.status) ? "not_found" : "unavailable"
      : !requested && refusedBeforeRequest(error) ? "invalid" : "unavailable";
    return { url: url.toString(), access_state: state };
  }
}

/** The reader's own refusal of an address before any request to it: not public, or no valid URL. */
function refusedBeforeRequest(error: unknown): boolean {
  return error instanceof DiscoveredDocumentError && (error.code === "destination" || error.code === "invalid_url");
}

/**
 * What a host's robots.txt says of a page: allowed or disallowed by rules fetched and parsed (or by a 4xx answer, which
 * means no rules), unreached when it couldn't be fetched (transport, DNS, timeout, 5xx, or a refusal on its redirect,
 * after the site answered), or refused when the reader refused the host's address before any request. Only an answer is
 * kept for the hour (the review of #421).
 */
async function robotsAnswer(url: URL, runtime: ForumPageRuntime): Promise<"allowed" | "disallowed" | RobotsFailure> {
  const now = runtime.now ?? Date.now;
  const cached = robotsCache.get(url.host);
  let rules: RobotsGroup[] | true | RobotsFailure | undefined = cached !== undefined && cached.expires > now()
    ? cached.rules : undefined;
  if (rules === undefined) {
    let pending = robotsPending.get(url.host);
    if (pending === undefined) {
      pending = (async (): Promise<RobotsGroup[] | true | RobotsFailure> => {
        let rules: RobotsGroup[] | true;
        let requested = false;
        try {
          const response = await fetchDocument(new URL("/robots.txt", url).toString(), runtime, async () => {
            requested = true;
          });
          rules = parseRobotsTxt(new TextDecoder().decode(response.bytes));
        } catch (error) {
          if (!(error instanceof UpstreamHttpError) || error.status < 400 || error.status >= 500) {
            return !requested && refusedBeforeRequest(error) ? "refused" : "unreached";
          }
          rules = true;
        }
        robotsCache.delete(url.host);
        if (robotsCache.size >= ROBOTS_CACHE_LIMIT) robotsCache.delete(robotsCache.keys().next().value!);
        robotsCache.set(url.host, { expires: now() + 3_600_000, rules });
        return rules;
      })();
      robotsPending.set(url.host, pending);
    }
    try { rules = await pending; }
    finally { if (robotsPending.get(url.host) === pending) robotsPending.delete(url.host); }
  }
  if (rules === "unreached" || rules === "refused") return rules;
  return rules === true || robotsTxtAllows(rules, FORUM_READER_USER_AGENT, url.toString()) ? "allowed" : "disallowed";
}

async function fetchDocument(
  url: string, runtime: ForumPageRuntime, checkRobots?: (destination: URL) => Promise<void>
) {
  const inherited = runtime.documentFetchRuntime;
  const deadline = AbortSignal.timeout(20_000);
  return (runtime.fetchDocument ?? fetchDiscoveredDocument)(url, {
    ...inherited, maximumBytes: MAXIMUM_BYTES, timeoutMs: 20_000,
    signal: inherited?.signal === undefined ? deadline : AbortSignal.any([inherited.signal, deadline]),
    userAgent: FORUM_READER_USER_AGENT,
    beforeRequest: async (destination) => {
      await checkRobots?.(destination);
      await inherited?.beforeRequest?.(destination);
      await paceHost(destination.host, runtime);
    }
  });
}

async function paceHost(host: string, runtime: ForumPageRuntime): Promise<void> {
  const now = runtime.now ?? Date.now;
  const sleep = runtime.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (const [key, state] of hostRequests) {
    if (state.pending === 0 && state.last + 1_000 <= now()) hostRequests.delete(key);
  }
  let state = hostRequests.get(host);
  if (state === undefined) {
    state = { tail: Promise.resolve(), last: Number.NEGATIVE_INFINITY, pending: 0 };
    hostRequests.set(host, state);
  }
  const previous = state.tail;
  let release: () => void = () => undefined;
  state.tail = new Promise<void>((resolve) => { release = resolve; });
  state.pending += 1;
  try {
    await previous;
    const wait = state.last + 1_000 - now();
    if (wait > 0) await sleep(wait);
    state.last = now();
  } finally { state.pending -= 1; release(); }
}

const UNREAD_ELEMENTS = ["script", "style", "template", "noscript"];

/**
 * The page's markup without comments and the elements whose links no one follows, read once from the start, as a browser
 * reads them. It is only searched for link tags, never shown as HTML.
 */
function markupWithoutUnreadParts(html: string): string {
  // ASCII only, so every index stays an index into html.
  const lower = html.replace(/[A-Z]+/gu, (letters) => letters.toLowerCase());
  const kept: string[] = [];
  let at = 0;
  for (let open = lower.indexOf("<"); open >= 0; open = lower.indexOf("<", at)) {
    const element = UNREAD_ELEMENTS.find((name) => lower.startsWith(`<${name}`, open) &&
      !/[\w-]/u.test(lower.charAt(open + name.length + 1)));
    const closing = lower.startsWith("<!--", open) ? "-->" : element === undefined ? undefined : `</${element}`;
    if (closing === undefined) {
      kept.push(html.slice(at, open + 1));
      at = open + 1;
      continue;
    }
    kept.push(html.slice(at, open));
    const close = lower.indexOf(closing, open + 1);
    if (close < 0) return kept.join("");
    at = closing === "-->" ? close + closing.length : lower.indexOf(">", close) + 1 || html.length;
  }
  kept.push(html.slice(at));
  return kept.join("");
}

/** The rel names of each a or link tag in a page's markup outside its unread parts, with its href. */
function relTags(html: string): Array<{ rel: string[]; href: string | undefined }> {
  const markup = markupWithoutUnreadParts(html);
  return [...markup.matchAll(/<(?:a|link)\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu)].flatMap((tag) => {
    const attributes = new Map<string, string>();
    for (const match of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)) {
      attributes.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4]!);
    }
    const rel = attributes.get("rel")?.toLowerCase().split(/\s+/u).filter((name) => name !== "") ?? [];
    return rel.length === 0 ? [] : [{ rel, href: attributes.get("href") }];
  });
}

/** The next page a page's markup links (rel="next") that the reader can follow: https, on the same host. */
function linkedPage(html: string, base: URL): string | undefined {
  for (const { rel, href } of relTags(html)) {
    if (!rel.includes("next") || href === undefined) continue;
    try {
      const next = new URL(extractHtmlText(`<h1>${href}</h1>`).title!, base);
      if (next.protocol === "https:" && next.host === base.host && !next.username && !next.password) return next.toString();
    } catch { /* An invalid linked page does not prevent reading this page. */ }
  }
  return undefined;
}

/**
 * Whether a page is a bot challenge, by its markup: Cloudflare's challenge script (window._cf_chl_opt inside a script
 * element), an element whose class or id is one of its cf-chl- names, or its challenge form. Text that only mentions them
 * is no challenge, nor is any title.
 */
function challengeMarkup(html: string): boolean {
  return /<script\b[^>]*>(?:(?!<\/script)[\s\S])*_cf_chl_opt/iu.test(html) ||
    /<[a-z][\w-]*\s[^>]*\b(?:class|id)\s*=\s*["']?[^"'>]*\bcf-chl-/iu.test(html) ||
    /<form\b[^>]*\bid\s*=\s*["']?challenge-form\b/iu.test(html);
}

/** The page's links on its own host, over https, to a page after the first by the page each picks; at most 50. */
function laterPageLinks(html: string, base: URL): string[] {
  const links = new Set<string>();
  for (const tag of markupWithoutUnreadParts(html).matchAll(/<a\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu)) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(tag[0]);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (value === undefined) continue;
    try {
      const link = new URL(extractHtmlText(`<h1>${value}</h1>`).title!, base);
      link.hash = "";
      if (link.protocol === "https:" && link.host === base.host && pagePickedAfterFirst(link.toString())) {
        links.add(link.toString());
      }
    } catch { /* An invalid link names no page. */ }
    if (links.size >= 50) break;
  }
  return [...links];
}

/**
 * Whether a page's markup marks a page before it (rel="prev" or "previous") or after it (rel="next"): any such tag, with
 * any link, followable or not, on any host, so a page of a longer thread never reads as a whole one (the review of #421).
 */
function pagesMarked(html: string): { before: boolean; after: boolean } {
  const tags = relTags(html);
  return { before: tags.some(({ rel }) => rel.includes("prev") || rel.includes("previous")),
    after: tags.some(({ rel }) => rel.includes("next")) };
}
