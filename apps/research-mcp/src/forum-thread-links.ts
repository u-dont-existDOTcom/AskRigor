import { createHash } from "node:crypto";

import { ATLAS_THREAD_HOST, ATLAS_THREAD_LINK } from "@askrigor/evidence-repository";

/**
 * Forum thread links: how two links to one thread compare (comparableUrl, which a forum_thread_read receipt signs by its
 * digest), and what the Atlas may publish of a thread read here (owner answers 252a and 253a; the review of 5 November
 * 2026, findings 1 and 2). A published thread is rebuilt from the verified parts of the read, never passed through from
 * the AI's link: a Reddit post's community from the subreddit the reader returned and its receipt signed, and its link
 * by the post's id alone; another forum's community as its registrable host, and its link only in one of four
 * structural, id-only forms. Every rule here is an exact, structural check of a link.
 */

// A Reddit post by its id alone, as reddit.com/comments/<id> or redd.it/<id> link it.
const REDDIT_POST_PATH = /^\/(?:r\/[A-Za-z0-9_]{2,21}\/)?comments\/([a-z0-9]+)(?:\/|$)/iu;
const REDD_IT_POST_PATH = /^\/([a-z0-9]+)\/?$/iu;
const REDDIT_SITE = /(?:^|\.)(?:reddit\.com|redd\.it)$/u;
// Query parameters that track a click or share, or pick a page, a sort order
// or a session of a discussion (phpBB's start, sid and sort keys; vBulletin's
// page and s), rather than name the discussion itself.
export const NON_THREAD_PARAMETER = new RegExp("^(?:utm_\\w+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid|ref|ref_src|" +
  "share_id|si|_ga|start|page|pg|offset|sid|s|phpsessid|sessionid|jsessionid|sort|order|sk|sd|st|highlight|hilit)$", "iu");
// With a thread id (phpBB's and vBulletin's t, a topic or Discuz tid), a post
// id or the forum id only locates a post in the thread or repeats where it is.
const THREAD_ID_PARAMETER = /^(?:t|topic|topicid|threadid|tid)$/iu;
const WITHIN_THREAD_PARAMETER = /^(?:p|pid|post|postid|f|fid|forum|forumid)$/iu;
// A page or post within a thread, at the end of its path: XenForo's /page-2
// and /post-123, vBulletin's /page2, a blog's /page/2.
const THREAD_PAGE_SUFFIX = /\/(?:page[-/]?\d+|post-\d+)\/?$/iu;
// A post number after a Discourse topic: /t/<slug>/<topic id>/<post number>.
const DISCOURSE_POST = /^(\/t\/[^/]+\/\d+)\/\d+\/?$/iu;

/** A thread's link as two links to it compare, in parts. */
interface ThreadParts {
  /** The host without a www, old, new, m, np or amp prefix, lower case. */
  host: string;
  /** A Reddit post's id, for any of Reddit's links to it. */
  post?: string;
  /** The path without a session, a page or post within the thread, or a trailing slash, lower case. */
  path: string;
  /** The parameters that may name the thread, by name. */
  query: Array<[string, string]>;
}

