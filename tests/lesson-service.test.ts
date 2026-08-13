import { describe, expect, it, vi } from "vitest";
import type { LessonCandidate } from "../apps/research-mcp/src/lessons/contracts.js";
import { GitHubApiError } from "../apps/research-mcp/src/lessons/github-app.js";
import type { CanonicalLesson, PrivacyScreenResult } from "../apps/research-mcp/src/lessons/privacy-screen.js";
import type { LessonAttemptLimiter } from "../apps/research-mcp/src/lessons/rate-limit.js";
import {
  LessonSubmissionService,
  type LessonSubmissionPipeline,
} from "../apps/research-mcp/src/lessons/service.js";

const candidate: LessonCandidate = {
  category: "missing_sources",
  general_lesson: "When material factual claims are made, AskRigor should attach traceable sources.",
  expected_behavior: "Cite each material claim near the sentence it supports and expose any source-access boundary.",
  failure_reason: "The answer asserted a conclusion without giving the user a way to inspect its evidence.",
  synthetic_regression_example: "A response ranks two interventions but supplies no citations for either ranking.",
  evidence_basis: "assistant_self_check",
  askrigor_version: "0.1.0",
  protocol_identities: [{ name: "HRP", version: "20.5.17", sha256: "a".repeat(64) }],
  consent_scope: "once",
};

function createSubject(overrides: {
  limit?: { allowed: true } | { allowed: false; retryAfterSeconds: number };
  limitReason?: "hourly_limit" | "daily_limit";
  anonymizerOutcome?: unknown;
  queueOutcome?: unknown;
  anonymizerError?: unknown;
  queueError?: unknown;
  pipeline?: LessonSubmissionPipeline;
  limiter?: LessonAttemptLimiter;
} = {}) {
  const consume = vi.fn(() => overrides.limit ?? { allowed: true as const });
  const generalize = vi.fn(async () => {
    if (overrides.anonymizerError !== undefined) throw overrides.anonymizerError;
    return overrides.anonymizerOutcome ?? { status: "generalized", candidate };
  });
  const submit = vi.fn(async () => {
    if (overrides.queueError !== undefined) throw overrides.queueError;
    return overrides.queueOutcome ?? {
      kind: "created",
      issueNumber: 42,
      occurrenceCount: 1,
      possibleRegression: false,
    };
  });
  const service = new LessonSubmissionService({
    limiter: overrides.limiter ?? {
      consume,
      lastBlockingReason: () => overrides.limitReason ?? "hourly_limit",
    },
    anonymizer: { generalize },
    queue: { submit },
    ...(overrides.pipeline ? { pipeline: overrides.pipeline } : {}),
  });
  return { service, consume, generalize, submit };
}

function pipelineWithPublicCandidateId(
  publicCandidateId: LessonSubmissionPipeline["publicCandidateId"],
): LessonSubmissionPipeline {
  return {
    parseCandidate: () => candidate,
    parseGeneralized: () => candidate,
    screen: (value) => ({ safe: true, candidate: value }),
    canonicalize: () => ({
      category: candidate.category,
      general_lesson: candidate.general_lesson,
      expected_behavior: candidate.expected_behavior,
    }),
    fingerprint: () => "f".repeat(64),
    publicCandidateId,
  };
}

