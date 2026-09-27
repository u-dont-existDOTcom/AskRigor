import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decodeScoutContinuation,
  encodeScoutContinuation,
  ScoutContinuationError
} from "../apps/research-mcp/src/scout-continuation.js";
import { discoveryQueryDigest, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";

const execute = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => vi.fn());
vi.mock("../apps/research-mcp/src/actions/gemini-scout-route.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../apps/research-mcp/src/actions/gemini-scout-route.js")>(),
  executeResumableAutomatedGeminiScout: execute
}));
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(),
  searchYoutube: search
}));

const { createAskRigorServer } = await import("../apps/research-mcp/src/server.js");

const SECRET = "scout-continuation-test-secret-0123456789";
const CHECKPOINT = {
  interaction_id: "interaction-1",
  phase: "INITIAL" as const,
  provider_interaction_count: 1 as const,
  poll_attempts: 0,
  executed_search_queries: []
};
const TARGET = {
  research_target: "Adults trying to avoid a hip replacement: what they tried and what happened",
  diagnosis_status: "diagnosis_not_specified" as const
};

describe("MCP Gemini scout continuation", () => {
  const previous = {
    continuation: process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET,
    finalization: process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET
  };
  beforeEach(() => {
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = SECRET;
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    execute.mockReset();
    search.mockReset();
  });
  afterEach(() => {
    for (const [name, value] of [
      ["ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previous.continuation],
      ["ASKRIGOR_FINALIZATION_SIGNING_SECRET", previous.finalization]
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("rejects altered and expired continuation tokens", () => {
    const token = encodeScoutContinuation({
      ...TARGET, checkpoint: CHECKPOINT, accounted_nano_usd: 1_000, expires_at_ms: 2_000
    }, SECRET);
    expect(decodeScoutContinuation(token, SECRET, 1_000)).toMatchObject({ ...TARGET, accounted_nano_usd: 1_000 });
    expect(() => decodeScoutContinuation(`${token.slice(0, -2)}xx`, SECRET, 1_000))
      .toThrow(new ScoutContinuationError("gemini_scout_continuation_invalid"));
    expect(() => decodeScoutContinuation(token, "another-secret-of-sufficient-length-00", 1_000))
      .toThrow(new ScoutContinuationError("gemini_scout_continuation_invalid"));
    expect(() => decodeScoutContinuation(token, SECRET, 2_000))
      .toThrow(new ScoutContinuationError("gemini_scout_continuation_expired"));
  });

  it("returns a continuation while the scout searches, then validated and title-found videos with a discovery receipt", async () => {
    const progress = { controller_progress: { checkpoint: CHECKPOINT, accounted_nano_usd: 1_000_000_000 } };
    const now = vi.spyOn(Date, "now");
    let clock = 1_790_000_000_000;
    now.mockImplementation(() => clock);
    // The executor polls until its deadline and is still searching, so the call hands back a token.
    execute.mockImplementation(async () => {
      clock += 38_000;
      return progress;
    });
    const client = await connect();
    const startedAt = clock;

    const first = await client.callTool({ name: "scout_gemini_youtube_candidates", arguments: TARGET });
    expect(first.isError).not.toBe(true);
    const pending = first.structuredContent as { scout_status: string; continuation_token: string };
    expect(pending.scout_status).toBe("pending");
    // One deadline-paced advance per call keeps the call under Claude's 60-second tool timeout.
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenNthCalledWith(1, TARGET, undefined, { deadlineMs: startedAt + 40_000 }, []);

    execute.mockReset();
    execute.mockResolvedValueOnce({
      controller_completion: {
        provider_response_id: "response-1",
        packet: {
          discovery_queries: [{ purpose: "firsthand_outcome", query: "avoided hip replacement what worked" }],
          search_gaps: [],
          candidates: [
            { video_id: "dQw4w9WgXcQ", title: "Real video", channel: "Real channel", why_surfaced: "Outcome" },
            { video_id: "Zz9Yy8Xx7Ww", title: "GROWING MY HIP BACK", channel: "SHAPEFIXER", why_surfaced: "Recovery" }
          ],
          title_only_candidates: [
            { title: "Gelatin for my hip, one year later", channel: "not described", why_surfaced: "Named remedy" }
          ]
        },
        validation: {
          ...validationReceipt(),
          rejected_candidates: [{
            video_id: "Zz9Yy8Xx7Ww",
            metadata_access_status: "not_found",
            retryable: false,
            rejection_reasons: ["metadata_not_api_visible_complete"],
            limitations: []
          }]
        },
        provider_storage_mode: "TEMPORARY_BACKGROUND_DELETE_REQUESTED",
        accounted_nano_usd: 900_000_000
      }
    });
    search.mockImplementation(async ({ query }: { query: string }) => ({
      access_status: "complete",
      data: query === "GROWING MY HIP BACK"
        ? [{ video_id: "XpZHKGGCK-o", title: "GROWING MY HIP BACK - How I Restored Full Function", channel_title: "SHAPEFIXER" }]
        : []
    }));
    const second = await client.callTool({
      name: "scout_gemini_youtube_candidates",
      arguments: { continuation_token: pending.continuation_token }
    });
    now.mockRestore();

    expect(execute).toHaveBeenCalledWith(
      TARGET, { checkpoint: CHECKPOINT, accountedNanoUsd: 1_000_000_000 }, { deadlineMs: expect.any(Number) }, []
    );
    expect(second.isError).not.toBe(true);
    const done = second.structuredContent as { scout_status: string; provider_storage_mode: string; research_receipt: string };
    // Title-only finds come first, then the candidate whose ID did not exist.
    expect(search.mock.calls.map(([request]) => request.query)).toEqual([
      "Gelatin for my hip, one year later",
      "GROWING MY HIP BACK"
    ]);
    expect(done).toMatchObject({
      scout_status: "complete",
      provider_storage_mode: "TEMPORARY_BACKGROUND_DELETE_REQUESTED",
      title_lookup: {
        found: [{
          video_id: "XpZHKGGCK-o",
          title: "GROWING MY HIP BACK - How I Restored Full Function",
          channel: "SHAPEFIXER",
          declared_title: "GROWING MY HIP BACK",
          why_surfaced: "Recovery"
        }],
        unresolved: [{
          title: "Gelatin for my hip, one year later",
          channel: "not described",
          why_surfaced: "Named remedy",
          reason: "no_matching_video"
        }]
      }
    });
    const text = (second.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain("validated 1 video(s) and found 1 more by exact title (title_lookup.found)");
    expect(text).toContain("1 named video(s) could not be identified (title_lookup.unresolved)");
    expect(verifyResearchReceipt(done.research_receipt, { secret: SECRET })).toMatchObject({
      ok: true,
      kind: "youtube_scout",
      claims: { videos: ["dQw4w9WgXcQ", "XpZHKGGCK-o"], open: "0" }
    });

    const tampered = await client.callTool({
      name: "scout_gemini_youtube_candidates",
      arguments: { continuation_token: `${pending.continuation_token.slice(0, -2)}xx` }
    });
    expect(tampered.isError).toBe(true);
    expect(tampered.content).toEqual([{
      type: "text",
      text: "scout gemini youtube candidates could not complete: gemini_scout_continuation_invalid."
    }]);
  });

  it("leaves named titles unsearched when the call is running long, and counts them as open", async () => {
    const now = vi.spyOn(Date, "now");
    let clock = 1_790_000_000_000;
    now.mockImplementation(() => clock);
    execute.mockImplementation(async () => {
      clock += 40_000;
      return {
        controller_completion: {
          provider_response_id: "response-3",
          packet: {
            discovery_queries: [],
            search_gaps: [],
            candidates: [],
            title_only_candidates: [
              { title: "Gelatin for my hip, one year later", channel: "not described", why_surfaced: "Named remedy" },
              { title: "Hip pain gone after hydration", channel: "not described", why_surfaced: "Named remedy" }
            ]
          },
          validation: validationReceipt(),
          provider_storage_mode: "TEMPORARY_BACKGROUND_DELETE_REQUESTED",
          accounted_nano_usd: 900_000_000
        }
      };
    });
    const client = await connect();
    const done = await client.callTool({ name: "scout_gemini_youtube_candidates", arguments: TARGET });
    now.mockRestore();

    expect(search).not.toHaveBeenCalled();
    const output = done.structuredContent as {
      title_lookup: { unresolved: Array<{ reason: string }> };
      research_receipt: string;
    };
    expect(output.title_lookup.unresolved.map(({ reason }) => reason)).toEqual(["not_searched", "not_searched"]);
    expect(verifyResearchReceipt(output.research_receipt, { secret: SECRET })).toMatchObject({
      ok: true,
      claims: { open: "2" }
    });
  });

  it("sends only screened text to Gemini: a first-person target or lead is refused before any provider call", async () => {
    const client = await connect();
    const personal = await client.callTool({
      name: "scout_gemini_youtube_candidates",
      arguments: { ...TARGET, research_target: "My hip hurts and I want to avoid surgery" }
    });
    const badLead = await client.callTool({
      name: "scout_gemini_youtube_candidates",
      arguments: { ...TARGET, rediscovery_leads: ["gelatin", "see https://example.com/my-story"] }
    });
    expect(execute).not.toHaveBeenCalled();
    expect(personal.isError).toBe(true);
    expect((personal.content as Array<{ text: string }>)[0]!.text).toContain("research_target_not_deidentified");
    expect(badLead.isError).toBe(true);
    expect((badLead.content as Array<{ text: string }>)[0]!.text).toContain("rediscovery_lead_not_deidentified");
  });

  it("runs a rediscovery round from comment-named leads and carries them through the continuation", async () => {
    const leads = ["gelatin", "hydration", "GROWING HIP BACK SHAPEFIXER"];
    const progress = { controller_progress: { checkpoint: CHECKPOINT, accounted_nano_usd: 1_000_000_000 } };
    const now = vi.spyOn(Date, "now");
    let clock = 1_790_000_000_000;
    now.mockImplementation(() => clock);
    execute.mockImplementation(async () => {
      clock += 15_000;
      return progress;
    });
    const client = await connect();
    const first = await client.callTool({
      name: "scout_gemini_youtube_candidates",
      arguments: { ...TARGET, rediscovery_leads: leads }
    });
    const pending = first.structuredContent as { continuation_token: string; rediscovery_leads: string[] };
    expect(pending.rediscovery_leads).toEqual(leads);
    expect(execute).toHaveBeenNthCalledWith(1, TARGET, undefined, { deadlineMs: expect.any(Number) }, leads);

    const both = await client.callTool({
      name: "scout_gemini_youtube_candidates",
      arguments: { continuation_token: pending.continuation_token, rediscovery_leads: leads }
    });
    expect(both.isError).toBe(true);

    execute.mockReset();
    execute.mockResolvedValueOnce({
      controller_completion: {
        provider_response_id: "response-2",
        packet: { discovery_queries: [], search_gaps: [], candidates: [] },
        validation: validationReceipt(),
        provider_storage_mode: "TEMPORARY_BACKGROUND_DELETE_REQUESTED",
        accounted_nano_usd: 900_000_000
      }
    });
    const done = await client.callTool({
      name: "scout_gemini_youtube_candidates",
      arguments: { continuation_token: pending.continuation_token }
    });
    now.mockRestore();
    expect(execute).toHaveBeenCalledWith(
      TARGET, { checkpoint: CHECKPOINT, accountedNanoUsd: 1_000_000_000 }, { deadlineMs: expect.any(Number) }, leads
    );
    const receipt = (done.structuredContent as { research_receipt: string }).research_receipt;
    // A rediscovery round is a different angle from the first scout of the same target.
    expect(verifyResearchReceipt(receipt, { secret: SECRET })).toMatchObject({
      ok: true,
      claims: { q: discoveryQueryDigest([TARGET.research_target, ...leads]) }
    });
    expect(discoveryQueryDigest([TARGET.research_target, ...leads]))
      .not.toBe(discoveryQueryDigest([TARGET.research_target]));
  });

  it("reports provider boundaries as errors with their code", async () => {
    execute.mockResolvedValueOnce({ controller_boundary: { code: "gemini_youtube_scout_request_failed", retryable: true } });
    const client = await connect();
    const result = await client.callTool({ name: "scout_gemini_youtube_candidates", arguments: TARGET });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{
      type: "text",
      text: "scout gemini youtube candidates could not complete: gemini_youtube_scout_request_failed (retryable)."
    }]);
  });
});

async function connect(): Promise<Client> {
  const server = createAskRigorServer();
  const client = new Client({ name: "askrigor-scout-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function validationReceipt() {
  return {
    packet_name: "askrigor_gemini_youtube_candidate_validation",
    packet_version: "1.0",
    source_contract: "gemini_youtube_candidate_handoff",
    source_packet_version: "2.0",
    status: "accepted",
    research_target: TARGET.research_target,
    candidate_frontier: {
      frontier_digest: "a".repeat(64),
      source_candidate_video_ids: ["dQw4w9WgXcQ"],
      validated_candidate_video_ids: ["dQw4w9WgXcQ"],
      terminally_rejected_video_ids: [],
      unresolved_candidate_video_ids: []
    },
    validated_candidates: [{ video_id: "dQw4w9WgXcQ" }],
    rejected_candidates: [],
    unresolved_candidates: [],
    suggested_seed_receipts: [],
    eligible_seed_video_ids: [],
    access_boundaries: []
  };
}
