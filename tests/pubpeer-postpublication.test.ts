import { describe, expect, it } from "vitest";

import {
  adaptPubpeerAuthorizedRecord,
  pubpeerAuthorizedRecordSchema,
} from "../packages/sources/src/index.js";

const DOI = "10.5555/pubpeer.study";
const RETRIEVED_AT = "2026-08-24T08:30:00.000Z";

describe("disabled PubPeer authorized-provider adapter", () => {
  it("preserves visible, edited, author-reply, and deleted states without converting labels into truth", () => {
    const result = adaptPubpeerAuthorizedRecord(DOI, response([
      message({ message_id: "m1", text: "A bounded methodological concern." }),
      message({
        message_id: "m2",
        role: "identified_author_reply",
        revision_state: "edited_visible",
        text: "The identified author supplied a clarification.",
        updated_at: "2026-08-24T08:10:00.000Z",
        provider_revision_id: "revision-2",
        classification: { raw_label: "author reply", source: "provider" },
      }),
      message({
        message_id: "m3",
        revision_state: "deleted_or_unavailable",
        text: null,
        classification: { raw_label: null, source: "unavailable" },
      }),
    ]));

    expect(result.error).toBeUndefined();
    expect(result.access_status).toBe("api_visible_complete");
    expect(result.pagination).toMatchObject({ returned: 3, exhausted: true });
    expect(result.data).toMatchObject({
      doi: DOI,
      lookup_status: "records_available",
      provider_reported_total: 3,
      deleted_or_unavailable_message_count: 1,
    });
    const thread = result.data.threads[0]!;
    expect(thread).toMatchObject({
      provider: "pubpeer",
      visible_message_count: 2,
      deleted_or_unavailable_message_count: 1,
      pagination_complete: true,
    });
    expect(thread.messages.map(({ role, revision_state, materiality, audit_status }) => ({
      role,
      revision_state,
      materiality,
      audit_status,
    }))).toEqual([
      {
        role: "comment",
        revision_state: "current_visible",
        materiality: "unknown",
        audit_status: "not_started",
      },
      {
        role: "identified_author_reply",
        revision_state: "edited_visible",
        materiality: "unknown",
        audit_status: "not_started",
      },
      {
        role: "comment",
        revision_state: "deleted_or_unavailable",
        materiality: "unknown",
        audit_status: "bounded",
      },
    ]);
    expect(thread.messages[2]!.bounded_excerpt).toBeNull();
    expect(thread.messages.map(({ classification_provenance }) =>
      classification_provenance.reported_by
    )).toEqual(["provider", "provider", "unavailable"]);
    expect(result.limitations.join(" ")).toContain("not proof of error");
    expect(result.limitations.join(" ")).toContain("deleted or unavailable");
    expect(JSON.stringify(result)).not.toContain("misconduct_confirmed");
  });

  it("keeps exact no-match provider-scoped and incomplete pagination partial", () => {
    const noMatch = adaptPubpeerAuthorizedRecord(DOI, response([], { thread: null }));
    expect(noMatch).toMatchObject({
      access_status: "api_visible_complete",
      data: { lookup_status: "no_match_in_provider", threads: [] },
    });
    expect(noMatch.limitations.join(" ")).toContain("not proof");

    const partial = adaptPubpeerAuthorizedRecord(DOI, response([
      message({ message_id: "m1" }),
    ], {
      exhausted: false,
      total: 3,
      nextCursor: "opaque-next",
    }));
    expect(partial).toMatchObject({
      access_status: "partial",
      pagination: { exhausted: false, next_cursor: "opaque-next" },
      data: { provider_reported_total: 3 },
    });
    expect(partial.limitations.join(" ")).toContain("continuation remains required");

    const threadCountPartial = adaptPubpeerAuthorizedRecord(DOI, response([
      message({ message_id: "m1" }),
    ], {
      total: 1,
      threadTotal: 2,
    }));
    expect(threadCountPartial).toMatchObject({
      access_status: "partial",
      pagination: { exhausted: false },
      data: { threads: [{ pagination_complete: false }] },
    });
  });

  it.each([
    ["unexpected fields", { ...response([]), unexpected: true }],
    ["duplicate message IDs", response([
      message({ message_id: "duplicate" }),
      message({ message_id: "duplicate" }),
    ])],
    ["oversized content", response([
      message({ message_id: "large", text: "x".repeat(4_001) }),
    ])],
    ["oversized links", response([
      message({
        message_id: "many-links",
        links: Array.from({ length: 51 }, (_, index) => `https://example.test/${index}`),
      }),
    ])],
    ["thread count smaller than returned", response([
      message({ message_id: "m1" }),
      message({ message_id: "m2" }),
    ], { threadTotal: 1 })],
    ["visible content missing", response([
      message({ message_id: "missing", text: null }),
    ])],
  ])("rejects malformed authorized records: %s", (_label, raw) => {
    const result = adaptPubpeerAuthorizedRecord(DOI, raw);
    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "pubpeer_authorized_record_malformed", retryable: false },
      data: { lookup_status: "unknown", threads: [] },
    });
    expect(JSON.stringify(result)).not.toContain("x".repeat(100));
  });

  it("rejects exact DOI mismatch and strict contract injection", () => {
    const mismatch = adaptPubpeerAuthorizedRecord(DOI, {
      ...response([]),
      doi: "10.5555/different",
    });
    expect(mismatch.error?.code).toBe("pubpeer_identifier_mismatch");
    expect(pubpeerAuthorizedRecordSchema.safeParse({
      ...response([]),
      complete: true,
      scientific_verdict: "invalid",
    }).success).toBe(false);
  });

  it.each([
    ["rate_limited", "pubpeer_rate_limited", true, 429],
    ["inaccessible", "pubpeer_authentication_denied", false, 401],
    ["not_found", "pubpeer_record_not_found", false, 404],
    ["error", "pubpeer_timeout", true, undefined],
  ] as const)("preserves %s provider failure", (accessStatus, code, retryable, httpStatus) => {
    const result = adaptPubpeerAuthorizedRecord(DOI, failure({
      access_status: accessStatus,
      code,
      retryable,
      http_status: httpStatus,
    }));
    expect(result).toMatchObject({
      access_status: accessStatus,
      error: {
        code,
        retryable,
        ...(httpStatus === undefined ? {} : { http_status: httpStatus }),
      },
      data: { lookup_status: "unknown" },
    });
    expect(result.limitations.join(" ")).toContain("no favorable or unfavorable inference");
  });
});

