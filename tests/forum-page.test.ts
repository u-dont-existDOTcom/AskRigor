import { describe, expect, it, vi } from "vitest";

import { startTags } from "../packages/sources/src/candidate-full-text.js";
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

  // The review of #421: a robots.txt that couldn't be reached is no rule of the site's. The read is unavailable, the page
  // isn't fetched, and nothing is kept, so the next read asks again; robots_disallowed is only a parsed rule's answer.
  it.each([500, 503, new Error("synthetic network error")])("does not fetch a page after robots failure %s", async (robots) => {
    const data = fixture({ robots });
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("unavailable");
    expect(data.requests).toHaveLength(1);
    await readForumPage(data.url, data.runtime);
    expect(data.requests.filter((request) => request.url.endsWith("/robots.txt"))).toHaveLength(2);
  });

  it("reads a host that doesn't resolve as unavailable, and one outside the public internet as invalid", async () => {
    const unresolved = fixture();
    unresolved.runtime.documentFetchRuntime!.resolveAddresses = async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    };
    expect((await readForumPage(unresolved.url, unresolved.runtime)).access_state).toBe("unavailable");
    expect(unresolved.requests).toHaveLength(0);
  });

  it("reads a robots.txt redirected where the reader won't go as unavailable, since the site answered", async () => {
    const data = fixture();
    const request = data.requestDocument;
    data.runtime.documentFetchRuntime!.requestDocument = async (...args) => args[0].pathname === "/robots.txt"
      ? response("", 301, { location: `http://${args[0].host}/robots.txt` }) : request(...args);
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("unavailable");
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

  // The review of #421: only exact refusals are blocked, a 401 asks for a login, and a busy or failing site is unavailable.
  it.each([403, 451])("reports blocked HTTP %i without text", async (status) => {
    const data = fixture({ status });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "blocked" });
  });

  it("reports HTTP 401 as needing a login, without text", async () => {
    const data = fixture({ status: 401 });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "login_required" });
  });

  it.each([406, 429, 500, 503])("reports unavailable HTTP %i without text", async (status) => {
    const data = fixture({ status });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "unavailable" });
  });

  it.each([404, 410])("reports not found HTTP %i without text", async (status) => {
    const data = fixture({ status });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "not_found" });
  });

  it.each([500, 502])("reports unavailable HTTP %i without text", async (status) => {
    const data = fixture({ status });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "unavailable" });
  });

  // The review of #421: a bot challenge is known by its markup only, never by its title's words, which a real thread
  // may have ("Just a moment of dizziness…").
  it.each([
    page.replaceAll("<body>", '<body><div class="cf-chl-container"></div>'),
    page.replaceAll("<body>", '<body><script>window._cf_chl_opt = {}</script>'),
    page.replaceAll("<body>", '<body><form id="challenge-form" action="/" method="POST"></form>')
  ])("reports the specified challenge markers without text", async (html) => {
    const data = fixture({ page: html });
    expect(await readForumPage(data.url, data.runtime)).toEqual({ url: data.url, access_state: "blocked" });
    expect(data.requests).toHaveLength(2);
  });

  it.each([
    page.replaceAll("Thread &amp; replies", "Just a moment of dizziness after a dose change"),
    page.replaceAll("Thread &amp; replies", "ATTENTION REQUIRED: my results"),
    page.replaceAll("Thread &amp; replies", "Is this CAPTCHA safe?"),
    page.replaceAll("<body>", "<body><p>The page said window._cf_chl_opt and cf-chl-widget before it loaded.</p>")
  ])("reads a page whose words only mention a challenge", async (html) => {
    const data = fixture({ page: html });
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("read");
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

  it("finds a next-page link after unread parts, whatever their case, and reads none inside them", async () => {
    const data = fixture({ page: `${page}\u0130<!-- <a rel='next' href='/comment'> --><SCRIPT type="x"><a rel='next' href='/script'></a></SCRIPT >` +
      "<STYLE>a{}</STYLE><scriptish></scriptish><a rel='next' href='/real'>next</a>" });
    expect((await readForumPage(data.url, data.runtime)).next_page).toBe(new URL("/real", data.url).toString());
  });

  it("reads no link after a comment or script that never closes", async () => {
    for (const open of ["<!-- ", "<script>"]) {
      const data = fixture({ page: `${page}${open}<a rel='next' href='/after'>next</a>` });
      expect((await readForumPage(data.url, data.runtime)).next_page).toBeUndefined();
    }
  });

  // The review of #421: any rel="prev" or rel="next" tag marks a page before or after this one, followable or not, on any
  // host, so a page of a longer thread never reads as a whole one; the reader still follows only a usable next link.
  it("marks a page before or after it by any rel tag, and follows only a usable next link", async () => {
    for (const [markup, before, after, next] of [
      [`<link rel="prev" href="?page=1">`, true, false, undefined],
      [`<a rel='Previous' href='http://elsewhere.example/1'>back</a>`, true, false, undefined],
      [`<link rel="next" href="http://forum.example/insecure">`, false, true, undefined],
      [`<link rel="next" href="?page=3"><link rel="prev">`, true, true, "?page=3"],
      [`<script><a rel='prev' href='/script'></a></script><!-- <link rel='next' href='/comment'> -->`, false, false, undefined],
      ["", false, false, undefined]
    ] as const) {
      const data = fixture({ page: `${page}${markup}` });
      const read = await readForumPage(data.url, data.runtime);
      expect(read.page_before === true, markup).toBe(before);
      expect(read.page_after === true, markup).toBe(after);
      expect(read.next_page, markup).toBe(next === undefined ? undefined : `${data.url}${next}`);
    }
  });

  // The review of #421: pagers without rel tags (MyBB's, vBulletin 3's, phpBB 3.0's, a "Weiter ›" link) still link the
  // later pages of their thread, by the page each link picks. The reader lists such links on its own host; the caller
  // keeps those of the page's own thread.
  it("lists the page's links to a page after the first, on its own host", async () => {
    const pagers: Array<[string, string, string]> = [
      ["/showthread.php?tid=77", `<a href="showthread.php?tid=77&amp;page=2" class="pagination_page">2</a>`,
        "/showthread.php?tid=77&page=2"],
      ["/showthread.php?t=88", `<a class="smallfont" href="showthread.php?t=88&amp;page=2">&gt;</a>`,
        "/showthread.php?t=88&page=2"],
      ["/viewtopic.php?f=4&t=99", `<a href="./viewtopic.php?f=4&amp;t=99&amp;start=15">2</a>`,
        "/viewtopic.php?f=4&t=99&start=15"],
      ["/thema/55", `<nav><a href="/thema/55?page=2">Weiter ›</a></nav>`, "/thema/55?page=2"]
    ];
    for (const [path, pager, later] of pagers) {
      const data = fixture({ page: page.replaceAll("</body>", `${pager}</body>`) });
      const origin = new URL(data.url).origin;
      const read = await readForumPage(`${origin}${path}`, data.runtime);
      expect(read.later_page_links, path).toEqual([`${origin}${later}`]);
    }
    // A first page's own link, another host's, and a link inside a script or comment are none.
    const none = fixture({ page: page.replaceAll("</body>", `<a href="?page=1">1</a><a href="https://elsewhere.example/t?page=2">x</a>` +
      `<script>var a = '<a href="?page=3">3</a>';</script><!-- <a href="?page=4">4</a> --></body>`) });
    expect((await readForumPage(none.url, none.runtime)).later_page_links).toBeUndefined();
  });

  // Greptile's review of 12 Nov 2026 (P1), reproduced by an independent audit: a thread page carried 50 links to other
  // threads' later pages (a sidebar, a "related threads" list) before its own page 2. The list stopped at 50 links of any
  // thread, so the thread's own page 2 was never listed and page 1 read as the whole thread. The links of the page's own
  // thread (the page's own link but for the page it picks) are now found before the limit applies, wherever they stand.
  const otherThread = (index: number): string => `/showthread.php?t=${1_000 + index}&page=2`;
  const laterPagesOf = (count: number, link = otherThread): string => Array.from({ length: count }, (_, index) =>
    `<li><a href="${link(index).replaceAll("&", "&amp;")}">Related thread ${index}</a></li>`).join("");
  const readThread = async (path: string, markup: string) => {
    const data = fixture({ page: page.replaceAll("</body>", `${markup}</body>`) });
    const origin = new URL(data.url).origin;
    const read = await readForumPage(`${origin}${path}`, data.runtime);
    expect(read.access_state).toBe("read");
    // The links as paths, as the page wrote them.
    return { read, links: (read.later_page_links ?? []).map((link) => link.slice(origin.length)) };
  };
  const pager = `<div class="pagination"><a href="showthread.php?t=77&amp;page=2">2</a></div>`;

  it("lists the thread's own later page behind 50 links to other threads' later pages", async () => {
    const { read, links } = await readThread("/showthread.php?t=77", `<ul>${laterPagesOf(50)}</ul>${pager}`);
    // First in the list, which still holds no more than 50 links and says that it left one out.
    expect(links).toEqual(["/showthread.php?t=77&page=2", ...Array.from({ length: 49 }, (_, index) => otherThread(index))]);
    expect(read.later_page_links_cut).toBe(true);
    // The page's own text is whole: its place in its thread is said by its links, not as a cut text.
    expect(read.truncated).toBe(false);
  });

  it("lists the thread's own later page before 50 links to other threads' later pages", async () => {
    const { read, links } = await readThread("/showthread.php?t=77", `${pager}<ul>${laterPagesOf(50)}</ul>`);
    expect(links).toEqual(["/showthread.php?t=77&page=2", ...Array.from({ length: 49 }, (_, index) => otherThread(index))]);
    expect(read.later_page_links_cut).toBe(true);
  });

  it("knows the thread's own later pages as the page's own link, but for the page each picks", async () => {
    // XenForo's path form, read at page 2: its own pages differ from it only in the path's page end and a last slash.
    const xenforo = await readThread("/threads/synthetic-topic.77/page-2",
      `${laterPagesOf(50, (index) => `/threads/other-topic.${index}/page-2`)}<a href="/threads/synthetic-topic.77/">1</a>` +
      `<a href="/threads/synthetic-topic.77/page-3">3</a>`);
    expect(xenforo.links[0]).toBe("/threads/synthetic-topic.77/page-3");
    // phpBB's parameters in another order, with the page's own start: one thread by its parameters' names and values.
    const phpbb = await readThread("/viewtopic.php?f=4&t=99&start=15",
      `${laterPagesOf(50, (index) => `/viewtopic.php?f=4&t=${1_000 + index}&start=15`)}<a href="./viewtopic.php?t=99&amp;f=4&amp;start=30">3</a>`);
    expect(phpbb.links[0]).toBe("/viewtopic.php?t=99&f=4&start=30");
    // Another thread is none of the page's own: another number, another parameter, another path. Each is listed in its
    // place on the page, as before.
    const others = await readThread("/showthread.php?t=77", `<a href="showthread.php?t=770&amp;page=2">a</a>` +
      `<a href="showthread.php?t=77&amp;view=print&amp;page=2">b</a><a href="/archive/showthread.php?t=77&amp;page=2">c</a>` +
      laterPagesOf(50));
    expect(others.links).toEqual(["/showthread.php?t=770&page=2", "/showthread.php?t=77&view=print&page=2",
      "/archive/showthread.php?t=77&page=2", ...Array.from({ length: 47 }, (_, index) => otherThread(index))]);
    expect(others.read.later_page_links_cut).toBe(true);
  });

  it("lists no more than 50 links when the thread links more than 50 of its own later pages", async () => {
    const ownPage = (index: number): string => `/showthread.php?t=77&page=${index + 2}`;
    const sixty = await readThread("/showthread.php?t=77", laterPagesOf(60, ownPage));
    expect(sixty.links).toEqual(Array.from({ length: 50 }, (_, index) => ownPage(index)));
    expect(sixty.read.later_page_links_cut).toBe(true);
    // Behind ten links to other threads: its own come first, and the reader reads no further once a link is left out
    // of a list with one of its own in it, which settles that a page follows.
    const behind = await readThread("/showthread.php?t=77", `${laterPagesOf(10)}${laterPagesOf(60, ownPage)}`);
    expect(behind.links).toEqual([...Array.from({ length: 41 }, (_, index) => ownPage(index)),
      ...Array.from({ length: 9 }, (_, index) => otherThread(index))]);
    expect(behind.read.later_page_links_cut).toBe(true);
    // A link counts once: sixty links to one later page are one link, and nothing is left out.
    const repeated = await readThread("/showthread.php?t=77", pager.repeat(60));
    expect(repeated.links).toEqual(["/showthread.php?t=77&page=2"]);
    expect(repeated.read.later_page_links_cut).toBeUndefined();
  });

  // A list that left links out and holds none of the page's own thread doesn't show that the page links none, as its
  // caller compares threads: the read says the list was cut, and read_forum_thread then signs no end of the thread. No
  // mark on a page shows it whole: whole is only a list that left nothing out, with none of its own thread in it.
  it("says when its list of later pages left links out, and not when it holds them all", async () => {
    const cut = await readThread("/showthread.php?t=77", laterPagesOf(51));
    expect(cut.links).toEqual(Array.from({ length: 50 }, (_, index) => otherThread(index)));
    expect(cut.read.later_page_links_cut).toBe(true);
    const full = await readThread("/showthread.php?t=77", laterPagesOf(50));
    expect(full.links).toEqual(Array.from({ length: 50 }, (_, index) => otherThread(index)));
    expect(full.read.later_page_links_cut).toBeUndefined();
    const few = await readThread("/showthread.php?t=77", `${laterPagesOf(3)}${pager}`);
    expect(few.links).toEqual(["/showthread.php?t=77&page=2", otherThread(0), otherThread(1), otherThread(2)]);
    expect(few.read.later_page_links_cut).toBeUndefined();
  });

  it("does not extract a next-page link from scripts or comments", async () => {
    const data = fixture({ page: `${page}<script><a rel='next' href='/script'></a></script><!-- <link rel='next' href='/comment'> -->` });
    expect((await readForumPage(data.url, data.runtime)).next_page).toBeUndefined();
  });

  it("supports plain text without treating angle brackets as HTML", async () => {
    const data = fixture({ page: `${text}<a literal>`, contentType: "text/plain" });
    expect((await readForumPage(data.url, data.runtime)).page_text).toBe(`${text}<a literal>`.trim());
  });

  // The review of #421: a link the reader refuses itself, before any request to the site, is invalid, not unavailable or
  // robots_disallowed, which the site would have said; read_forum_thread signs no receipt for it.
  it.each(["http://forum.example/thread", "not a URL", "https://user:password@forum.example/thread", "https://forum.example:8443/thread"])("does not request an invalid forum URL %s", async (url) => {
    const data = fixture();
    expect((await readForumPage(url, data.runtime)).access_state).toBe("invalid");
    expect(data.requests).toHaveLength(0);
  });

  it("rejects private destinations before a network request", async () => {
    const data = fixture();
    data.runtime.documentFetchRuntime!.resolveAddresses = async () => ["127.0.0.1"];
    expect((await readForumPage(data.url, data.runtime)).access_state).toBe("invalid");
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

// The code review of 13 Nov 2026 (Codex, P1): the bot-challenge check read a page with three backtracking patterns,
// each starting over at every "<script", tag or "<form" of a page that never closed them. Timed on its own, the first
// took 3.8 seconds on 128 KB of "<script" text, about 38 minutes by the same rule at the reader's 3 MB limit, and the
// second took 15 seconds on 16 KB of "<a class=": the cube of the size. The read is synchronous, so the server answered
// nothing else meanwhile.
describe("public forum page reader on hostile markup", () => {
  const KB = 1024;
  /** A unit repeated to a length. */
  const filled = (unit: string, length: number): string => unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
  /** How long one read of a page takes, with what it returns. */
  const timedRead = async (html: string) => {
    const data = fixture({ page: html });
    const started = performance.now();
    const read = await readForumPage(data.url, data.runtime);
    return { read, milliseconds: performance.now() - started };
  };
  // Sizes four times apart, up to a page as large as the reader takes (3 MB): a read whose time grows with the square
  // or the cube of the size fails at a small size, in seconds, rather than holding the run for hours.
  const SIZES = [8 * KB, 32 * KB, 128 * KB, 512 * KB, 3 * KB * KB - 8 * KB];
  const withinTime = async (label: string, pageOf: (length: number) => string, state = "read") => {
    for (const length of SIZES) {
      const { read, milliseconds } = await timedRead(pageOf(length));
      expect(read.access_state, `${label}, ${length / KB} KB`).toBe(state);
      // Well under a second for a few hundred KB, as the review asked, and three seconds for the largest page.
      expect(milliseconds, `${label}, ${length / KB} KB, took ${Math.round(milliseconds)} ms`)
        .toBeLessThan(length <= 512 * KB ? 500 : 3_000);
    }
  };

  // Each hostile text stands inside one script that closes, with a mention of all three markers after it. The text
  // extractor drops such a script in one step, so the time measured is the challenge check's; and the mention keeps the
  // check reading on, where a page that names no marker at all is answered at once.
  const mention = "<p>The page said window._cf_chl_opt, cf-chl-widget and challenge-form before it loaded.</p>";
  const inScript = (hostile: string, end = "") => (length: number): string =>
    `<html><body><script>${filled(hostile, length)}${end}</script>${mention}<p>${text}</p></body></html>`;

  it.each([
    ["a script full of \"<script>\" strings (the review's page)", "var a = \"<script>\";", ""],
    // One ">" ends them all, just before the script closes: with none, the patterns took the script's own end for
    // theirs and read the mention after it as a script's text, a challenge by their rule.
    ["a script full of \"<script\" that one \">\" ends", "<script ", ">"],
    ["tags with a class and no end (\"<a class=\")", "<a class=", ""],
    ["tags with an id and an open quote (\"<div id='\")", "<div id='", ""],
    ["tags with no end (\"<a \")", "<a ", ""],
    ["forms with no end (\"<form \")", "<form ", ""],
    ["forms with an id (\"<form id=\")", "<form id=", ""]
  ])("checks for a bot challenge in time linear in the page's size: %s", async (label, hostile, end) => {
    await withinTime(label, inScript(hostile, end));
  }, 120_000);

  it("still knows a challenge on a page of that size, and a page that only mentions one", async () => {
    const hostile = filled("var a = \"<script>\"; <a class= <form id= ", 512 * KB);
    for (const marker of ["<script>window._cf_chl_opt = {}</script>", "<div class=\"cf-chl-container\"></div>",
      "<form id=\"challenge-form\" action=\"/\" method=\"POST\"></form>"]) {
      const { read, milliseconds } = await timedRead(`<html><body><script>${hostile}</script>${marker}<p>${text}</p></body></html>`);
      expect(read, marker).toEqual({ url: expect.any(String), access_state: "blocked" });
      expect(milliseconds, marker).toBeLessThan(500);
    }
    const { read } = await timedRead(inScript("var a = \"<script>\"; <a class= <form id= ")(512 * KB));
    expect(read.access_state).toBe("read");
  }, 120_000);

  // The same answers as the three patterns the check used to be (main at e24f6d3b), on pages built from the pieces those
  // patterns read and on challenge pages with a few edits, so both answers come up often. Deterministic: its own seed.
  it("answers as the three patterns it replaces did, on generated pages", async () => {
    const formerly = (html: string): boolean =>
      /<script\b[^>]*>(?:(?!<\/script)[\s\S])*_cf_chl_opt/iu.test(html) ||
      /<[a-z][\w-]*\s[^>]*\b(?:class|id)\s*=\s*["']?[^"'>]*\bcf-chl-/iu.test(html) ||
      /<form\b[^>]*\bid\s*=\s*["']?challenge-form\b/iu.test(html);
    let state = 20261113;
    const random = (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
    };
    const pick = (list: readonly string[]): string => list[Math.floor(random() * list.length)]!;
    const pieces = ["<script", "<SCRIPT", "<script ", "<script>", "</script", "</SCRIPT>", ">", ">", "_cf_chl_opt", "_CF_CHL_OPT",
      "<div", "<a", "<A ", "<x-y", "<", "<1", " ", " ", "\n", "\t", "class", "CLASS", "id", "ID", "=", " = ", "\"", "'", "cf-chl-",
      "CF-CHL-widget", "xcf-chl-", "-cf-chl-", "x", "-", "data-", "_", "/", "<form", "<FORM ", "<forms", "<form-", "challenge-form",
      "CHALLENGE-FORM", "challenge-forms", "xchallenge-form", " class=\"", " id='", " id=", "<class ", " ", "😀",
      // Letters that fold to s and k where a pattern ignores case, as the patterns did.
      "<ſcript", "claſſ", "<K "];
    const challenges = ["<script>window._cf_chl_opt = {}</script>", "<SCRIPT type='x'>a</script><script>_cf_chl_opt",
      "<script </script >_cf_chl_opt", "<script><script>_cf_chl_opt", "<div class=\"cf-chl-container\"></div>",
      "<a id = 'x cf-chl-y'>", "<x-y\ndata-id=cf-chl-", "<div a='>' class=\"a\" id=cf-chl-1>", "<a <b class= \"cf-chl-",
      "<class =cf-chl-", "<div <data-id =\"cf-chl-x\"", "<form id=\"challenge-form\" action=\"/\" method=\"POST\"></form>",
      "<FORM x=y ID = 'challenge-form'>", "<form\nid=challenge-form>", "<form <form id= \"challenge-form\"",
      "<form data-id=challenge-form."];
    const options = { page: "" };
    const data = fixture(options);
    let blocked = 0;
    for (let run = 0; run < 3_000; run += 1) {
      let html = "";
      if (run % 2 === 0) {
        const count = 1 + Math.floor(random() * 18);
        for (let index = 0; index < count; index += 1) html += pick(pieces);
      } else {
        html = pick(challenges);
        for (let edits = 1 + Math.floor(random() * 4); edits > 0; edits -= 1) {
          const at = Math.floor(random() * (html.length + 1));
          const kind = random();
          html = kind < 0.5 ? html.slice(0, at) + pick(pieces) + html.slice(at)
            : kind < 0.8 ? html.slice(0, at) + html.slice(at + 1 + Math.floor(random() * 4))
              : html.slice(0, at) + pick(challenges) + html.slice(at);
        }
      }
      options.page = html;
      const was = formerly(html);
      if (was) blocked += 1;
      expect((await readForumPage(data.url, data.runtime)).access_state === "blocked", JSON.stringify(html)).toBe(was);
    }
    // Both answers came up often enough to compare.
    expect(blocked).toBeGreaterThan(600);
    expect(blocked).toBeLessThan(2_400);
  }, 120_000);

  // Pull request 441 listed the pattern that finds a page's tags (a, link and meta, with their quoted values) as slow
  // and queued. Timed on 13 Nov 2026 on its own: 11 seconds on 128 KB of "<a " closed by nothing but one open quote,
  // four times that for twice the size. In a nav the links are read (a pager stands there) and the text extractor drops
  // the element in one step; in a script the extractor's meta tags are looked for before the script is dropped.
  it.each([
    ["links with no end and one open quote, in a nav", (length: number) =>
      `<html><body><p>${text}</p><nav>${filled("<a href=/thread ", length)}"</nav></body></html>`],
    ["link tags with no end and one open quote, in a nav", (length: number) =>
      `<html><body><p>${text}</p><nav>${filled("<link rel=next  ", length)}'</nav></body></html>`],
    ["meta tags with no end and one open quote, in a script", (length: number) =>
      `<html><body><p>${text}</p><script>${filled("<meta name=key  ", length)}"</script></body></html>`]
  ])("finds a page's tags in time linear in the page's size: %s", async (label, pageOf) => {
    await withinTime(label, pageOf);
  }, 120_000);

  // The same tags as the pattern found (main at e24f6d3b), in the same order, on generated markup: tags that end, tags
  // that never do, quoted values that hold a ">" or the other quote, and quotes left open.
  it("finds the tags the pattern it replaces found, on generated markup", () => {
    let state = 441;
    const random = (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
    };
    const pieces = ["<a", "<A", "<a ", "<link", "<LINK ", "<meta", "<META ", "<abbr", "<a-b", "<lin\u212a", "<linked", "<", ">", ">",
      ">", "\"", "\"", "'", "'", " ", "\n", "x", "href=", "rel=next", "=", "/", "</a>", "<a>", "<link>", "<meta>",
      "\ud83d\ude00", "&quot;", "a", "link", "meta", "<b>", "\u00a0"];
    let found = 0;
    for (let run = 0; run < 20_000; run += 1) {
      let html = "";
      for (let count = 1 + Math.floor(random() * 30); count > 0; count -= 1) {
        html += pieces[Math.floor(random() * pieces.length)]!;
      }
      for (const names of ["a|link", "a", "meta"]) {
        const formerly = [...html.matchAll(new RegExp(`<(?:${names})\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "giu"))]
          .map((match) => match[0]);
        expect([...startTags(html, names)], `${names} in ${JSON.stringify(html)}`).toEqual(formerly);
        found += formerly.length;
      }
    }
    expect(found).toBeGreaterThan(20_000);
  });
});
