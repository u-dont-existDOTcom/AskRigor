import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { finalizeResearch, finalizeResearchInputSchema, finalizeResearchOutputSchema,
  type FinalizeResearchInput, type FinalizeResearchOptions } from "../apps/research-mcp/src/research-finalization-gate.js";
import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createSecondReader, SECOND_READER_RUBRIC, type SecondReader, type SecondReaderFinding,
  type SecondReading } from "../apps/research-mcp/src/second-reader.js";
import { withHarmScreen } from "./helpers/harm-screen.js";

const SECRET = "second-reader-test-secret-01234567890123456789";
const KEY = "private-provider-test-key-never-output";
const LIMIT = "No study's methods were checked in full text for this answer.";
const QUOTE = "The extract can cause nausea.";
const finding = (kind: SecondReaderFinding["kind"] = "safety_claims", quote = QUOTE): SecondReaderFinding =>
  ({ kind, quote, why: "This sentence is not declared." });
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [], research_target: "Synthetic second reader", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage", not_relevant_reason: "Synthetic fixture",
  key_sources: [], answer_draft: `${QUOTE}\n\n${LIMIT}`, absence_claims: [], scale_results: [], binary_results: [], safety_claims: [], safety_question: false,
  key_terms: [], mechanism_claims: [], recommendations: [], user_observations: [], proposed_tests: [], ...overrides
});
const check = (input = base(), secondReading?: FinalizeResearchOptions["secondReading"]) =>
  finalizeResearch(input, { secret: SECRET, now: () => new Date("2026-10-17T12:00:00Z"),
    ...(secondReading === undefined ? {} : { secondReading }) });
const declarations = { safety_claims: [], key_terms: [], scale_results: [] };
const env = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  ASKRIGOR_SECOND_READER: "on", ASKRIGOR_SECOND_READER_BASE_URL: "https://provider.example/v1",
  ASKRIGOR_SECOND_READER_MODEL: "test-model", ASKRIGOR_SECOND_READER_KEY: KEY,
  ASKRIGOR_SECOND_READER_PRICE_IN: "2", ASKRIGOR_SECOND_READER_PRICE_OUT: "10", ...overrides
});
const response = (findings: unknown[] = [finding()], usage = { prompt_tokens: 100, completion_tokens: 10 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings }) } }], usage }));
const fakeFetch = () => vi.fn<typeof fetch>().mockImplementation(async () => response());
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

async function withTool(reader: SecondReader, run: (call: (input: unknown) => Promise<Record<string, unknown>>) => Promise<void>) {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  const server = createAskRigorServer("standard", { secondReader: reader, findingsLibrary: false });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "second-reader-test", version: "1" });
  try {
    await server.connect(st); await client.connect(ct);
    await run(async (input) => {
      const result = await client.callTool({ name: "finalize_research", arguments: input as Record<string, unknown> });
      expect(result.isError).not.toBe(true);
      expect(finalizeResearchOutputSchema.safeParse(result.structuredContent).success).toBe(true);
      return result.structuredContent!;
    });
  } finally { await client.close(); await server.close(); }
}

