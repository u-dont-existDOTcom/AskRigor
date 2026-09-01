import { createHash } from "node:crypto";

import {
  assertPairedMastConditions,
  type MastCondition,
  type PairedMastConditions,
} from "./paired-condition.js";
import { canonicalSha256 } from "../../terminal-bench/verifier-contract.js";

export interface OpenAiResponsesRequest {
  model: string;
  instructions: string;
  input: string;
  reasoning: { effort: MastCondition["sharedSettings"]["reasoningEffort"] };
  max_output_tokens: number;
  store: false;
}

export interface ResponseArtifact {
  rawResponseBytes: Uint8Array;
  rawResponseSha256: string;
  parsedResponse: unknown;
  outputText: string;
  responseId: string | null;
  model: string | null;
  usage: unknown;
  retryCount: number;
  estimatedCostUsd: number | null;
}

export interface AdapterDependencies {
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

class NonRetryableAdapterError extends Error {}

export function buildResponsesRequest(condition: MastCondition, input: string): OpenAiResponsesRequest {
  if (input.length === 0) throw new Error("Benchmark input must not be empty");
  return {
    model: condition.sharedSettings.model,
    instructions: condition.systemInstructions,
    input,
    reasoning: { effort: condition.sharedSettings.reasoningEffort },
    max_output_tokens: condition.sharedSettings.maxOutputTokens,
    store: false,
  };
}

export function assertRequestsDifferOnlyBySystemInstructions(
  conditions: PairedMastConditions,
  input: string,
): void {
  assertPairedMastConditions(conditions);
  const bare = buildResponsesRequest(conditions.bare, input);
  const hrp = buildResponsesRequest(conditions.hrp, input);
  const { instructions: bareInstructions, ...bareShared } = bare;
  const { instructions: hrpInstructions, ...hrpShared } = hrp;
  if (
    bareInstructions === hrpInstructions
    || canonicalSha256(bareShared) !== canonicalSha256(hrpShared)
  ) {
    throw new Error("REQUEST_PAIR_DIFF_EXCEEDS_SYSTEM_INSTRUCTIONS");
  }
}

export function estimateMaximumRequestCostUsd(
  condition: MastCondition,
  maximumInputTokens: number,
): number {
  if (!Number.isInteger(maximumInputTokens) || maximumInputTokens < 0) {
    throw new Error("Maximum input tokens must be a non-negative integer");
  }
  return (
    maximumInputTokens * condition.sharedSettings.inputPriceUsdPerMillionTokens
    + condition.sharedSettings.maxOutputTokens * condition.sharedSettings.outputPriceUsdPerMillionTokens
  ) / 1_000_000;
}

function extractOutputText(response: unknown): string {
  if (response === null || typeof response !== "object") return "";
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  return output.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (
        part !== null
        && typeof part === "object"
        && (part as { type?: unknown }).type === "output_text"
        && typeof (part as { text?: unknown }).text === "string"
      ) {
        return [(part as { text: string }).text];
      }
      return [];
    });
  }).join("\n");
}

function usageCostUsd(
  usage: unknown,
  condition: MastCondition,
): number | null {
  if (usage === null || typeof usage !== "object") return null;
  const inputTokens = (usage as { input_tokens?: unknown }).input_tokens;
  const outputTokens = (usage as { output_tokens?: unknown }).output_tokens;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") return null;
  return (
    inputTokens * condition.sharedSettings.inputPriceUsdPerMillionTokens
    + outputTokens * condition.sharedSettings.outputPriceUsdPerMillionTokens
  ) / 1_000_000;
}

export async function executeOpenAiResponse(
  condition: MastCondition,
  input: string,
  apiKey: string,
  dependencies: AdapterDependencies = {},
): Promise<ResponseArtifact> {
  if (apiKey.length === 0) throw new Error("OpenAI API key is required at execution time");
  const request = buildResponsesRequest(condition, input);
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  let lastError: unknown;
  for (let attempt = 0; attempt <= condition.sharedSettings.maximumRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      condition.sharedSettings.timeoutSeconds * 1_000,
    );
    try {
      const response = await fetchImplementation(condition.sharedSettings.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const rawResponseBytes = new Uint8Array(await response.arrayBuffer());
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const error = new Error(`OPENAI_RESPONSE_HTTP_${response.status}`);
        if (!retryable || attempt === condition.sharedSettings.maximumRetries) {
          throw new NonRetryableAdapterError(error.message);
        }
        lastError = error;
        await sleep(250 * (2 ** attempt));
        continue;
      }
      const rawResponseUtf8 = new TextDecoder().decode(rawResponseBytes);
      let parsedResponse: Record<string, unknown>;
      try {
        parsedResponse = JSON.parse(rawResponseUtf8) as Record<string, unknown>;
      } catch {
        throw new NonRetryableAdapterError("OPENAI_RESPONSE_INVALID_JSON");
      }
      const estimatedCostUsd = usageCostUsd(parsedResponse.usage, condition);
      if (
        estimatedCostUsd !== null
        && estimatedCostUsd > condition.sharedSettings.maximumEstimatedCostUsdBeforeAbort
      ) {
        throw new NonRetryableAdapterError("OPENAI_RESPONSE_COST_CEILING_EXCEEDED");
      }
      return {
        rawResponseBytes,
        rawResponseSha256: createHash("sha256").update(rawResponseBytes).digest("hex"),
        parsedResponse,
        outputText: extractOutputText(parsedResponse),
        responseId: typeof parsedResponse.id === "string" ? parsedResponse.id : null,
        model: typeof parsedResponse.model === "string" ? parsedResponse.model : null,
        usage: parsedResponse.usage ?? null,
        retryCount: attempt,
        estimatedCostUsd,
      };
    } catch (error) {
      lastError = error;
      if (error instanceof NonRetryableAdapterError) throw error;
      if (attempt === condition.sharedSettings.maximumRetries) throw error;
      await sleep(250 * (2 ** attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OPENAI_RESPONSE_FAILED");
}
