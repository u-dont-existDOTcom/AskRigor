import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decodeScoutContinuation,
  encodeScoutContinuation,
  ScoutContinuationError
} from "../apps/research-mcp/src/scout-continuation.js";
import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";

const execute = vi.hoisted(() => vi.fn());
vi.mock("../apps/research-mcp/src/actions/gemini-scout-route.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../apps/research-mcp/src/actions/gemini-scout-route.js")>(),
  executeResumableAutomatedGeminiScout: execute
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

  it("returns a continuation while the scout searches, then the validated videos and a discovery receipt", async () => {
    const progress = { controller_progress: { checkpoint: CHECKPOINT, accounted_nano_usd: 1_000_000_000 } };
    const now = vi.spyOn(Date, "now");
    let clock = 1_790_000_000_000;
    now.mockImplementation(() => clock);
    // Every advance "takes" 15 seconds, so the first call hands back a token.
    execute.mockImplementation(async () => {
      clock += 15_000;
      return progress;
    });
    const client = await connect();

    const first = await client.callTool({ name: "scout_gemini_youtube_candidates", arguments: TARGET });
    expect(first.isError).not.toBe(true);
    const pending = first.structuredContent as { scout_status: string; continuation_token: string };
    expect(pending.scout_status).toBe("pending");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, TARGET, undefined);

    execute.mockReset();
    execute.mockResolvedValueOnce({
      controller_completion: {
        provider_response_id: "response-1",
        packet: {
          discovery_queries: [{ purpose: "firsthand_outcome", query: "avoided hip replacement what worked" }],
          search_gaps: [],
          candidates: [
            { video_id: "dQw4w9WgXcQ", title: "Real video", channel: "Real channel" },
            { video_id: "Zz9Yy8Xx7Ww", title: "GROWING MY HIP BACK", channel: "SHAPEFIXER" }
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
    const second = await client.callTool({
      name: "scout_gemini_youtube_candidates",
      arguments: { continuation_token: pending.continuation_token }
    });
    now.mockRestore();

    expect(execute).toHaveBeenCalledWith(TARGET, { checkpoint: CHECKPOINT, accountedNanoUsd: 1_000_000_000 });
    expect(second.isError).not.toBe(true);
    const done = second.structuredContent as { scout_status: string; provider_storage_mode: string; research_receipt: string };
    expect(done).toMatchObject({
      scout_status: "complete",
      provider_storage_mode: "TEMPORARY_BACKGROUND_DELETE_REQUESTED",
      // The garbled ID's title comes back so the model can search it exactly.
      invalid_id_candidates: [{ title: "GROWING MY HIP BACK", channel: "SHAPEFIXER" }]
    });
    expect((second.content as Array<{ text: string }>)[0]!.text).toContain(
      "1 proposed video(s) had IDs that do not exist (invalid_id_candidates)"
    );
    expect(verifyResearchReceipt(done.research_receipt, { secret: SECRET })).toMatchObject({
      ok: true,
      kind: "youtube_scout",
      claims: { videos: ["dQw4w9WgXcQ"], open: "0" }
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
