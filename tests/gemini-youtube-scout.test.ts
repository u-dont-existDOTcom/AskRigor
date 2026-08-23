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

function compactPacketValue(value = packet()) {
  if (value.packet_version !== "2.0") throw new Error("fixture requires packet v2");
  return {
    packet_name: value.packet_name,
    packet_version: value.packet_version,
    research_target: value.research_target,
    diagnosis_status: value.diagnosis_status,
    discovery_query_rows: value.discovery_queries.map(({ purpose, query }) => [
      purpose,
      query
    ]),
    candidate_rows: value.candidates.map((candidate) => [
      candidate.video_id,
      candidate.canonical_url,
      candidate.title,
      candidate.channel,
      candidate.target_distance,
      candidate.provisional_intervention_family,
      candidate.creator_claim_summary,
      candidate.provisional_specific_program,
      candidate.provisional_population_or_stage,
      candidate.provisional_outcome_and_horizon,
      candidate.summary_basis,
      candidate.why_surfaced
    ]),
    suggested_seed_video_ids: value.suggested_seed_video_ids,
    search_gaps: value.search_gaps,
    disclosures: value.disclosures
  };
}

function compactPacket(value = packet()): string {
  return JSON.stringify(compactPacketValue(value));
}

function interactionResponse(
  output = compactPacket(),
  steps: Record<string, unknown>[] = [
    {
      type: "google_search_call",
      arguments: { queries: packet().discovery_queries.map(({ query }) => query) }
    },
    { type: "google_search_result", results: [] },
    { type: "model_output", content: [{ type: "text", text: output }] }
  ],
  includeId = true
): Response {
  return new Response(JSON.stringify({
    ...(includeId ? { id: "interaction-fixture-1" } : {}),
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

function repairInteractionResponse(output = compactPacket()): Response {
  return new Response(JSON.stringify({
    status: "completed",
    model: CONFIG.model,
    steps: [
      { type: "model_output", content: [{ type: "text", text: output }] }
    ],
    usage: {
      total_input_tokens: 100,
      total_output_tokens: 200,
      total_thought_tokens: 50,
      grounding_tool_count: []
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
      correction_attempted: false,
      provider_interaction_count: 1,
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
    const providerSchema = (
      request.response_format as Record<string, unknown>
    ).schema as Record<string, unknown>;
    const schemaText = JSON.stringify(providerSchema);
    expect(schemaText).not.toContain('"const"');
    expect(schemaText).not.toContain('"$schema"');
    expect(schemaText).not.toContain('"minLength"');
    expect(schemaText).not.toContain('"maxLength"');
    expect(schemaText).not.toContain('"pattern"');
    expect(schemaText).not.toContain('"format"');
    expect(schemaText).toContain('"packet_version"');
    expect(providerSchema).toMatchObject({
      properties: {
        discovery_query_rows: {
          type: "array",
          items: { type: "array", items: { type: "string" } }
        },
        candidate_rows: {
          type: "array",
          items: { type: "array", items: { type: "string" } }
        }
      },
      additionalProperties: false
    });
    expect(String(request.input)).toContain("AUTOMATED COMPACT TRANSPORT");
    expect(String(request.input)).toContain("exactly 12 strings");
  });

  it("accepts the stateless live response shape without an interaction id", async () => {
    const fetchMock = vi.fn(async () => interactionResponse(
      compactPacket(),
      undefined,
      false
    ));
    vi.stubGlobal("fetch", fetchMock);

    const first = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);
    const second = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(first.access_status).toBe("complete");
    expect(first.primary_identifier).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(first.data).toMatchObject({
      response_id: first.primary_identifier,
      provider_storage_disabled: true,
      correction_attempted: false,
      provider_interaction_count: 1
    });
    expect(second.primary_identifier).toBe(first.primary_identifier);
    expect(first.primary_identifier).not.toContain("Candidate");
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
      compactPacket(),
      [{ type: "model_output", text: compactPacket() }]
    )));

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("error");
    expect(result.error?.code).toBe("gemini_youtube_scout_ungrounded");
    expect(result.data).toEqual({});
  });

  it("rejects a packet whose declared searches do not match executed Google queries", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(interactionResponse(
        compactPacket(),
        [
          {
            type: "google_search_call",
            arguments: {
              queries: Array.from({ length: 8 }, (_, index) => `different query ${index}`)
            }
          },
          { type: "google_search_result", result: [] },
          { type: "model_output", content: [{ type: "text", text: compactPacket() }] }
        ]
      ))
      .mockResolvedValueOnce(repairInteractionResponse(compactPacket()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("error");
    expect(result.error?.code).toBe("gemini_youtube_scout_query_receipt_mismatch");
    expect(result.data).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("performs one no-search correction and combines provider usage", async () => {
    const invalid = compactPacketValue();
    invalid.candidate_rows[0]!.pop();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(interactionResponse(JSON.stringify(invalid)))
      .mockResolvedValueOnce(repairInteractionResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("complete");
    expect(result.primary_identifier).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.data).toMatchObject({
      usage: {
        total_input_tokens: 1_100,
        total_output_tokens: 2_200,
        total_thought_tokens: 550,
        google_search_queries: 8
      },
      correction_attempted: true,
      provider_interaction_count: 2,
      packet: { packet_version: "2.0" }
    });
    expect(result.raw_metadata).toMatchObject({ correction_attempted: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body)
    ) as Record<string, unknown>;
    expect(repairRequest.tools).toBeUndefined();
    expect(JSON.stringify(repairRequest)).not.toContain(CONFIG.apiKey);
    expect(String(repairRequest.input)).toContain("Safe validation issues");
    expect(String(repairRequest.input)).toContain("Executed Google Search queries");
  });

  it("requires the current generic summary basis on new automated packets", async () => {
    const stalePacket = packet();
    for (const candidate of stalePacket.candidates) {
      if ("summary_basis" in candidate) {
        candidate.summary_basis =
          "spark_public_video_context_not_transcript_verified_by_askrigor";
      }
    }
    const staleOutput = compactPacket(stalePacket);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(interactionResponse(staleOutput))
      .mockResolvedValueOnce(repairInteractionResponse(staleOutput));
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("error");
    expect(result.error?.code).toBe("gemini_youtube_scout_invalid_packet");
    expect(result.data).toEqual({});
  });

  it("rejects invalid candidate packets without exposing raw output", async () => {
    const raw = '{"private_provider_detail":"do-not-return"}';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(interactionResponse(raw))
      .mockResolvedValueOnce(repairInteractionResponse(raw));
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("error");
    expect(result.error?.code).toBe("gemini_youtube_scout_invalid_packet");
    expect(JSON.stringify(result)).not.toContain("private_provider_detail");
  });

  it("keeps the strict packet parser authoritative over the compact provider schema", async () => {
    const incompletePacket = compactPacketValue();
    incompletePacket.candidate_rows[0]![5] = "unsupported_family";
    const invalidOutput = JSON.stringify(incompletePacket);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(interactionResponse(invalidOutput))
      .mockResolvedValueOnce(repairInteractionResponse(invalidOutput));
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoutGeminiYoutubeCandidates(INPUT, CONFIG);

    expect(result.access_status).toBe("error");
    expect(result.error?.code).toBe("gemini_youtube_scout_invalid_packet");
    expect(result.data).toEqual({});
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
