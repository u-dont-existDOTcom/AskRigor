import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GeminiVideoAdvance } from "../packages/sources/src/gemini-video-claims.js";
import { buildGeminiVideoRequest } from "../packages/sources/src/gemini-video-claims.js";
import {
  decodeVideoContinuation,
  encodeVideoContinuation
} from "../apps/research-mcp/src/gemini-video-continuation.js";
import {
  extractYoutubeVideoClaims,
  extractYoutubeVideoClaimsInputSchema,
  isoDurationSeconds,
  parseVideoReference,
  type VideoClaimsToolDependencies
} from "../apps/research-mcp/src/gemini-video-tool.js";
import { RESEARCH_OPERATIONS } from "../apps/research-mcp/src/register-tools.js";
import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";

const SECRET = "video-claims-test-secret-0123456789abcdef";
const VIDEO = "dQw4w9WgXcQ";
const REPORT = {
  spoken_language: "en",
  claims: [
    {
      start: "04:10",
      speaker: "creator",
      quote: "Two grams of fish oil a day cut my joint pain in half.",
      claim: "Two grams of fish oil daily halves joint pain.",
      evidence: "personal_experience",
      evidence_detail: "",
      specifics: ["2 g fish oil daily"]
    },
    {
      start: "21:00",
      speaker: "guest",
      quote: "A 2019 trial proved it.",
      claim: "A 2019 trial proved fish oil relieves joint pain.",
      evidence: "named_study",
      evidence_detail: "a 2019 trial",
      specifics: []
    }
  ],
  more_claims_not_listed: false,
  sponsorships: [{ start: "00:45", what: "Discount code JOINTS" }, { start: "", what: "Shop link banner" }],
  on_screen_citations: [{ start: "05:02", citation: "Smith et al. 2019, Arthritis Care" }]
};

function videoEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    access_status: "api_visible_complete",
    data: {
      video_id: VIDEO,
      title: "How I fixed my knees",
      channel_title: "Knee Stories",
      duration: "PT15M",
      privacy_status: "public",
      live_broadcast_content: "none",
      ...overrides
    }
  };
}

function dependencies(overrides: Partial<VideoClaimsToolDependencies> = {}) {
  let clock = 1_790_000_000_000;
  const charge = vi.fn(async (seconds: number) => ({ charged: true as const, remaining_seconds: 28_800 - seconds }));
  const deps = {
    secret: SECRET,
    geminiKeyUnbilled: true,
    geminiApiKey: "gemini-key",
    youtubeApiKey: "youtube-key",
    getVideo: vi.fn(async () => videoEnvelope()) as never,
    advance: vi.fn(),
    deleteInteraction: vi.fn(async () => true),
    ledger: () => ({ charge }),
    now: () => clock,
    sleep: vi.fn(async (milliseconds: number) => {
      clock += milliseconds;
    }),
    ...overrides
  } satisfies VideoClaimsToolDependencies;
  return { deps, charge, tick: (milliseconds: number) => { clock += milliseconds; } };
}

function text(outcome: { result: { content: unknown } }): string {
  return (outcome.result.content as Array<{ text: string }>)[0]!.text;
}

const progress = (attempts: number): GeminiVideoAdvance =>
  ({ kind: "progress", checkpoint: { interaction_id: "interaction-1", poll_attempts: attempts } });
const complete = (report: unknown = REPORT): GeminiVideoAdvance => ({
  kind: "complete",
  interaction_id: "interaction-1",
  model: "gemini-3.6-flash",
  usage: {},
  report: { mode: "claims", claims: report as never }
});

