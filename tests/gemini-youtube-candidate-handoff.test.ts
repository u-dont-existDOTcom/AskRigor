import { describe, expect, it, vi } from "vitest";

import {
  GeminiYoutubeCandidateHandoffError,
  MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES,
  parseGeminiYoutubeCandidateHandoff,
  validateGeminiYoutubeCandidateHandoff,
  type GeminiYoutubeCandidatePacket,
  type YoutubeVideo
} from "../packages/sources/src/index.js";
import type { ProvenanceEnvelope } from "../packages/contracts/src/index.js";

const VIDEO_IDS = ["XpZHKGGCK-o", "0sZEvvPWq88", "qfPjRBqADKk"] as const;
const TITLES = ["First outcome video", "Injection comparison", "Loading guide"] as const;
const CHANNELS = ["Independent runner", "Recorded clinician", "Recorded physio"] as const;
const YOUTUBE = { apiKey: "fixture-youtube-key" };

function packet(): GeminiYoutubeCandidatePacket {
  return {
    packet_name: "gemini_youtube_candidate_handoff",
    packet_version: "1.0",
    research_target: "how can I fix my bad hip",
    diagnosis_status: "diagnosis_not_specified",
    discovery_queries: [
      { purpose: "firsthand_outcome", query: '"hip pain" "what worked for me"' },
      { purpose: "radical_outcome", query: '"growing my hip back"' },
      { purpose: "overlooked_intervention", query: '"hip pain" nightshades' },
      { purpose: "overlooked_intervention", query: '"hip pain" progressive loading' },
      { purpose: "conventional_benefit", query: '"hip injection" relief experience' },
      { purpose: "conventional_negative", query: '"hip injection" failed OR flare' }
    ],
    candidates: VIDEO_IDS.map((videoId, index) => ({
      video_id: videoId,
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      title: TITLES[index]!,
      channel: CHANNELS[index]!,
      target_distance: index === 0 ? "exact" : "adjacent",
      provisional_intervention_family: index === 0
        ? "nutrition_or_elimination"
        : index === 1
          ? "regenerative_or_biologic"
          : "local_mechanical",
      creator_claim_summary: `The creator reports candidate ${index + 1} as a personal or clinical approach.`,
      why_surfaced: `Candidate ${index + 1} may expose decision-useful implementation vocabulary.`
    })),
    suggested_seed_video_ids: [VIDEO_IDS[0], VIDEO_IDS[1]],
    search_gaps: ["No exact independent account of one queried topical approach was surfaced."],
    disclosures: [
      "comments_not_retrieved",
      "provider_metadata_not_validated_by_gemini",
      "creator_claims_not_validated",
      "not_medical_advice"
    ]
  };
}

function response(value: GeminiYoutubeCandidatePacket = packet()): string {
  return [
    "Scout contract: youtube-candidate-handoff-v1",
    "",
    "Mode: candidate_discovery",
    "",
    "## AskRigor candidate handoff",
    "",
    "```json",
    JSON.stringify(value, null, 2),
    "```"
  ].join("\n");
}

function videoEnvelope(
  videoId: string,
  options: {
    title?: string;
    channel?: string;
    channelId?: string;
    commentCount?: string;
    omitCommentCount?: boolean;
    privacyStatus?: "public" | "private" | "unlisted";
  } = {}
): ProvenanceEnvelope<YoutubeVideo> {
  const index = VIDEO_IDS.indexOf(videoId as typeof VIDEO_IDS[number]);
  const title = options.title ?? TITLES[index]!;
  const channel = options.channel ?? CHANNELS[index]!;
  const channelId = options.channelId ?? `UC${"0".repeat(21)}${index}`;
  return {
    provider: "youtube",
    record_type: "youtube_video",
    primary_identifier: videoId,
    retrieved_at: "2026-08-21T03:00:00.000Z",
    source_identity: {
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      title
    },
    pagination: { returned: 1, exhausted: true },
    access_status: "api_visible_complete",
    limitations: [],
    data: {
      video_id: videoId,
      title,
      channel_id: channelId,
      channel_title: channel,
      privacy_status: options.privacyStatus ?? "public",
      statistics: {
        view_count: "100",
        like_count: "10",
        ...(options.omitCommentCount ? {} : { comment_count: options.commentCount ?? "5" })
      }
    }
  };
}