describe("lesson submission pipeline", () => {
  it("runs the exact fail-closed stages in order before returning a private-safe receipt", async () => {
    const order: string[] = [];
    const canonical: CanonicalLesson = {
      category: "missing_sources",
      general_lesson: candidate.general_lesson,
      expected_behavior: candidate.expected_behavior,
    };
    const pipeline: LessonSubmissionPipeline = {
      parseCandidate(raw) {
        order.push("strict parse");
        expect(raw).toBe(candidate);
        return candidate;
      },
      screen(value): PrivacyScreenResult {
        order.push(order.includes("anonymizer") ? "post-screen" : "pre-screen");
        return { safe: true, candidate: value };
      },
      parseGeneralized(raw) {
        order.push("strict generalized parse");
        expect(raw).toEqual(candidate);
        return candidate;
      },
      canonicalize(value) {
        order.push("canonicalize");
        expect(value).toBe(candidate);
        return canonical;
      },
      fingerprint(value) {
        order.push("fingerprint");
        expect(value).toBe(canonical);
        return "f".repeat(64);
      },
      publicCandidateId(issueNumber) {
        order.push("public receipt");
        expect(issueNumber).toBe(42);
        return "ARL-0042";
      },
    };
    const { service, consume, generalize, submit } = createSubject({ pipeline });
    consume.mockImplementation(() => { order.push("rate limit"); return { allowed: true }; });
    generalize.mockImplementation(async (value) => {
      order.push("anonymizer");
      expect(value).toBe(candidate);
      return { status: "generalized", candidate };
    });
    submit.mockImplementation(async (input) => {
      order.push("github queue");
      expect(input).toEqual({ candidate, fingerprint: "f".repeat(64) });
      return { kind: "created", issueNumber: 42, occurrenceCount: 1, possibleRegression: false };
    });

    await expect(service.submit(candidate)).resolves.toEqual({
      status: "submitted",
      candidate_id: "ARL-0042",
      occurrence_count: 1,
      retryable: false,
    });
    expect(order).toEqual([
      "rate limit",
      "strict parse",
      "pre-screen",
      "anonymizer",
      "strict generalized parse",
      "post-screen",
      "canonicalize",
      "fingerprint",
      "github queue",
      "public receipt",
    ]);
  });

  it("maps an active duplicate to the same public-safe candidate shape", async () => {
    const { service } = createSubject({
      queueOutcome: { kind: "existing", issueNumber: 7, occurrenceCount: 4, possibleRegression: false },
    });

    await expect(service.submit(candidate)).resolves.toEqual({
      status: "existing_candidate",
      candidate_id: "ARL-0007",
      occurrence_count: 4,
      retryable: false,
    });
  });

  it.each([
    ["hourly_limit", 120],
    ["daily_limit", 43_200],
  ] as const)("returns a %s receipt before parsing or external dependencies", async (limitReason, retryAfterSeconds) => {
    const { service, generalize, submit } = createSubject({
      limit: { allowed: false, retryAfterSeconds },
      limitReason,
    });

    await expect(service.submit({ raw_chat: "private candidate" })).resolves.toEqual({
      status: "rate_limited",
      retryable: true,
      retry_after_seconds: retryAfterSeconds,
      reason_code: limitReason,
    });
    expect(generalize).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter returns an unrecognized public result", async () => {
    const unsafeLimiter = {
      consume: () => ({ allowed: false, retryAfterSeconds: Number.NaN }),
      lastBlockingReason: () => "candidate-secret",
    } as unknown as LessonAttemptLimiter;
    const { service, generalize, submit } = createSubject({ limiter: unsafeLimiter });

    await expect(service.submit(candidate)).resolves.toEqual({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_service_unavailable",
    });
    expect(generalize).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ["truthy non-boolean allowed", { allowed: "candidate-secret" }],
    ["allowed result with an extra field", { allowed: true, user_id: "private-user" }],
    ["blocked result missing its reset", { allowed: false }],
    ["blocked result with an extra field", { allowed: false, retryAfterSeconds: 60, clientIp: "192.0.2.1" }],
  ])("rejects the malformed limiter decision: %s", async (_name, decision) => {
    const unsafeLimiter = {
      consume: () => decision,
      lastBlockingReason: () => "hourly_limit",
    } as unknown as LessonAttemptLimiter;
    const { service, generalize, submit } = createSubject({ limiter: unsafeLimiter });

    const result = await service.submit(candidate);

    expect(result).toEqual({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_service_unavailable",
    });
    expect(generalize).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("candidate-secret");
    expect(JSON.stringify(result)).not.toContain("private-user");
    expect(JSON.stringify(result)).not.toContain("192.0.2.1");
  });

  it("does not reuse a mutable generic failure receipt across submissions", async () => {
    const unsafeLimiter = {
      consume: () => ({ allowed: "candidate-secret" }),
      lastBlockingReason: () => "hourly_limit",
    } as unknown as LessonAttemptLimiter;
    const { service } = createSubject({ limiter: unsafeLimiter });
    const first = await service.submit(candidate);
    (first as unknown as { reason_code: string }).reason_code = "mutated-secret";

    const second = await service.submit(candidate);

    expect(second).toEqual({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_service_unavailable",
    });
    expect(JSON.stringify(second)).not.toContain("mutated-secret");
  });

  it("strictly rejects malformed input before either external dependency", async () => {
    const { service, generalize, submit } = createSubject();

    await expect(service.submit({ ...candidate, raw_chat: "private raw content" })).resolves.toEqual({
      status: "privacy_rejected",
      retryable: false,
      reason_code: "unsafe_candidate",
    });
    expect(generalize).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("privacy-rejects deterministic pre-screen and model-declared unsafe candidates", async () => {
    const unsafePipeline: LessonSubmissionPipeline = {
      parseCandidate: () => candidate,
      parseGeneralized: () => candidate,
      screen: () => ({ safe: false, reasonCode: "direct_identifier" }),
      canonicalize: vi.fn(),
      fingerprint: vi.fn(),
      publicCandidateId: vi.fn(),
    };
    const pre = createSubject({ pipeline: unsafePipeline });
    const model = createSubject({ anonymizerOutcome: { status: "privacy_rejected" } });

    await expect(pre.service.submit(candidate)).resolves.toEqual({
      status: "privacy_rejected", retryable: false, reason_code: "unsafe_candidate",
    });
    await expect(model.service.submit(candidate)).resolves.toEqual({
      status: "privacy_rejected", retryable: false, reason_code: "unsafe_candidate",
    });
    expect(pre.generalize).not.toHaveBeenCalled();
    expect(pre.submit).not.toHaveBeenCalled();
    expect(model.submit).not.toHaveBeenCalled();
  });

  it("strictly reparses model output before the post-screen and queue", async () => {
    const postScreen = vi.fn<LessonSubmissionPipeline["screen"]>();
    const pipeline: LessonSubmissionPipeline = {
      parseCandidate: () => candidate,
      parseGeneralized: () => undefined,
      screen: postScreen.mockReturnValue({ safe: true, candidate }),
      canonicalize: vi.fn(),
      fingerprint: vi.fn(),
      publicCandidateId: vi.fn(),
    };
    const { service, submit } = createSubject({ pipeline });

    await expect(service.submit(candidate)).resolves.toEqual({
      status: "anonymizer_unavailable",
      retryable: true,
      reason_code: "privacy_service_unavailable",
    });
    expect(postScreen).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ["ai_budget_exhausted", false],
    ["privacy_service_unavailable", true],
  ] as const)("maps anonymizer failure %s with truthful retryability", async (reasonCode, retryable) => {
    const { service, submit } = createSubject({
      anonymizerOutcome: { status: "anonymizer_unavailable", reasonCode },
    });

    await expect(service.submit(candidate)).resolves.toEqual({
      status: "anonymizer_unavailable",
      retryable,
      reason_code: reasonCode,
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ["thrown dependency", { anonymizerError: new Error("private provider failure") }],
    ["unrecognized outcome", { anonymizerOutcome: { status: "provider-private-state" } }],
  ])("maps an %s to the generic sanitized fail-closed receipt", async (_name, overrides) => {
    const { service, submit } = createSubject(overrides);

    await expect(service.submit(candidate)).resolves.toEqual({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_service_unavailable",
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown unavailable reason", {
      status: "anonymizer_unavailable",
      reasonCode: "provider-private-reason",
    }],
    ["unavailable result with extra data", {
      status: "anonymizer_unavailable",
      reasonCode: "privacy_service_unavailable",
      provider_response: "private provider response",
    }],
    ["privacy rejection with extra data", {
      status: "privacy_rejected",
      risk_codes: ["private-risk-detail"],
    }],
    ["generalized result with extra data", {
      status: "generalized",
      candidate,
      provider_response: "private provider response",
    }],
  ])("strictly rejects malformed anonymizer outcome: %s", async (_name, anonymizerOutcome) => {
    const { service, submit } = createSubject({ anonymizerOutcome });

    const result = await service.submit(candidate);

    expect(result).toEqual({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_service_unavailable",
    });
    expect(submit).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("provider-private");
    expect(JSON.stringify(result)).not.toContain("private-risk-detail");
  });

  it.each([
    [new GitHubApiError("github_auth_unavailable", false), "github_auth_unavailable", false],
    [new GitHubApiError("github_scope_invalid", false), "github_auth_unavailable", false],
    [new GitHubApiError("github_service_unavailable", true), "github_service_unavailable", true],
    [new GitHubApiError("github_service_unavailable", false), "github_service_unavailable", false],
  ] as const)("maps a sanitized GitHub error to its allowlisted receipt", async (queueError, reasonCode, retryable) => {
    const { service } = createSubject({ queueError });

    await expect(service.submit(candidate)).resolves.toEqual({
      status: "github_unavailable",
      retryable,
      reason_code: reasonCode,
    });
  });

  it.each([
    ["non-boolean retryability", "retryable-secret"],
    ["missing retryability", undefined],
  ])("strictly rejects a GitHub error with %s", async (_name, retryable) => {
    const queueError = new GitHubApiError("github_service_unavailable", false);
    Object.defineProperty(queueError, "retryable", { value: retryable });
    const { service } = createSubject({ queueError });

    const result = await service.submit(candidate);

    expect(result).toEqual({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_service_unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("retryable-secret");
  });

  it.each([
    ["zero occurrence count", {
      kind: "created",
      issueNumber: 991,
      occurrenceCount: 0,
      possibleRegression: false,
    }],
    ["invalid issue number", {
      kind: "created",
      issueNumber: -1,
      occurrenceCount: 1,
      possibleRegression: false,
    }],
    ["non-boolean regression flag", {
      kind: "existing",
      issueNumber: 991,
      occurrenceCount: 2,
      possibleRegression: "private-provider-state",
    }],
    ["extra private queue field", {
      kind: "created",
      issueNumber: 991,
      occurrenceCount: 1,
      possibleRegression: false,
      private_url: "https://github.com/private/repository/issues/991",
    }],
  ])("strictly rejects malformed queue result before deriving an ID: %s", async (_name, queueOutcome) => {
    const publicCandidateId = vi.fn(() => "ARL-0991");
    const { service } = createSubject({
      queueOutcome,
      pipeline: pipelineWithPublicCandidateId(publicCandidateId),
    });

    const result = await service.submit(candidate);

    expect(result).toEqual({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_service_unavailable",
    });
    expect(publicCandidateId).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("991");
    expect(JSON.stringify(result)).not.toContain("github.com");
    expect(JSON.stringify(result)).not.toContain("private-provider-state");
  });

  it("does not expose arbitrary dependency errors or apply a public ID after queue failure", async () => {
    const privateError = new Error([
      candidate.general_lesson,
      "f".repeat(64),
      "private issue 991",
      "https://github.com/private/repository/issues/991",
      "provider body",
      "secret-fixture",
    ].join(" "));
    const publicCandidateId = vi.fn(() => "ARL-0991");
    const pipeline = pipelineWithPublicCandidateId(publicCandidateId);
    const { service } = createSubject({ pipeline, queueError: privateError });

    const result = await service.submit(candidate);

    expect(result).toEqual({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_service_unavailable",
    });
    expect(publicCandidateId).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    for (const sensitive of [
      candidate.general_lesson,
      "f".repeat(64),
      "991",
      "github.com",
      "provider body",
      "secret-fixture",
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it("counts duplicate submissions as attempts because rate limiting runs first", async () => {
    const { service, consume } = createSubject({
      queueOutcome: { kind: "existing", issueNumber: 42, occurrenceCount: 2, possibleRegression: false },
    });

    await service.submit(candidate);
    await service.submit(candidate);

    expect(consume).toHaveBeenCalledTimes(2);
  });
});
