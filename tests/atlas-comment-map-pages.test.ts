import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RANK_MIN_TRIED,
  commentMapSchema,
  commentMapsFileSchema,
  rankWithinProblems,
  renderPrivateCommentMaps,
  standaloneAtlasPage,
  wilsonRange,
  type CommentMap,
} from "../apps/research-mcp/src/atlas/comment-map-pages.js";
import { ATLAS_CSS } from "../apps/research-mcp/src/atlas/pages.js";
import { insideRepository, renderPrivateCommentMapsFile } from "../scripts/render-private-comment-maps.mts";

// The owner's comment maps as a private Atlas page (owner answer 227). Every video, channel, method and count here is
// invented; the owner's real maps live outside this repository.

const map = (overrides: Partial<CommentMap> & Pick<CommentMap, "video_id" | "label" | "problem" | "tried" | "outcomes">):
  CommentMap => ({
  channel: "An invented channel",
  mapped_on: "2026-10-31",
  corpus: 980,
  sampled: 360,
  sample: "lowest_hash",
  left_out: { promotion: 2, joke: 1 },
  better_reports_lasted: { immediate: 5, days: 2, weeks: 1, months: 1, years: 1, not_stated: 3 },
  harm_kinds: [{ kind: "dizziness during the exercise (invented)", people: 2 }],
  leads: [{ method: "an invented stretch", people: 3, outcomes: { better: 2, no_change: 1, worse: 0, mixed: 0 },
    helped_more_than_video: 1, helped_after_video_failed: 1 }],
  ...overrides,
});

const MAPS = [
  map({ video_id: "AAAAAAAAAA1", label: "The big invented routine", problem: "Velmor dizziness (invented)", tried: 60,
    outcomes: { better: 48, no_change: 5, worse: 4, mixed: 3 }, leads: [
      { method: "an invented tea", people: 1, outcomes: { better: 1, no_change: 0, worse: 0, mixed: 0 },
        helped_more_than_video: 0, helped_after_video_failed: 0 },
      { method: "an invented walk", people: 4, outcomes: { better: 1, no_change: 3, worse: 0, mixed: 0 },
        helped_more_than_video: 0, helped_after_video_failed: 0 },
      { method: "an invented stretch", people: 3, outcomes: { better: 2, no_change: 1, worse: 0, mixed: 0 },
        helped_more_than_video: 1, helped_after_video_failed: 1 },
    ] }),
  map({ video_id: "BBBBBBBBBB2", label: "A smaller invented routine", problem: "Velmor dizziness (invented)", tried: 40,
    outcomes: { better: 34, no_change: 3, worse: 2, mixed: 1 } }),
  map({ video_id: "CCCCCCCCCC3", label: "A barely tried invented routine", problem: "Velmor dizziness (invented)",
    tried: 18, outcomes: { better: 15, no_change: 2, worse: 1, mixed: 0 }, leads: [], harm_kinds: [] }),
  map({ video_id: "DDDDDDDDDD4", label: "Zentarine <b>& \"drops\"</b> (invented)", problem: "Ostrel heel pain (invented)",
    tried: 26, outcomes: { better: 16, no_change: 5, worse: 3, mixed: 2 } }),
];
const FILE = commentMapsFileSchema.parse({ schema: "askrigor.comment-maps.v1", maps: MAPS });
const OPTIONS = { renderedOn: "2026-11-02", videoLinks: false };

const temporary: string[] = [];
afterEach(async () => {
  while (temporary.length > 0) await rm(temporary.pop()!, { recursive: true, force: true });
});

describe("the counts", () => {
  it("work out the 95% Wilson range from the counts", () => {
    const eight = wilsonRange(8, 10)!;
    expect(eight.low).toBeCloseTo(0.4902, 4);
    expect(eight.high).toBeCloseTo(0.9433, 4);
    expect(wilsonRange(0, 0)).toBeNull();
    expect(wilsonRange(0, 5)!.low).toBeCloseTo(0, 10);
    expect(wilsonRange(5, 5)!.high).toBeCloseTo(1, 10);
    // Worked from the counts, never from a range already rounded: 38 of 63 runs to 71.47%, so 71%, where a range first
    // rounded to 0.715 would show 72%.
    const wide = wilsonRange(38, 63)!;
    expect(wide.high).toBeCloseTo(0.71468, 4);
    const page = renderPrivateCommentMaps(commentMapsFileSchema.parse({ schema: "askrigor.comment-maps.v1", maps: [map({
      video_id: "EEEEEEEEEE5", label: "An invented manoeuvre", problem: "Invented vertigo", tried: 63, corpus: 2750,
      outcomes: { better: 38, no_change: 9, worse: 10, mixed: 6 } })] }), OPTIONS);
    expect(page).toContain("Better: 48–71% of those");
    expect(page).toContain("in 360 comments read of 2,750:");
  });

  it("rank only within a problem, by the low end of the range, and list too few reports apart", () => {
    const [velmor, ostrel] = rankWithinProblems(FILE.maps);
    expect(velmor!.problem).toBe("Velmor dizziness (invented)");
    // 34 of 40 has the higher low end (0.71 against 0.68), so it ranks above 48 of 60.
    expect(velmor!.ranked.map(({ video_id }) => video_id)).toEqual(["BBBBBBBBBB2", "AAAAAAAAAA1"]);
    expect(velmor!.tooFew.map(({ tried }) => tried)).toEqual([18]);
    expect(RANK_MIN_TRIED).toBe(20);
    expect(ostrel!.ranked.map(({ video_id }) => video_id)).toEqual(["DDDDDDDDDD4"]);
    expect(ostrel!.tooFew).toEqual([]);
  });
});

