import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const { spawned } = vi.hoisted(() => ({ spawned: [] as { command: string; args?: string[]; env?: Record<string, string>; stderr?: unknown }[] }));
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", async (original) => {
  const actual = await original<typeof import("@modelcontextprotocol/sdk/client/stdio.js")>();
  return { ...actual, StdioClientTransport: class extends actual.StdioClientTransport {
    constructor(parameters: import("@modelcontextprotocol/sdk/client/stdio.js").StdioServerParameters) {
      spawned.push(parameters);
      if (parameters.command === "/usr/bin/ssh") throw new Error("Real SSH is disabled in this hermetic test");
      super(parameters);
    }
  } };
});
import { createRedditReaderClient, redditReaderFromEnv, type RedditReaderClient } from "../apps/research-mcp/src/reddit-reader-client.js";

const URL = "https://www.reddit.com/r/synthetic/comments/abc123/title/?context=1";
const fixture = fileURLToPath(new globalThis.URL("./fixtures/reddit-reader-server.mjs", import.meta.url));
const clients: RedditReaderClient[] = [];
const directories: string[] = [];
const settings = { target: "synthetic@reader.invalid", keyFile: "/synthetic/key", knownHostsFile: "/synthetic/known-hosts" };
async function fake(mode = "normal", options: { busyWaitMs?: number; deadlineMs?: number; idleMs?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "askrigor-reader-"));
  directories.push(directory);
  const log = join(directory, "calls.jsonl");
  const client = createRedditReaderClient({ ...settings, command: process.execPath, args: [fixture, mode, log], ...options });
  clients.push(client);
  const records = async () => (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  return { client, log, records };
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
  spawned.length = 0;
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function untilStarted(records: () => Promise<{ event: string }[]>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await records().catch(() => [])).some((record) => record.event === "start")) return;
    await pause(10);
  }
  throw new Error("Synthetic server did not receive a call");
}

