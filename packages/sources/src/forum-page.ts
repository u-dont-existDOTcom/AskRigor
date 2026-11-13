import { extractHtmlText, startTags } from "./candidate-full-text.js";
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
   * keeps those of the page's own thread (the review of #421). The links that are the page's own but for the page they
   * pick come first, wherever they stand on the page, so no other thread's links take their place in the list
   * (Greptile's review of 12 Nov 2026, P1: 50 links to other threads' later pages, in a sidebar, stood before the
   * thread's own page 2, which was never listed, and page 1 read as the whole thread).
   */
  later_page_links?: string[];
  /**
   * Whether the page holds more such links than the list. A cut list with no link of the page's own thread, as the
   * caller compares threads, doesn't show that the page links none: whether a page follows is then unknown, not no
   * (Greptile's review of 12 Nov 2026).
   */
  later_page_links_cut?: boolean;
}

// The parameters, and the path's end, that pick a page of a thread: phpBB's start, vBulletin's and Discourse's page, a
// page count or offset elsewhere, XenForo's /page-2.
const PAGE_PARAMETER = /^(?:start|page|pg|offset)$/iu;
const PAGE_PATH_END = /\/page[-/]?([0-9]{1,9})\/?$/iu;
// How many links to later pages a read lists. Its caller compares each with the page's own thread, a URL parse and more
// on a link the page wrote, so the limit bounds the list a page can hand on and the work done on it, however many links
// the page holds. It is no limit on finding the page's own: those are looked for to the end of the page (Greptile's
// review of 12 Nov 2026).
const LATER_PAGE_LINKS_LIMIT = 50;

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
  const suffix = PAGE_PATH_END.exec(link.pathname)?.[1];
  return suffix !== undefined && Number(suffix) > 1;
}

/**
 * A link without what picks a page of its thread: its path without the page at its end (/page-2) and one last slash, and
 * its other parameters by name, each with its values in the link's order. Two links on one host with the same one are
 * one thread's pages: each is the other but for the page it picks. Exact and structural, and narrower than the caller's
 * own comparison of threads, which also sets aside a session, a sort order or a forum's id beside a thread's: it only
 * puts a link first in the list, and the caller still decides whose thread a link is (the review of #421).
 */