describe("the maps file", () => {
  const valid = MAPS[0]!;
  it("holds only counts and AskRigor's own words, each adding up", () => {
    expect(commentMapSchema.safeParse(valid).success).toBe(true);
    for (const broken of [
      { ...valid, comment_text: "a commenter's words" },
      { ...valid, commenters: ["someone"] },
      { ...valid, video_id: "https://example.org/watch" },
      { ...valid, outcomes: { ...valid.outcomes, better: 49 } },
      { ...valid, sampled: 981 },
      { ...valid, tried: 361, outcomes: { better: 361, no_change: 0, worse: 0, mixed: 0 } },
      { ...valid, sample: "all" },
      { ...valid, left_out: { promotion: 300, joke: 200 } },
      { ...valid, leads: [{ ...valid.leads[0]!, people: 4 }] },
      { ...valid, leads: [{ ...valid.leads[0]!, helped_more_than_video: 4 }] },
    ]) {
      expect(commentMapSchema.safeParse(broken).success, JSON.stringify(broken).slice(0, 80)).toBe(false);
    }
    expect(commentMapsFileSchema.safeParse({ schema: "askrigor.comment-maps.v1", maps: [valid, valid] }).success).toBe(false);
    expect(commentMapsFileSchema.safeParse({ schema: "askrigor.comment-maps.v2", maps: [valid] }).success).toBe(false);
  });
});