function threadParts(url: string): ThreadParts | undefined {
  const trimmed = url.trim().replace(/[.,;:!?"'*`\]]+$/u, "");
  let link: URL;
  try {
    link = new globalThis.URL(trimmed);
  } catch {
    return undefined;
  }
  const host = link.hostname.toLowerCase().replace(/^(?:www|old|new|m|np|amp)\./u, "");
  const post = host === "redd.it"
    ? REDD_IT_POST_PATH.exec(link.pathname)?.[1]
    : /(?:^|\.)reddit\.com$/u.test(host) ? REDDIT_POST_PATH.exec(link.pathname)?.[1] : undefined;
  if (post !== undefined) return { host: "reddit.com", post: post.toLowerCase(), path: "", query: [] };
  const threadId = [...link.searchParams.keys()].some((key) => THREAD_ID_PARAMETER.test(key));
  const query = [...link.searchParams]
    .filter(([key]) => !NON_THREAD_PARAMETER.test(key) && !(threadId && WITHIN_THREAD_PARAMETER.test(key)))
    .sort(([left], [right]) => left.localeCompare(right));
  const path = link.pathname.replace(/;jsessionid=[^/]*/iu, "").replace(THREAD_PAGE_SUFFIX, "")
    .replace(DISCOURSE_POST, "$1").replace(/\/+$/u, "").toLowerCase();
  return { host, path, query };
}

/**
 * A URL as two links to one thread compare: no scheme, subdomain prefix,
 * fragment, session, trailing slash or trailing punctuation, and no parameter
 * or path suffix that only tracks a click or picks a page, post or sort order.
 * A Reddit post is its id, which Reddit never reuses, whatever its subreddit,
 * title slug or comment permalink. Other query parameters stay: they may be
 * what names a forum's thread.
 */
export function comparableUrl(url: string): string {
  const parts = threadParts(url);
  if (parts === undefined) {
    return url.trim().replace(/[.,;:!?"'*`\]]+$/u, "").toLowerCase().replace(/^https?:\/\//u, "").replace(/#.*$/u, "")
      .replace(/\/+$/u, "");
  }
  if (parts.post !== undefined) return `reddit.com/comments/${parts.post}`;
  const query = parts.query.map(([key, value]) => `${key}=${value}`).join("&");
  return `${parts.host}${parts.path}${query === "" ? "" : `?${query}`}`;
}

/** A thread's digest, as a forum_thread_read receipt signs it: of its comparable link. */
export function forumThreadDigest(url: string): string {
  return createHash("sha256").update(comparableUrl(url)).digest("hex").slice(0, 16);
}

// A subreddit's name as Reddit gives it, lower case, and the mark a receipt signs for a post on a person's profile
// (a subreddit named u_ and the user's name), whose name it never signs.
const SUBREDDIT_NAME = /^[a-z0-9][a-z0-9_]{1,20}$/u;
export const REDDIT_PROFILE = "u_";

/**
 * What a Reddit forum_thread_read receipt signs of the subreddit the reader returned (`c`): its name lower case, or
 * REDDIT_PROFILE for a post on a person's profile, so no receipt ever names a user. Undefined for anything else.
 */
export function signedSubreddit(community: string | undefined): string | undefined {
  const name = community?.trim().toLowerCase();
  if (name === undefined) return undefined;
  if (name.startsWith(REDDIT_PROFILE)) return REDDIT_PROFILE;
  return SUBREDDIT_NAME.test(name) ? name : undefined;
}

/** Whether a value is what a receipt signs of a subreddit: a name, or the profile mark. */
export function isSignedSubreddit(value: string): boolean {
  return value === REDDIT_PROFILE || SUBREDDIT_NAME.test(value);
}

// Second-level labels under which a country's registry hands out names (co.uk, com.au, or.jp, gob.mx and the like), a
// structural approximation of the public suffix list's country entries that never keeps a label beyond them.
const COMMUNITY_MAX_CHARACTERS = 120;
const COUNTRY_SECOND_LEVEL = new Set(["ac", "asn", "co", "com", "edu", "go", "gob", "gouv", "gov", "govt", "id", "ltd",
  "mil", "ne", "net", "nhs", "nom", "or", "org", "plc", "sch"]);

/**
 * A site's registrable host, the community the Atlas names a forum page by (the review of 5 November, finding 1): its
 * last two labels, or three under a country's second level (example.co.uk), so a person's or a blog's subdomain
 * (janedoe.substack.com) is never named. Undefined for a host that isn't a domain name (an IP address, say).
 */
export function registrableHost(hostname: string): string | undefined {
  const host = hostname.toLowerCase().replace(/\.$/u, "");
  if (!ATLAS_THREAD_HOST.test(host)) return undefined;
  const labels = host.split(".");
  const countrySecondLevel = labels.length >= 3 && labels.at(-1)!.length === 2 && COUNTRY_SECOND_LEVEL.has(labels.at(-2)!);
  const registrable = labels.slice(countrySecondLevel ? -3 : -2).join(".");
  // A community is at most 120 characters, as the library and the Atlas keep one.
  return registrable.length > COMMUNITY_MAX_CHARACTERS ? undefined : registrable;
}

const THREAD_NUMBER = /^[0-9]{1,12}$/u;
const XENFORO_THREAD = /^\/threads\/(?:[^/]*\.)?([0-9]{1,12})$/u;
// A Discourse topic by its id, after a title slug that is not a number (a number there may be the topic's id followed by
// a post's, which no rule here tells apart).
const DISCOURSE_TOPIC = /^\/t\/(?:[0-9]*[^/0-9][^/]*\/)?([0-9]{1,12})$/u;

/** The one value of a thread's query parameter t, when it is a number. */
function threadNumber(parts: ThreadParts): string | undefined {
  const values = parts.query.filter(([key]) => key === "t").map(([, value]) => value);
  return values.length === 1 && THREAD_NUMBER.test(values[0]!) ? values[0] : undefined;
}

/** The structural, id-only link of a forum page read here, in one of the four forms the Atlas publishes; or none. */
function forumThreadLink(parts: ThreadParts): string | undefined {
  const base = `https://${parts.host}`;
  const number = parts.path === "/viewtopic.php" || parts.path === "/showthread.php" ? threadNumber(parts) : undefined;
  const xenforo = XENFORO_THREAD.exec(parts.path)?.[1];
  const discourse = DISCOURSE_TOPIC.exec(parts.path)?.[1];
  const link = number !== undefined ? `${base}${parts.path}?t=${number}`
    : xenforo !== undefined ? `${base}/threads/${xenforo}/`
      : discourse !== undefined ? `${base}/t/${discourse}` : undefined;
  return link !== undefined && ATLAS_THREAD_LINK.test(link) ? link : undefined;
}

/** A thread read here as the Atlas may publish it: each thread once by its comparable link, a community and a link when any. */
export interface PublishedThread {
  /** The thread's comparable link (comparableUrl), so a thread given twice counts once. */
  key: string;
  /** r/<subreddit> on Reddit, from the reader's signed subreddit; the registrable host elsewhere. */
  community?: string;
  /** https://www.reddit.com/comments/<id>/ on Reddit, or a forum's structural, id-only form. */
  link?: string;
}

/**
 * What the Atlas may publish of a thread read here, rebuilt from the read's verified parts (the review of 5 November,
 * findings 1 and 2), never from the AI's link as given: the parts of its comparable link, which the thread's
 * forum_thread_read receipt signs by its digest, and for a Reddit post the subreddit the reader returned, as the
 * receipt signed it (`subreddit`). A Reddit post publishes r/<subreddit> and https://www.reddit.com/comments/<id>/, or
 * neither when it is on a person's profile or no subreddit was signed. Another forum publishes its registrable host,
 * and a link only as phpBB's viewtopic.php?t=<id>, vBulletin's showthread.php?t=<id>, XenForo's /threads/<id>/ or
 * Discourse's /t/<id>, at the root of its host, with nothing else in the path or query: never a title, a slug or a query
 * value; any other page (Earth Clinic's, for now) is counted only. Undefined for a value that isn't a link.
 */
export function publishedThreadOf(url: string, subreddit?: string): PublishedThread | undefined {
  const parts = threadParts(url);
  if (parts === undefined) return undefined;
  const key = comparableUrl(url);
  if (parts.post !== undefined) {
    const name = subreddit === undefined ? undefined : signedSubreddit(subreddit);
    if (name === undefined || name === REDDIT_PROFILE) return { key };
    const link = `https://www.reddit.com/comments/${parts.post}/`;
    return { key, community: `r/${name}`, ...(ATLAS_THREAD_LINK.test(link) ? { link } : {}) };
  }
  if (REDDIT_SITE.test(parts.host)) return { key };
  const community = registrableHost(parts.host);
  const link = forumThreadLink(parts);
  return { key, ...(community === undefined ? {} : { community }), ...(link === undefined ? {} : { link }) };
}
