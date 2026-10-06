import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GEMINI_VIDEO_MAX_POLLS,
  advanceGeminiVideoPass,
  buildGeminiVideoRequest,
  formatVideoTime,
  parseVideoTime
} from "../packages/sources/src/gemini-video-claims.js";

const VIDEO = "dQw4w9WgXcQ";
const CONFIG = { apiKey: "test-gemini-key" };
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

function claimsReport(overrides: Record<string, unknown> = {}) {
  return {
    spoken_language: "en",
    claims: [{
      start: "04:10",
      speaker: "creator",
      quote: "Two grams of fish oil a day cut my joint pain in half.",
      claim: "Two grams of fish oil daily halves joint pain.",
      evidence: "personal_experience",
      evidence_detail: "",
      specifics: ["2 g fish oil daily"]
    }],
    more_claims_not_listed: false,
    sponsorships: [{ start: "00:45", what: "Sponsored by a supplement brand, discount code JOINTS" }],
    on_screen_citations: [],
    ...overrides
  };
}

function interaction(status: string, output?: unknown, id = "interaction-1") {
  return new Response(JSON.stringify({
    id,
    status,
    model: "gemini-3.6-flash",
    steps: output === undefined
      ? []
      : [{ type: "model_output", content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output) }] }],
    usage: { total_input_tokens: 90_000, total_output_tokens: 1_200 }
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function requests(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit | undefined)?.method ?? "GET",
    body: (init as RequestInit | undefined)?.body
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Gemini video reading request", () => {
  it("sends only the rebuilt public watch URL and a fixed prompt, with agentic processing", () => {
    const request = buildGeminiVideoRequest({ mode: "claims", video_id: VIDEO });
    expect(request).toMatchObject({
      model: "gemini-3.6-flash",
      background: true,
      store: true,
      input: [
        { type: "video", uri: `https://www.youtube.com/watch?v=${VIDEO}`, processing: "agentic" },
        { type: "text", text: expect.stringContaining("List every health claim the video makes") }
      ],
      response_format: { type: "text", mime_type: "application/json" }
    });
    // Two passes for different videos differ only in the video's ID.
    const other = buildGeminiVideoRequest({ mode: "claims", video_id: "abcdefghijk" });
    expect(JSON.stringify(other)).toBe(JSON.stringify(request).replaceAll(VIDEO, "abcdefghijk"));
  });

  it("asks a follow-up in the fixed form, adding only the time", () => {
    const request = buildGeminiVideoRequest({ mode: "moment", video_id: VIDEO, at_seconds: 250 });
    const text = (request.input as Array<{ text?: string }>)[1]!.text!;
    expect(text).toContain("At 04:10, quote what is said and describe what is shown.");
    const later = buildGeminiVideoRequest({ mode: "moment", video_id: VIDEO, at_seconds: 3_725 });
    expect(JSON.stringify(later)).toBe(JSON.stringify(request).replaceAll("04:10", "1:02:05"));
  });

  it("refuses anything but a checked video ID and a whole-second time", () => {
    expect(() => buildGeminiVideoRequest({ mode: "claims", video_id: "https://evil.example/x" })).toThrow();
    expect(() => buildGeminiVideoRequest({ mode: "claims", video_id: VIDEO, question: "my pain" } as never)).toThrow();
    expect(() => buildGeminiVideoRequest({ mode: "moment", video_id: VIDEO, at_seconds: 1.5 })).toThrow();
  });

  it("reads and writes video times", () => {
    expect(parseVideoTime("04:10")).toBe(250);
    expect(parseVideoTime("4:10")).toBe(250);
    expect(parseVideoTime("75:30")).toBe(4_530);
    expect(parseVideoTime("1:02:05")).toBe(3_725);
    for (const bad of ["4:60", "1:2:03", "1:60:00", "abc", "", "-1:00", "250"]) {
      expect(parseVideoTime(bad), bad).toBeUndefined();
    }
    expect(formatVideoTime(0)).toBe("00:00");
    expect(formatVideoTime(250)).toBe("04:10");
    expect(formatVideoTime(3_725)).toBe("1:02:05");
  });
});