describe("second reader in the final check", () => {
  it("leaves the off path unchanged, without a call or second_reading", async () => {
    const readAnswer = vi.fn<SecondReader["readAnswer"]>();
    await withTool({ enabled: false, readAnswer }, async (call) => {
      const result = await call(base());
      expect(result.status).toBe("ready_with_limits");
      expect(result).not.toHaveProperty("second_reading");
      expect(readAnswer).not.toHaveBeenCalled();
    });
  });
  it("waits for passing checks, a parsed input and an answer draft", async () => {
    const readAnswer = vi.fn<SecondReader["readAnswer"]>();
    await withTool({ enabled: true, readAnswer }, async (call) => {
      for (const input of [base({ answer_draft: QUOTE }), base({ answer_draft: undefined }), { ...base(), receipts: 7 }]) {
        expect((await call(input)).status).toBe("not_ready");
      }
      expect(readAnswer).not.toHaveBeenCalled();
    });
  });
  it.each([
    ["safety_claims", "a harm or safety statement"],
    ["key_terms", "a specialized term the answer relies on"],
    ["scale_results", "a scale or questionnaire result"]
  ] as const)("holds an undeclared %s finding with the fixed step", async (kind, label) => {
    const readAnswer = vi.fn<SecondReader["readAnswer"]>().mockResolvedValue({ status: "ran", findings: [finding(kind)] });
    await withTool({ enabled: true, readAnswer }, async (call) => {
      const result = await call(base());
      expect(result.status).toBe("not_ready");
      expect(result.next_steps).toEqual([
        `A second reading found a sentence that looks like ${label} not in the declarations: ${JSON.stringify(QUOTE)}. Declare it in ${kind}, or list it in reader_dismissed with a one-line reason.`
      ]);
      expect(result.second_reading).toEqual({ status: "ran", findings: 1, open: 1, dismissed: 0 });
      expect(result).not.toHaveProperty("finalization_receipt");
      expect(readAnswer).toHaveBeenCalledExactlyOnceWith(base().answer_draft, declarations);
    });
  });
  it("accepts a covering safety declaration, with symmetric normalized quote containment", () => {
    const quote = "The extract can cause nausea. Another sentence.";
    const input = base({ answer_draft: `${quote}\n\nHow often this happens wasn't quantified in the sources found here.\n\n${LIMIT}`,
      safety_claims: [{ quote, direction: "harm", exposure: "the extract", basis: "not_quantified" }] });
    for (const found of [QUOTE, quote, "The extract can cause nausea. Another sentence. More text."]) {
      // An answer with safety statements screens its serious harms (owner answer "128b").
      const shown = withHarmScreen(base({ ...input, answer_draft: `${found}\n\n${input.answer_draft}` }));
      const result = check(shown, { status: "ran", findings: [finding("safety_claims", found.toUpperCase())] });
      expect(result.status, result.next_steps.join("\n")).toBe("ready_with_limits");
      expect(result.second_reading).toEqual({ status: "ran", findings: 1, open: 0, dismissed: 0 });
    }
  });
  it("accepts a declared key term in the finding, with the existing term boundaries", () => {
    const quote = "Elemental dose means the amount of the element.";
    const result = check(base({ answer_draft: `${quote}\n\n${LIMIT}`, key_terms: [{ term: "Elemental dose", explanation: quote }] }),
      { status: "ran", findings: [finding("key_terms", quote)] });
    expect(result.status, result.next_steps.join("\n")).toBe("ready_with_limits");
    expect(result.second_reading?.open).toBe(0);
    const unrelated = check(base({ answer_draft: `Although it varies.\n\n${LIMIT}`, key_terms: [{ term: "alt", explanation: "alt" }] }),
      { status: "ran", findings: [finding("key_terms", "Although it varies.")] });
    expect(unrelated.second_reading?.open).toBe(1);
  });
  it("accepts a declared scale result", () => {
    const quote = "The Test scale runs from 0 to 10, and the average was 2.";
    const result = check(base({ answer_draft: `${quote}\n\n${LIMIT}`, scale_results: [{ quote, scale: "Test", range: { min: 0, max: 10 },
      better: "lower", values: [2], benchmark: "none_established" }] }), { status: "ran", findings: [finding("scale_results", quote)] });
    expect(result.status, result.next_steps.join("\n")).toBe("ready_with_limits");
    expect(result.second_reading?.open).toBe(0);
  });
  it.each(["safety_claims", "key_terms", "scale_results"] as const)("accepts an exact normalized dismissal of %s", (kind) => {
    const input = base({ reader_dismissed: [{ quote: `“${QUOTE.toUpperCase()}”`, reason: " This is a limit, not a result. " }] });
    const result = check(input, { status: "ran", findings: [finding(kind)] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.second_reading).toEqual({ status: "ran", findings: 1, open: 0, dismissed: 1 });
    expect(finalizeResearchInputSchema.parse(input).reader_dismissed![0].reason).toBe("This is a limit, not a result.");
  });
  it("checks dismissed quotes against shown prose and requires equality to cover a finding", () => {
    const result = check(base({ reader_dismissed: [{ quote: "The extract", reason: "Only a partial quote." }] }),
      { status: "ran", findings: [finding()] });
    expect(result.second_reading?.open).toBe(1);
    const absent = check(base({ reader_dismissed: [{ quote: "Not in the answer.", reason: "A reason." }] }));
    expect(absent.status).toBe("not_ready");
    expect(absent.next_steps.join("\n")).toContain("reader_dismissed[0] gives text the answer does not show");
  });
  it("drops quotes outside the displayed answer, including link targets and code, using the existing locator", () => {
    const result = check(base({ answer_draft: `[The extract](https://example.com/hidden) can cause nausea.\n\n\`\`\`\nHidden sentence.\n\`\`\`\n\n${LIMIT}` }),
      { status: "ran", findings: [finding(), finding("safety_claims", "Hidden sentence."), finding("safety_claims", "Not there.")] });
    expect(result.second_reading).toEqual({ status: "ran", findings: 1, open: 1, dismissed: 0 });
  });
  it("does not let another declaration kind cover a finding", () => {
    const result = check(base({ key_terms: [{ term: "extract", explanation: QUOTE }] }), { status: "ran", findings: [finding()] });
    expect(result.second_reading?.open).toBe(1);
  });
  it("keeps second reading and dismissals out of the receipt, adding no caveat", () => {
    const input = base({ reader_dismissed: [{ quote: QUOTE, reason: "Not a harm statement." }] });
    const original = check(input);
    const result = check(input, { status: "ran", findings: [finding()] });
    expect(result.caveats).toEqual(original.caveats);
    expect(result.finalization_receipt).toBe(original.finalization_receipt);
    expect(JSON.stringify(verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET,
      now: () => new Date("2026-10-17T12:00:00Z") }))).not.toMatch(/second_reading|reader_dismissed|nausea/);
  });
  it("reports a supplied reading even without a draft, receipt secret or valid input", () => {
    const secondReading = { status: "ran" as const, findings: [finding()] };
    expect(check(base({ answer_draft: undefined }), secondReading).second_reading).toEqual({ status: "ran", findings: 0, open: 0, dismissed: 0 });
    expect(finalizeResearch({}, { secret: SECRET, secondReading }).second_reading).toEqual({ status: "ran", findings: 0, open: 0, dismissed: 0 });
    expect(finalizeResearch(base(), { secret: undefined, secondReading: { status: "skipped", reason: "off" } }).second_reading)
      .toEqual({ status: "skipped", reason: "off", findings: 0, open: 0, dismissed: 0 });
  });
  it("reads a ready answer too, and the handler uses a dismissal in its second result", async () => {
    const quote = "Observed nausea was 18 versus 4.";
    const input = base({
      receipts: [], answer_draft: `${quote}\n\n${LIMIT}`,
      reader_dismissed: [{ quote, reason: "The sentence is covered elsewhere." }]
    });
    const readAnswer = vi.fn<SecondReader["readAnswer"]>().mockResolvedValue({ status: "ran", findings: [finding("scale_results", quote)] });
    await withTool({ enabled: true, readAnswer }, async (call) => {
      const result = await call(input);
      expect(result.status).toBe("ready_with_limits");
      expect(result.second_reading).toEqual({ status: "ran", findings: 1, open: 0, dismissed: 1 });
      expect(result.finalization_receipt).toBeDefined();
      expect(readAnswer).toHaveBeenCalledTimes(1);
    });
  });
  it("enforces dismissal shape, count and trimmed reason length", () => {
    for (const reader_dismissed of [[{ quote: QUOTE, reason: "  " }], [{ quote: QUOTE, reason: "x".repeat(201) }],
      [{ quote: QUOTE, reason: "Reason", extra: true }], Array(21).fill({ quote: QUOTE, reason: "Reason" })]) {
      expect(finalizeResearchInputSchema.safeParse({ ...base(), reader_dismissed }).success).toBe(false);
    }
  });
});

