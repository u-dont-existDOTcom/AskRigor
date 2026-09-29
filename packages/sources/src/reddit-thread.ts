import { fetchText, UpstreamHttpError } from "./http.js";

/** What Reddit's public embed endpoint says about a thread link. */
export type RedditThreadLookup =
  | { state: "found"; subreddit: string; post_id: string; title: string }
  | { state: "not_found" }
  | { state: "unavailable" };

const REDDIT_OEMBED_URL = "https://www.reddit.com/oembed";
const THREAD_PATH = /^\/r\/([A-Za-z0-9_]{2,21})\/comments\/([a-z0-9]+)(?:\/|$)/iu;
// The embed markup links the thread by its canonical path, with its real subreddit.
const EMBEDDED_THREAD = /https:\/\/www\.reddit\.com\/r\/([A-Za-z0-9_]{2,21})\/comments\/([a-z0-9]+)\//iu;
const LOOKUP_TIMEOUT_MS = 5_000;
const MAX_LOOKUPS = 40;
const CONCURRENCY = 8;
const USER_AGENT = "AskRigor/0.1 (research thread check; +https://askrigor.com)";

/** The post id of a full reddit.com thread link, or undefined for any other link. */
export function redditPostId(url: string): string | undefined {
  try {
    const link = new URL(url);
    if (!/(?:^|\.)reddit\.com$/iu.test(link.hostname)) return undefined;
    return THREAD_PATH.exec(link.pathname)?.[2]?.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Looks a Reddit thread up with Reddit's public embed endpoint, which needs no
 * account: its real subreddit and title, or not found. Only the thread's link
 * is sent, and the poster's name in the response is not kept.
 */
export async function lookupRedditThread(
  url: string,
  options: { timeoutMs?: number } = {}
): Promise<RedditThreadLookup> {
  const postId = redditPostId(url);
  const subreddit = postId === undefined ? undefined : THREAD_PATH.exec(new URL(url).pathname)?.[1];
  if (postId === undefined || subreddit === undefined) return { state: "unavailable" };
  const endpoint = `${REDDIT_OEMBED_URL}?${new URLSearchParams({
    url: `https://www.reddit.com/r/${subreddit}/comments/${postId}/`
  }).toString()}`;
  try {
    const body = JSON.parse(await fetchText(endpoint, {
      maxRetries: 0,
      timeoutMs: options.timeoutMs ?? LOOKUP_TIMEOUT_MS,
      headers: { "user-agent": USER_AGENT, accept: "application/json" }
    })) as { html?: unknown; title?: unknown };
    const embedded = typeof body.html === "string" ? EMBEDDED_THREAD.exec(body.html) : null;
    if (embedded === null || embedded[2]!.toLowerCase() !== postId) return { state: "unavailable" };
    return {
      state: "found",
      subreddit: embedded[1]!.toLowerCase(),
      post_id: postId,
      title: typeof body.title === "string" ? body.title.slice(0, 300) : ""
    };
  } catch (error) {
    return error instanceof UpstreamHttpError && error.status === 404 ? { state: "not_found" } : { state: "unavailable" };
  }
}

/**
 * Looks up the Reddit threads among these links, each post once, at most 40,
 * a few at a time. Keyed by post id; a link beyond the cap gets no entry.
 */
export async function lookupRedditThreads(
  urls: readonly string[],
  options: { timeoutMs?: number } = {}
): Promise<Map<string, RedditThreadLookup>> {
  const byPost = new Map<string, string>();
  for (const url of urls) {
    const postId = redditPostId(url);
    if (postId !== undefined && !byPost.has(postId) && byPost.size < MAX_LOOKUPS) byPost.set(postId, url);
  }
  const entries = [...byPost];
  const results = new Map<string, RedditThreadLookup>();
  for (let start = 0; start < entries.length; start += CONCURRENCY) {
    const batch = entries.slice(start, start + CONCURRENCY);
    const lookups = await Promise.all(batch.map(([, url]) => lookupRedditThread(url, options)));
    batch.forEach(([postId], index) => results.set(postId, lookups[index]!));
  }
  return results;
}
