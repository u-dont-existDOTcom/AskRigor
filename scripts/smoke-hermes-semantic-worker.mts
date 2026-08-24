import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  HERMES_AGENT_PIN,
  createHermesProcessSemanticExecutor,
  hermesSemanticExecutionSchema
} from "../apps/research-mcp/src/hermes-worker-pilot.js";

const checkout = required("ASKRIGOR_HERMES_CHECKOUT");
const python = required("ASKRIGOR_HERMES_PYTHON");
const sessionId = `ars1_${"A".repeat(32)}`;
const stateDigest = "b".repeat(64);
let requestCount = 0;
const requestShapes: string[] = [];
const requestBodyShapes: Array<Record<string, unknown>> = [];

const server = createServer((request, response) => {
  requestCount += 1;
  requestShapes.push(`${request.method ?? "UNKNOWN"} ${request.url ?? ""}`);
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    if (request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        object: "list",
        data: [{ id: "askrigor-hermes-smoke", object: "model" }]
      }));
      return;
    }
    // Parse only to prove the SDK emitted JSON; never write the request.
    if (body.length > 0) {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      requestBodyShapes.push({
        path: request.url ?? "",
        keys: Object.keys(parsed).sort(),
        stream: parsed.stream
      });
    }
    const content = JSON.stringify({
      contract_version: "askrigor_hermes_semantic_result_v1",
      session_id: sessionId,
      state_digest: stateDigest,
      work_type: "module_applicability",
      submission: {
        package_version: "askrigor_module_applicability_v1",
        decisions: [{
          module_id: "FORUM_SIGNAL",
          applicability: "REQUIRED",
          rationale: "The de-identified practical treatment comparison requires firsthand evidence."
        }]
      }
    });
    if (request.url?.endsWith("/chat/completions")) {
      const chunk = (choices: unknown[], usage: unknown = null) => JSON.stringify({
        id: `chatcmpl-hermes-smoke-${requestCount}`,
        object: "chat.completion.chunk",
        created: 1_777_000_000,
        model: "askrigor-hermes-smoke",
        choices,
        usage
      });
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(`data: ${chunk([{
        index: 0,
        delta: { role: "assistant", content },
        finish_reason: null
      }])}\n\n`);
      response.write(`data: ${chunk([{
        index: 0,
        delta: {},
        finish_reason: "stop"
      }], { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 })}\n\n`);
      response.end("data: [DONE]\n\n");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      capabilities: ["completion"],
      model_info: { "llama.context_length": 131_072 }
    }));
  });
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const { port } = server.address() as AddressInfo;
  const executor = createHermesProcessSemanticExecutor({
    hermesCheckout: checkout,
    pythonExecutable: python,
    provider: "openai",
    model: "askrigor-hermes-smoke",
    apiKey: "one-shot-local-fixture-key",
    baseUrl: `http://127.0.0.1:${port}/v1`,
    timeoutMs: 60_000
  });
  const input = {
    session_id: sessionId,
    state_digest: stateDigest,
    research_context: "de-identified treatment comparison",
    semantic_work: {
      kind: "module_applicability" as const,
      package: {
        package_version: "askrigor_module_applicability_v1" as const,
        state_digest: stateDigest,
        unresolved_module_ids: ["FORUM_SIGNAL" as const]
      }
    }
  };
  const runs = [];
  try {
    for (let index = 0; index < 2; index += 1) {
      runs.push(hermesSemanticExecutionSchema.parse(await executor.execute(input)));
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      smoke_failure: error instanceof Error ? error.message : "unknown",
      provider_requests: requestCount,
      request_shapes: requestShapes,
      request_body_shapes: requestBodyShapes
    })}\n`);
    throw error;
  }
  process.stdout.write(`${JSON.stringify({
    smoke_version: "askrigor_hermes_official_runtime_smoke_v1",
    upstream_commit: HERMES_AGENT_PIN.commit,
    runs: runs.length,
    provider_requests: requestCount,
    work_type: runs[0]!.model_output.work_type,
    tools_available_to_worker: 0,
    finalization_authority_tested_elsewhere: true
  })}\n`);
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing smoke setting: ${name}`);
  return value;
}
