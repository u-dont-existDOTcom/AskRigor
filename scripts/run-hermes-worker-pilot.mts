import { readFile } from "node:fs/promises";

import { z } from "zod";

import {
  createHermesProcessSemanticExecutor,
  createHttpPrivateResearchOrchestrationClient,
  hermesWorkerRunResultSchema,
  runHermesResearchTask
} from "../apps/research-mcp/src/hermes-worker-pilot.js";

const inputSchema = z.union([
  z.object({
    research_target: z.string().trim().min(1).max(1_000),
    diagnosis_status: z.enum([
      "diagnosis_not_specified",
      "user_supplied_diagnosis"
    ]).default("diagnosis_not_specified")
  }).strict(),
  z.object({
    existing_session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
    deidentified_research_context: z.string().trim().min(1).max(1_000).optional()
  }).strict()
]);

async function main(): Promise<void> {
  const stdin = await readFile(0, "utf8");
  if (Buffer.byteLength(stdin, "utf8") > 8 * 1_024) {
    throw new Error("Hermes pilot input exceeds its bound");
  }
  const input = inputSchema.parse(JSON.parse(stdin));
  const client = createHttpPrivateResearchOrchestrationClient({
    baseUrl: new URL(required("ASKRIGOR_PRIVATE_ORCHESTRATION_URL")),
    apiKey: required("ASKRIGOR_PRIVATE_ORCHESTRATION_API_KEY")
  });
  const worker = createHermesProcessSemanticExecutor({
    hermesCheckout: required("ASKRIGOR_HERMES_CHECKOUT"),
    pythonExecutable: required("ASKRIGOR_HERMES_PYTHON"),
    provider: required("ASKRIGOR_HERMES_PROVIDER"),
    model: required("ASKRIGOR_HERMES_MODEL"),
    apiKey: required("ASKRIGOR_HERMES_MODEL_API_KEY"),
    ...(process.env.ASKRIGOR_HERMES_BASE_URL?.trim()
      ? { baseUrl: process.env.ASKRIGOR_HERMES_BASE_URL.trim() }
      : {})
  });
  const result = await runHermesResearchTask(input, client, worker);
  process.stdout.write(`${JSON.stringify(hermesWorkerRunResultSchema.parse(result))}\n`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required Hermes pilot setting is absent: ${name}`);
  return value;
}

main().catch(() => {
  // Do not print provider errors, request bodies, environment, or credentials.
  process.stderr.write("AskRigor Hermes worker pilot failed.\n");
  process.exitCode = 1;
});