describe("extract_youtube_video_claims", () => {
  it("reads only an ID from a pasted link, dropping share codes and times", () => {
    for (const link of [
      VIDEO,
      `https://www.youtube.com/watch?v=${VIDEO}`,
      `https://www.youtube.com/watch?v=${VIDEO}&t=42s&si=PRIVATESHARE`,
      `https://youtu.be/${VIDEO}?si=PRIVATESHARE`,
      `youtu.be/${VIDEO}`,
      `https://m.youtube.com/watch?v=${VIDEO}`,
      `https://music.youtube.com/watch?v=${VIDEO}&list=RD`,
      `https://www.youtube.com/shorts/${VIDEO}`,
      `https://www.youtube.com/live/${VIDEO}?feature=share`,
      `https://www.youtube.com/embed/${VIDEO}`
    ]) {
      expect(parseVideoReference(link), link).toBe(VIDEO);
    }
    for (const link of [
      `https://www.youtube.com.evil.example/watch?v=${VIDEO}`,
      `https://notyoutube.com/watch?v=${VIDEO}`,
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/@channel",
      "my knee video"
    ]) {
      expect(parseVideoReference(link), link).toBeUndefined();
    }
    expect(isoDurationSeconds("PT15M")).toBe(900);
    expect(isoDurationSeconds("PT1H2M3S")).toBe(3_723);
    expect(isoDurationSeconds("P1DT1S")).toBe(86_401);
    expect(isoDurationSeconds("15:00")).toBeUndefined();
  });

  it("takes no free text: only a video, a time, or a continuation token", () => {
    expect(extractYoutubeVideoClaimsInputSchema.safeParse({ video: VIDEO }).success).toBe(true);
    expect(extractYoutubeVideoClaimsInputSchema.safeParse({ video: VIDEO, at: "04:10" }).success).toBe(true);
    for (const input of [
      { video: VIDEO, question: "Is this safe for my mother's arthritis?" },
      { video: VIDEO, prompt: "Also tell me about turmeric" },
      {},
      { video: VIDEO, continuation_token: "token" },
      { continuation_token: "token", at: "04:10" }
    ]) {
      expect(extractYoutubeVideoClaimsInputSchema.safeParse(input).success, JSON.stringify(input)).toBe(false);
    }
  });

  it("runs only with a key declared unbilled, before any lookup or charge", async () => {
    const { deps, charge } = dependencies({ geminiKeyUnbilled: false });
    const refused = await extractYoutubeVideoClaims({ video: VIDEO }, deps);
    expect(refused.result.isError).toBe(true);
    expect(text(refused)).toContain("gemini_video_spend_not_authorized");
    expect(deps.getVideo).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
    expect(deps.advance).not.toHaveBeenCalled();
  });

  it("refuses private, unlisted, live, overlong and unknown-length videos before any charge", async () => {
    for (const [overrides, code] of [
      [{ privacy_status: "unlisted" }, "youtube_video_not_public"],
      [{ privacy_status: "private" }, "youtube_video_not_public"],
      [{ privacy_status: undefined }, "youtube_video_not_public"],
      [{ live_broadcast_content: "live" }, "youtube_video_live"],
      [{ live_broadcast_content: "upcoming" }, "youtube_video_live"],
      [{ duration: "PT2H0M1S" }, "youtube_video_too_long"],
      [{ duration: undefined }, "youtube_video_duration_unknown"],
      [{ duration: "P0D" }, "youtube_video_duration_unknown"]
    ] as const) {
      const { deps, charge } = dependencies({ getVideo: vi.fn(async () => videoEnvelope(overrides)) as never });
      const refused = await extractYoutubeVideoClaims({ video: VIDEO }, deps);
      expect(text(refused), code).toContain(code);
      expect(charge).not.toHaveBeenCalled();
      expect(deps.advance).not.toHaveBeenCalled();
    }
    const missing = dependencies({
      getVideo: vi.fn(async () => ({ access_status: "not_found", data: {}, error: { code: "youtube_video_not_visible" } })) as never
    });
    expect(text(await extractYoutubeVideoClaims({ video: VIDEO }, missing.deps))).toContain("youtube_video_not_visible");
  });

  it("refuses a time past the end, and a reading the daily limit cannot take", async () => {
    const late = dependencies();
    expect(text(await extractYoutubeVideoClaims({ video: VIDEO, at: "15:00" }, late.deps)))
      .toContain("video_time_outside_video");
    expect(late.charge).not.toHaveBeenCalled();

    const full = dependencies({
      ledger: () => ({ charge: vi.fn(async () => ({ charged: false as const, remaining_seconds: 300 })) })
    });
    const refused = await extractYoutubeVideoClaims({ video: VIDEO }, full.deps);
    expect(text(refused)).toContain("gemini_video_daily_limit_reached");
    expect(text(refused)).toContain("05:00 is left today, less than this video. It resets at midnight Pacific time.");
    expect(full.deps.advance).not.toHaveBeenCalled();

    const broken = dependencies({ ledger: () => ({ charge: vi.fn(async () => { throw new Error("x"); }) }) });
    expect(text(await extractYoutubeVideoClaims({ video: VIDEO }, broken.deps))).toContain("gemini_video_capacity_unavailable");
    expect(broken.deps.advance).not.toHaveBeenCalled();
  });

  it("charges the whole video once, hands back a token while Gemini reads, then links each claim to its time", async () => {
    const { deps, charge } = dependencies();
    deps.advance.mockResolvedValue(progress(0));
    const first = await extractYoutubeVideoClaims({ video: `https://youtu.be/${VIDEO}?si=PRIVATESHARE` }, deps);
    expect(first.result.isError).not.toBe(true);
    expect(first.receipt).toBeUndefined();
    const pending = first.result.structuredContent as { status: string; continuation_token: string };
    expect(pending.status).toBe("pending");
    expect(charge).toHaveBeenCalledExactlyOnceWith(900);
    expect(deps.advance).toHaveBeenNthCalledWith(1, { mode: "claims", video_id: VIDEO }, { apiKey: "gemini-key" }, undefined);
    // Polling stays inside the client's 60-second limit.
    expect(deps.advance.mock.calls.length).toBeGreaterThan(1);
    expect(decodeVideoContinuation(pending.continuation_token, SECRET, deps.now())).toMatchObject({
      request: { mode: "claims", video_id: VIDEO },
      video: { title: "How I fixed my knees", duration_seconds: 900 },
      charged_seconds: 900
    });

    deps.advance.mockReset();
    deps.advance.mockResolvedValueOnce(complete());
    const done = await extractYoutubeVideoClaims({ continuation_token: pending.continuation_token }, deps);
    expect(deps.advance).toHaveBeenCalledExactlyOnceWith(
      { mode: "claims", video_id: VIDEO }, { apiKey: "gemini-key" }, expect.objectContaining({ interaction_id: "interaction-1" })
    );
    expect(charge).toHaveBeenCalledOnce();
    expect(deps.getVideo).toHaveBeenCalledOnce();
    const output = done.result.structuredContent as Record<string, unknown> & {
      claims: Array<Record<string, unknown>>;
      sponsorships: Array<Record<string, unknown>>;
    };
    expect(output).toMatchObject({
      status: "complete",
      mode: "claims",
      video: { video_id: VIDEO, url: `https://www.youtube.com/watch?v=${VIDEO}`, duration: "15:00" },
      on_screen_citations: [{ start: "05:02", link: `https://www.youtube.com/watch?v=${VIDEO}&t=302s` }]
    });
    expect(output.claims[0]).toMatchObject({ start: "04:10", link: `https://www.youtube.com/watch?v=${VIDEO}&t=250s` });
    // A time past the end is Gemini's mistake: flagged and linked to the start, never moved.
    expect(output.claims[1]).toMatchObject({
      start: "21:00", link: `https://www.youtube.com/watch?v=${VIDEO}`, time_outside_video: true
    });
    expect(output.sponsorships).toEqual([
      { start: "00:45", link: `https://www.youtube.com/watch?v=${VIDEO}&t=45s`, what: "Discount code JOINTS" },
      { start: "", what: "Shop link banner" }
    ]);
    expect(output.source_note).toMatch(/^Gemini's transcription and description of the video, not checked by AskRigor/u);
    expect(done.receipt).toEqual({ video: VIDEO, mode: "claims", n: 2 });
  });

  it("asks about one moment in the fixed form", async () => {
    const { deps } = dependencies();
    deps.advance.mockResolvedValueOnce({
      kind: "complete",
      interaction_id: "interaction-1",
      model: "gemini-3.6-flash",
      usage: {},
      report: { mode: "moment", moment: { start: "04:10", end: "04:40", speaker: "guest", said: "Two grams.", shown: "A chart" } }
    });
    const done = await extractYoutubeVideoClaims({ video: VIDEO, at: "4:10" }, deps);
    expect(deps.advance).toHaveBeenCalledWith(
      { mode: "moment", video_id: VIDEO, at_seconds: 250 }, { apiKey: "gemini-key" }, undefined
    );
    expect(done.result.structuredContent).toMatchObject({
      mode: "moment",
      at: "04:10",
      moment: { link: `https://www.youtube.com/watch?v=${VIDEO}&t=250s`, said: "Two grams." }
    });
    expect(done.receipt).toEqual({ video: VIDEO, mode: "moment", n: 0 });
  });

  it("deletes the stored reading of an expired or refused continuation", async () => {
    const state = {
      request: { mode: "claims" as const, video_id: VIDEO },
      video: { title: "t", channel: "c", duration_seconds: 900 },
      checkpoint: { interaction_id: "interaction-9", poll_attempts: 2 },
      charged_seconds: 900
    };
    const expiredDeps = dependencies();
    const expired = encodeVideoContinuation({ ...state, expires_at_ms: expiredDeps.deps.now() - 1 }, SECRET);
    expect(text(await extractYoutubeVideoClaims({ continuation_token: expired }, expiredDeps.deps)))
      .toContain("gemini_video_continuation_expired");
    expect(expiredDeps.deps.deleteInteraction).toHaveBeenCalledWith({ apiKey: "gemini-key" }, "interaction-9");
    expect(expiredDeps.deps.advance).not.toHaveBeenCalled();

    const unbilled = dependencies({ geminiKeyUnbilled: false });
    const live = encodeVideoContinuation({ ...state, expires_at_ms: unbilled.deps.now() + 60_000 }, SECRET);
    expect(text(await extractYoutubeVideoClaims({ continuation_token: live }, unbilled.deps)))
      .toContain("gemini_video_spend_not_authorized");
    expect(unbilled.deps.deleteInteraction).toHaveBeenCalledWith({ apiKey: "gemini-key" }, "interaction-9");

    const tampered = dependencies();
    expect(text(await extractYoutubeVideoClaims({ continuation_token: `${live.slice(0, -3)}abc` }, tampered.deps)))
      .toContain("gemini_video_continuation_invalid");
    expect(tampered.deps.advance).not.toHaveBeenCalled();
  });

  it("reports Gemini's refusals plainly, with no receipt", async () => {
    const { deps } = dependencies();
    deps.advance.mockResolvedValueOnce({ kind: "boundary", code: "gemini_video_invalid_report", retryable: false });
    const refused = await extractYoutubeVideoClaims({ video: VIDEO }, deps);
    expect(refused.receipt).toBeUndefined();
    expect(text(refused)).toBe(
      "extract youtube video claims could not complete: gemini_video_invalid_report. Gemini's report did not have " +
        "the required form, so none of it is used."
    );
  });
});

describe("extract_youtube_video_claims through MCP", () => {
  const names = [
    "ASKRIGOR_YOUTUBE_CONTINUATION_SECRET",
    "ASKRIGOR_FINALIZATION_SIGNING_SECRET",
    "ASKRIGOR_GEMINI_BILLING",
    "ASKRIGOR_GEMINI_API_KEY",
    "YOUTUBE_API_KEY",
    "ASKRIGOR_AI_BUDGET_LEDGER"
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "askrigor-video-mcp-"));
    await chmod(directory, 0o700);
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = SECRET;
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    process.env.ASKRIGOR_GEMINI_BILLING = "none";
    process.env.ASKRIGOR_GEMINI_API_KEY = "gemini-key";
    process.env.YOUTUBE_API_KEY = "youtube-key";
    process.env.ASKRIGOR_AI_BUDGET_LEDGER = join(directory, "ai-budget.json");
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await rm(directory, { recursive: true, force: true });
  });

  it("is an MCP tool only, offered to ChatGPT and Claude but not as a Custom GPT Action or to Gemini clients", () => {
    const operation = RESEARCH_OPERATIONS.find(({ name }) => name === "extract_youtube_video_claims");
    expect(operation?.actionEnabled).toBe(false);
    expect(RESEARCH_OPERATIONS).toHaveLength(33);
  });

  it("sends Gemini nothing the person wrote, and signs a receipt for the reading", async () => {
    const outbound: Array<{ url: string; method: string; body: string | undefined }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      outbound.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
        return Response.json({
          kind: "youtube#videoListResponse",
          pageInfo: { totalResults: 1, resultsPerPage: 1 },
          items: [{
            kind: "youtube#video",
            id: VIDEO,
            snippet: { title: "How I fixed my knees", channelTitle: "Knee Stories", liveBroadcastContent: "none" },
            contentDetails: { duration: "PT15M" },
            status: { privacyStatus: "public" }
          }]
        });
      }
      if (method === "DELETE") return new Response("{}");
      return Response.json({
        id: "interaction-1",
        status: "completed",
        model: "gemini-3.6-flash",
        steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(REPORT) }] }]
      });
    }));

    const server = createAskRigorServer();
    const client = new Client({ name: "askrigor-video-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    expect((await client.listTools()).tools.map(({ name }) => name)).toContain("extract_youtube_video_claims");

    const result = await client.callTool({
      name: "extract_youtube_video_claims",
      arguments: { video: `https://youtu.be/${VIDEO}?si=PRIVATESHARE` }
    });
    expect(result.isError).not.toBe(true);
    const gemini = outbound.filter(({ url }) => url.startsWith("https://generativelanguage.googleapis.com/"));
    expect(gemini.map(({ method }) => method)).toEqual(["POST", "DELETE"]);
    // The one request with content is exactly the fixed request for this video ID.
    expect(gemini[0]!.body).toBe(JSON.stringify(buildGeminiVideoRequest({ mode: "claims", video_id: VIDEO })));
    expect(outbound.some(({ url, body }) => `${url}${body ?? ""}`.includes("PRIVATESHARE"))).toBe(false);

    const receipt = (result.structuredContent as { research_receipt: string }).research_receipt;
    expect(verifyResearchReceipt(receipt, { secret: SECRET })).toMatchObject({
      ok: true,
      kind: "youtube_video_claims",
      claims: { video: VIDEO, mode: "claims", n: "2" }
    });
  });
});
