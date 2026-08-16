import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  advanceYoutubeAuditState,
  createYoutubeAuditIdentifierMembership,
  decodeYoutubeAuditContinuation,
  encodeYoutubeAuditContinuation,
  YoutubeAuditContinuationError,
  YoutubeAuditRestartRequiredError,
  type YoutubeVideoAuditContinuationState
} from "../apps/research-mcp/src/youtube-audit-continuation.js";
import type { YoutubeComment } from "@askrigor/sources";

const NOW = 1_786_579_200_000;
const SECRET = "s".repeat(32);
const STATE: YoutubeVideoAuditContinuationState = {
  version: 1,
  video_id: "XpZHKGGCK-o",
  analysis_limit: 500,
  started_at_ms: NOW,
  expires_at_ms: NOW + 3_600_000,
  segment_index: 1,
  cursor: { thread_offset: 1, top_level_emitted: false },
  provider_reported_comments: "399",
  top_level_comments_retrieved: 1,
  replies_retrieved: 0,
  comment_thread_pages: 1,
  reply_pages: 0,
  pagination_overlaps_reconciled: 0,
  records_retrieved_cumulative: 1,
  rolling_sha256: "a".repeat(64),
  sample_identifiers: ["UgxTop00000000000000001"],
  seen_identifier_membership: createYoutubeAuditIdentifierMembership([
    "UgxTop00000000000000001"
  ]),
  reply_count_mismatches: []
};

const comment = (id: string, text = `comment ${id}`): YoutubeComment => ({
  video_id: "XpZHKGGCK-o",
  comment_id: id,
  parent_id: null,
  top_level_comment_id: id,
  is_reply: false,
  author_channel_id: `channel-${id}`,
  author_display_name: `author-${id}`,
  text,
  like_count: 0,
  published_at: "2025-02-01T11:00:00Z",
  updated_at: "2025-02-01T11:00:00Z"
});

