import { describe, expect, it, vi } from "vitest";

import { FORUM_READER_USER_AGENT, readForumPage, type ForumPageRuntime } from "../packages/sources/src/forum-page.js";
import { DiscoveredDocumentError, type DiscoveredDocumentFetchRuntime } from "../packages/sources/src/http.js";

let host = 0;
const text = "A synthetic forum participant describes their experience. ".repeat(40);
const page = `<html><head><title>Thread &amp; replies</title></head><body><p>${text}</p><p>Another block.</p></body></html>`;
const response = (body: string, status = 200, headers: Record<string, string> = {}) =>
  ({ status, headers: new Headers({ "content-type": "text/html", ...headers }), bytes: new TextEncoder().encode(body) });

function fixture(options: { robots?: string | number | Error; page?: string; status?: number; contentType?: string } = {}) {
  const url = `https://forum-${++host}.example/thread`;
  let time = 1_000_000;
  const requests: { url: string; at: number }[] = [];
  const requestDocument: NonNullable<DiscoveredDocumentFetchRuntime["requestDocument"]> = vi.fn(async (destination, _addresses, limits) => {
    requests.push({ url: destination.toString(), at: time });
    expect(limits.maximumBytes).toBe(3 * 1024 * 1024);
    expect(limits.timeoutMs).toBe(20_000);
    expect(limits.userAgent).toBe(FORUM_READER_USER_AGENT);
    if (destination.pathname === "/robots.txt") {
      if (options.robots instanceof Error) throw options.robots;
      return response(typeof options.robots === "string" ? options.robots : "User-agent: *\nAllow: /", typeof options.robots === "number" ? options.robots : 200);
    }
    return response(options.page ?? page, options.status ?? 200, options.contentType === undefined ? {} : { "content-type": options.contentType });
  });
  const runtime: ForumPageRuntime = {
    now: () => time,
    sleep: async (milliseconds) => { await new Promise<void>((resolve) => setImmediate(resolve)); time += milliseconds; },
    documentFetchRuntime: { resolveAddresses: async () => ["93.184.216.34"], requestDocument }
  };
  return { url, requests, runtime, requestDocument, advance: (milliseconds: number) => { time += milliseconds; } };
}

