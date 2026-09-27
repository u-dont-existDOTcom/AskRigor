import { describe, expect, it, vi } from "vitest";

import { lookUpScoutTitles } from "../apps/research-mcp/src/scout-title-lookup.js";
import type { searchYoutube } from "../packages/sources/src/index.js";

const CONFIG = { apiKey: "fixture-youtube-key" };

function results(records: Array<{ video_id: string; title: string; channel_title: string }>) {
  return {
    access_status: "complete",
    data: records
  } as unknown as Awaited<ReturnType<typeof searchYoutube>>;
}

describe("scout exact-title lookup", () => {
  it("finds a named video, preferring the declared channel among matching titles", async () => {
    const search = vi.fn(async () => results([
      { video_id: "aaaaaaaaaaa", title: "Unrelated hip exercises", channel_title: "Clinic" },
      { video_id: "bbbbbbbbbbb", title: "GROWING MY HIP BACK - How I Restored Full Function", channel_title: "Reupload Hub" },
      { video_id: "XpZHKGGCK-o", title: "GROWING MY HIP BACK - How I Restored Full Function", channel_title: "SHAPEFIXER" }
    ]));

    const lookup = await lookUpScoutTitles([
      { title: "GROWING MY HIP BACK", channel: "SHAPEFIXER", why_surfaced: "First-person recovery" }
    ], { config: CONFIG, knownVideoIds: new Set(), search });

    expect(search).toHaveBeenCalledWith({ query: "GROWING MY HIP BACK", pageSize: 10 }, CONFIG);
    expect(lookup).toEqual({
      found: [{
        video_id: "XpZHKGGCK-o",
        title: "GROWING MY HIP BACK - How I Restored Full Function",
        channel: "SHAPEFIXER",
        declared_title: "GROWING MY HIP BACK",
        why_surfaced: "First-person recovery"
      }],
      unresolved: []
    });
  });

  it("accepts a loosely matching title only when the declared channel agrees or the titles are nearly the same", async () => {
    const byQuery: Record<string, Array<{ video_id: string; title: string; channel_title: string }>> = {
      "Recovery Story": [{ video_id: "aaaaaaaaaaa", title: "Cancer Recovery Story", channel_title: "Oncology Stories" }],
      // Seen on the discovery bench: another Shorts video with a similar title.
      "Exercise for Instant Hip Pain Relief #Shorts": [
        { video_id: "bbbbbbbbbbb", title: "Easy Way to Get Instant Hip Pain Relief #Shorts", channel_title: "Spine Center" }
      ],
      "Treating Arthritis Without Surgery": [
        { video_id: "ccccccccccc", title: "Treating Knee Arthritis Without Surgery", channel_title: "Talking With Docs" }
      ],
      "She Fixed Her Severe Hip Pain Without Surgery": [
        { video_id: "ddddddddddd", title: "She Fixed Her Severe Hip Pain Without Surgery | Upright Health", channel_title: "Upright Health" }
      ]
    };
    const search = vi.fn(async ({ query }: { query: string }) => results(byQuery[query] ?? []));

    const lookup = await lookUpScoutTitles([
      { title: "Recovery Story", channel: "not described" },
      { title: "Exercise for Instant Hip Pain Relief #Shorts", channel: "Hip Clinic" },
      { title: "Treating Arthritis Without Surgery", channel: "Talking With Docs" },
      { title: "She Fixed Her Severe Hip Pain Without Surgery", channel: "not described" }
    ], { config: CONFIG, knownVideoIds: new Set(), search });

    expect(lookup.found.map(({ video_id, declared_title }) => [declared_title, video_id])).toEqual([
      ["Treating Arthritis Without Surgery", "ccccccccccc"],
      ["She Fixed Her Severe Hip Pain Without Surgery", "ddddddddddd"]
    ]);
    expect(lookup.unresolved.map(({ title, reason }) => [title, reason])).toEqual([
      ["Recovery Story", "no_matching_video"],
      ["Exercise for Instant Hip Pain Relief #Shorts", "no_matching_video"]
    ]);
  });

  it("decodes the HTML entities YouTube search puts in titles and channels", async () => {
    const search = vi.fn(async () => results([
      { video_id: "ddddddddddd", title: "Tinnitus: He Tried Everything. Here&#39;s What WORKED", channel_title: "Treble &amp; Health" }
    ]));

    const lookup = await lookUpScoutTitles([
      { title: "Tinnitus: He Tried Everything. Here's What WORKED", channel: "Treble & Health" }
    ], { config: CONFIG, knownVideoIds: new Set(), search });

    expect(lookup.found).toEqual([{
      video_id: "ddddddddddd",
      title: "Tinnitus: He Tried Everything. Here's What WORKED",
      channel: "Treble & Health",
      declared_title: "Tinnitus: He Tried Everything. Here's What WORKED"
    }]);
  });

  it("keeps a title with no matching result, a failed search, the daily search cap and titles over the limit unresolved", async () => {
    const search = vi.fn(async ({ query }: { query: string }) => {
      if (query === "Fails") return { access_status: "error", data: [] } as unknown as Awaited<ReturnType<typeof searchYoutube>>;
      if (query === "Daily cap") {
        return {
          access_status: "rate_limited",
          error: { code: "youtube_search_quota_exhausted" },
          data: []
        } as unknown as Awaited<ReturnType<typeof searchYoutube>>;
      }
      if (query === "Throws") throw new Error("network");
      return results([{ video_id: "ccccccccccc", title: "Something else entirely", channel_title: "Channel" }]);
    });

    const lookup = await lookUpScoutTitles([
      { title: "No match here", channel: "not described" },
      { title: "Fails", channel: "A" },
      { title: "Throws", channel: "B" },
      { title: "Daily cap", channel: "D" },
      { title: "Over the limit", channel: "C" }
    ], { config: CONFIG, knownVideoIds: new Set(), search, limit: 4 });

    expect(search).toHaveBeenCalledTimes(4);
    expect(lookup.found).toEqual([]);
    expect(lookup.unresolved.map(({ title, reason }) => [title, reason])).toEqual([
      ["No match here", "no_matching_video"],
      ["Fails", "search_failed"],
      ["Throws", "search_failed"],
      ["Daily cap", "search_quota_exhausted"],
      ["Over the limit", "not_searched"]
    ]);
  });

  it("searches a repeated title once and drops videos the scout already validated", async () => {
    const search = vi.fn(async () => results([
      { video_id: "XpZHKGGCK-o", title: "GROWING MY HIP BACK", channel_title: "SHAPEFIXER" }
    ]));

    const lookup = await lookUpScoutTitles([
      { title: "GROWING MY HIP BACK", channel: "SHAPEFIXER" },
      { title: "growing my hip back", channel: "not described" }
    ], { config: CONFIG, knownVideoIds: new Set(["XpZHKGGCK-o"]), search });

    expect(search).toHaveBeenCalledOnce();
    expect(lookup).toEqual({ found: [], unresolved: [] });
  });
});
