import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

import {
  McpInputValidationError,
  OpenAiTransportError,
  FULL_RUN_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  parseReviewCaseSet,
  runPublicReviewEvaluation,
  selectReviewCases,
  sha256,
  type EvaluationMode,
  type McpCallResult,
  type McpSession,
  type McpToolDescriptor,
  type OpenAiResponsesRequest,
  type ResponsesTransport,
  type RunEvaluationResult,
} from "./public-review-eval-lib.mts";

const execFileAsync = promisify(execFile);
const PRODUCTION_MCP_ENDPOINT = "https://mcp.askrigor.com/mcp";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const APPROVED_CASE_FILE = "docs/public-review-cases-v0.1.0.json";

type ReadCommittedCaseFile = (
  workingDirectory: string,
  commit: string,
) => Promise<string>;

export interface McpInitializationOptions {
  signal: AbortSignal;
  timeout: number;
  maxTotalTimeout: number;
}

export interface PublicReviewCliOptions {
  live: boolean;
  help: boolean;
  mode: EvaluationMode;
  caseIds: string[];
  model: string;
  caseFile: string;
  outputRoot: string;
}

export interface PublicReviewCliRuntime {
  run(input: {
    options: PublicReviewCliOptions;
    apiKey?: string;
  }): Promise<RunEvaluationResult>;
  stdout(message: string): void;
  stderr(message: string): void;
}

export function parsePublicReviewCliArgs(
  argv: readonly string[],
): PublicReviewCliOptions {
  const options: PublicReviewCliOptions = {
    live: false,
    help: false,
    mode: "all",
    caseIds: [],
    model: "chat-latest",
    caseFile: APPROVED_CASE_FILE,
    outputRoot: ".artifacts/public-review-eval",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--live":
        options.live = true;
        break;
      case "--help":
        options.help = true;
        break;
      case "--mode": {
        const value = requireOptionValue(argv, ++index, "--mode");
        if (value !== "direct" && value !== "model" && value !== "all") {
          throw new Error(`invalid mode: ${value}`);
        }
        options.mode = value;
        break;
      }
      case "--case":
        options.caseIds.push(requireOptionValue(argv, ++index, "--case"));
        break;
      case "--model":
        options.model = requireOptionValue(argv, ++index, "--model");
        break;
      case "--output-root":
        options.outputRoot = requireOptionValue(argv, ++index, "--output-root");
        break;
      default:
        throw new Error(`unknown option: ${argument}`);
    }
  }

  return options;
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  environment: Readonly<Record<string, string | undefined>> = process.env,
  runtime: PublicReviewCliRuntime = createProductionRuntime(),
): Promise<number> {
  let options: PublicReviewCliOptions;
  try {
    options = parsePublicReviewCliArgs(argv);
  } catch (error) {
    runtime.stderr(error instanceof Error ? error.message : "Invalid command line.");
    return 2;
  }

  if (options.help) {
    runtime.stdout(renderHelp());
    return 0;
  }
  if (!options.live) {
    runtime.stderr("Refusing network calls without --live.");
    return 2;
  }

  const needsOpenAi = options.mode === "model" || options.mode === "all";
  const apiKey = environment.OPENAI_API_KEY;
  if (needsOpenAi && (apiKey === undefined || apiKey.trim().length === 0)) {
    runtime.stderr("OPENAI_API_KEY is required for model mode.");
    return 2;
  }

  try {
    const result = await runtime.run({
      options,
      ...(needsOpenAi ? { apiKey } : {}),
    });
    runtime.stdout(`Automated result: ${result.report.automated_result.toUpperCase()}`);
    runtime.stdout(`REPORT: ${result.paths.reportJson}`);
    runtime.stdout(`SUMMARY: ${result.paths.summaryMarkdown}`);
    runtime.stdout(`MANIFEST: ${result.paths.sha256Manifest}`);
    return result.exitCode;
  } catch {
    runtime.stderr("Public review run failed safely before a complete result was available.");
    return 1;
  }
}

function createProductionRuntime(): PublicReviewCliRuntime {
  return {
    run: runProductionReview,
    stdout(message) {
      process.stdout.write(`${message}\n`);
    },
    stderr(message) {
      process.stderr.write(`${message}\n`);
    },
  };
}

