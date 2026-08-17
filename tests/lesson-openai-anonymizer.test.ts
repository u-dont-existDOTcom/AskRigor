import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonCandidate } from "../apps/research-mcp/src/lessons/contracts.js";
import type { AiBudget, BudgetReservation } from "../apps/research-mcp/src/lessons/ai-budget.js";
import {
  LESSON_PRIVACY_JSON_SCHEMA,
  OPENAI_LESSON_MODEL,
  PRIVACY_SYSTEM_PROMPT,
  createOpenAiLessonAnonymizer,
} from "../apps/research-mcp/src/lessons/openai-anonymizer.js";

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

class RecordingReservation implements BudgetReservation {
  commits: number[] = [];
  forfeits = 0;

  async commit(actualNanoUsd: number): Promise<void> {
    this.commits.push(actualNanoUsd);
  }

  async forfeit(): Promise<void> {
    this.forfeits += 1;
  }
}

class RecordingBudget implements AiBudget {
  readonly reservation = new RecordingReservation();
  readonly requests: Array<{ category: string; maximumNanoUsd: number }> = [];

  constructor(private readonly allowed = true) {}

  async reserve(category: string, maximumNanoUsd: number): Promise<BudgetReservation | undefined> {
    this.requests.push({ category, maximumNanoUsd });
    return this.allowed ? this.reservation : undefined;
  }
}

