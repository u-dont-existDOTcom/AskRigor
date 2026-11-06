import { extractHtmlText } from "./candidate-full-text.js";
import { DiscoveredDocumentError, fetchDiscoveredDocument, UpstreamHttpError, type DiscoveredDocumentFetchRuntime } from "./http.js";
import { parseRobotsTxt, robotsTxtAllows, type RobotsGroup } from "./robots-txt.js";

export const FORUM_READER_USER_AGENT = "AskRigor/0.1 (research thread check; +https://askrigor.com)";
const MAXIMUM_BYTES = 3 * 1024 * 1024;
const MAXIMUM_CHARACTERS = 60_000;
const ROBOTS_CACHE_LIMIT = 256;
const robotsCache = new Map<string, { expires: number; rules: RobotsGroup[] | boolean }>();
const robotsPending = new Map<string, Promise<RobotsGroup[] | boolean>>();
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
   * What came of the read. invalid: the reader refused the link itself before any request to the site (not https, a
   * port or credentials, not a URL, or a destination outside the public internet), so the site said nothing (the review
   * of #421: such a link read as unavailable, and its receipt backed a community's declared block).
   */
  access_state: "read" | "robots_disallowed" | "blocked" | "needs_a_browser" | "not_found" | "unavailable" | "invalid";
  title?: string;
  page_text?: string;
  truncated?: boolean;
  next_page?: string;
}

export async function readForumPage(value: string, runtime: ForumPageRuntime = {}): Promise<ForumPage> {
  let url: URL;
  try {
    url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return { url: value, access_state: "invalid" };
    url.hash = "";
  } catch { return { url: value, access_state: "invalid" }; }
  let robotsDenied = false;
  try {
    let allowed: boolean;
    try {
      allowed = await allowedByRobots(url, runtime);
    } catch (error) {
      // The reader refused the site's own address before any request to it; a redirect's refusal, after the site
      // answered, stays unavailable below.
      if (error instanceof ForumLinkRefused) return { url: url.toString(), access_state: "invalid" };
      throw error;
    }
    if (!allowed) return { url: url.toString(), access_state: "robots_disallowed" };
    const fetched = await fetchDocument(url.toString(), runtime, async (destination) => {
      if (!await allowedByRobots(destination, runtime)) {
        robotsDenied = true;
        throw new Error("Forum destination disallowed by robots.txt");
      }
    });
    const contentType = fetched.contentType?.split(";", 1)[0]!.trim().toLowerCase();
    if (contentType !== undefined && !["text/html", "application/xhtml+xml", "text/plain"].includes(contentType)) {
      return { url: fetched.finalUrl, access_state: "unavailable" };
    }
    const html = new TextDecoder().decode(fetched.bytes);
    const extracted = contentType === "text/plain" ? { text: html.trim() } : extractHtmlText(html);
    const titleMarkup = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu)?.[1];
    const title = titleMarkup === undefined ? extracted.title : extractHtmlText(`<h1>${titleMarkup}</h1>`).title;
    const challengeTitle = title?.toLowerCase();
    if (html.includes("_cf_chl_opt") || html.includes("cf-chl-") ||
        challengeTitle?.startsWith("just a moment") || challengeTitle?.includes("captcha") ||
        challengeTitle?.startsWith("attention required")) {
      return { url: fetched.finalUrl, access_state: "blocked" };
    }
    if (extracted.text.length < 1_500) return { url: fetched.finalUrl, access_state: "needs_a_browser" };
    const next = contentType === "text/plain" ? undefined : nextPage(html, new URL(fetched.finalUrl));
    return { url: fetched.finalUrl, access_state: "read", ...(title === undefined ? {} : { title }),
      page_text: extracted.text.slice(0, MAXIMUM_CHARACTERS), truncated: extracted.text.length > MAXIMUM_CHARACTERS,
      ...(next === undefined ? {} : { next_page: next }) };
  } catch (error) {
    if (robotsDenied) return { url: url.toString(), access_state: "robots_disallowed" };
    const state = error instanceof UpstreamHttpError
      ? [401, 403, 406, 429, 451, 503].includes(error.status) ? "blocked"
        : [404, 410].includes(error.status) ? "not_found" : "unavailable"
      : "unavailable";
    return { url: url.toString(), access_state: state };
  }
}

/** The reader refused a forum page's address before any request to its site. */
class ForumLinkRefused extends Error {}

async function allowedByRobots(url: URL, runtime: ForumPageRuntime): Promise<boolean> {
  const now = runtime.now ?? Date.now;
  const cached = robotsCache.get(url.host);
  let rules = cached !== undefined && cached.expires > now() ? cached.rules : undefined;
  if (rules === undefined) {
    let pending = robotsPending.get(url.host);
    if (pending === undefined) {
      pending = (async () => {
        let rules: RobotsGroup[] | boolean;
        try {
          const response = await fetchDocument(new URL("/robots.txt", url).toString(), runtime);
          rules = parseRobotsTxt(new TextDecoder().decode(response.bytes));
        } catch (error) {
          // The reader's own refusal of the site's address, before any request: the site said nothing, so this is no
          // robots.txt answer, and nothing is kept for the host.
          if (error instanceof DiscoveredDocumentError && (error.code === "destination" || error.code === "invalid_url")) {
            throw new ForumLinkRefused();
          }
          rules = error instanceof UpstreamHttpError && error.status >= 400 && error.status < 500;
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
  return typeof rules === "boolean" ? rules : robotsTxtAllows(rules, FORUM_READER_USER_AGENT, url.toString());
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

function nextPage(html: string, base: URL): string | undefined {
  const markup = markupWithoutUnreadParts(html);
  for (const tag of markup.matchAll(/<(?:a|link)\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu)) {
    const attributes = new Map<string, string>();
    for (const match of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)) {
      attributes.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4]!);
    }
    if (!attributes.get("rel")?.toLowerCase().split(/\s+/u).includes("next")) continue;
    const href = attributes.get("href");
    if (href === undefined) continue;
    try {
      const next = new URL(extractHtmlText(`<h1>${href}</h1>`).title!, base);
      if (next.protocol === "https:" && next.host === base.host && !next.username && !next.password) return next.toString();
    } catch { /* An invalid next link does not prevent reading this page. */ }
  }
  return undefined;
}