describe("Reddit stdio reader", () => {
  it("is disabled unless all three settings are present", () => {
    expect(redditReaderFromEnv({})).toBeUndefined();
    for (const missing of ["ASKRIGOR_REDDIT_READER_SSH_TARGET", "ASKRIGOR_REDDIT_READER_KEY_FILE", "ASKRIGOR_REDDIT_READER_KNOWN_HOSTS_FILE"]) {
      const env = { ASKRIGOR_REDDIT_READER_SSH_TARGET: settings.target, ASKRIGOR_REDDIT_READER_KEY_FILE: settings.keyFile,
        ASKRIGOR_REDDIT_READER_KNOWN_HOSTS_FILE: settings.knownHostsFile };
      delete env[missing as keyof typeof env];
      expect(redditReaderFromEnv(env)).toBeUndefined();
    }
    expect(spawned).toHaveLength(0);
  });
  it.each([
    { ...settings, target: "-oProxyCommand=synthetic" }, { ...settings, target: "synthetic@reader.invalid command" },
    { ...settings, keyFile: "relative-key" }, { ...settings, knownHostsFile: "relative-known-hosts" }
  ])("rejects unsafe configuration before spawning: %j", (config) => {
    expect(() => createRedditReaderClient(config)).toThrow("Reddit reader invalid");
    expect(spawned).toHaveLength(0);
  });
  it("uses the exact SSH security options with a minimal environment and no query arguments", async () => {
    const client = redditReaderFromEnv({ ASKRIGOR_REDDIT_READER_SSH_TARGET: settings.target,
      ASKRIGOR_REDDIT_READER_KEY_FILE: settings.keyFile, ASKRIGOR_REDDIT_READER_KNOWN_HOSTS_FILE: settings.knownHostsFile })!;
    clients.push(client);
    expect(spawned).toHaveLength(0);
    expect((await client.searchThreads({ query: "synthetic question; $(never executed)" })).access_state).toBe("unavailable");
    expect(spawned[0]).toMatchObject({ command: "/usr/bin/ssh", stderr: "ignore", args: ["-T", "-F", "none", "-o", "BatchMode=yes",
      "-o", "IdentitiesOnly=yes", "-o", "ClearAllForwardings=yes", "-o", "StrictHostKeyChecking=yes", "-o",
      "UserKnownHostsFile=/synthetic/known-hosts", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=30", "-o",
      "ServerAliveCountMax=3", "-i", settings.keyFile, settings.target] });
    expect(Object.values(spawned[0]!.env!).filter(Boolean)).toEqual(["/usr/bin:/bin"]);
    expect(JSON.stringify(spawned)).not.toContain("synthetic question");
  });
  it.each(["normal", "text"])("reads validated %s results, paginates within caps and removes every author field", async (mode) => {
    const { client, records } = await fake(mode);
    const result = await client.readThread(URL);
    expect(result).toMatchObject({ access_state: "read", url: "https://www.reddit.com/r/synthetic/comments/abc123/", community: "synthetic",
      title: "Synthetic thread", post_text: "Synthetic original post", thread_comment_count: 30, comments_read: 10, comments_without_text: 1 });
    expect(result.comments).toHaveLength(11);
    expect(result.more).toBeTruthy();
    const author = createHash("sha256").update("abc123\0synthetic-other-author").digest("hex").slice(0, 8);
    expect(result.comments?.find((comment) => comment.id === "other")).toMatchObject({ person: author, is_original_poster: false });
    expect(result.comments?.find((comment) => comment.id === "op")).toMatchObject({ is_original_poster: true });
    expect(result.comments?.find((comment) => comment.id === "collapsed")).not.toHaveProperty("person");
    expect(JSON.stringify(result)).not.toMatch(/synthetic-original-author|synthetic-other-author|relationship_verified|thread_id|"author"|"name"/u);
    const continuation = JSON.parse(Buffer.from(result.more!, "base64url").toString("utf8"));
    expect(Object.keys(continuation).sort()).toEqual(["id", "pages", "replies", "v"]);
    expect(JSON.stringify(continuation)).not.toMatch(/synthetic-original-author|synthetic-other-author|"author"/u);
    const calls = (await records()).filter((record) => record.event === "start");
    expect(calls[0].input).toEqual({ thread: "https://www.reddit.com/r/synthetic/comments/abc123/" });
    expect(calls[1]).toMatchObject({ name: "get_reddit_comments", input: { limit: 200, depth: 10, sort: "top" } });
    expect(calls.filter((record) => record.name === "expand_reddit_comments")).toHaveLength(3);
    expect(calls.filter((record) => record.name === "get_reddit_replies")).toHaveLength(5);
    const resumed = await client.readThread(URL, result.more);
    expect(resumed).toMatchObject({ access_state: "read", comments_read: 4, comments_without_text: 0 });
    expect(resumed.more).toBeUndefined();
    expect(resumed.comments?.map((comment) => comment.id)).toEqual(["page4", "other", "page5", "reply-6"]);
    expect(resumed.comments?.every((comment) => comment.person === author)).toBe(true);
    expect((await records()).filter((record) => record.event === "boot")).toHaveLength(1);
  });
  it("normalizes uppercase subreddit paths", async () => {
    const { client, records } = await fake();
    expect((await client.readThread("https://www.reddit.com/R/SYNTHETIC/comments/ABC123/")).access_state).toBe("read");
    expect((await records()).find((record) => record.event === "start").input.thread).toBe("https://www.reddit.com/r/synthetic/comments/abc123/");
  });
  it("preserves text when a duplicate comment is collapsed on a later page", async () => {
    const { client } = await fake("collapsed-duplicate");
    const result = await client.readThread(URL);
    expect(result.comments?.find((comment) => comment.id === "other")).toMatchObject({ text: "Synthetic comment other", collapsed: false });
  });
  it("marks a first read below the thread's own count as truncated even without a continuation", async () => {
    const { client } = await fake("incomplete");
    const result = await client.readThread(URL);
    expect(result).toMatchObject({ access_state: "read", truncated: true, comments_read: 1 });
    expect(result.more).toBeUndefined();
  });
  it("does not truncate a first read returning every comment when all_comments_collected is false", async () => {
    const { client } = await fake("all-returned-false");
    const result = await client.readThread(URL);
    expect(result).toMatchObject({ access_state: "read", truncated: false, thread_comment_count: 3,
      comments_read: 2, comments_without_text: 1 });
    expect(result.comments).toHaveLength(3);
    expect(result.more).toBeUndefined();
  });
  it("keeps a repeated-page boundary truncated even when the thread's own count was returned", async () => {
    const { client } = await fake("repeated-page");
    const result = await client.readThread(URL);
    expect(result).toMatchObject({ access_state: "read", truncated: true, thread_comment_count: 2, comments_read: 2 });
    expect(result.more).toBeUndefined();
  });
  it.each([
    { mode: "large-initial", expansions: 0, replies: 0, pendingPage: "page-1", pendingReply: "reply-1" },
    { mode: "large-page", expansions: 2, replies: 0, pendingPage: "page-3", pendingReply: "reply-1" },
    { mode: "large-replies", expansions: 0, replies: 2, pendingPage: undefined, pendingReply: "reply-3" }
  ])("stops following continuations at the per-call text boundary: $mode", async ({ mode, expansions, replies, pendingPage, pendingReply }) => {
    const { client, records } = await fake(mode);
    const result = await client.readThread(URL);
    expect(result).toMatchObject({ access_state: "read", truncated: true });
    expect(result.comments!.reduce((count, comment) => count + (comment.text?.length ?? 0), 0)).toBeGreaterThan(100_000);
    const pending = JSON.parse(Buffer.from(result.more!, "base64url").toString("utf8"));
    expect(Object.keys(pending).sort()).toEqual(["id", "pages", "replies", "v"]);
    expect(pending.pages[0]).toBe(pendingPage);
    expect(pending.replies[0]).toBe(pendingReply);
    const calls = (await records()).filter((record) => record.event === "start");
    expect(calls.find((record) => record.name === "get_reddit_comments").input.limit).toBe(200);
    expect(calls.filter((record) => record.name === "expand_reddit_comments")).toHaveLength(expansions);
    expect(calls.filter((record) => record.name === "get_reddit_replies")).toHaveLength(replies);
  });
  it("keeps continuation state independent of the number of comments already read", async () => {
    const { client } = await fake("many-comments");
    let more: string | undefined;
    for (let turn = 0; turn < 8; turn += 1) {
      const result = await client.readThread(URL, more);
      expect(result.access_state).toBe("read");
      expect(result.comments!.length).toBeGreaterThanOrEqual(1_500);
      more = result.more!;
      const pending = JSON.parse(Buffer.from(more, "base64url").toString("utf8"));
      expect(Object.keys(pending).sort()).toEqual(["id", "pages", "replies", "v"]);
      expect(more.length).toBeLessThan(100);
    }
  });
  it("keeps the pending continuation when a later page reaches the overall deadline", async () => {
    // The deadline also covers starting the fake reader's process, which can take over a second while the full gate runs
    // (a 600 ms deadline failed there once on 3 Nov), so it leaves room for that; the slow page still outlasts it.
    const { client } = await fake("slow-continuation", { deadlineMs: 3_000 });
    const result = await client.readThread(URL);
    expect(result).toMatchObject({ access_state: "read", truncated: true, comments_read: 2 });
    expect(JSON.parse(Buffer.from(result.more!, "base64url").toString("utf8"))).toMatchObject({ pages: ["page-1"] });
  });
  it("resolves a short link's subreddit from the post before requesting comments", async () => {
    const { client, records } = await fake();
    expect((await client.readThread("https://redd.it/abc123")).url).toBe("https://www.reddit.com/r/synthetic/comments/abc123/");
    expect((await records()).filter((record) => record.event === "start").slice(0, 2).map((record) => record.input.thread))
      .toEqual(["https://redd.it/abc123", "https://www.reddit.com/r/synthetic/comments/abc123/"]);
  });
  it("asks for a page of 25, forwards filters on stdin and reuses its lazy connection", async () => {
    const { client, records, log } = await fake();
    await expect(readFile(log)).rejects.toMatchObject({ code: "ENOENT" });
    const input = { query: "synthetic research", subreddit: "synthetic", sort: "top" as const, time: "year" as const, after: "synthetic-after" };
    const result = await client.searchThreads(input);
    expect(result).toMatchObject({ access_state: "searched", returned: 7, after: "synthetic-after" });
    expect(result.threads[0]).toEqual({ title: "Synthetic search 0", subreddit: "synthetic", url: "https://www.reddit.com/r/synthetic/comments/abc0/" });
    await client.searchThreads({ query: "second wording" });
    const events = await records();
    expect(events.filter((record) => record.event === "boot")).toHaveLength(1);
    // Without a page size the host returned 7 (#394's run); 25 is Reddit's own default page.
    expect(events.find((record) => record.event === "start").input).toEqual({ ...input, limit: 25 });
    expect(JSON.stringify(events.find((record) => record.event === "boot"))).not.toContain(input.query);
  });
  // The host's codes, from its browser reader's source, and one it might add later.
  it.each([
    ["THREAD_NOT_RENDERED", "not_found"], ["INVALID_INPUT", "invalid"], ["LOGIN_REQUIRED", "not_available"],
    ["HUMAN_CHECK_REQUIRED", "not_available"], ["BROWSER_UNAVAILABLE", "not_available"], ["ACCESS_DENIED", "blocked"],
    ["NOT_PUBLIC", "blocked"], ["WEBSITE_READ_FAILED", "unavailable"], ["UNKNOWN", "unavailable"]
  ])("maps %s to %s and names the code without exposing provider text", async (code, expected) => {
    const { client } = await fake(`error-${code}`);
    expect(await client.readThread(URL)).toEqual({ access_state: expected, url: URL, host_code: code });
    expect(await client.searchThreads({ query: "synthetic" })).toEqual({ access_state: expected, threads: [], returned: 0, host_code: code });
  });
  it("answers the host's busy with a retry hint, and passes on no code that isn't one", async () => {
    // The host locks its one browser for each read, whichever client sent it, and asks for a retry in 2 seconds.
    expect(await (await fake("error-BROWSER_BUSY")).client.readThread(URL))
      .toEqual({ access_state: "busy", url: URL, retry_after_seconds: 5, host_code: "BROWSER_BUSY" });
    expect(await (await fake("error-not a code")).client.searchThreads({ query: "synthetic" }))
      .toEqual({ access_state: "unavailable", threads: [], returned: 0 });
  });
  it("rejects malformed data without reconnecting", async () => {
    const { client, records } = await fake("malformed");
    expect((await client.readThread(URL)).access_state).toBe("unavailable");
    expect((await records()).filter((record) => record.event === "boot")).toHaveLength(1);
  });
  it("reconnects once after a transport failure and then reuses the new connection", async () => {
    const { client, records } = await fake("crash");
    expect((await client.searchThreads({ query: "synthetic" })).returned).toBe(7);
    await client.searchThreads({ query: "second" });
    expect((await records()).filter((record) => record.event === "boot")).toHaveLength(2);
  });
  it("stops after its one reconnect when both transports fail", async () => {
    const { client, records } = await fake("always-crash");
    expect((await client.searchThreads({ query: "synthetic" })).access_state).toBe("unavailable");
    expect((await records()).filter((record) => record.event === "boot")).toHaveLength(2);
  });
  it("times out a waiting call without sending it or releasing the preceding turn", async () => {
    const { client, records } = await fake("slow", { busyWaitMs: 20 });
    const first = client.searchThreads({ query: "first" });
    await untilStarted(records);
    // One call is ahead, so about ten seconds (#394's run: seven parallel reads came back busy with no hint).
    expect(await client.searchThreads({ query: "never sent" })).toEqual({ access_state: "busy", threads: [], returned: 0,
      retry_after_seconds: 10 });
    expect(await client.readThread(URL)).toEqual({ access_state: "busy", url: URL, retry_after_seconds: 10 });
    expect((await records()).filter((record) => record.event === "start")).toHaveLength(1);
    await first;
    expect((await client.searchThreads({ query: "after completion" })).returned).toBe(7);
  });
  it("serializes requests across separate clients", async () => {
    const first = await fake("slow");
    const second = await fake();
    const pending = first.client.searchThreads({ query: "first" });
    await untilStarted(first.records);
    const next = second.client.searchThreads({ query: "second" });
    await expect(readFile(second.log)).rejects.toMatchObject({ code: "ENOENT" });
    await Promise.all([pending, next]);
    const end = (await first.records()).find((record) => record.event === "end");
    const start = (await second.records()).find((record) => record.event === "start");
    expect(start.at).toBeGreaterThanOrEqual(end.at);
  });
  it("counts a call's wait for its turn within its deadline, so it answers busy before a client gives up", async () => {
    const holder = await fake("slow");
    const waiting = await fake();
    const holding = holder.client.readThread(URL);
    await untilStarted(holder.records);
    // The deadline is shorter than the line ahead: the call answers busy within it instead of waiting out the line.
    const waiter = createRedditReaderClient({ ...settings, command: process.execPath,
      args: [fileURLToPath(new globalThis.URL("./fixtures/reddit-reader-server.mjs", import.meta.url)), "normal", waiting.log],
      deadlineMs: 300, busyWaitMs: 10_000 });
    clients.push(waiter);
    const started = Date.now();
    expect(await waiter.searchThreads({ query: "synthetic" })).toMatchObject({ access_state: "busy", returned: 0 });
    expect(Date.now() - started).toBeLessThan(1_000);
    await expect(readFile(waiting.log)).rejects.toMatchObject({ code: "ENOENT" });
    await holding;
  });
  it("bounds calls with a deadline", async () => {
    const { client } = await fake("slow", { deadlineMs: 100 });
    expect((await client.searchThreads({ query: "synthetic" })).access_state).toBe("unavailable");
    expect(spawned).toHaveLength(1);
  });
  it("closes an idle connection and reconnects on demand", async () => {
    const { client, records } = await fake("normal", { idleMs: 20 });
    await client.searchThreads({ query: "synthetic" });
    await pause(60);
    expect((await client.searchThreads({ query: "second" })).returned).toBe(7);
    expect((await records()).filter((record) => record.event === "boot")).toHaveLength(2);
  });
  it("rejects invalid links, continuations and search inputs before sending", async () => {
    const { client, log } = await fake();
    for (const url of ["http://www.reddit.com/r/synthetic/comments/abc123/", "https://reddit.com.invalid/r/synthetic/comments/abc123/", "https://reddit.com/user/synthetic"]) {
      expect((await client.readThread(url)).access_state).toBe("invalid");
    }
    expect((await client.readThread(URL, "malformed")).access_state).toBe("invalid");
    const wrongThread = Buffer.from(JSON.stringify({ v: 1, id: "other", pages: [], replies: [], seen: [] })).toString("base64url");
    expect((await client.readThread(URL, wrongThread)).access_state).toBe("invalid");
    expect((await client.searchThreads({ query: "a".repeat(501) })).access_state).toBe("invalid");
    await expect(readFile(log)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