describe("YouTube audit continuation tokens", () => {
  it("authenticates minimized continuation state without comment text", () => {
    const token = encodeYoutubeAuditContinuation(STATE, SECRET);

    expect(decodeYoutubeAuditContinuation(token, SECRET, STATE.started_at_ms + 1))
      .toEqual(STATE);
    const payload = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8");
    expect(payload).not.toContain("my hip stopped hurting");
    expect(payload).not.toContain("author_display_name");
    expect(payload).not.toContain(SECRET);
  });

  it("authenticates bounded adjacent-page fingerprints and the cumulative overlap boundary", () => {
    const stateWithOverlap = {
      ...STATE,
      pagination_overlaps_reconciled: 2,
      cursor: {
        previous_top_level_page_sha256: ["b".repeat(43)],
        thread_offset: 0,
        top_level_emitted: true,
        reply_page_token: "reply-page-2",
        previous_reply_page_sha256: ["c".repeat(43)],
        current_parent_id: "UgxTop00000000000000001",
        current_expected_replies: 3,
        current_replies_retrieved: 2
      }
    } as YoutubeVideoAuditContinuationState;

    const token = encodeYoutubeAuditContinuation(stateWithOverlap, SECRET);

    expect(decodeYoutubeAuditContinuation(token, SECRET, NOW)).toEqual(stateWithOverlap);
    const payload = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8");
    expect(payload).not.toContain("top-overlap");
    expect(payload).not.toContain("reply-overlap");
  });

  it("decodes one-hour legacy object-shaped identifier tokens during migration", () => {
    const legacyPayload = Buffer.from(JSON.stringify({
      ...STATE,
      seen_identifier_membership: undefined,
      sample_identifiers: STATE.sample_identifiers.map((comment_id) => ({ comment_id }))
    }), "utf8").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(legacyPayload).digest("base64url");

    expect(decodeYoutubeAuditContinuation(
      `${legacyPayload}.${signature}`,
      SECRET,
      NOW
    )).toEqual(STATE);
  });

  it("requires an explicit restart for a signed legacy corpus whose exact sample was bounded", () => {
    const identifiers = Array.from(
      { length: 500 },
      (_, index) => `legacy-${String(index).padStart(4, "0")}`
    );
    const legacyPayload = Buffer.from(JSON.stringify({
      ...STATE,
      segment_index: 6,
      top_level_comments_retrieved: 501,
      comment_thread_pages: 26,
      records_retrieved_cumulative: 501,
      sample_identifiers: identifiers.map((comment_id) => ({ comment_id })),
      seen_identifier_membership: undefined
    }), "utf8").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(legacyPayload).digest("base64url");

    try {
      decodeYoutubeAuditContinuation(`${legacyPayload}.${signature}`, SECRET, NOW);
      throw new Error("Expected the legacy continuation to require a restart");
    } catch (error) {
      expect(error).toBeInstanceOf(YoutubeAuditRestartRequiredError);
      expect(error).toMatchObject({
        code: "youtube_video_audit_continuation_migration_restart_required",
        snapshot: {
          video_id: "XpZHKGGCK-o",
          segment_index: 6,
          records_retrieved_cumulative: 501,
          comment_thread_pages: 26
        }
      });
    }
  });

  it("enforces expiry before classifying a signed legacy corpus migration", () => {
    const identifiers = Array.from(
      { length: 500 },
      (_, index) => `expired-legacy-${String(index).padStart(4, "0")}`
    );
    const legacyPayload = Buffer.from(JSON.stringify({
      ...STATE,
      started_at_ms: NOW - 3_600_001,
      expires_at_ms: NOW - 1,
      segment_index: 6,
      top_level_comments_retrieved: 501,
      comment_thread_pages: 26,
      records_retrieved_cumulative: 501,
      sample_identifiers: identifiers.map((comment_id) => ({ comment_id })),
      seen_identifier_membership: undefined
    }), "utf8").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(legacyPayload).digest("base64url");

    try {
      decodeYoutubeAuditContinuation(`${legacyPayload}.${signature}`, SECRET, NOW);
      throw new Error("Expected the legacy continuation to be expired");
    } catch (error) {
      expect(error).toBeInstanceOf(YoutubeAuditContinuationError);
      expect(error).toMatchObject({
        code: "youtube_video_audit_continuation_expired"
      });
      expect(error).not.toBeInstanceOf(YoutubeAuditRestartRequiredError);
      expect(error).not.toHaveProperty("snapshot");
    }
  });

  it("rejects changed signatures, changed payloads, wrong secrets, and expiry", () => {
    const token = encodeYoutubeAuditContinuation(STATE, SECRET);
    const [payload, signature] = token.split(".") as [string, string];
    const changedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;
    const changedSignature = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    expect(() => decodeYoutubeAuditContinuation(`${payload}.${changedSignature}`, SECRET, NOW))
      .toThrow(/invalid/i);
    expect(() => decodeYoutubeAuditContinuation(`${changedPayload}.${signature}`, SECRET, NOW))
      .toThrow(/invalid/i);
    expect(() => decodeYoutubeAuditContinuation(token, "w".repeat(32), NOW))
      .toThrow(/invalid/i);
    expect(() => decodeYoutubeAuditContinuation(token, SECRET, STATE.expires_at_ms))
      .toThrow(/expired/i);
  });

  it("rejects short secrets, invalid versions, oversized tokens, and oversized samples", () => {
    expect(() => encodeYoutubeAuditContinuation(STATE, "short"))
      .toThrow(/32/);
    expect(() => encodeYoutubeAuditContinuation({ ...STATE, version: 2 } as never, SECRET))
      .toThrow(/state/i);
    expect(() => decodeYoutubeAuditContinuation("a".repeat(65_537), SECRET, NOW))
      .toThrow(/large/i);
    expect(() => encodeYoutubeAuditContinuation({
      ...STATE,
      sample_identifiers: Array.from(
        { length: 501 },
        (_, index) => `Ugx${index}`
      )
    }, SECRET)).toThrow(/state/i);
  });

  it("rejects overlong, duplicate, and structurally misplaced page fingerprints", () => {
    const fingerprint = (index: number) =>
      createHash("sha256").update(String(index)).digest("base64url");
    expect(() => encodeYoutubeAuditContinuation({
      ...STATE,
      cursor: {
        ...STATE.cursor,
        previous_top_level_page_sha256: Array.from(
          { length: 21 },
          (_, index) => fingerprint(index)
        )
      }
    }, SECRET)).toThrow(/state/i);
    expect(() => encodeYoutubeAuditContinuation({
      ...STATE,
      cursor: {
        ...STATE.cursor,
        previous_top_level_page_sha256: [fingerprint(0), fingerprint(0)]
      }
    }, SECRET)).toThrow(/state/i);
    expect(() => encodeYoutubeAuditContinuation({
      ...STATE,
      cursor: {
        ...STATE.cursor,
        previous_reply_page_sha256: [fingerprint(0)]
      }
    }, SECRET)).toThrow(/state/i);
  });

  it("rejects a signed membership filter that omits a retained sample identifier", () => {
    expect(() => encodeYoutubeAuditContinuation({
      ...STATE,
      seen_identifier_membership: createYoutubeAuditIdentifierMembership([])
    }, SECRET)).toThrow(/state/i);
  });

  it("keeps the worst-case supported continuation below the public token limit", () => {
    const identifier = (prefix: string, index: number) =>
      `${prefix}${String(index).padStart(4, "0")}`.padEnd(64, "x");
    const fingerprint = (prefix: string, index: number) =>
      createHash("sha256").update(`${prefix}-${index}`).digest("base64url");
    const worstCaseIdentifiers = Array.from(
      { length: 500 },
      (_, index) => identifier("comment", index)
    );
    const worstCase: YoutubeVideoAuditContinuationState = {
      ...STATE,
      cursor: {
        top_level_page_token: "t".repeat(1_024),
        page_fingerprint: "f".repeat(64),
        previous_top_level_page_sha256: Array.from(
          { length: 20 },
          (_, index) => fingerprint("top", index)
        ),
        thread_offset: Number.MAX_SAFE_INTEGER,
        top_level_emitted: true,
        reply_page_token: "r".repeat(1_024),
        previous_reply_page_sha256: Array.from(
          { length: 100 },
          (_, index) => fingerprint("reply", index)
        ),
        current_parent_id: identifier("parent", 0),
        current_expected_replies: Number.MAX_SAFE_INTEGER,
        current_replies_retrieved: Number.MAX_SAFE_INTEGER
      },
      provider_reported_comments: "9".repeat(64),
      top_level_comments_retrieved: 500,
      replies_retrieved: 0,
      records_retrieved_cumulative: 500,
      sample_identifiers: worstCaseIdentifiers,
      seen_identifier_membership:
        createYoutubeAuditIdentifierMembership(worstCaseIdentifiers),
      reply_count_mismatches: Array.from(
        { length: 16 },
        (_, index) => ({
          parent_comment_id: identifier("mismatch", index),
          expected: Number.MAX_SAFE_INTEGER,
          retrieved: Number.MAX_SAFE_INTEGER
        })
      )
    };

    const token = encodeYoutubeAuditContinuation(worstCase, SECRET);

    expect(token.length).toBeLessThanOrEqual(64_000);
    expect(token.length).toBeLessThanOrEqual(65_536);
    expect(decodeYoutubeAuditContinuation(token, SECRET, NOW)).toEqual(worstCase);
  });

  it("advances counters, rolling digest, and a deterministic bottom-k identifier sample", () => {
    const base = {
      ...STATE,
      analysis_limit: 2,
      segment_index: 0,
      top_level_comments_retrieved: 0,
      replies_retrieved: 0,
      comment_thread_pages: 0,
      reply_pages: 0,
      records_retrieved_cumulative: 0,
      rolling_sha256: "0".repeat(64),
      sample_identifiers: [],
      seen_identifier_membership: createYoutubeAuditIdentifierMembership([])
    };
    const { cursor: _cursor, ...withoutCursor } = base;
    const comments = [comment("UgxC", "my hip stopped hurting"), comment("UgxA"), comment("UgxB")];

    const advanced = advanceYoutubeAuditState(
      withoutCursor,
      comments,
      {
        top_level_comments_retrieved: 3,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 0,
        reply_count_mismatches: []
      },
      { thread_offset: 3, top_level_emitted: false }
    );

    const expectedIds = comments
      .map(({ comment_id }) => comment_id)
      .sort((left, right) =>
        createHash("sha256").update(left).digest("hex")
          .localeCompare(createHash("sha256").update(right).digest("hex")) ||
        left.localeCompare(right)
      );
    expect(advanced).toMatchObject({
      segment_index: 1,
      top_level_comments_retrieved: 3,
      replies_retrieved: 0,
      comment_thread_pages: 1,
      reply_pages: 0,
      records_retrieved_cumulative: 3,
      cursor: { thread_offset: 3, top_level_emitted: false },
      sample_identifiers: expectedIds
    });
    expect(advanced.rolling_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(advanced.rolling_sha256).not.toBe(base.rolling_sha256);

    const token = encodeYoutubeAuditContinuation(advanced, SECRET);
    const payload = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8");
    expect(payload).not.toContain("my hip stopped hurting");
    expect(payload).not.toContain("author-UgxC");
  });

  it("retains provider-valid dotted reply identifiers in continuation state", () => {
    const empty = {
      ...STATE,
      segment_index: 0,
      top_level_comments_retrieved: 0,
      replies_retrieved: 0,
      comment_thread_pages: 0,
      reply_pages: 0,
      records_retrieved_cumulative: 0,
      rolling_sha256: "0".repeat(64),
      sample_identifiers: [],
      seen_identifier_membership: createYoutubeAuditIdentifierMembership([])
    };
    const { cursor: _cursor, ...withoutCursor } = empty;
    const reply = {
      ...comment("UgxReply.replyPart"),
      parent_id: "UgxTop",
      top_level_comment_id: "UgxTop",
      is_reply: true
    };

    const advanced = advanceYoutubeAuditState(
      withoutCursor,
      [reply],
      {
        top_level_comments_retrieved: 0,
        replies_retrieved: 1,
        comment_thread_pages: 1,
        reply_pages: 1,
        reply_count_mismatches: []
      },
      { thread_offset: 1, top_level_emitted: false }
    );

    expect(advanced.sample_identifiers).toEqual(["UgxReply.replyPart"]);
    expect(decodeYoutubeAuditContinuation(
      encodeYoutubeAuditContinuation(advanced, SECRET),
      SECRET,
      NOW
    )).toEqual(advanced);
  });

  it("reconciles exact duplicate record IDs within or across continuation segments", () => {
    const empty = {
      ...STATE,
      segment_index: 0,
      top_level_comments_retrieved: 0,
      replies_retrieved: 0,
      comment_thread_pages: 0,
      reply_pages: 0,
      records_retrieved_cumulative: 0,
      rolling_sha256: "0".repeat(64),
      sample_identifiers: [],
      seen_identifier_membership: createYoutubeAuditIdentifierMembership([])
    };
    const { cursor: _emptyCursor, ...emptyWithoutCursor } = empty;
    const withinSegment = advanceYoutubeAuditState(
      emptyWithoutCursor,
      [comment("UgxDuplicate"), comment("UgxDuplicate")],
      {
        top_level_comments_retrieved: 2,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 0,
        reply_count_mismatches: []
      },
      { thread_offset: 2, top_level_emitted: false }
    );
    expect(withinSegment).toMatchObject({
      top_level_comments_retrieved: 1,
      records_retrieved_cumulative: 1,
      pagination_overlaps_reconciled: 1,
      sample_identifiers: ["UgxDuplicate"]
    });

    const { cursor: _stateCursor, ...stateWithoutCursor } = STATE;
    const acrossSegments = advanceYoutubeAuditState(
      stateWithoutCursor,
      [comment("UgxTop00000000000000001")],
      {
        top_level_comments_retrieved: 1,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 0,
        reply_count_mismatches: []
      },
      { thread_offset: 2, top_level_emitted: false }
    );
    expect(acrossSegments).toMatchObject({
      segment_index: 2,
      top_level_comments_retrieved: 1,
      records_retrieved_cumulative: 1,
      pagination_overlaps_reconciled: 1,
      rolling_sha256: STATE.rolling_sha256,
      sample_identifiers: STATE.sample_identifiers
    });
  });

  it("fails closed on a non-adjacent duplicate omitted from a corpus sample over 500", () => {
    const empty = {
      ...STATE,
      segment_index: 0,
      top_level_comments_retrieved: 0,
      replies_retrieved: 0,
      comment_thread_pages: 0,
      reply_pages: 0,
      records_retrieved_cumulative: 0,
      rolling_sha256: "0".repeat(64),
      sample_identifiers: [],
      seen_identifier_membership: createYoutubeAuditIdentifierMembership([])
    };
    const { cursor: _emptyCursor, ...emptyWithoutCursor } = empty;
    const corpus = Array.from({ length: 501 }, (_, index) =>
      comment(`corpus-${String(index).padStart(4, "0")}`)
    );
    const first = advanceYoutubeAuditState(
      emptyWithoutCursor,
      corpus,
      {
        top_level_comments_retrieved: corpus.length,
        replies_retrieved: 0,
        comment_thread_pages: 26,
        reply_pages: 0,
        reply_count_mismatches: []
      },
      { thread_offset: 1, top_level_emitted: false }
    );
    const omitted = corpus.find(({ comment_id }) =>
      !first.sample_identifiers.includes(comment_id)
    );
    expect(omitted).toBeDefined();
    const { cursor: _firstCursor, ...firstWithoutCursor } = first;

    try {
      advanceYoutubeAuditState(
        firstWithoutCursor,
        [omitted!],
        {
          top_level_comments_retrieved: 1,
          replies_retrieved: 0,
          comment_thread_pages: 1,
          reply_pages: 0,
          reply_count_mismatches: []
        },
        { thread_offset: 2, top_level_emitted: false }
      );
      throw new Error("Expected the possible duplicate to require a restart");
    } catch (error) {
      expect(error).toBeInstanceOf(YoutubeAuditRestartRequiredError);
      expect(error).toMatchObject({
        code: "youtube_video_audit_identifier_membership_restart_required",
        snapshot: {
          video_id: "XpZHKGGCK-o",
          segment_index: 1,
          records_retrieved_cumulative: 501,
          comment_thread_pages: 26
        }
      });
    }
  });

  it("allows a resumable cursor to exceed a stale provider reply count", () => {
    expect(() => encodeYoutubeAuditContinuation({
      ...STATE,
      cursor: {
        thread_offset: 0,
        top_level_emitted: true,
        reply_page_token: "next-reply-page",
        current_parent_id: "UgxTop00000000000000001",
        current_expected_replies: 1,
        current_replies_retrieved: 2
      }
    }, SECRET)).not.toThrow();
  });

  it("uses a canonical signature over the encoded payload", () => {
    const token = encodeYoutubeAuditContinuation(STATE, SECRET);
    const [payload, signature] = token.split(".") as [string, string];
    expect(signature).toBe(createHmac("sha256", SECRET).update(payload).digest("base64url"));
  });
});