describe("public forum page reader", () => {
  it("extracts visible blocks and title with the reader agent and limits", async () => {
    const data = fixture({ page: page.replace("</body>", "<script>do not show this</script><div hidden>hidden text</div></body>") });
    const result = await readForumPage(data.url, data.runtime);
    expect(result).toMatchObject({ url: data.url, access_state: "read", title: "Thread & replies", truncated: false });
    expect(result.page_text).toContain(`${text.trim()}\nAnother block.`);
    expect(result.page_text).not.toMatch(/do not show this|hidden text/u);
    expect(data.requests).toHaveLength(2);
    expect(data.requests[1]!.at - data.requests[0]!.at).toBeGreaterThanOrEqual(1_000);
  });

  it("fetches no thread when robots disallows it", async () => {
    const data = fixture({ robots: "User-agent: AskRigor\nDisallow: /thread" });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "robots_disallowed" });
    expect(data.requests).toHaveLength(1);
  });

  it.each([401, 403, 404, 429])("allows a missing robots response with HTTP %i", async (robots) => {
    const data = fixture({ robots });
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("read");
  });

  it.each([500, 503, new Error("synthetic network error")])("does not fetch a page after robots failure %s", async (robots) => {
    const data = fixture({ robots });
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("robots_disallowed");
    expect(data.requests).toHaveLength(1);
  });

  it("caches rules for one hour then refreshes", async () => {
    const data = fixture();
    await readForumPage(data.url, data.runtime);
    await readForumPage(data.url, data.runtime);
    expect(data.requests.filter((request) => request.url.endsWith("/robots.txt"))).toHaveLength(1);
    data.advance(3_600_000);
    await readForumPage(data.url, data.runtime);
    expect(data.requests.filter((request) => request.url.endsWith("/robots.txt"))).toHaveLength(2);
  });

  it("bounds the robots host cache", async () => {
    const first = fixture({ robots: "User-agent: *\nDisallow: /" });
    await readForumPage(first.url, first.runtime);
    for (let index = 0; index < 256; index += 1) {
      const next = fixture({ robots: "User-agent: *\nDisallow: /" });
      await readForumPage(next.url, next.runtime);
    }
    await readForumPage(first.url, first.runtime);
    expect(first.requests).toHaveLength(2);
  });

  it("shares the robots lookup and spaces concurrent page requests in this process", async () => {
    const data = fixture();
    const results = await Promise.all([readForumPage(data.url, data.runtime), readForumPage(`${data.url}?page=2`, { ...data.runtime })]);
    expect(results.map((result) => result.access_state)).toEqual(["read", "read"]);
    expect(data.requests).toHaveLength(3);
    expect(data.requests[1]!.at - data.requests[0]!.at).toBeGreaterThanOrEqual(1_000);
    expect(data.requests[2]!.at - data.requests[1]!.at).toBeGreaterThanOrEqual(1_000);
  });

  it.each([401, 403, 406, 429, 451, 503])("reports blocked HTTP %i without text", async (status) => {
    const data = fixture({ status });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "blocked" });
  });

  it.each([404, 410])("reports not found HTTP %i without text", async (status) => {
    const data = fixture({ status });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "not_found" });
  });

  it.each([500, 502])("reports unavailable HTTP %i without text", async (status) => {
    const data = fixture({ status });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "unavailable" });
  });

  it.each([
    page.replace("<body>", '<body><div class="cf-chl-container"></div>'),
    page.replace("<body>", '<body><script>window._cf_chl_opt = {}</script>'),
    page.replace("Thread &amp; replies", "Just a moment"),
    page.replace("Thread &amp; replies", "Just a moment..."),
    page.replace("Thread &amp; replies", "jUsT a MoMeNt..."),
    page.replace("Thread &amp; replies", "ATTENTION REQUIRED!"),
    page.replace("Thread &amp; replies", "Please finish this CAPTCHA")
  ])("reports the specified challenge markers without text", async (html) => {
    const data = fixture({ page: html });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "blocked" });
    expect(data.requests).toHaveLength(2);
  });

  it("reads an ordinary long page containing challenge-platform", async () => {
    const data = fixture({ page: page.replace("<body>", '<body><script src="/challenge-platform/script"></script>') });
    expect(await readForumPage(data.url, data.runtime)).toMatchObject({ access_state: "read", page_text: expect.stringContaining(text.trim()) });
  });

  it("reports a short page as needing a browser and returns no text", async () => {
    const data = fixture({ page: "<title>A short page</title><p>Load posts.</p>" });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "needs_a_browser" });
  });

  it("caps read text at 60,000 characters and reports truncation", async () => {
    const data = fixture({ page: `<p>${"x".repeat(60_001)}</p>` });
    const result = await readForumPage(data.url, data.runtime);
    expect(result.page_text).toHaveLength(60_000);
    expect(result.truncated).toBe(true);
  });

  it("returns only an HTTPS rel-next link on the same host", async () => {
    const data = fixture({ page: `${page}<a rel="next" href="https://elsewhere.example/page">elsewhere</a><link REL='prev NEXT' href='?page=2&amp;view=full'>` });
    expect((await readForumPage(data.url, data.runtime)).next_page).toBe(`${data.url}?page=2&view=full`);
    expect(data.requests).toHaveLength(2);
  });

  it("does not extract a next-page link from scripts or comments", async () => {
    const data = fixture({ page: `${page}<script><a rel='next' href='/script'></a></script><!-- <link rel='next' href='/comment'> -->` });
    expect((await readForumPage(data.url, data.runtime)).next_page).toBeUndefined();
  });

  it("supports plain text without treating angle brackets as HTML", async () => {
    const data = fixture({ page: `${text}<a literal>`, contentType: "text/plain" });
    expect((await readForumPage(data.url, data.runtime)).page_text).toBe(`${text}<a literal>`.trim());
  });

  it.each(["http://forum.example/thread", "not a URL", "https://user:password@forum.example/thread", "https://forum.example:8443/thread"])("does not request an invalid forum URL %s", async (url) => {
    const data = fixture();
    expect((await readForumPage(url, data.runtime)).access_state).toBe("unavailable");
    expect(data.requests).toHaveLength(0);
  });

  it("rejects private destinations before a network request", async () => {
    const data = fixture();
    data.runtime.documentFetchRuntime!.resolveAddresses = async () => ["127.0.0.1"];
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("robots_disallowed");
    expect(data.requests).toHaveLength(0);
  });

  it("rejects an oversized document", async () => {
    const data = fixture({ page: "x".repeat(3 * 1024 * 1024 + 1) });
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("unavailable");
  });

  it("does not read a non-text response", async () => {
    const data = fixture({ contentType: "image/png" });
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("unavailable");
  });

  it("passes the user agent through the injected-fetch transport too", async () => {
    const data = fixture();
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("user-agent")).toBe(FORUM_READER_USER_AGENT);
      return new Response(new URL(String(url)).pathname === "/robots.txt" ? "User-agent: *\nAllow: /" : page);
    });
    data.runtime.documentFetchRuntime!.fetch = fetcher;
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("read");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(data.requestDocument).not.toHaveBeenCalled();
  });

  it("reports transport errors without provider error text", async () => {
    const data = fixture();
    const request = data.requestDocument;
    data.runtime.documentFetchRuntime!.requestDocument = async (...args) => {
      if (args[0].pathname === "/robots.txt") return request(...args);
      throw new DiscoveredDocumentError("transport", "private upstream detail");
    };
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "unavailable" });
  });

  it("checks redirect destinations' robots and paces every request", async () => {
    const data = fixture();
    const initialRequest = data.requestDocument;
    data.runtime.documentFetchRuntime!.requestDocument = async (...args) => {
      if (args[0].pathname === "/thread") {
        await initialRequest(...args);
        return response("", 302, { location: "/private" });
      }
      if (args[0].pathname === "/robots.txt") {
        await initialRequest(...args);
        return response("User-agent: *\nDisallow: /private");
      }
      return initialRequest(...args);
    };
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("robots_disallowed");
    expect(data.requests.map((request) => new URL(request.url).pathname)).toEqual(["/robots.txt", "/thread"]);
  });

  it("uses a redirected robots file in the context of the initial host", async () => {
    const data = fixture();
    const initialRequest = data.requestDocument;
    data.runtime.documentFetchRuntime!.requestDocument = async (...args) => {
      await initialRequest(...args);
      if (args[0].pathname === "/robots.txt") return response("", 302, { location: "/robot-rules" });
      return response("User-agent: *\nDisallow: /thread");
    };
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("robots_disallowed");
    expect(data.requests.map((request) => new URL(request.url).pathname)).toEqual(["/robots.txt", "/robot-rules"]);
    expect(data.requests[1]!.at - data.requests[0]!.at).toBeGreaterThanOrEqual(1_000);
  });
});
