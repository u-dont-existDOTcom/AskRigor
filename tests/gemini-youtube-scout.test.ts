import { afterEach, describe, expect, it, vi } from "vitest";

import {
  scoutGeminiYoutubeCandidates,
  type GeminiYoutubeCandidatePacket
} from "../packages/sources/src/index.js";

const CONFIG = {
  apiKey: "fixture-gemini-key",
  model: "fixture-gemini-model"
};
const INPUT = {
  researchTarget: "compare materially different programs for a painful hip",
  diagnosisStatus: "diagnosis_not_specified" as const,
  scoutInstructions: "Scout public YouTube candidates across distinct treatment programs."
};
const VIDEO_IDS = ["XpZHKGGCK-o", "0sZEvvPWq88", "qfPjRBqADKk"] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

function packet(): GeminiYoutubeCandidatePacket {
  return {
    packet_name: "gemini_youtube_candidate_handoff",
    packet_version: "2.0",
    research_target: INPUT.researchTarget,
    diagnosis_status: INPUT.diagnosisStatus,
    discovery_queries: [
      { purpose: "firsthand_outcome", query: '"hip pain" "what worked for me"' },
      { purpose: "radical_outcome", query: '"growing my hip back"' },
      { purpose: "overlooked_intervention", query: '"hip pain" progressive loading' },
      { purpose: "overlooked_intervention", query: '"hip pain" aquatic program' },
      { purpose: "conventional_benefit", query: '"hip injection" relief experience' },
      { purpose: "conventional_negative", query: '"hip injection" failed flare' },
      { purpose: "overlooked_intervention", query: '"hip pain" diet program results' },
      { purpose: "firsthand_outcome", query: '"advanced hip arthritis" program experience' }
    ],
    candidates: VIDEO_IDS.map((videoId, index) => ({
      video_id: videoId,
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Candidate ${index + 1}`,
      channel: `Independent channel ${index + 1}`,
      target_distance: index === 0 ? "exact" : "adjacent",
      provisional_intervention_family: index === 0
        ? "nutrition_or_elimination"
        : index === 1
          ? "regenerative_or_biologic"
          : "local_mechanical",
      creator_claim_summary: `Provisional public-video-context summary ${index + 1}.`,
      provisional_specific_program: `Materially distinct program ${index + 1}.`,
      provisional_population_or_stage: "Population or stage provisionally described.",
      provisional_outcome_and_horizon: "Reported outcome and horizon provisionally described.",
      summary_basis: "gemini_public_search_or_video_context_not_transcript_verified_by_askrigor",
      why_surfaced: "May add nonredundant vocabulary for formal and community investigation."
    })),
    suggested_seed_video_ids: [VIDEO_IDS[0], VIDEO_IDS[1]],
    search_gaps: ["One queried program lacked an independent firsthand candidate."],
    disclosures: [
      "comments_not_retrieved",
      "provider_metadata_not_validated_by_gemini",
      "creator_claims_not_validated",
      "not_medical_advice"
    ]
  };
}

function interactionResponse(
  output = JSON.stringify(packet()),
  steps: Record<string, unknown>[] = [
    {
      type: "google_search_call",
      arguments: { queries: packet().discovery_queries.map(({ query }) => query) }
    },
    { type: "google_search_result", results: [] },
    { type: "model_output", content: [{ type: "text", text: output }] }
  ]
): Response {
  return new Response(JSON.stringify({
    id: "interaction-fixture-1",
    status: "completed",
    model: CONFIG.model,
    steps,
    usage: {
      total_input_tokens: 1_000,
      total_output_tokens: 2_000,
      total_thought_tokens: 500,
      grounding_tool_count: [{ type: "google_search", count: 8 }]
    }
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("Gemini YouTube scout adapter", () => {
  it("requests Google-grounded structured output without putting the key in the URL or body", async () => {
    const fetchMock = vi.fn(async () => interactionResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("complete");
    expect(result.data).toMatchObject({
      response_id: "interaction-fixture-1",
      google_search_grounded: true,
      provider_storage_disabled: true,
      usage: {
        total_input_tokens: 1_000,
        total_output_tokens: 2_000,
        total_thought_tokens: 500,
        google_search_queries: 8
      },
      packet: { packet_version: "2.0" }
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(String(url)).not.toContain(CONFIG.apiKey);
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(JSON.stringify(request)).not.toContain(CONFIG.apiKey);
    expect(request).toMatchObject({
      model: CONFIG.model,
      store: false,
      tools: [{ type: "google_search" }],
      generation_config: {
        max_output_tokens: 12_000,
        thinking_level: "low"
      },
      response_format: {
        type: "text",
        mime_type: "application/json"
      }
    });
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(CONFIG.apiKey);
    const schemaText = JSON.stringify(
      (request.response_format as Record<string, unknown>).schema
    );
    expect(schemaText).not.toContain('"const"');
    expect(schemaText).not.toContain('"$schema"');
    expect(schemaText).toContain('"packet_version"');
  });

  it("rejects missing configuration before any provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(scoutGeminiYoutubeCandidates(INPUT, {
      ...CONFIG,
      apiKey: ""
    })).rejects.toThrow("Invalid Gemini YouTube scout configuration");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an ungrounded provider response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => interactionResponse(
      JSON.stringify(packet()),
      [{ type: "model_output", text: JSON.stringify(packet()) }]
    )));

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("error");
    expect(result.error?.code).toBe("gemini_youtube_scout_ungrounded");
    expect(result.data).toEqual({});
  });

  it("rejects a packet whose declared searches do not match executed Google queries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => interactionResponse(
      JSON.stringify(packet()),
      [
        {
          type: "google_search_call",
          arguments: {
            queries: Array.from({ length: 8 }, (_, index) => `different query ${index}`)
          }
        },
        { type: "google_search_result", result: [] },
        { type: "model_output", content: [{ type: "text", text: JSON.stringify(packet()) }] }
      ]
    )));

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("error");
    expect(result.error?.code).toBe("gemini_youtube_scout_query_receipt_mismatch");
    expect(result.data).toEqual({});
  });

  it("requires the current generic summary basis on new automated packets", async () => {
    const stalePacket = packet();
    for (const candidate of stalePacket.candidates) {
      if ("summary_basis" in candidate) {
        candidate.summary_basis =
          "spark_public_video_context_not_transcript_verified_by_askrigor";
      }
    }
    vi.stubGlobal("fetch", vi.fn(async () => interactionResponse(
      JSON.stringify(stalePacket)
    )));

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("error");
    expect(result.error?.code).toBe("gemini_youtube_scout_invalid_packet");
    expect(result.data).toEqual({});
  });

  it("rejects invalid candidate packets without exposing raw output", async () => {
    const raw = '{"private_provider_detail":"do-not-return"}';
    vi.stubGlobal("fetch", vi.fn(async () => interactionResponse(raw)));

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("error");
    expect(result.error?.code).toBe("gemini_youtube_scout_invalid_packet");
    expect(JSON.stringify(result)).not.toContain("private_provider_detail");
  });

  it("maps rate limits without returning provider body details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: {
        reason: "private-quota-detail",
        message: "private provider message"
      }
    }), { status: 429 })));

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("rate_limited");
    expect(result.error).toMatchObject({
      code: "gemini_youtube_scout_rate_limited",
      http_status: 429,
      retryable: true
    });
    expect(JSON.stringify(result)).not.toContain("private-quota-detail");
    expect(JSON.stringify(result)).not.toContain("private provider message");
  });
});