describe("Gemini video reading pass", () => {
  it("starts a background pass, polls it, and deletes the stored copy before reporting", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(interaction("in_progress"))
      .mockResolvedValueOnce(interaction("completed", claimsReport()))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const started = await advanceGeminiVideoPass({ mode: "claims", video_id: VIDEO }, CONFIG);
    expect(started).toEqual({ kind: "progress", checkpoint: { interaction_id: "interaction-1", poll_attempts: 0 } });
    const done = await advanceGeminiVideoPass(
      { mode: "claims", video_id: VIDEO }, CONFIG, started.kind === "progress" ? started.checkpoint : undefined
    );
    expect(done).toMatchObject({
      kind: "complete",
      interaction_id: "interaction-1",
      usage: { total_input_tokens: 90_000, total_output_tokens: 1_200 },
      report: { mode: "claims", claims: claimsReport() }
    });
    expect(requests(fetchMock)).toEqual([
      { url: ENDPOINT, method: "POST", body: JSON.stringify(buildGeminiVideoRequest({ mode: "claims", video_id: VIDEO })) },
      { url: `${ENDPOINT}/interaction-1`, method: "GET", body: undefined },
      { url: `${ENDPOINT}/interaction-1`, method: "DELETE", body: undefined }
    ]);
  });

  it("keeps the checkpoint while the stored copy cannot be deleted", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(interaction("completed", claimsReport()))
      .mockResolvedValueOnce(new Response("{}", { status: 503 })));
    expect(await advanceGeminiVideoPass(
      { mode: "claims", video_id: VIDEO }, CONFIG, { interaction_id: "interaction-1", poll_attempts: 3 }
    )).toEqual({ kind: "progress", checkpoint: { interaction_id: "interaction-1", poll_attempts: 3 } });
  });

  it("refuses a report outside its contract, without repairing it, and still deletes the stored copy", async () => {
    for (const output of [
      "not json",
      claimsReport({ claims: [{ ...claimsReport().claims[0], start: "four ten" }] }),
      claimsReport({ claims: Array.from({ length: 41 }, () => claimsReport().claims[0]) }),
      claimsReport({ verdict: "true" })
    ]) {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(interaction("completed", output))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const refused = await advanceGeminiVideoPass(
        { mode: "claims", video_id: VIDEO }, CONFIG, { interaction_id: "interaction-1", poll_attempts: 0 }
      );
      expect(refused).toMatchObject({ kind: "boundary", code: "gemini_video_invalid_report", retryable: false });
      expect(requests(fetchMock).at(-1)?.method).toBe("DELETE");
    }
  });

  it("reports a moment in the fixed form", async () => {
    const moment = { start: "04:10", end: "04:40", speaker: "guest", said: "We gave 2 grams a day.", shown: "A bar chart" };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(interaction("completed", moment))
      .mockResolvedValueOnce(new Response("{}", { status: 200 })));
    expect(await advanceGeminiVideoPass(
      { mode: "moment", video_id: VIDEO, at_seconds: 250 }, CONFIG, { interaction_id: "interaction-1", poll_attempts: 0 }
    )).toMatchObject({ kind: "complete", report: { mode: "moment", moment } });
  });

  it("ends a pass Gemini could not finish, after deleting it", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(interaction("failed"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 })));
    expect(await advanceGeminiVideoPass(
      { mode: "claims", video_id: VIDEO }, CONFIG, { interaction_id: "interaction-1", poll_attempts: 0 }
    )).toEqual({ kind: "boundary", code: "gemini_video_not_completed", retryable: false });
  });

  it("classifies a refused start", async () => {
    for (const [status, code, retryable] of [
      // Prepaid credits used up (2026-10-06): a billing state, not an unreadable video.
      [402, "gemini_video_credits_depleted", false],
      [429, "gemini_video_rate_limited", true],
      [403, "gemini_video_inaccessible", false],
      [400, "gemini_video_request_rejected", false],
      [503, "gemini_video_upstream_unavailable", true]
    ] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status })));
      expect(await advanceGeminiVideoPass({ mode: "claims", video_id: VIDEO }, CONFIG))
        .toEqual({ kind: "boundary", code, retryable });
    }
  });

  it("counts a failed poll as one attempt, and deletes the pass once the attempts run out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })));
    expect(await advanceGeminiVideoPass(
      { mode: "claims", video_id: VIDEO }, CONFIG, { interaction_id: "interaction-1", poll_attempts: 4 }
    )).toEqual({ kind: "progress", checkpoint: { interaction_id: "interaction-1", poll_attempts: 5 } });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(interaction("in_progress"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await advanceGeminiVideoPass(
      { mode: "claims", video_id: VIDEO }, CONFIG,
      { interaction_id: "interaction-1", poll_attempts: GEMINI_VIDEO_MAX_POLLS - 1 }
    )).toEqual({ kind: "boundary", code: "gemini_video_timed_out", retryable: true });
    expect(requests(fetchMock).map(({ method }) => method)).toEqual(["GET", "DELETE"]);

    // A stored pass that is already gone cannot finish.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 404 })));
    expect(await advanceGeminiVideoPass(
      { mode: "claims", video_id: VIDEO }, CONFIG, { interaction_id: "interaction-1", poll_attempts: 0 }
    )).toEqual({ kind: "boundary", code: "gemini_video_not_completed", retryable: false });
  });
});