describe("the private page", () => {
  it("says it is private and unpublished, and is kept out of search engines", () => {
    const page = renderPrivateCommentMaps(FILE, OPTIONS);
    expect(page).toContain('<meta name="robots" content="noindex">');
    expect(page).not.toContain('rel="canonical"');
    expect(page).toContain("Private: for AskRigor’s owner only");
    expect(page).toContain("they stay private until YouTube agrees; AskRigor asked on 31 October 2026. Rendered on " +
      "2026-11-02 from 4 maps. None of it is on askrigor.com.");
    expect(page.match(/success rate/gu)).toHaveLength(1);
    expect(page).toContain("people who commented and said they tried the video’s method, never a success rate");
    expect(page).not.toMatch(/<script|\son[a-z]+=|\sstyle=/iu);
  });

  it("ranks the videos of a problem with two or more, and puts problems with one video in one table", () => {
    const page = renderPrivateCommentMaps(FILE, OPTIONS);
    const velmor = page.slice(page.indexOf('<h3 id="problem-1">'), page.indexOf('<h3 id="one-video">'));
    expect(velmor).toContain("Velmor dizziness (invented)");
    expect(velmor.indexOf("A smaller invented routine")).toBeLessThan(velmor.indexOf("The big invented routine"));
    // A range keeps its dash with its numbers in a narrow cell.
    expect(velmor).toContain('<td><a href="#map-2">A smaller invented routine</a> (An invented channel)</td><td>40</td>' +
      "<td>34 (71\u2060–\u206093%)</td>");
    expect(velmor).toContain("Too few reports to rank (fewer than 20 people who said they tried it): " +
      '<a href="#map-3">A barely tried invented routine</a> (18 people).');
    const single = page.slice(page.indexOf('<h3 id="one-video">'), page.indexOf('<h2 id="the-maps">'));
    expect(single).toContain("Each of these problems has one video mapped, so there is nothing to rank it against yet.");
    expect(single).toContain("<tr><td>Ostrel heel pain (invented)</td><td><a href=\"#map-4\">Zentarine");
    const alone = renderPrivateCommentMaps(commentMapsFileSchema.parse({ schema: "askrigor.comment-maps.v1",
      maps: [MAPS[2]!] }), OPTIONS);
    expect(alone).toContain("No problem has two videos mapped yet, so nothing is ranked.");
    expect(alone).toContain("<td>Velmor dizziness (invented)</td><td><a href=\"#map-1\">A barely tried invented routine</a> " +
      "(An invented channel); too few reports to rank</td>");
  });

  it("gives every map's counts, harms and leads, escaped", () => {
    const page = renderPrivateCommentMaps(FILE, OPTIONS);
    expect(page).toContain("60 people said they did the video’s method, in 360 comments read of 980: the 360 whose IDs " +
      "rank lowest by hash, chosen without regard to what they say.");
    expect(page).toContain("Better 48, no change 5, worse 4, mixed 3. Better: 68–88% of those who tried it (the 95% range).");
    expect(page).toContain("Reports of getting better: right away 5, days 2, weeks 1, months 1, years 1, not said 3.");
    expect(page).toContain("dizziness during the exercise (invented) (2)");
    expect(page).toContain("<li>an invented stretch: 3 people (better 2, no change 1, worse 0, mixed 0); 1 said it helped " +
      "more than the video’s method; 1 after the video’s method failed</li>");
    // Ranked by how many said each helped; a method one person credits is folded away.
    const first = page.slice(page.indexOf('id="map-1"'), page.indexOf('id="map-2"'));
    expect(first.indexOf("an invented stretch")).toBeLessThan(first.indexOf("an invented walk"));
    expect(first).toContain("<details><summary>1 more, credited by one person</summary><ul>\n<li>an invented tea: 1 person");
    expect(page).toContain("No harm was reported.");
    expect(page).toContain("Nothing else was credited.");
    expect(page).toContain("2 promotion, 1 joke.");
    expect(page).toContain("Zentarine &lt;b&gt;&amp; &quot;drops&quot;&lt;/b&gt; (invented)");
    expect(page).not.toContain("<b>&");
  });

  it("links a video only in the owner's view, built from its ID", () => {
    const without = renderPrivateCommentMaps(FILE, OPTIONS);
    expect(without).not.toMatch(/youtube\.com|youtu\.be/iu);
    expect(without).not.toContain("AAAAAAAAAA1");
    const linked = renderPrivateCommentMaps(FILE, { ...OPTIONS, videoLinks: true });
    expect(linked).toContain('<a href="https://www.youtube.com/watch?v=AAAAAAAAAA1">the video</a>');
    expect(linked.match(/youtube\.com\/watch\?v=/gu)).toHaveLength(4);
  });

  it("becomes one file to open on its own, its stylesheet written in", () => {
    const file = standaloneAtlasPage(renderPrivateCommentMaps(FILE, OPTIONS));
    expect(file).not.toContain('<link rel="stylesheet"');
    expect(file).toContain(`<style>\n${ATLAS_CSS}</style>`);
    expect(file).toContain('<a class="brand" href="https://askrigor.com/atlas">AskRigor Atlas</a>');
    expect(file).toContain('action="https://askrigor.com/atlas/search"');
    expect(file).not.toMatch(/(?:href|action)="\/atlas/u);
    expect(() => standaloneAtlasPage("<html></html>")).toThrow("ATLAS_PAGE_STYLESHEET_LINK_NOT_FOUND");
  });
});

describe("the render script", () => {
  it("renders the maps to a private file outside the repository", async () => {
    const folder = await mkdtemp(join(tmpdir(), "askrigor-comment-maps-"));
    temporary.push(folder);
    const input = join(folder, "maps.json");
    const output = join(folder, "maps.html");
    await writeFile(input, JSON.stringify({ schema: "askrigor.comment-maps.v1", maps: MAPS }));
    expect(await renderPrivateCommentMapsFile(input, output, { videoLinks: true, renderedOn: "2026-11-02" }))
      .toEqual({ maps: 4 });
    const written = await readFile(output, "utf8");
    expect(written).toContain("Private: for AskRigor’s owner only");
    expect(written).toContain("youtube.com/watch?v=AAAAAAAAAA1");
    expect((await stat(output)).mode & 0o777).toBe(0o600);
  });

  it("refuses a maps file or a page inside the repository, which is public", async () => {
    const folder = await mkdtemp(join(tmpdir(), "askrigor-comment-maps-"));
    temporary.push(folder);
    const input = join(folder, "maps.json");
    await writeFile(input, JSON.stringify({ schema: "askrigor.comment-maps.v1", maps: MAPS }));
    const options = { videoLinks: false, renderedOn: "2026-11-02" };
    await expect(renderPrivateCommentMapsFile(input, join(process.cwd(), "maps.html"), options))
      .rejects.toThrow("stay outside this repository");
    await expect(renderPrivateCommentMapsFile(input, join(folder, "maps.html"), { ...options, repository: folder }))
      .rejects.toThrow("stay outside this repository");
    expect(insideRepository("/r/a/b", "/r/a")).toBe(true);
    expect(insideRepository("/r/a", "/r/a")).toBe(true);
    expect(insideRepository("/r/ab", "/r/a")).toBe(false);
    expect(insideRepository("/r", "/r/a")).toBe(false);
  });
});