function responseFor(result: unknown, usage: unknown = { input_tokens: 100, output_tokens: 10 }): Response {
  return new Response(JSON.stringify({
    id: "resp_fixture",
    object: "response",
    status: "completed",
    output: [
      { type: "reasoning", id: "reasoning_fixture", summary: [] },
      {
        type: "message",
        id: "message_fixture",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", annotations: [], text: JSON.stringify(result) }],
      },
    ],
    usage,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function responseWithoutUsage(result: unknown): Response {
  return new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function incompleteResponse(result: unknown): Response {
  return new Response(JSON.stringify({
    status: "incomplete",
    output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
    usage: { input_tokens: 100, output_tokens: 10 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function createSubject(fetchImpl: typeof fetch, budget = new RecordingBudget()) {
  return {
    anonymizer: createOpenAiLessonAnonymizer({ apiKey: "test-api-key", budget, fetch: fetchImpl }),
    budget,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fixed-model OpenAI lesson anonymizer", () => {
  it("uses an API-valid strict root object with every root field required", () => {
    expect(LESSON_PRIVACY_JSON_SCHEMA).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["safe", "risk_codes", "generalized"],
    });
    expect(LESSON_PRIVACY_JSON_SCHEMA).not.toHaveProperty("anyOf");
  });

  it("defines privacy-only safety, nullability, and exact metadata preservation", () => {
    const requiredContract = [
      "Judge only privacy and security risk; do not treat scientific uncertainty, evidence quality, or a described product failure as privacy risk.",
      "Return safe:true with an empty risk_codes array when the candidate is already a generalized product lesson with no personal narrative, direct identifier, credential, raw conversation, unnecessary URL, or copied material.",
      "Do not reject a generalized lesson merely because it discusses AskRigor, factual claims, evidence, source support, traceability, or auditability.",
      "A lesson saying that material factual claims need traceable supporting sources is safe when it contains no private or identifying material.",
      "When safe is false, generalized must be null.",
      "When safe is true, preserve category, evidence_basis, askrigor_version, protocol_identities, and consent_scope exactly.",
      "Keep omitted askrigor_version and protocol_identities null; never infer or invent them.",
    ];

    for (const statement of requiredContract) {
      expect(PRIVACY_SYSTEM_PROMPT).toContain(statement);
    }
  });

  it("sends the exact fixed, non-stored structured-output request and returns screened output", async () => {
    const generalized = { ...candidate, general_lesson: "AskRigor should preserve only a general product lesson supported by traceable evidence." };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseFor({ safe: true, risk_codes: [], generalized }));
    const { anonymizer, budget } = createSubject(fetchMock);

    await expect(anonymizer.generalize(candidate)).resolves.toEqual({ status: "generalized", candidate: generalized });

    expect(OPENAI_LESSON_MODEL).toBe("gpt-5.4-nano-2026-03-17");
    expect(budget.requests).toEqual([{ category: "lesson_privacy_generalization", maximumNanoUsd: 10_000_000 }]);
    expect(budget.reservation.commits).toEqual([32_500]);
    expect(budget.reservation.forfeits).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-api-key");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gpt-5.4-nano-2026-03-17",
      store: false,
      max_output_tokens: 1200,
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: [{ type: "input_text", text: PRIVACY_SYSTEM_PROMPT }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(candidate) }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "askrigor_lesson_privacy_result",
          strict: true,
          schema: LESSON_PRIVACY_JSON_SCHEMA,
        },
      },
    });
  });

  it("commits valid usage and rejects a model-declared unsafe candidate", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseFor({ safe: false, risk_codes: ["personal_narrative"] }));
    const { anonymizer, budget } = createSubject(fetchMock);

    await expect(anonymizer.generalize(candidate)).resolves.toEqual({ status: "privacy_rejected" });
    expect(budget.reservation.commits).toEqual([32_500]);
    expect(budget.reservation.forfeits).toBe(0);
  });

  it("normalizes the strict transport's required null generalized field for an unsafe result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseFor({
      safe: false,
      risk_codes: ["uncertain"],
      generalized: null,
    }));
    const { anonymizer, budget } = createSubject(fetchMock);

    await expect(anonymizer.generalize(candidate)).resolves.toEqual({ status: "privacy_rejected" });
    expect(budget.reservation.commits).toEqual([32_500]);
  });

  it.each([
    ["HTTP error", () => new Response("upstream private body", { status: 429 })],
    ["missing usage", () => responseWithoutUsage({ safe: false, risk_codes: [] })],
    ["incomplete response", () => incompleteResponse({ safe: false, risk_codes: [] })],
    ["invalid usage", () => responseFor({ safe: false, risk_codes: [] }, { input_tokens: -1, output_tokens: 2 })],
    ["malformed JSON output", () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: "not-json" }] }], usage: { input_tokens: 1, output_tokens: 1 } }))],
    ["extra model output fields", () => responseFor({ safe: false, risk_codes: [], candidate_text: "must not pass" })],
    ["cost above reservation", () => responseFor({ safe: false, risk_codes: [] }, { input_tokens: 200_001, output_tokens: 0 })],
  ])("forfeits the reservation and fails closed for %s", async (_name, makeResponse) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(makeResponse());
    const { anonymizer, budget } = createSubject(fetchMock);

    await expect(anonymizer.generalize(candidate)).resolves.toEqual({
      status: "anonymizer_unavailable",
      reasonCode: "privacy_service_unavailable",
    });
    expect(budget.reservation.commits).toEqual([]);
    expect(budget.reservation.forfeits).toBe(1);
  });

  it.each([
    ["an email", "AskRigor should retain me@example.com in a generalized lesson only when useful to reviewers."],
    ["a personal story", "I was diagnosed with a chronic condition and AskRigor should retain that experience for reviewers."],
  ])("commits valid usage but privacy-rejects output that reintroduces %s", async (_name, general_lesson) => {
    const generalized = { ...candidate, general_lesson };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseFor({ safe: true, risk_codes: [], generalized }));
    const { anonymizer, budget } = createSubject(fetchMock);

    await expect(anonymizer.generalize(candidate)).resolves.toEqual({ status: "privacy_rejected" });
    expect(budget.reservation.commits).toEqual([32_500]);
    expect(budget.reservation.forfeits).toBe(0);
  });

  it.each([
    ["category", { category: "other" }],
    ["evidence basis", { evidence_basis: "source_recheck" }],
    ["AskRigor version", { askrigor_version: "invented-version" }],
    ["protocol identities", { protocol_identities: [{ name: "Invented", version: "99" }] }],
    ["consent scope", { consent_scope: "conversation" }],
  ])("privacy-rejects a model attempt to change %s metadata", async (_name, mutation) => {
    const generalized = { ...candidate, ...mutation };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseFor({ safe: true, risk_codes: [], generalized }));
    const { anonymizer, budget } = createSubject(fetchMock);

    await expect(anonymizer.generalize(candidate)).resolves.toEqual({ status: "privacy_rejected" });
    expect(budget.reservation.commits).toEqual([32_500]);
    expect(budget.reservation.forfeits).toBe(0);
  });

  it("forfeits after the fixed 20-second deadline without exposing the thrown error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("private upstream error")));
      });
    });
    const { anonymizer, budget } = createSubject(fetchMock);
    const outcome = anonymizer.generalize(candidate);
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(outcome).resolves.toEqual({
      status: "anonymizer_unavailable",
      reasonCode: "privacy_service_unavailable",
    });
    expect(budget.reservation.forfeits).toBe(1);
  });

  it("refuses before fetch when the hard budget cannot reserve the maximum", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const budget = new RecordingBudget(false);
    const { anonymizer } = createSubject(fetchMock, budget);

    await expect(anonymizer.generalize(candidate)).resolves.toEqual({
      status: "anonymizer_unavailable",
      reasonCode: "ai_budget_exhausted",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
