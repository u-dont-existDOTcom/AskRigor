import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  BARE_SYSTEM_INSTRUCTIONS,
  assertPairedMastConditions,
  createPairedMastConditions,
  loadCanonicalHrpInstructions,
  type MastSharedSettings,
} from "../evaluation/mast/src/paired-condition.js";
import {
  assertRequestsDifferOnlyBySystemInstructions,
  buildResponsesRequest,
  estimateMaximumRequestCostUsd,
  executeOpenAiResponse,
} from "../evaluation/mast/src/openai-adapter.js";
import {
  parseSctRating,
  scoreSctEpoch,
  scoreSctResponse,
} from "../evaluation/mast/src/preflight.js";

const repositoryRoot = new URL("../", import.meta.url).pathname;
const sharedSettings: MastSharedSettings = {
  endpoint: "https://api.openai.com/v1/responses",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  maxOutputTokens: 512,
  store: false,
  timeoutSeconds: 180,
  maximumRetries: 2,
  maximumEstimatedCostUsdBeforeAbort: 10,
  inputPriceUsdPerMillionTokens: 4,
  outputPriceUsdPerMillionTokens: 20,
};

async function pairedConditions() {
  const protocol = await loadCanonicalHrpInstructions(repositoryRoot);
  return createPairedMastConditions(
    sharedSettings,
    BARE_SYSTEM_INSTRUCTIONS,
    protocol.combinedInstructions,
  );
}

describe("MAST paired-condition preflight", () => {
  it("loads complete canonical protocol bytes and permits only system instructions to differ", async () => {
    const protocol = await loadCanonicalHrpInstructions(repositoryRoot);
    const [universal, hrp] = await Promise.all([
      readFile(new URL("../protocols/Universal_Instructions.xml", import.meta.url), "utf8"),
      readFile(new URL("../protocols/HRP_Full.xml", import.meta.url), "utf8"),
    ]);
    expect(protocol.universalBytes).toBe(universal);
    expect(protocol.hrpBytes).toBe(hrp);
    expect(protocol.combinedInstructions).toBe(`${universal}\n\n${hrp}`);

    const conditions = await pairedConditions();
    expect(() => assertPairedMastConditions(conditions)).not.toThrow();
    expect(() => assertRequestsDifferOnlyBySystemInstructions(conditions, "same SCT item"))
      .not.toThrow();
    expect(conditions.bare.sharedSettingsSha256).toBe(conditions.hrp.sharedSettingsSha256);
    expect(conditions.bare.systemInstructionsSha256).not.toBe(
      conditions.hrp.systemInstructionsSha256,
    );
  });

  it("builds the current official Responses API request without hidden condition metadata", async () => {
    const conditions = await pairedConditions();
    const bare = buildResponsesRequest(conditions.bare, "item bytes");
    const hrp = buildResponsesRequest(conditions.hrp, "item bytes");
    expect(bare).toMatchObject({
      model: "gpt-5.6-sol",
      input: "item bytes",
      reasoning: { effort: "xhigh" },
      max_output_tokens: 512,
      store: false,
    });
    expect({ ...bare, instructions: undefined }).toEqual({ ...hrp, instructions: undefined });
    expect(estimateMaximumRequestCostUsd(conditions.bare, 4_096)).toBeCloseTo(0.026624, 9);
  });

  it("preserves exact response bytes, parses output, records usage, and bounds retries", async () => {
    const conditions = await pairedConditions();
    const body = JSON.stringify({
      id: "resp_fixture",
      model: "gpt-5.6-sol",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "Rating: +1" }],
      }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    let calls = 0;
    const fetchImplementation = (async () => {
      calls += 1;
      return calls === 1
        ? new Response("retry", { status: 429 })
        : new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const artifact = await executeOpenAiResponse(
      conditions.bare,
      "same SCT item",
      "test-key-not-real",
      { fetchImplementation, sleep: async () => undefined },
    );
    expect(calls).toBe(2);
    expect(artifact.retryCount).toBe(1);
    expect(artifact.outputText).toBe("Rating: +1");
    expect(artifact.responseId).toBe("resp_fixture");
    expect(artifact.model).toBe("gpt-5.6-sol");
    expect(new TextDecoder().decode(artifact.rawResponseBytes)).toBe(body);
    expect(artifact.rawResponseSha256).toBe(
      createHash("sha256").update(body).digest("hex"),
    );
    expect(artifact.estimatedCostUsd).toBeCloseTo(0.0008, 9);
  });

  it("does not retry a non-retryable provider response", async () => {
    const conditions = await pairedConditions();
    let calls = 0;
    const fetchImplementation = (async () => {
      calls += 1;
      return new Response("bad request", { status: 400 });
    }) as typeof fetch;
    await expect(executeOpenAiResponse(
      conditions.bare,
      "same SCT item",
      "test-key-not-real",
      { fetchImplementation, sleep: async () => undefined },
    )).rejects.toThrow("OPENAI_RESPONSE_HTTP_400");
    expect(calls).toBe(1);
  });

  it("matches the pinned MAST SCT response parser and normalized scoring rule", () => {
    expect(parseSctRating("reason\nRating: -1")).toBe(-1);
    expect(parseSctRating('{"Rating":"+2"}')).toBe(2);
    expect(parseSctRating("no final field")).toBeNull();
    expect(scoreSctResponse([0, 2, 5, 3, 0], -1)).toEqual({
      response: -1,
      normalizedScore: 0.4,
      inExpertSet: true,
    });
    expect(scoreSctEpoch([
      { expertDistribution: [0, 2, 5, 3, 0], response: -1 },
      { expertDistribution: [0, 0, 1, 4, 2], response: 1 },
    ])).toEqual({
      sctScore: 0.7,
      percentageInExpertSet: 1,
    });
  });
});