describe("Gemini YouTube candidate handoff", () => {
  it("parses only the exact framed strict packet", () => {
    const parsed = parseGeminiYoutubeCandidateHandoff(response().replace(/\n/gu, "\r\n"));

    expect(parsed.packet_name).toBe("gemini_youtube_candidate_handoff");
    expect(parsed.candidates.map(({ video_id }) => video_id)).toEqual(VIDEO_IDS);
    expect(parsed.discovery_queries.map(({ purpose }) => purpose)).toContain("radical_outcome");
  });

  it("rejects extra prose, malformed JSON, unexpected fields, and bad canonical links", () => {
    const extraField = { ...packet(), invented_status: "available" };
    const badLink = packet();
    badLink.candidates[0]!.canonical_url = "https://youtu.be/XpZHKGGCK-o";

    for (const [input, code] of [
      [`preface\n${response()}`, "invalid_framing"],
      [`${response()}\ntrailing prose`, "invalid_framing"],
      [response().replace('"packet_name"', '"packet_name" broken'), "invalid_json"],
      [response(extraField as GeminiYoutubeCandidatePacket), "invalid_packet"],
      [response(badLink), "invalid_packet"]
    ] as const) {
      expect(() => parseGeminiYoutubeCandidateHandoff(input)).toThrowError(
        expect.objectContaining({ code })
      );
    }
  });

  it("reports exact schema issue paths for duplicate queries and out-of-packet seeds", () => {
    const value = packet();
    value.discovery_queries[1]!.query = value.discovery_queries[0]!.query;
    value.suggested_seed_video_ids[1] = "abcdefghijk";

    try {
      parseGeminiYoutubeCandidateHandoff(response(value));
      throw new Error("expected packet rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiYoutubeCandidateHandoffError);
      expect(error).toMatchObject({ code: "invalid_packet" });
      const issues = (error as GeminiYoutubeCandidateHandoffError).issues;
      expect(issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "discovery_queries.1" }),
        expect.objectContaining({ path: "suggested_seed_video_ids.1" })
      ]));
    }
  });

  it("bounds the complete untrusted response before JSON parsing", () => {
    expect(() => parseGeminiYoutubeCandidateHandoff(
      "x".repeat(MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES + 1)
    )).toThrowError(expect.objectContaining({
      code: "invalid_framing",
      issues: [expect.objectContaining({ message: expect.stringContaining("32768 UTF-8 bytes") })]
    }));
  });

  it("fails structurally before making provider calls", async () => {
    const getVideo = vi.fn();
    const value = packet();
    value.candidates.push(value.candidates[0]!);

    await expect(validateGeminiYoutubeCandidateHandoff(
      response(value),
      YOUTUBE,
      { get_video: getVideo }
    )).rejects.toMatchObject({ code: "invalid_packet" });
    expect(getVideo).not.toHaveBeenCalled();
  });

  it("independently validates every identity and returns provider metadata", async () => {
    const getVideo = vi.fn(async (videoId: string) => videoEnvelope(videoId));

    const receipt = await validateGeminiYoutubeCandidateHandoff(
      response(),
      YOUTUBE,
      { get_video: getVideo }
    );

    expect(getVideo).toHaveBeenCalledTimes(3);
    expect(receipt).toMatchObject({
      status: "accepted",
      rejected_candidates: [],
      suggested_seed_receipts: [
        { video_id: VIDEO_IDS[0], disposition: "eligible", reasons: [] },
        { video_id: VIDEO_IDS[1], disposition: "eligible", reasons: [] }
      ],
      eligible_seed_video_ids: [VIDEO_IDS[0], VIDEO_IDS[1]]
    });
    expect(receipt.validated_candidates).toHaveLength(3);
    expect(receipt.validated_candidates[0]).toMatchObject({
      video_id: VIDEO_IDS[0],
      metadata_access_status: "api_visible_complete",
      provider_metadata: {
        title: TITLES[0],
        channel_title: CHANNELS[0],
        statistics: { comment_count: "5" }
      },
      gemini_provisional_annotations: {
        intervention_family: "nutrition_or_elimination"
      }
    });
    expect(receipt.access_boundaries).toContain(
      "No YouTube comments or transcripts were retrieved by this validation."
    );
  });

  it("rejects mismatched declarations without discarding valid candidates", async () => {
    const getVideo = vi.fn(async (videoId: string) => videoEnvelope(
      videoId,
      videoId === VIDEO_IDS[0] ? { title: "Different provider title" } : {}
    ));

    const receipt = await validateGeminiYoutubeCandidateHandoff(
      response(),
      YOUTUBE,
      { get_video: getVideo }
    );

    expect(receipt.status).toBe("partial");
    expect(receipt.validated_candidates).toHaveLength(2);
    expect(receipt.rejected_candidates).toEqual([
      expect.objectContaining({
        video_id: VIDEO_IDS[0],
        rejection_reasons: ["declared_title_mismatch"],
        provider_title: "Different provider title"
      })
    ]);
    expect(receipt.suggested_seed_receipts[0]).toEqual({
      video_id: VIDEO_IDS[0],
      disposition: "rejected",
      reasons: ["candidate_rejected"]
    });
  });

  it("keeps comment-count and creator-diversity limits mechanical and explicit", async () => {
    const value = packet();
    value.suggested_seed_video_ids.push(VIDEO_IDS[2]);
    const sharedChannel = `UC${"7".repeat(22)}`;
    const getVideo = vi.fn(async (videoId: string) => {
      if (videoId === VIDEO_IDS[0]) return videoEnvelope(videoId, { channelId: sharedChannel });
      if (videoId === VIDEO_IDS[1]) return videoEnvelope(videoId, { channelId: sharedChannel });
      return videoEnvelope(videoId, { commentCount: "00" });
    });

    const receipt = await validateGeminiYoutubeCandidateHandoff(
      response(value),
      YOUTUBE,
      { get_video: getVideo }
    );

    expect(receipt.status).toBe("partial");
    expect(receipt.suggested_seed_receipts).toEqual([
      { video_id: VIDEO_IDS[0], disposition: "eligible", reasons: [] },
      {
        video_id: VIDEO_IDS[1],
        disposition: "ineligible",
        reasons: ["duplicate_suggested_channel"]
      },
      {
        video_id: VIDEO_IDS[2],
        disposition: "ineligible",
        reasons: ["comment_count_zero"]
      }
    ]);
    expect(receipt.eligible_seed_video_ids).toEqual([VIDEO_IDS[0]]);
  });

  it("does not upgrade nonpublic or unreported-comment seeds", async () => {
    const getVideo = vi.fn(async (videoId: string) => {
      if (videoId === VIDEO_IDS[0]) return videoEnvelope(videoId, { privacyStatus: "unlisted" });
      if (videoId === VIDEO_IDS[1]) return videoEnvelope(videoId, { omitCommentCount: true });
      return videoEnvelope(videoId);
    });

    const receipt = await validateGeminiYoutubeCandidateHandoff(
      response(),
      YOUTUBE,
      { get_video: getVideo }
    );

    expect(receipt.status).toBe("partial");
    expect(receipt.suggested_seed_receipts).toEqual([
      {
        video_id: VIDEO_IDS[0],
        disposition: "ineligible",
        reasons: ["privacy_not_public"]
      },
      {
        video_id: VIDEO_IDS[1],
        disposition: "ineligible",
        reasons: ["comment_count_not_reported"]
      }
    ]);
    expect(receipt.eligible_seed_video_ids).toEqual([]);
  });

  it("preserves provider access failures without leaking a false validation", async () => {
    const getVideo = vi.fn(async (videoId: string) => videoId === VIDEO_IDS[0]
      ? {
          provider: "youtube",
          record_type: "youtube_video",
          primary_identifier: videoId,
          retrieved_at: "2026-08-21T03:00:00.000Z",
          source_identity: {},
          pagination: { returned: 0, exhausted: true },
          access_status: "inaccessible" as const,
          limitations: ["Provider did not expose the video."],
          error: { code: "youtube_video_not_visible", message: "Video not visible" },
          data: {} as YoutubeVideo
        }
      : videoEnvelope(videoId));

    const receipt = await validateGeminiYoutubeCandidateHandoff(
      response(),
      YOUTUBE,
      { get_video: getVideo }
    );

    expect(receipt.status).toBe("partial");
    expect(receipt.rejected_candidates[0]).toMatchObject({
      video_id: VIDEO_IDS[0],
      metadata_access_status: "inaccessible",
      provider_error_code: "youtube_video_not_visible",
      rejection_reasons: expect.arrayContaining(["metadata_not_api_visible_complete"]),
      limitations: ["Provider did not expose the video."]
    });
  });
});
