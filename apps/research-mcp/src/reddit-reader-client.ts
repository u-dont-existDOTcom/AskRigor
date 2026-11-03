import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { DEFAULT_INHERITED_ENV_VARS, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ErrorCode, McpError, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { redditPostId } from "@askrigor/sources";
import { z } from "zod";

// A call ends within this, its wait for its turn included, so it answers before the strictest client limit the
// repository records: Claude waits 60 seconds for a tool (docs/superpowers/plans/2026-09-26-instruction-optimization.md).
const DEADLINE_MS = 50_000;
// How long a call waits for its turn before it answers busy with a retry hint. Waiting adds no load on Reddit, and the
// host gets one request at a time (owner answer 213b), so a second request at once is never sent. Before, a call
// waited up to 45 seconds and then read for up to 45 more: #394's run lost seven parallel reads of q128-oral-liver,
// all busy at once, with nothing to say when to try again.
const START_WAIT_MS = 10_000;
// About how long one call holds the line, for the retry hint: a 34-comment thread was read in 7 seconds on 1 Nov.
const TYPICAL_CALL_MS = 10_000;
const MAXIMUM_MORE_LENGTH = 1_000_000;
const MAXIMUM_COMMENT_CHARACTERS = 100_000;
const IDLE_MS = 5 * 60_000;
/**
 * The page a search asks the host for. Without a size the host returned 7 threads (#394's run: 138 of 148 searches,
 * none with a next page), so "found" counted a page and could not tell a niche topic from a busy one. 25 is Reddit's
 * own default page (its maximum is 100): a fuller page without asking Reddit for more than one, and 25 titles leave
 * the AI a choice without filling its context. The host's next-page token gives the next 25.
 */
export const SEARCH_PAGE_SIZE = 25;
const SORT = ["relevance", "hot", "top", "new", "comments"] as const;
const TIME = ["hour", "day", "week", "month", "year", "all"] as const;
// Every call this process sends the host, sessions alike, in order: the first runs and the rest wait their turn.
let readerTurn = Promise.resolve();
const line: object[] = [];
type FailureState = "not_found" | "invalid" | "unavailable" | "busy" | "not_available";
export interface RedditReaderComment {
  id: string; parent_id: string; depth: number; person?: string; is_original_poster: boolean;
  text: string | null; removed: boolean; collapsed: boolean; score: number; created: string | number; url: string;
}
export interface RedditThreadResult {
  access_state: "read" | FailureState; url: string; community?: string; title?: string; created?: string | number;
  post_text?: string; comments?: RedditReaderComment[]; thread_comment_count?: number;
  comments_read?: number; comments_without_text?: number; truncated?: boolean; more?: string;
  /** With busy: about how long the calls ahead of it should take. */
  retry_after_seconds?: number;
}
export interface RedditSearchInput {
  query: string; subreddit?: string; sort?: typeof SORT[number]; time?: typeof TIME[number]; after?: string;
}
export interface RedditSearchResult {
  access_state: "searched" | FailureState;
  threads: { url: string; subreddit: string; title: string }[]; returned: number; after?: string;
  /** With busy: about how long the calls ahead of it should take. */
  retry_after_seconds?: number;
}
export interface RedditReaderClient {
  readThread(url: string, more?: string): Promise<RedditThreadResult>;
  searchThreads(input: RedditSearchInput): Promise<RedditSearchResult>;
  close(): Promise<void>;
}
class ReaderError extends Error {
  constructor(readonly code: FailureState, readonly retryAfterSeconds?: number) { super(`Reddit reader ${code}`); }
}
/** A failure as a result: busy carries its retry hint. */
const failure = (error: unknown) => error instanceof ReaderError
  ? { access_state: error.code, ...(error.retryAfterSeconds === undefined ? {} : { retry_after_seconds: error.retryAfterSeconds }) }
  : { access_state: "unavailable" as const };
const timestamp = z.union([z.string(), z.number().finite()]);
const token = z.string().min(1).max(64_000);
const postSchema = z.object({
  source: z.string(), post: z.object({ id: z.string().regex(/^[a-z0-9]+$/iu), name: z.string(), title: z.string(), body: z.string(),
    author: z.string().nullable(), subreddit: z.string().regex(/^[A-Za-z0-9_]{2,21}$/u), url: z.string().url(), score: z.number(),
    comment_count: z.number().int().nonnegative(), created: timestamp, removed: z.boolean() })
});
const commentSchema = z.object({
  id: z.string(), name: z.string(), parent_id: z.string(), thread_id: z.string(), body: z.string().nullable(), removed: z.boolean(),
  collapsed: z.boolean(), author: z.string().nullable(), score: z.number(), created: timestamp, url: z.string().url(),
  depth: z.number().int().nonnegative(), relationship_verified: z.boolean()
});
const continuationSchema = z.object({ comment_id: z.string().min(1) });
const commentsSchema = z.object({
  source: z.string(), thread_id: z.string(), comments: z.array(commentSchema), returned_count: z.number().int().nonnegative(),
  loaded_comments: z.number().int().nonnegative(), next_page_token: token.nullable(),
  reply_continuations: z.array(continuationSchema), account_session_verified: z.boolean(), all_comments_collected: z.boolean(), scope: z.unknown()
});
const searchSchema = z.object({
  source: z.string(), posts: z.array(z.object({ id: z.string(), name: z.string(), subreddit: z.string(), title: z.string(), url: z.string().url() })),
  next_page_token: token.nullable(), account_session_verified: z.boolean(), scope: z.unknown()
});
const moreSchema = z.object({ v: z.literal(1), id: z.string(), pages: z.array(token).max(1_000), replies: z.array(z.string()).max(10_000) });

export function redditReaderFromEnv(env: NodeJS.ProcessEnv = process.env): RedditReaderClient | undefined {
  const target = env.ASKRIGOR_REDDIT_READER_SSH_TARGET;
  const keyFile = env.ASKRIGOR_REDDIT_READER_KEY_FILE;
  const knownHostsFile = env.ASKRIGOR_REDDIT_READER_KNOWN_HOSTS_FILE;
  if (!target?.trim() || !keyFile?.trim() || !knownHostsFile?.trim()) return undefined;
  return createRedditReaderClient({ target, keyFile, knownHostsFile });
}

export function createRedditReaderClient(options: {
  target: string; keyFile: string; knownHostsFile: string;
  /** A local SDK server, never a shell, for hermetic transport tests. */
  command?: string; args?: string[];
  busyWaitMs?: number; deadlineMs?: number; idleMs?: number;
}): RedditReaderClient {
  if (!/^[A-Za-z0-9_-]+@[A-Za-z0-9.-]+$/u.test(options.target) ||
      !isAbsolute(options.keyFile) || !isAbsolute(options.knownHostsFile)) throw new ReaderError("invalid");
  const args = ["-T", "-F", "none", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "ClearAllForwardings=yes",
    "-o", "StrictHostKeyChecking=yes", "-o", `UserKnownHostsFile=${options.knownHostsFile}`, "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3", "-i", options.keyFile, options.target];
  // The SDK merges its default inherited environment. Explicit empty values prevent forwarding its account and home values.
  const env = Object.fromEntries(DEFAULT_INHERITED_ENV_VARS.map((key) => [key, ""]));
  env.PATH = "/usr/bin:/bin";
  let connection: Client | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const close = async () => {
    clearTimeout(idleTimer);
    const current = connection;
    connection = undefined;
    await current?.close().catch(() => undefined);
  };
  const connect = async (signal: AbortSignal, remaining: number) => {
    if (connection !== undefined) return connection;
    const client = new Client({ name: "askrigor-forum-reader", version: "1.0" });
    const transport = new StdioClientTransport({ command: options.command ?? "/usr/bin/ssh", args: options.command === undefined
      ? args : options.args ?? [], env, stderr: "ignore" });
    client.onclose = () => { if (connection === client) connection = undefined; };
    try { await client.connect(transport, { signal, timeout: remaining }); }
    catch (error) { await client.close().catch(() => undefined); throw error; }
    connection = client;
    return client;
  };
  const call = async <T>(name: string, input: Record<string, unknown>, schema: z.ZodType<T>, signal: AbortSignal, end: number): Promise<T> => {
    let result: CallToolResult | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const remaining = end - Date.now();
        if (remaining <= 0 || signal.aborted) throw new ReaderError("unavailable");
        const client = await connect(signal, remaining);
        result = await client.callTool({ name, arguments: input }, undefined,
          { signal, timeout: remaining, maxTotalTimeout: remaining }) as CallToolResult;
        break;
      } catch (error) {
        if (signal.aborted || error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
          await close();
          throw new ReaderError("unavailable");
        }
        const transportFailure = !(error instanceof ReaderError) && (!(error instanceof McpError) || error.code === ErrorCode.ConnectionClosed);
        if (!transportFailure || attempt !== 0 || signal.aborted) throw new ReaderError("unavailable");
        await close();
      }
    }
    if (result === undefined) throw new ReaderError("unavailable");
    let data: unknown = result.structuredContent;
    if (data === undefined) {
      const first = result.content.find((block) => block.type === "text");
      try { data = first?.type === "text" ? JSON.parse(first.text) : undefined; }
      catch { throw new ReaderError("unavailable"); }
    }
    if (result.isError) {
      const failure = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).safeParse(data);
      const code = failure.success ? failure.data.error.code : undefined;
      // LOGIN_REQUIRED: the host's own Reddit sign-in has lapsed, and only its operator can renew it. On 3 Nov every
      // thread read answered it while searches still worked, and the AI, told only "unavailable", kept trying.
      throw new ReaderError(code === "THREAD_NOT_RENDERED" ? "not_found" : code === "INVALID_INPUT" ? "invalid"
        : code === "LOGIN_REQUIRED" ? "not_available" : "unavailable");
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ReaderError("unavailable");
    return parsed.data;
  };
  const queued = async <T>(work: (signal: AbortSignal, end: number) => Promise<T>): Promise<T> => {
    const end = Date.now() + (options.deadlineMs ?? DEADLINE_MS);
    const place = {};
    line.push(place);
    const previous = readerTurn;
    let release!: () => void;
    const done = new Promise<void>((resolve) => { release = resolve; });
    readerTurn = previous.then(() => done);
    let waiting: ReturnType<typeof setTimeout> | undefined;
    let admitted = false;
    try {
      admitted = await Promise.race([previous.then(() => true), new Promise<boolean>((resolve) => {
        waiting = setTimeout(() => resolve(false), Math.min(options.busyWaitMs ?? START_WAIT_MS, end - Date.now()));
      })]);
      clearTimeout(waiting);
      // Each call still ahead, the running one included, holds the line about TYPICAL_CALL_MS.
      if (!admitted) {
        throw new ReaderError("busy", Math.min(120, Math.max(5, Math.ceil(line.indexOf(place) * TYPICAL_CALL_MS / 1_000))));
      }
      clearTimeout(idleTimer);
      return await work(AbortSignal.timeout(Math.max(0, end - Date.now())), end);
    } finally {
      clearTimeout(waiting);
      line.splice(line.indexOf(place), 1);
      release();
      if (admitted && connection !== undefined) idleTimer = setTimeout(() => { void close(); }, options.idleMs ?? IDLE_MS);
      idleTimer?.unref?.();
    }
  };
  return {
    close,
    async searchThreads(input) {
      try {
        const request = z.object({ query: z.string().min(1).max(500), subreddit: z.string().regex(/^[A-Za-z0-9_]{2,21}$/u).optional(),
          sort: z.enum(SORT).optional(), time: z.enum(TIME).optional(), after: token.optional() }).safeParse(input);
        if (!request.success) throw new ReaderError("invalid");
        return await queued(async (signal, end): Promise<RedditSearchResult> => {
          const result = await call("search_reddit", { ...request.data, limit: SEARCH_PAGE_SIZE }, searchSchema, signal, end);
          const threads = result.posts.map(({ url, subreddit, title }) => ({ url, subreddit, title }));
          return { access_state: "searched", threads, returned: threads.length, ...(result.next_page_token === null ? {} : { after: result.next_page_token }) };
        });
      } catch (error) {
        return { ...failure(error), threads: [], returned: 0 };
      }
    },
    async readThread(url, more) {
      try {
        const link = normalizeThread(url);
        let pending: z.output<typeof moreSchema> | undefined;
        if (more !== undefined) {
          if (more.length > MAXIMUM_MORE_LENGTH || !/^[A-Za-z0-9_-]+$/u.test(more)) throw new ReaderError("invalid");
          try { pending = moreSchema.parse(JSON.parse(Buffer.from(more, "base64url").toString("utf8"))); }
          catch { throw new ReaderError("invalid"); }
          if (pending.id !== link.id) throw new ReaderError("invalid");
        }
        return await queued(async (signal, end): Promise<RedditThreadResult> => {
          const { post } = await call("get_reddit_thread", { thread: link.url }, postSchema, signal, end);
          if (post.id.toLowerCase() !== link.id) throw new ReaderError("unavailable");
          const canonical = `https://www.reddit.com/r/${post.subreddit.toLowerCase()}/comments/${link.id}/`;
          const person = (author: string) => createHash("sha256").update(`${link.id}\0${author}`).digest("hex").slice(0, 8);
          const originalPoster = post.author === null ? undefined : person(post.author);
          const comments = new Map<string, RedditReaderComment>();
          const pages = [...pending?.pages ?? []];
          const replies = [...pending?.replies ?? []];
          const loadedTokens = new Set<string>();
          const loadedReplies = new Set<string>();
          let incomplete = false;
          let characters = 0;
          const merge = (result: z.output<typeof commentsSchema>) => {
            if (result.thread_id.replace(/^t3_/u, "").toLowerCase() !== link.id) throw new ReaderError("unavailable");
            for (const comment of result.comments) {
              if (comment.thread_id.replace(/^t3_/u, "").toLowerCase() !== link.id) throw new ReaderError("unavailable");
              const previous = comments.get(comment.id);
              if (comment.body === null && previous?.text) continue;
              characters += (comment.body?.length ?? 0) - (previous?.text?.length ?? 0);
              const key = comment.author === null ? undefined : person(comment.author);
              comments.set(comment.id, { id: comment.id, parent_id: comment.parent_id, depth: comment.depth,
                ...(key === undefined ? {} : { person: key }), is_original_poster: key !== undefined && key === originalPoster,
                text: comment.body, removed: comment.removed, collapsed: comment.collapsed, score: comment.score,
                created: comment.created, url: comment.url });
            }
            if (result.next_page_token !== null && loadedTokens.has(result.next_page_token)) incomplete = true;
            if (result.next_page_token !== null && !loadedTokens.has(result.next_page_token) && !pages.includes(result.next_page_token)) pages.push(result.next_page_token);
            for (const { comment_id: id } of result.reply_continuations) if (!loadedReplies.has(id) && !replies.includes(id)) replies.push(id);
          };
          if (pending === undefined) merge(await call("get_reddit_comments", { thread: canonical, limit: 200, depth: 10, sort: "top" }, commentsSchema, signal, end));
          let expansions = 0;
          let continuations = 0;
          while (Date.now() < end && !signal.aborted && characters <= MAXIMUM_COMMENT_CHARACTERS &&
              ((pages.length > 0 && expansions < 3) || (replies.length > 0 && continuations < 5))) {
            const page = pages.length > 0 && expansions < 3 ? pages[0] : undefined;
            const reply = page === undefined ? replies[0] : undefined;
            try {
              const result = page !== undefined
                ? await call("expand_reddit_comments", { thread: canonical, page_token: page, limit: 500 }, commentsSchema, signal, end)
                : await call("get_reddit_replies", { thread: canonical, comment_id: reply, limit: 500, depth: 10, sort: "top" }, commentsSchema, signal, end);
              if (page !== undefined) { pages.shift(); loadedTokens.add(page); expansions += 1; }
              else { replies.shift(); loadedReplies.add(reply!); continuations += 1; }
              merge(result);
            } catch (error) {
              if (signal.aborted || Date.now() >= end) break;
              throw error;
            }
          }
          const values = [...comments.values()];
          const remaining = { v: 1, id: link.id, pages, replies };
          const next = pages.length === 0 && replies.length === 0 ? undefined : Buffer.from(JSON.stringify(remaining)).toString("base64url");
          if (next !== undefined && (next.length > MAXIMUM_MORE_LENGTH || !moreSchema.safeParse(remaining).success)) throw new ReaderError("unavailable");
          return { access_state: "read", url: canonical, community: post.subreddit.toLowerCase(), title: post.title, created: post.created,
            post_text: post.body, comments: values, thread_comment_count: post.comment_count,
            comments_read: values.filter((comment) => comment.text !== null && comment.text.length > 0).length,
            comments_without_text: values.filter((comment) => comment.text === null || comment.text.length === 0).length,
            // The far side reports all_comments_collected false even when it returned every comment, so a first read is
            // compared with the thread's own count.
            truncated: incomplete || next !== undefined || (pending === undefined && values.length < post.comment_count),
            ...(next === undefined ? {} : { more: next }) };
        });
      } catch (error) { return { ...failure(error), url }; }
    }
  };
}

function normalizeThread(value: string): { url: string; id: string } {
  let link: URL;
  try { link = new URL(value); } catch { throw new ReaderError("invalid"); }
  if (link.protocol !== "https:" || link.username || link.password || link.port) throw new ReaderError("invalid");
  const id = redditPostId(value);
  if (id !== undefined) {
    const subreddit = /^\/r\/([A-Za-z0-9_]{2,21})\//iu.exec(link.pathname)?.[1];
    if (subreddit !== undefined) return { id, url: `https://www.reddit.com/r/${subreddit.toLowerCase()}/comments/${id}/` };
  }
  const short = link.hostname.toLowerCase() === "redd.it" ? /^\/([a-z0-9]+)\/?$/iu.exec(link.pathname)?.[1]?.toLowerCase() : undefined;
  if (short !== undefined) return { id: short, url: `https://redd.it/${short}` };
  throw new ReaderError("invalid");
}
