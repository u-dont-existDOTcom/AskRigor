import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupRedditThread, lookupRedditThreads, redditPostId } from "../packages/sources/src/reddit-thread.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// The embed endpoint's answer for a real post, as seen on 29 Sep 2026: its real
// subreddit is in the embed markup, and the poster's name comes along too.
const embed = (subreddit: string, postId: string, title: string) => JSON.stringify({
  author_name: "someone",
  html: `<blockquote class="reddit-embed-bq"><a href="https://www.reddit.com/r/${subreddit}/comments/${postId}/a_slug/">` +
    `${title}</a><br> by <a href="https://www.reddit.com/user/someone/">u/someone</a> in ` +
    `<a href="https://www.reddit.com/r/${subreddit}/">${subreddit}</a></blockquote>`,
  provider_name: "reddit",
  title,
  type: "rich"
});

describe("Reddit thread lookup", () => {
  it("returns a thread's real subreddit and title, never the poster", async () => {
    const fetchMock = vi.fn(async () => new Response(embed("evolutionReddit", "1abcde", "Some other post"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await lookupRedditThread("https://old.reddit.com/r/trt/comments/1ABCDE/hgh_and_trt/?utm_source=share");
    expect(result).toEqual({ state: "found", subreddit: "evolutionreddit", post_id: "1abcde", title: "Some other post" });
    expect(JSON.stringify(result)).not.toContain("someone");
    // Only the canonical thread link goes to Reddit, on its embed endpoint.
    const requested = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(requested.origin + requested.pathname).toBe("https://www.reddit.com/oembed");
    expect([...requested.searchParams]).toEqual([["url", "https://www.reddit.com/r/trt/comments/1abcde/"]]);
  });

  it("tells a missing thread from a lookup that failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await lookupRedditThread("https://www.reddit.com/r/trt/comments/zz9zz9zzz/x/")).toEqual({ state: "not_found" });
    for (const failure of [
      async () => new Response("{}", { status: 503 }),
      async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); },
      // An answer naming another post proves nothing about this one.
      async () => new Response(embed("trt", "2other", "A title"), { status: 200 }),
      async () => new Response("not json", { status: 200 })
    ]) {
      vi.stubGlobal("fetch", vi.fn(failure));
      expect(await lookupRedditThread("https://www.reddit.com/r/trt/comments/1abcde/x/")).toEqual({ state: "unavailable" });
    }
    // A link that is not a thread is not looked up.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await lookupRedditThread("https://www.reddit.com/r/trt/")).toEqual({ state: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks each post up once, at most 40", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const thread = new URL(String(input)).searchParams.get("url")!;
      const [, subreddit, postId] = /\/r\/([^/]+)\/comments\/([^/]+)\//u.exec(thread)!;
      return new Response(embed(subreddit!, postId!, "A title"), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const links = [
      "https://www.reddit.com/r/trt/comments/aaa111/x/",
      "https://old.reddit.com/r/trt/comments/aaa111/other_slug/c0mm3nt/",
      ...Array.from({ length: 45 }, (_, index) => `https://www.reddit.com/r/trt/comments/p${index}/x/`)
    ];
    const results = await lookupRedditThreads(links);
    expect(results.size).toBe(40);
    expect(fetchMock).toHaveBeenCalledTimes(40);
    expect(results.get("aaa111")).toMatchObject({ state: "found", subreddit: "trt" });
    expect(redditPostId("https://www.reddit.com/r/trt/comments/AAA111/")).toBe("aaa111");
    expect(redditPostId("https://redd.it/aaa111")).toBeUndefined();
  });
});