describe("configured second reader with fake fetch only", () => {
  it.each([undefined, "off", "ON", "true"])("disables for %s without fetching or logging", async (setting) => {
    const fetch = fakeFetch(); const log = vi.fn();
    const reader = createSecondReader({ env: env({ ASKRIGOR_SECOND_READER: setting }), fetch, log });
    expect(reader.enabled).toBe(false);
    expect(await reader.readAnswer(QUOTE, declarations)).toEqual({ status: "skipped", reason: "off" });
    expect(fetch).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  });
  it("disables incomplete configuration with one log of missing variable names only", () => {
    const log = vi.fn(); const fetch = fakeFetch();
    const reader = createSecondReader({ env: env({ ASKRIGOR_SECOND_READER_KEY: undefined, ASKRIGOR_SECOND_READER_PRICE_IN: "" }), fetch, log });
    expect(reader.enabled).toBe(false);
    expect(log).toHaveBeenCalledExactlyOnceWith("ASKRIGOR_SECOND_READER_KEY, ASKRIGOR_SECOND_READER_PRICE_IN");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{ ASKRIGOR_SECOND_READER_BASE_URL: "http://provider.example/v1" },
    { ASKRIGOR_SECOND_READER_BASE_URL: "not-a-url" }, { ASKRIGOR_SECOND_READER_PRICE_OUT: "NaN" },
    { ASKRIGOR_SECOND_READER_PRICE_IN: "-1" }])("rejects invalid configuration without its values: %j", (overrides) => {
    const log = vi.fn();
    expect(createSecondReader({ env: env(overrides), fetch: fakeFetch(), log }).enabled).toBe(false);
    expect(log).toHaveBeenCalledExactlyOnceWith("error");
  });
  it.each(["https://api.venice.ai/api/v1/", "https://provider.example/v1", "https://api.anthropic.com/v1",
    "https://api.venice.ai.example/v1"])("sends the exact request envelope to %s, with Venice's parameter only there", async (baseUrl) => {
    const fetch = fakeFetch();
    const reader = createSecondReader({ env: env({ ASKRIGOR_SECOND_READER_BASE_URL: baseUrl }), fetch });
    await reader.readAnswer("Réponse。", { ...declarations, key_terms: [{ term: "élément", explanation: "Une définition." }] });
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe(`${baseUrl.replace(/\/$/, "")}/chat/completions`);
    expect(request).toMatchObject({ method: "POST", redirect: "error", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" } });
    const body = JSON.parse(request!.body as string);
    expect(body).toMatchObject({ model: "test-model", temperature: 0, max_tokens: 3000, response_format: { type: "json_object" } });
    expect(body.messages).toEqual([{ role: "system", content: SECOND_READER_RUBRIC }, { role: "user", content:
      'ANSWER (as the user would see it):\n<<<\nRéponse。\n>>>\n\nDECLARATIONS made to the final check (JSON):\n{"safety_claims": [], "key_terms": [{"term": "élément", "explanation": "Une définition."}], "scale_results": []}' }]);
    if (new URL(baseUrl).hostname === "api.venice.ai") expect(body.venice_parameters).toEqual({ include_venice_system_prompt: false });
    else expect(body).not.toHaveProperty("venice_parameters");
  });
  it("reads configuration once", async () => {
    const config = env(); const fetch = fakeFetch();
    const reader = createSecondReader({ env: config, fetch });
    config.ASKRIGOR_SECOND_READER_MODEL = "changed"; config.ASKRIGOR_SECOND_READER_KEY = "changed";
    await reader.readAnswer(QUOTE, declarations);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).model).toBe("test-model");
    expect(fetch.mock.calls[0][1]!.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
  });
  it("drops other kinds and malformed findings, keeping only kind, quote and why", async () => {
    const fetch = fakeFetch().mockResolvedValue(response([finding(), { ...finding("key_terms"), issue: "missing" },
      finding("scale_results"), { ...finding(), kind: "recommendations" }, { ...finding(), quote: "" }, { kind: "key_terms" }]));
    expect(await createSecondReader({ env: env(), fetch }).readAnswer(QUOTE, declarations)).toEqual({ status: "ran",
      findings: [finding(), finding("key_terms"), finding("scale_results")] });
  });
  it("reuses the same reading (also while pending), keyed by the draft alone", async () => {
    const fetch = fakeFetch(); const reader = createSecondReader({ env: env(), fetch });
    const [a, b] = await Promise.all([reader.readAnswer(QUOTE, declarations), reader.readAnswer(QUOTE, declarations)]);
    expect(a).toEqual(b); expect(fetch).toHaveBeenCalledTimes(1);
    await reader.readAnswer(QUOTE, declarations); expect(fetch).toHaveBeenCalledTimes(1);
    // Declaring a finding reuses the reading; the gate then sees it covered.
    await reader.readAnswer(QUOTE, { ...declarations, safety_claims: [{ quote: QUOTE }] });
    expect(fetch).toHaveBeenCalledTimes(1);
    await reader.readAnswer(`${QUOTE} Changed.`, declarations);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("reads a reply wrapped in a code fence", async () => {
    const fetch = fakeFetch().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "```json\n" + JSON.stringify({ findings: [finding()] }) + "\n```" } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await createSecondReader({ env: env(), fetch }).readAnswer(QUOTE, declarations))
      .toEqual({ status: "ran", findings: [finding()] });
  });
  it("expires the cache at one hour and evicts beyond 500 entries", async () => {
    let now = 0; const fetch = fakeFetch(); const reader = createSecondReader({ env: env(), fetch, now: () => now });
    await reader.readAnswer(QUOTE, declarations);
    now = 3_599_999; await reader.readAnswer(QUOTE, declarations); expect(fetch).toHaveBeenCalledTimes(1);
    now = 3_600_000; await reader.readAnswer(QUOTE, declarations); expect(fetch).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 500; i++) await reader.readAnswer(`Draft ${i}`, declarations);
    await reader.readAnswer(QUOTE, declarations); expect(fetch).toHaveBeenCalledTimes(503);
  });
  it("charges usage times both prices, skips at the cap and resets on the UTC day", async () => {
    let now = Date.parse("2026-10-17T23:59:00Z"); const fetch = fakeFetch();
    // 100*2/1e6 + 10*10/1e6 = $0.0003, two calls reach $0.0006.
    const reader = createSecondReader({ env: env({ ASKRIGOR_SECOND_READER_DAILY_CAP_USD: "0.0006" }), fetch, now: () => now });
    expect((await reader.readAnswer("A", declarations)).status).toBe("ran");
    expect((await reader.readAnswer("B", declarations)).status).toBe("ran");
    expect(await reader.readAnswer("C", declarations)).toEqual({ status: "skipped", reason: "daily_budget" });
    expect(fetch).toHaveBeenCalledTimes(2);
    now += 60_000;
    expect((await reader.readAnswer("C", declarations)).status).toBe("ran"); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("uses the default $4 cap and counts usage on an unreadable finding reply", async () => {
    const fetch = fakeFetch().mockResolvedValue(new Response(JSON.stringify({ usage: { prompt_tokens: 1_000_000, completion_tokens: 200_000 }, choices: [] })));
    const log = vi.fn(); const reader = createSecondReader({ env: env(), fetch, log });
    expect(await reader.readAnswer("A", declarations)).toEqual({ status: "skipped", reason: "unreadable" });
    expect(await reader.readAnswer("B", declarations)).toEqual({ status: "skipped", reason: "daily_budget" });
    expect(fetch).toHaveBeenCalledTimes(1); expect(log).toHaveBeenCalledExactlyOnceWith("unreadable");
  });
  it("does not call with a zero daily cap", async () => {
    const fetch = fakeFetch(); const reader = createSecondReader({ env: env({ ASKRIGOR_SECOND_READER_DAILY_CAP_USD: "0" }), fetch });
    expect(await reader.readAnswer(QUOTE, declarations)).toEqual({ status: "skipped", reason: "daily_budget" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("times out after 30 seconds, aborts and leaves the original check passing", async () => {
    vi.useFakeTimers(); const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => {}));
    const log = vi.fn(); const reader = createSecondReader({ env: env(), fetch, log });
    const pending = reader.readAnswer(QUOTE, declarations);
    await vi.advanceTimersByTimeAsync(30_000);
    const reading = await pending;
    expect(reading).toEqual({ status: "skipped", reason: "timeout" });
    expect(fetch.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(log).toHaveBeenCalledExactlyOnceWith("timeout");
    const result = check(base(), reading); expect(result.status).toBe(check().status); expect(result.caveats).toEqual(check().caveats);
  });
  it("applies the same timeout while waiting for the response body", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({ ok: true,
      json: () => new Promise(() => {}) } as unknown as Response);
    const log = vi.fn(); const reader = createSecondReader({ env: env(), fetch, log });
    const pending = reader.readAnswer(QUOTE, declarations);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual({ status: "skipped", reason: "timeout" });
    expect(log).toHaveBeenCalledExactlyOnceWith("timeout");
  });
  it.each(["http", "throw", "json", "content", "shape"])("skips a %s failure without leaking the key or caching a failure", async (failure) => {
    const fetch = fakeFetch(); const log = vi.fn();
    if (failure === "http") fetch.mockResolvedValue(new Response(KEY, { status: 500 }));
    if (failure === "throw") fetch.mockRejectedValue(new Error(KEY));
    if (failure === "json") fetch.mockResolvedValue(new Response(KEY));
    if (failure === "content") fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: KEY } }] })));
    if (failure === "shape") fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"findings": 1}' } }] })));
    const reader = createSecondReader({ env: env(), fetch, log });
    const reading = await reader.readAnswer(QUOTE, declarations);
    expect(reading).toEqual({ status: "skipped", reason: ["http", "throw"].includes(failure) ? "error" : "unreadable" });
    expect(check(base(), reading).status).toBe(check().status);
    expect(JSON.stringify([reading, check(base(), reading), log.mock.calls])).not.toContain(KEY);
    expect(log).toHaveBeenCalledExactlyOnceWith(reading.status === "skipped" ? reading.reason : "unexpected");
    fetch.mockImplementation(async () => response()); await reader.readAnswer(QUOTE, declarations);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("drops even a provider finding that echoes the secret and never returns it in results, steps or logs", async () => {
    const log = vi.fn(); const fetch = fakeFetch().mockResolvedValue(response([
      finding(), finding("key_terms", KEY), { ...finding(), why: KEY }
    ]));
    const reading = await createSecondReader({ env: env(), fetch, log }).readAnswer(QUOTE, declarations);
    expect(reading).toEqual({ status: "ran", findings: [finding()] });
    expect(JSON.stringify([reading, check(base(), reading), log.mock.calls])).not.toContain(KEY);
    expect(log).not.toHaveBeenCalled();
  });
  it.each(["error", "timeout", "unreadable", "daily_budget"] as const)("uses the second result on a skipped %s reading", async (reason) => {
    await withTool({ enabled: true, readAnswer: async (): Promise<SecondReading> => ({ status: "skipped", reason }) }, async (call) => {
      const result = await call(base());
      expect(result.status).toBe("ready_with_limits");
      expect(result.second_reading).toEqual({ status: "skipped", reason, findings: 0, open: 0, dismissed: 0 });
    });
  });
});
