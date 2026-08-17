import { describe, expect, it } from "vitest";

import { createYoutubeActionContinuationHandleStore } from
  "../apps/research-mcp/src/actions/youtube-continuation-handle.js";

describe("YouTube Action continuation handles", () => {
  it("expires without renewal exactly one hour after issuance", () => {
    let now = 1_787_000_000_000;
    const store = createYoutubeActionContinuationHandleStore({ now: () => now });
    const token = `payload.${"s".repeat(43)}`;
    const handle = store.issue(token);

    now += 3_599_999;
    expect(store.claim(handle)).toBe(token);
    store.rollback(handle);

    now += 1;
    expect(() => store.claim(handle)).toThrow("expired or unavailable");
  });

  it("evicts the oldest inactive handle at the hard entry bound", () => {
    const store = createYoutubeActionContinuationHandleStore({
      now: () => 1_787_000_000_000,
      random: deterministicRandom(),
      maxEntries: 2,
      maxTotalBytes: 1_024
    });
    const first = store.issue("first.signed");
    const second = store.issue("second.signed");
    const third = store.issue("third.signed");

    expect(() => store.claim(first)).toThrow("expired or unavailable");
    expect(store.claim(second)).toBe("second.signed");
    store.rollback(second);
    expect(store.claim(third)).toBe("third.signed");
  });

  it("evicts the oldest inactive handle at the hard byte bound", () => {
    const store = createYoutubeActionContinuationHandleStore({
      now: () => 1_787_000_000_000,
      random: deterministicRandom(),
      maxEntries: 10,
      maxTotalBytes: 85
    });
    const first = store.issue("first.signed");
    const second = store.issue("second.signed");

    expect(() => store.claim(first)).toThrow("expired or unavailable");
    expect(store.claim(second)).toBe("second.signed");
    expect(() => store.issue("x".repeat(86))).toThrow("exceeds store capacity");
  });

  it("claims one request atomically and supports explicit commit or rollback", () => {
    const store = createYoutubeActionContinuationHandleStore();
    const handle = store.issue("payload.signed");

    expect(store.claim(handle)).toBe("payload.signed");
    expect(() => store.claim(handle)).toThrow("expired or unavailable");

    store.rollback(handle);
    expect(store.claim(handle)).toBe("payload.signed");
    store.commit(handle);
    expect(() => store.claim(handle)).toThrow("expired or unavailable");
  });

  it("rejects empty or oversized retained tokens", () => {
    const store = createYoutubeActionContinuationHandleStore();

    expect(() => store.issue("")).toThrow("invalid size");
    expect(() => store.issue("x".repeat(65_537))).toThrow("invalid size");
  });

  it("rejects nonpositive or unsafe store bounds", () => {
    for (const options of [
      { ttlMs: 0 },
      { maxEntries: 0 },
      { maxTotalBytes: 0 },
      { ttlMs: 1.5 }
    ]) {
      expect(() => createYoutubeActionContinuationHandleStore(options))
        .toThrow("positive safe integer");
    }
  });
});

function deterministicRandom(): (size: number) => Uint8Array {
  let call = 0;
  return (size) => {
    call += 1;
    return new Uint8Array(size).fill(call);
  };
}
