import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { ATLAS_HOME_ROUTES, QUICK_ANSWER_MISSES_IT } from "../apps/research-mcp/src/atlas/pages.js";
import {
  REACH_HOME_SENTENCES,
  REACH_TEST_SENTENCE,
  atlasReachSnapshot,
  type AtlasReachSnapshot,
} from "./helpers/atlas-reach-scenario.js";

// Release A's acceptance (the design of 19 Nov 2026, section 3.1, and its Fable recheck, 2.1): with
// ASKRIGOR_ATLAS_SHOW_SAVED_FINDINGS off, this release neither widens nor narrows what the public reaches. The snapshot
// is the same scenario run on main (263048eb); only the sentences on how findings reached the pages and the
// separately tested Traditions navigation tab (owner answer 403) may differ.
describe("what a signed-out reader and the lookup tool reach, with saved findings not shown at once", () => {
  it("is what main reaches, page by page and finding by finding, but for how findings got there", async () => {
    const main = JSON.parse(await readFile(new URL("./fixtures/atlas-reach-main.json", import.meta.url), "utf8")) as
      AtlasReachSnapshot & { made: { commit: string } };
    expect(main.made.commit).toBe("263048eb");
    const now = await atlasReachSnapshot();
    // The sentences the digests leave out are the pages' own.
    expect(REACH_TEST_SENTENCE).toBe(QUICK_ANSWER_MISSES_IT);
    expect(REACH_HOME_SENTENCES[1].startsWith(`${ATLAS_HOME_ROUTES} `)).toBe(true);
    expect(now.publications).toEqual(main.publications);
    // The same pages answer, with the same status, the same robots rule and the same text but those sentences.
    expect(Object.keys(now.pages)).toEqual(Object.keys(main.pages));
    const owner = `/atlas/findings/${main.publications.owner}`;
    const before = `/atlas/findings/${main.publications.before}`;
    for (const [path, page] of Object.entries(main.pages)) {
      expect(now.pages[path], path).toEqual({ ...page,
        // The home page names the three ways in, where main said a separate AI's test let every finding in.
        ...(path === "/atlas" ? { homeSentence: 1 } : {}),
        // The finding the owner showed no longer says the quick-answer test found anything: the test never ran on it.
        // Nor does one shown before this release, whose route was never recorded, as for every finding shown today.
        ...(path === owner || path === before ? { testSentences: 0 } : {}) });
    }
    expect(main.pages["/atlas"]!.homeSentence).toBe(0);
    expect(main.pages[owner]!.testSentences).toBe(1);
    expect(main.pages[before]!.testSentences).toBe(1);
    // The finding the test showed with its pass still says so, and the kept one that names a (made-up) living person
    // keeps its own page, out of search engines, as on main.
    expect(now.pages[`/atlas/findings/${main.publications.tested}`]!.testSentences).toBe(1);
    expect(now.pages[`/atlas/findings/${main.publications.person}`]).toMatchObject({ status: 200, noindex: true,
      testSentences: 0 });
    // The lookup tool returns the same findings, in the same words, the kept one included.
    expect(now.lookup).toEqual(main.lookup);
    expect(main.lookup["query Zentaro"]!.findings).toEqual([main.publications.person]);
  });
});
