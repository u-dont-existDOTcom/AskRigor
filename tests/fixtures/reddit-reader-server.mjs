import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const [mode = "normal", log] = process.argv.slice(2);
const previous = log && existsSync(log) ? readFileSync(log, "utf8") : "";
const record = (event) => { if (log) appendFileSync(log, `${JSON.stringify(event)}\n`); };
record({ event: "boot", pid: process.pid, env: process.env, argv: process.argv.slice(2) });
const server = new McpServer({ name: "synthetic-forum-reader", version: "1.0" });
const post = { id: "abc123", name: "t3_abc123", title: "Synthetic thread", body: "Synthetic original post", author: "synthetic-original-author",
  subreddit: "synthetic", url: "https://www.reddit.com/r/synthetic/comments/abc123/", score: 4, comment_count: 30,
  created: 1_700_000_000, removed: false };
const comment = (id, author = "synthetic-other-author", body = `Synthetic comment ${id}`) => ({
  id, name: `t1_${id}`, parent_id: "t3_abc123", thread_id: "abc123", body, removed: body === null, collapsed: body === null,
  author, score: 2, created: 1_700_000_010, url: `https://www.reddit.com/r/synthetic/comments/abc123/comment/${id}/`, depth: 0,
  relationship_verified: true
});
const comments = (items, next = null, replies = []) => ({ source: "reddit", thread_id: "abc123", comments: items,
  returned_count: items.length, loaded_comments: items.length, next_page_token: next, reply_continuations: replies,
  account_session_verified: true, all_comments_collected: next === null && replies.length === 0, scope: "synthetic" });
for (const name of ["search_reddit", "get_reddit_thread", "get_reddit_comments", "get_reddit_replies", "expand_reddit_comments"]) {
  server.registerTool(name, { inputSchema: z.object({}).passthrough() }, async (input) => {
    record({ event: "start", name, input, at: Date.now() });
    if (mode === "crash" && !previous.includes('"event":"start"')) process.exit(0);
    if (mode === "always-crash") process.exit(0);
    if (mode === "slow-continuation" && name === "expand_reddit_comments") await new Promise((resolve) => setTimeout(resolve, 10_000));
    if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 150));
    // The host's busy answer carries its retry hint, as the real host's does.
    if (mode.startsWith("error-")) return { isError: true, structuredContent: { error: { code: mode.slice(6), message: "Synthetic private provider message",
      ...(mode === "error-BROWSER_BUSY" ? { retry_after_seconds: 2 } : {}) } }, content: [] };
    let result;
    if (name === "search_reddit") result = { source: "reddit", posts: Array.from({ length: 7 }, (_, index) => ({
      id: `abc${index}`, name: `t3_abc${index}`, subreddit: "synthetic", title: `Synthetic search ${index}`,
      url: `https://www.reddit.com/r/synthetic/comments/abc${index}/` })), next_page_token: "synthetic-after",
      account_session_verified: true, scope: "synthetic" };
    else if (name === "get_reddit_thread") result = { source: "reddit", post: mode === "all-returned-false" ? { ...post, comment_count: 3 }
      : mode === "repeated-page" ? { ...post, comment_count: 2 } : post };
    else if (name === "get_reddit_comments") result = comments([
      comment("op", "synthetic-original-author"), comment("other"), comment("collapsed", null, null)
    ], "page-1", Array.from({ length: 6 }, (_, index) => ({ comment_id: `reply-${index + 1}`, author: "synthetic-other-author" })));
    else if (name === "expand_reddit_comments") {
      const index = Number(input.page_token.split("-")[1]);
      result = comments([comment(`page${index}`), mode === "collapsed-duplicate" ? comment("other", null, null) : comment("other")], index < 5 ? `page-${index + 1}` : null);
    } else result = comments([comment(input.comment_id)]);
    if (mode === "incomplete" && name === "get_reddit_comments") result = { ...comments([comment("other")]), all_comments_collected: false };
    if (mode === "all-returned-false" && name === "get_reddit_comments") result = { ...comments([
      comment("op", "synthetic-original-author"), comment("other"), comment("collapsed", null, null)
    ]), all_comments_collected: false };
    if (mode === "repeated-page" && ["get_reddit_comments", "expand_reddit_comments"].includes(name)) {
      result = comments([comment(name)], "page-1");
    }
    if (mode === "large-initial" && name === "get_reddit_comments") result = comments([comment("large", undefined, "x".repeat(100_001))], "page-1", [{ comment_id: "reply-1" }]);
    if (mode === "large-page" && name === "expand_reddit_comments") result = comments([comment(input.page_token, undefined, "x".repeat(60_000))], `page-${Number(input.page_token.split("-")[1]) + 1}`);
    if (mode === "large-replies") {
      if (name === "get_reddit_comments") result = comments([comment("other")], null, [{ comment_id: "reply-1" }, { comment_id: "reply-2" }, { comment_id: "reply-3" }]);
      if (name === "get_reddit_replies") result = comments([comment(input.comment_id, undefined, "x".repeat(60_000))]);
    }
    if (mode === "many-comments" && ["get_reddit_comments", "expand_reddit_comments"].includes(name)) {
      const page = name === "get_reddit_comments" ? 0 : Number(input.page_token.split("-")[1]);
      result = comments(Array.from({ length: input.limit }, (_, index) => comment(`${page}-${index}`, undefined, "x")), `page-${page + 1}`);
    }
    if (mode === "malformed") result = { invalid: true };
    record({ event: "end", name, at: Date.now() });
    return mode === "text" ? { content: [{ type: "text", text: JSON.stringify(result) }] }
      : { structuredContent: result, content: [{ type: "text", text: "Synthetic reader result" }] };
  });
}
await server.connect(new StdioServerTransport());
