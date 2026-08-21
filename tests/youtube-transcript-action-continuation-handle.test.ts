import { describe, expect, it } from "vitest";

import {
  createYoutubeTranscriptContinuationHandleStore,
  YoutubeTranscriptContinuationHandleError
} from "../apps/research-mcp/src/actions/youtube-transcript-continuation-handle.js";

const STATE = {
  provider_cursor: "provider-cursor",
  source_video_id: "XpZHKGGCK-o",
  selected_track: {
    language_code: "en",
    language_name: "English",
    is_auto_generated: false
  },
  snapshot_sha256: "a".repeat(64),
  provider_reported_segments: 2,
  page_size: 1,
  page_count: 1,
  records_returned_cumulative: 1,
  next_expected_index: 1,
  timestamps_present: true
};

describe("YouTube transcript Action continuation handles", () => {
  it("expires without renewal one hour after issuance", () => {
    let now = 1_000;
    const store = createYoutubeTranscriptContinuationHandleStore({ now: () => now });
    const handle = store.issue(STATE);

    now += 3_599_999;
    expect(store.claim(handle)).toEqual(STATE);
    store.rollback(handle);
    now += 1;
    expect(() => store.claim(handle)).toThrow(YoutubeTranscriptContinuationHandleError);
  });

  it("claims atomically and supports rollback without exposing mutable state", () => {
    const store = createYoutubeTranscriptContinuationHandleStore();
    const handle = store.issue(STATE);
    const claimed = store.claim(handle);
    claimed.provider_cursor = "mutated";

    expect(() => store.claim(handle)).toThrow(YoutubeTranscriptContinuationHandleError);
    store.rollback(handle);
    expect(store.claim(handle)).toEqual(STATE);
    store.commit(handle);
    expect(() => store.claim(handle)).toThrow(YoutubeTranscriptContinuationHandleError);
  });

  it("rejects transcript text or other unbounded continuation fields", () => {
    const store = createYoutubeTranscriptContinuationHandleStore();
    expect(() => store.issue({
      ...STATE,
      transcript_text: "must never be retained"
    } as never)).toThrow();
  });
});
