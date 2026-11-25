import { describe, expect, it } from "vitest";

import {
  NAMED_VIDEO_LINK, NAMED_VIDEOS_PER_FINDING, NAMED_VIDEOS_SIGNED, namedVideoIdOf, namedVideoIdsIn,
  namedVideoLink, namedVideosFromReceipt, signedNamedVideos, storedCardWithoutYouTubeFindings, withoutYouTubeData,
} from "../apps/research-mcp/src/findings/card.js";
import { unsavedCardCopy } from "../apps/research-mcp/src/findings/unsaved-card.js";
import { OTHER_VIDEO, OTHER_WATCH, VIDEO, WATCH, videoCard } from "./helpers/named-videos-fixture.js";

describe("named video addresses", () => {
  it.each([
    ...["youtube.com", "www.youtube.com", "m.youtube.com"].flatMap((host) => [
      `https://${host}/watch?v=${VIDEO}`, `https://${host}/shorts/${VIDEO}`, `https://${host}/live/${VIDEO}`,
    ]), `https://youtu.be/${VIDEO}`, `http://youtube.com/watch?v=${VIDEO}`, `http://youtu.be/${VIDEO}`,
    `https://www.youtube.com/watch?feature=share&v=${VIDEO}&t=12#part`, `https://youtu.be/${VIDEO}?t=12`,
  ])("reads the video ID from %s", (link) => {
    expect(namedVideoIdOf(link)).toBe(VIDEO);
    expect(namedVideoLink(VIDEO)).toBe(WATCH);
    expect(NAMED_VIDEO_LINK.test(WATCH)).toBe(true);
  });

  it.each([
    `https://youtube.com.example.org/watch?v=${VIDEO}`, `https://notyoutube.com/watch?v=${VIDEO}`,
    `https://www.youtube.com/channel/${VIDEO}`, `https://www.youtube.com/playlist?list=${VIDEO}`,
    "https://www.youtube.com/watch?v=short", `ftp://youtu.be/${VIDEO}`, `https://user@youtu.be/${VIDEO}`,
    `https://youtu.be:8443/${VIDEO}`, VIDEO, "", `https://youtu.be/${VIDEO}/extra`,
  ])("refuses a non-video address %s", (link) => expect(namedVideoIdOf(link)).toBeUndefined());

  it("reads links in sentences in first-seen order, strips sentence punctuation and ignores bare IDs", () => {
    expect(namedVideoIdsIn(`See https://youtu.be/${VIDEO}. Then ${OTHER_WATCH}, and ${WATCH}. Bare ${VIDEO}.`))
      .toEqual([VIDEO, OTHER_VIDEO]);
    expect(namedVideoIdsIn(`Only ${VIDEO}, no address.`)).toEqual([]);
    // Codex's review of 15 November 2026, finding 5: a scheme in upper case is read too.
    expect(namedVideoIdsIn(`Explain HTTPS://youtu.be/${VIDEO} and Https://www.youtube.com/watch?v=${VIDEO}`)).toEqual([VIDEO]);
  });

  it.each([`https://youtu.be:443/${VIDEO}`, `http://youtu.be:80/${VIDEO}`])(
    "refuses an explicitly written default port in %s", (link) => expect(namedVideoIdOf(link)).toBeUndefined());

  it("round trips signed places, refusing unapproved IDs and ignoring malformed or out-of-card claims", () => {
    const card = { findings: [{ named_videos: [WATCH, WATCH, OTHER_WATCH] }, {}, { named_videos: [OTHER_WATCH] }] };
    const signed = signedNamedVideos(card, (id) => id === VIDEO);
    expect(signed).toEqual([`1.${VIDEO}`]);
    expect(signedNamedVideos(card, () => true)).toEqual([`1.${VIDEO}`, `1.${OTHER_VIDEO}`, `3.${OTHER_VIDEO}`]);
    expect(namedVideosFromReceipt([...signed, `3.${OTHER_VIDEO}`, `4.${VIDEO}`, "garbage", `0.${VIDEO}`, 17, null], 3))
      .toEqual(new Map([[0, new Set([VIDEO])], [2, new Set([OTHER_VIDEO])]]));
    expect(namedVideosFromReceipt(signed[0], 3)).toEqual(new Map([[0, new Set([VIDEO])]]));
    for (const malformed of [undefined, 7, {}, null]) expect(namedVideosFromReceipt(malformed, 3)).toEqual(new Map());
    expect(NAMED_VIDEOS_PER_FINDING).toBe(3);
    expect(NAMED_VIDEOS_SIGNED).toBe(10);
  });
});

describe("what a saved or unsaved card keeps of named videos", () => {
  it.each([WATCH, `https://youtu.be/${VIDEO}`, `https://www.youtube.com/shorts/${VIDEO}`])(
    "stores a signed %s as its watch page, without making the video a source", (link) => {
      const card = videoCard([link, OTHER_WATCH, link]);
      card.findings[0]!.claim = `An invented claim ${WATCH}`;
      const stored = withoutYouTubeData(card, new Set(), { namedVideos: new Map([[0, new Set([VIDEO])]]) });
      expect(stored.card.findings[0]!.named_videos).toEqual([WATCH]);
      expect(stored.card.findings[0]!.claim).toBe("An invented claim (YouTube video)");
      expect(stored.card.findings[0]!.sources).toEqual(card.findings[0]!.sources);
    });

  it("keeps no unsigned link, and keeps none without a receipt map", () => {
    expect(withoutYouTubeData(videoCard([WATCH])).card.findings[0]).not.toHaveProperty("named_videos");
    expect(withoutYouTubeData(videoCard([WATCH]), new Set(), { namedVideos: new Map([[0, new Set([OTHER_VIDEO])]]) })
      .card.findings[0]).not.toHaveProperty("named_videos");
  });

  it("holds a comment-derived finding even when its video was signed and preserves original places", () => {
    const card = videoCard([WATCH]);
    card.findings.push({ ...card.findings[0]!, named_videos: [OTHER_WATCH] });
    const stored = withoutYouTubeData(card, new Set([0]), {
      namedVideos: new Map([[0, new Set([VIDEO])], [1, new Set([OTHER_VIDEO])]]),
    });
    expect(stored.kept).toEqual([1]);
    expect(stored.card.findings).toHaveLength(1);
    expect(stored.card.findings[0]!.named_videos).toEqual([OTHER_WATCH]);
  });

  it("preserves a stored finding's signed links through the comment-finding scrub", () => {
    const stored = withoutYouTubeData(videoCard([WATCH]), new Set(), { namedVideos: new Map([[0, new Set([VIDEO])]]) });
    expect(storedCardWithoutYouTubeFindings(stored.card).card.findings[0]!.named_videos).toEqual([WATCH]);
  });

  it("leaves named video links out of the unsaved copy and says what was left out", () => {
    const copy = unsavedCardCopy(videoCard([WATCH]), false)!;
    expect(copy).toBeDefined();
    expect((copy.card.findings as object[])[0]).not.toHaveProperty("named_videos");
    expect(copy.leftOut).toContain("findings[0].named_videos: a named video's link, which is kept only with a saved card");
    expect(JSON.stringify(copy.card)).not.toContain(VIDEO);
  });
});
