import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryAtlasPageSource,
  InMemoryAtlasPublicationStore,
  type AtlasPageSource,
} from "@askrigor/evidence-repository";

import { AtlasChangeSignal } from "../apps/research-mcp/src/atlas/change-signal.js";
import { renderAtlasCommentMaps } from "../apps/research-mcp/src/atlas/comment-maps-page.js";
import { ATLAS_PAGE_HEADERS, atlasRouteOf, createAtlasPagesHandler } from "../apps/research-mcp/src/atlas/pages-http.js";
import { COMMENT_MAPS_PATH, atlasPageProblems } from "../apps/research-mcp/src/atlas/pages.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// The page that explains AskRigor's comment maps (plan 2026-10-31-video-comment-maps.md, "Public without approval").
// The maps themselves stay private until YouTube answers (owner answer 208b): the page is fixed text, and it shows no
// map, count, video or link to YouTube.

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
});

async function serve(source: AtlasPageSource): Promise<string> {
  const handler = createAtlasPagesHandler({ enabled: true, source, signal: new AtlasChangeSignal() });
  const server = createAskRigorHttpServer({ publicServerEnabled: false, atlasPagesHandler: handler });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function text(base: string, path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, init);
  return { response, body: await response.text() };
}

const emptyAtlas = () => new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore() });

/** A source that fails every read: a page that reads nothing still answers. */
const failingSource: AtlasPageSource = {
  read: async () => {
    throw new Error("ATLAS_READ_FAILED");
  },
};

/** The page's own words, between its header and footer, with the markup taken out. */
const mainText = (body: string) => body.slice(body.indexOf("<main"), body.indexOf("</main>"))
  .replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ");

describe("the comment maps page", () => {
  it("is served at its own path with the pages' headers, and nothing below it", async () => {
    expect(atlasRouteOf(COMMENT_MAPS_PATH)).toEqual({ kind: "comment-maps" });
    expect(atlasRouteOf(`${COMMENT_MAPS_PATH}/`)).toBeUndefined();
    const base = await serve(emptyAtlas());
    const { response, body } = await text(base, COMMENT_MAPS_PATH);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(ATLAS_PAGE_HEADERS["Content-Security-Policy"]);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body).toContain('<link rel="canonical" href="https://askrigor.com/atlas/comment-maps">');
    // AskRigor's own method, not an unreviewed finding: search engines may index it (owner answer 224a covers findings).
    expect(body).not.toContain('name="robots"');
    expect(body).not.toMatch(/<script|\son[a-z]+=|\sstyle=/iu);
    expect((await text(base, `${COMMENT_MAPS_PATH}/`)).response.status).toBe(404);
    const head = await text(base, COMMENT_MAPS_PATH, { method: "HEAD" });
    expect(head.response.status).toBe(200);
    expect(head.body).toBe("");
    expect((await text(base, COMMENT_MAPS_PATH, { method: "POST" })).response.status).toBe(405);
  });

  it("reads nothing: it answers while every read fails", async () => {
    const base = await serve(failingSource);
    expect((await text(base, COMMENT_MAPS_PATH)).response.status).toBe(200);
    expect((await text(base, "/atlas")).response.status).toBe(503);
  });

  it("says the maps stay private until YouTube answers, and explains the method and its limits", () => {
    const words = mainText(renderAtlasCommentMaps());
    expect(words).toContain("The maps aren’t in the Atlas.");
    expect(words).toContain("Until YouTube answers, the maps made so far are kept privately for AskRigor’s owner, " +
      "and none is shown on these pages.");
    expect(words).toContain("AskRigor will delete them if YouTube asks it to.");
    expect(words).toContain("The comments are read only through YouTube’s API,");
    expect(words).toContain("chosen without regard to what they say");
    expect(words).toContain("Promotion and jokes are left out first:");
    expect(words).toContain("Each person counts once");
    expect(words).toContain("never of a success rate");
    expect(words).toContain("findings drawn from YouTube comments are never published in the Atlas");
    expect(words).toContain("at least 20 people said they tried it");
    expect(words).toContain("The map is part of your answer only: AskRigor doesn’t publish it.");
  });

  it("shows no map, no link to YouTube and no number but the method's own", () => {
    const body = renderAtlasCommentMaps();
    expect(atlasPageProblems(body)).toEqual([]);
    expect(body).not.toMatch(/youtube(?:-nocookie)?\.com|youtu\.be/iu);
    // The dates of the question to YouTube, the range's 95%, and the thresholds for ranking a video and judging a
    // channel ("at least five" is a word): never a count from a video's comments.
    expect([...mainText(body).matchAll(/\d+/gu)].map(([number]) => number)).toEqual(["31", "2026", "95", "20"]);
  });

  it("keeps YouTube's name out of the feature's own name (YouTube's branding guidelines)", () => {
    const body = renderAtlasCommentMaps();
    expect(body).toContain("<title>Comment maps | AskRigor Atlas</title>");
    expect(body).toContain("<h1>Comment maps</h1>");
    expect(body).toContain("YouTube has not reviewed or endorsed it.");
  });

  it("is linked from the Atlas home, which says the maps are private without naming YouTube", async () => {
    const base = await serve(emptyAtlas());
    const { response, body } = await text(base, "/atlas");
    expect(response.status).toBe(200);
    expect(body).toContain('<h2 id="comment-maps">Comment maps</h2>');
    expect(body).toContain("The maps are kept privately for now, so none is shown here.");
    expect(body).toContain(`<a href="${COMMENT_MAPS_PATH}">How comment maps work, what they can’t show, and why they ` +
      "aren’t here</a>");
    // The pages built from findings keep their guard: no YouTube, model, chat or account, in any case.
    expect(body).not.toMatch(/youtu|claude|chatgpt|\bgpt\b|contributor|account|\bchat\b|model|surface/iu);
  });
});