function response(
  messages: ReturnType<typeof message>[],
  options: {
    thread?: "default" | null;
    exhausted?: boolean;
    total?: number;
    threadTotal?: number;
    nextCursor?: string | null;
  } = {},
) {
  const thread = options.thread === null ? null : {
    thread_id: "thread-1",
    provider_record_id: "publication-1",
    canonical_url: "https://pubpeer.com/publications/ABC123",
    provider_reported_message_count: options.threadTotal ?? options.total ?? messages.length,
    messages,
  };
  return {
    record_kind: "response" as const,
    contract_version: "askrigor.pubpeer-authorized-response.v1" as const,
    retrieved_at: RETRIEVED_AT,
    doi: DOI,
    thread,
    pagination: {
      returned: messages.length,
      provider_reported_total: options.total ?? messages.length,
      page_size: 100,
      next_cursor: options.nextCursor ?? null,
      exhausted: options.exhausted ?? true,
    },
  };
}

function message(overrides: Partial<{
  message_id: string;
  role: "comment" | "identified_author_reply";
  posted_at: string | null;
  updated_at: string | null;
  provider_revision_id: string | null;
  revision_state: "current_visible" | "edited_visible" | "deleted_or_unavailable" | "unknown";
  text: string | null;
  links: string[];
  classification: { raw_label: string | null; source: "provider" | "moderator" | "commenter" | "unavailable" };
}> = {}) {
  return {
    message_id: overrides.message_id ?? "message-1",
    role: overrides.role ?? "comment",
    posted_at: overrides.posted_at ?? "2026-08-24T08:00:00.000Z",
    updated_at: overrides.updated_at ?? null,
    provider_revision_id: overrides.provider_revision_id ?? null,
    revision_state: overrides.revision_state ?? "current_visible",
    text: overrides.text === undefined ? "A bounded post-publication message." : overrides.text,
    links: overrides.links ?? ["https://example.test/evidence"],
    classification: overrides.classification ?? { raw_label: "methodological", source: "provider" },
  };
}

function failure(overrides: {
  access_status: "rate_limited" | "inaccessible" | "not_found" | "error";
  code: string;
  retryable: boolean;
  http_status?: number;
}) {
  return {
    record_kind: "failure" as const,
    contract_version: "askrigor.pubpeer-authorized-failure.v1" as const,
    retrieved_at: RETRIEVED_AT,
    doi: DOI,
    access_status: overrides.access_status,
    code: overrides.code,
    message: "Bounded authorized provider failure",
    retryable: overrides.retryable,
    ...(overrides.http_status === undefined ? {} : { http_status: overrides.http_status }),
  };
}
