import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GEMINI_VIDEO_MAX_POLLS,
  advanceGeminiVideoPass,
  buildGeminiVideoRequest,
  geminiVideoClaimsReportSchema,
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
  it("preserves typed relationships and a late funding caveat apart from health claims", async () => {
    const report = JSON.parse(await readFile(new URL("fixtures/gemini/video-claims-relationships-and-caveats.json", import.meta.url), "utf8"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(interaction("completed", report))
      .mockResolvedValueOnce(new Response("{}", { status: 200 })));
    const done = await advanceGeminiVideoPass({ mode: "claims", video_id: VIDEO }, CONFIG,
      { interaction_id: "interaction-1", poll_attempts: 0 });
    expect(done).toMatchObject({ kind: "complete", report: { mode: "claims", claims: report } });
    const request = buildGeminiVideoRequest({ mode: "claims", video_id: VIDEO });
    const prompt = (request.input as Array<{ text?: string }>)[1]!.text!;
    expect(prompt).toContain("A creator's own membership is not an outside sponsorship");
    expect(prompt).toContain("A declined offer does not show anyone was paid");
    expect(prompt).toContain("including late caveats");
    const schema = (request.response_format as { schema: any }).schema;
    expect(schema.properties.sponsorships.items.required).toEqual(expect.arrayContaining([
      "relationship_type", "relationship_scope", "quote", "actor", "counterparty", "content_access"
    ]));
    expect(schema.required).toContain("caveats");
    expect(prompt).toContain("an advisory role is not proof of a paid video");
    expect(prompt).toContain("A study's funding is not a video sponsorship");
    const relationships = geminiVideoClaimsReportSchema.parse(report).sponsorships;
    expect(relationships.filter((entry) => entry.relationship_type === "outside_paid_placement")).toHaveLength(1);
    expect(relationships.find((entry) => entry.relationship_type === "creator_product_advisory")).toMatchObject({
      relationship_scope: "creator_other_business",
      quote: "I advise on their supplement formulas.",
      content_access: "model_report_unverified"
    });
    expect(relationships.find((entry) => entry.relationship_type === "research_author_employment_or_equity")).toMatchObject({
      relationship_scope: "underlying_study"
    });
    expect(relationships.find((entry) => entry.relationship_type === "patent_or_licensing_interest")).toMatchObject({
      relationship_scope: "underlying_study"
    });
    // Older untyped records stay unknown. A missing field never becomes a sponsorship or a checked quote.
    expect(relationships.find((entry) => entry.relationship_type === "unknown")).toMatchObject({
      quote: "", relationship_scope: "unknown"
    });
  });

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
    )).toEqual({ kind: "boundary", code: "gemini_video_not_completed", retryable: false, gemini_status: "failed" });
  });

  // 22 Oct: production's video reads ended without a report and the refusal could not say why. The status and the
  // error code Gemini gives are kept when they are identifiers; its message, which could carry any text, never is.
  it("keeps how Gemini ended an unfinished pass: its status and error code, not its message", async () => {
    const ended = (status: string, error: unknown) => new Response(JSON.stringify({
      id: "interaction-1", status, model: "gemini-3.6-flash", steps: [], error
    }), { status: 200, headers: { "content-type": "application/json" } });
    const pass = async (status: string, error: unknown) => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(ended(status, error))
        .mockResolvedValueOnce(new Response("{}", { status: 200 })));
      return advanceGeminiVideoPass(
        { mode: "claims", video_id: VIDEO }, CONFIG, { interaction_id: "interaction-1", poll_attempts: 0 }
      );
    };
    const named = await pass("failed", { status: "INVALID_ARGUMENT", code: 400, message: "Video https://x.example/v is private" });
    expect(named).toEqual({
      kind: "boundary", code: "gemini_video_not_completed", retryable: false,
      gemini_status: "failed", gemini_error_code: "INVALID_ARGUMENT"
    });
    expect(JSON.stringify(named)).not.toContain("private");
    expect(await pass("cancelled", { code: 403 })).toMatchObject({ gemini_status: "cancelled", gemini_error_code: "403" });
    const odd = await pass("failed: see https://x.example", { status: "video is private", code: 12_345 });
    expect(odd).toEqual({
      kind: "boundary", code: "gemini_video_not_completed", retryable: false, gemini_status: "unrecognized"
    });
    expect(await pass("incomplete", null)).toEqual({
      kind: "boundary", code: "gemini_video_not_completed", retryable: false, gemini_status: "incomplete"
    });
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
    )).toEqual({ kind: "boundary", code: "gemini_video_not_completed", retryable: false, gemini_ending: "interaction_missing" });
  });

  // AskRigor#359: a reading that ended gemini_video_not_completed could not say whether Gemini ended it with a status
  // or no longer had it when polled. The second now carries a fixed marker, and nothing from Gemini's reply.
  it("marks a pass Gemini no longer had when polled, with nothing from its reply, and polls nothing more", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: 404, status: "NOT_FOUND", message: "Interaction interaction-7 for https://x.example/v was not found" }
    }), { status: 404, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const gone = await advanceGeminiVideoPass(
      { mode: "claims", video_id: VIDEO }, CONFIG, { interaction_id: "interaction-7", poll_attempts: 3 }
    );
    expect(gone).toEqual({
      kind: "boundary", code: "gemini_video_not_completed", retryable: false, gemini_ending: "interaction_missing"
    });
    for (const leaked of ["interaction-7", "NOT_FOUND", "x.example", "not found", CONFIG.apiKey]) {
      expect(JSON.stringify(gone)).not.toContain(leaked);
    }
    // One poll, no retry and no delete: the pass is gone, and another reading would charge the daily limit again.
    expect(requests(fetchMock)).toEqual([{ url: `${ENDPOINT}/interaction-7`, method: "GET", body: undefined }]);

    // A pass Gemini ended with a status keeps its status, with no such marker.
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(interaction("failed"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 })));
    expect(await advanceGeminiVideoPass(
      { mode: "claims", video_id: VIDEO }, CONFIG, { interaction_id: "interaction-1", poll_attempts: 0 }
    )).not.toHaveProperty("gemini_ending");
    // A start Gemini refuses with 404 is a refused request, not a pass it lost.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 404 })));
    expect(await advanceGeminiVideoPass({ mode: "claims", video_id: VIDEO }, CONFIG))
      .toEqual({ kind: "boundary", code: "gemini_video_request_rejected", retryable: false });
  });
});