function withoutPagePicked(link: URL): string {
  const path = link.pathname.replace(PAGE_PATH_END, "");
  const parameters = [...link.searchParams].filter(([key]) => !PAGE_PARAMETER.test(key))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return JSON.stringify([path.endsWith("/") ? path.slice(0, -1) : path, parameters]);
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
    const later = contentType === "text/plain" ? { links: [], cut: false } : laterPageLinks(html, new URL(fetched.finalUrl));
    return { url: fetched.finalUrl, access_state: "read", ...(title === undefined ? {} : { title }),
      page_text: extracted.text.slice(0, MAXIMUM_CHARACTERS), truncated: extracted.text.length > MAXIMUM_CHARACTERS,
      ...(next === undefined ? {} : { next_page: next }), ...(marked.before ? { page_before: true } : {}),
      ...(marked.after ? { page_after: true } : {}), ...(later.links.length === 0 ? {} : { later_page_links: later.links }),
      ...(later.cut ? { later_page_links_cut: true } : {}) };
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
  return [...startTags(markup, "a|link")].flatMap((tag) => {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)) {
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
 *
 * Each of the three gives the answer of the one pattern in its note, in time that grows with the page's size and no
 * faster (the code review of 13 Nov 2026, Codex, P1). The patterns themselves started over at every "<script", tag or
 * "<form" of a page that never closed them and read on to its end each time: 3.8 seconds on 128 KB of "<script" text,
 * and 15 seconds on 16 KB of "<a class=", where the second pattern's time grew with the cube of the size. A page may be
 * 3 MB, and the read is synchronous, so the server answered nothing else meanwhile.
 */
function challengeMarkup(html: string): boolean {
  return challengeScript(html) || challengeElement(html) || challengeForm(html);
}

/**
 * Where a pattern (with the g flag) next matches at or after a place, or Infinity for nowhere. The answer is kept while
 * the places asked for stay between the place it was found from and the match, so places asked for in rising order,
 * as every caller here asks, read the text once between them.
 */
function nextMatch(text: string, pattern: RegExp): (from: number) => number {
  let asked = Infinity;
  let found = -1;
  return (from) => {
    if (from < asked || from > found) {
      pattern.lastIndex = from;
      found = pattern.exec(text)?.index ?? Infinity;
      asked = from;
    }
    return found;
  };
}

/**
 * /<script\b[^>]*>(?:(?!<\/script)[\s\S])*_cf_chl_opt/iu: after the first ">" that follows a "<script", the name
 * _cf_chl_opt before any "</script".
 */
function challengeScript(html: string): boolean {
  const optionsOf = nextMatch(html, /_cf_chl_opt/giu);
  const closeOf = nextMatch(html, /<\/script/giu);
  let tagEnd = -1;
  for (const open of html.matchAll(/<script\b/giu)) {
    const from = open.index + open[0].length;
    if (tagEnd < from) tagEnd = html.indexOf(">", from);
    // No ">" after this "<script", or no such name after its tag: none after any later one either.
    if (tagEnd < 0) return false;
    const options = optionsOf(tagEnd + 1);
    if (options === Infinity) return false;
    if (options < closeOf(tagEnd + 1)) return true;
  }
  return false;
}

/**
 * /<[a-z][\w-]*\s[^>]*\b(?:class|id)\s*=\s*["']?[^"'>]*\bcf-chl-/iu: after a tag's name and a space, and before any ">",
 * a class or id whose value holds a cf-chl- name: after the "=", or after one quote that only spaces come before, with
 * no quote or ">" between.
 */
function challengeElement(html: string): boolean {
  const nameOf = nextMatch(html, /\bcf-chl-/giu);
  if (nameOf(0) === Infinity) return false;
  const valueEndOf = nextMatch(html, /["'>]/gu);
  const tagEndOf = nextMatch(html, />/gu);
  const named = (from: number): boolean => nameOf(from) < valueEndOf(from);
  const attribute = /\b(?:class|id)\s*=/giu;
  const spaces = /\s*/yu;
  // The first class or id at or after the last tag asked about whose value holds such a name. Each class or id of the
  // page is looked at once, whichever tags it may belong to.
  let found = -1;
  for (const open of html.matchAll(/<[a-z][\w-]*\s/giu)) {
    const from = open.index + open[0].length;
    while (found < from) {
      attribute.lastIndex = Math.max(attribute.lastIndex, from);
      const match = attribute.exec(html);
      if (match === null) return false;
      const value = match.index + match[0].length;
      spaces.lastIndex = value;
      spaces.exec(html);
      const quote = spaces.lastIndex;
      if (named(value) || ((html[quote] === '"' || html[quote] === "'") && named(quote + 1))) found = match.index;
    }
    if (found < tagEndOf(from)) return true;
  }
  return false;
}

/** /<form\b[^>]*\bid\s*=\s*["']?challenge-form\b/iu: after a "<form" and before any ">", the id challenge-form. */
function challengeForm(html: string): boolean {
  const idOf = nextMatch(html, /\bid\s*=\s*["']?challenge-form\b/giu);
  let tagEnd = -1;
  for (const open of html.matchAll(/<form\b/giu)) {
    const from = open.index + open[0].length;
    const id = idOf(from);
    if (id === Infinity) return false;
    if (tagEnd < from) tagEnd = html.indexOf(">", from);
    if (tagEnd < 0 || id < tagEnd) return true;
  }
  return false;
}

/**
 * The page's links on its own host, over https, to a page after the first by the page each picks: at most 50, those of
 * the page's own thread first, and whether any was left out (cut). The limit is on the list, not on the search
 * (Greptile's review of 12 Nov 2026): the search used to stop at 50 links of any thread, so 50 links to other threads
 * standing first hid the thread's own page 2. The page is now read on, in the same one pass, until a link is left out
 * of a list that holds one of the page's own thread, which settles that a page follows, or to the page's end, as it
 * always was read with fewer than 50 such links.
 */
function laterPageLinks(html: string, base: URL): { links: string[]; cut: boolean } {
  const thread = withoutPagePicked(base);
  const own = new Set<string>();
  const others = new Set<string>();
  let cut = false;
  for (const tag of startTags(markupWithoutUnreadParts(html), "a")) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(tag);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (value === undefined) continue;
    let link: URL;
    try {
      link = new URL(extractHtmlText(`<h1>${value}</h1>`).title!, base);
    } catch { continue; /* An invalid link names no page. */ }
    link.hash = "";
    const listed = link.toString();
    if (link.protocol !== "https:" || link.host !== base.host || !pagePickedAfterFirst(listed)) continue;
    if (own.has(listed) || others.has(listed)) continue;
    if (withoutPagePicked(link) === thread) {
      if (own.size < LATER_PAGE_LINKS_LIMIT) own.add(listed);
      else cut = true;
    } else if (own.size + others.size < LATER_PAGE_LINKS_LIMIT) others.add(listed);
    else cut = true;
    // One of the page's own takes the place of another thread's link in a full list.
    if (own.size + others.size > LATER_PAGE_LINKS_LIMIT) cut = true;
    if (cut && own.size > 0) break;
  }
  return { links: [...own, ...others].slice(0, LATER_PAGE_LINKS_LIMIT), cut };
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