async function runProductionReview(input: {
  options: PublicReviewCliOptions;
  apiKey?: string;
}): Promise<RunEvaluationResult> {
  const workingDirectory = process.cwd();
  const repository = await readRepositoryIdentity(workingDirectory);
  const caseFileBytes = await readApprovedReviewCaseFile(
    workingDirectory,
    repository.commit,
  );
  const caseSet = parseReviewCaseSet(JSON.parse(caseFileBytes.toString("utf8")));
  const reviewCases = selectReviewCases(caseSet, input.options.caseIds);
  const started = new Date();
  const runId = `${compactUtcTimestamp(started)}-${randomBytes(4).toString("hex")}`;

  const client = new Client({
    name: "askrigor-public-review-eval",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(PRODUCTION_MCP_ENDPOINT),
  );
  const fullRunDeadline = started.getTime() + FULL_RUN_TIMEOUT_MS;
  try {
    await connectMcpClientWithinDeadline(
      (candidateTransport, options) => client.connect(candidateTransport, options),
      transport,
      REQUEST_TIMEOUT_MS,
    );
    const remainingFullRunMs = fullRunDeadline - Date.now();
    if (remainingFullRunMs <= 0) {
      throw new Error("public review full-run deadline expired during MCP initialization");
    }
    const session = createMcpSession(client);
    const responsesTransport = input.apiKey === undefined
      ? undefined
      : createOpenAiResponsesTransport(input.apiKey);
    return await runPublicReviewEvaluation({
      reviewCases,
      mode: input.options.mode,
      model: input.options.model,
      mcpSession: session,
      responsesTransport,
      repository,
      caseFile: {
        path: input.options.caseFile,
        sha256: sha256(caseFileBytes),
      },
      outputRoot: resolve(workingDirectory, input.options.outputRoot),
      runId,
      startedAt: started.toISOString(),
      finishedAt: () => new Date().toISOString(),
      activeSecret: input.apiKey,
      fullRunTimeoutMs: remainingFullRunMs,
    });
  } finally {
    await client.close();
  }
}

export async function connectMcpClientWithinDeadline<TTransport>(
  connect: (
    transport: TTransport,
    options: McpInitializationOptions,
  ) => Promise<void>,
  transport: TTransport,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("MCP initialization deadline is invalid");
  }
  const controller = new AbortController();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      rejectPromise(new Error("MCP initialization deadline expired"));
    }, timeoutMs);
    connect(transport, {
      signal: controller.signal,
      timeout: timeoutMs,
      maxTotalTimeout: timeoutMs,
    }).then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolvePromise();
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        rejectPromise(error);
      },
    );
  });
}

function createMcpSession(client: Client): McpSession {
  return {
    async listTools() {
      const result = await client.listTools(
        undefined,
        { timeout: REQUEST_TIMEOUT_MS, maxTotalTimeout: REQUEST_TIMEOUT_MS },
      );
      return { tools: result.tools as McpToolDescriptor[] };
    },
    async callTool(input, signal) {
      try {
        const result = await client.callTool(
          input,
          undefined,
          {
            timeout: REQUEST_TIMEOUT_MS,
            maxTotalTimeout: REQUEST_TIMEOUT_MS,
            signal,
          },
        );
        return result as unknown as McpCallResult;
      } catch (error) {
        if (
          error instanceof McpError &&
          error.code === ErrorCode.InvalidParams &&
          /Input validation error|Invalid arguments for tool/.test(error.message)
        ) {
          throw new McpInputValidationError("MCP input validation rejected the call");
        }
        throw error;
      }
    },
  };
}

export async function readApprovedReviewCaseFile(
  workingDirectory: string,
  commit: string,
  readCommitted: ReadCommittedCaseFile = readCommittedApprovedCaseFile,
): Promise<Buffer> {
  const caseFilePath = resolve(workingDirectory, APPROVED_CASE_FILE);
  const [workingBytes, committedText] = await Promise.all([
    readFile(caseFilePath),
    readCommitted(workingDirectory, commit),
  ]);
  const committedBytes = Buffer.from(committedText, "utf8");
  if (!workingBytes.equals(committedBytes)) {
    throw new Error("approved public review case file differs from the reported commit");
  }
  return workingBytes;
}

async function readCommittedApprovedCaseFile(
  workingDirectory: string,
  commit: string,
): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["show", `${commit}:${APPROVED_CASE_FILE}`],
    { cwd: workingDirectory, maxBuffer: 1_048_576 },
  );
  return stdout;
}

function createOpenAiResponsesTransport(apiKey: string): ResponsesTransport {
  return {
    async create(request: OpenAiResponsesRequest, signal: AbortSignal) {
      const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        signal,
      });
      const value: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        throw new OpenAiTransportError(response.status, extractOpenAiErrorCode(value));
      }
      return value;
    },
  };
}

async function readRepositoryIdentity(
  workingDirectory: string,
): Promise<{ commit: string; dirty: boolean }> {
  const [{ stdout: commitOutput }, { stdout: statusOutput }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workingDirectory }),
    execFileAsync("git", ["status", "--porcelain", "--untracked-files=no"], {
      cwd: workingDirectory,
    }),
  ]);
  const commit = commitOutput.trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Git commit identity is invalid");
  return { commit, dirty: statusOutput.trim().length > 0 };
}

function extractOpenAiErrorCode(value: unknown): string {
  if (
    typeof value === "object" && value !== null &&
    "error" in value && typeof value.error === "object" && value.error !== null &&
    "code" in value.error && typeof value.error.code === "string"
  ) {
    return value.error.code.slice(0, 100);
  }
  return "openai_http_error";
}

function compactUtcTimestamp(value: Date): string {
  return value.toISOString().replaceAll("-", "").replaceAll(":", "");
}

function requireOptionValue(
  argv: readonly string[],
  index: number,
  option: string,
): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--") || value.trim().length === 0) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function renderHelp(): string {
  return [
    "Usage: npm run review:public-live -- --live [options]",
    "",
    "Options:",
    "  --mode direct|model|all",
    "  --case <case-id>            repeatable",
    "  --model <model-id>",
    "  --output-root <path>",
    "  --help",
  ].join("\n");
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  process.exitCode = await main();
}
