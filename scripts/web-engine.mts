/**
 * The AskRigor web-app engine trial (owner answer 221, 2 November 2026): Claude, through the Claude API, answers one
 * question the way AskRigor's ChatGPT app does. It connects to AskRigor's MCP server itself, offers the model AskRigor's
 * tools and web search, runs the tool loop, and keeps the final answer, an event log and what each request cost.
 * A laptop script, not a site. Each case is paid from the owner's monthly Claude API credit, so a run stops at its budget.
 *
 *   ASKRIGOR_ENGINE_KEY_FILE=<Claude API key file> [ASKRIGOR_ENGINE_WORKSPACE_ID=<id>] \
 *     npx tsx scripts/web-engine.mts --regress <dir> --cases a,b[,c] --out <dir> [--budget 20] [--effort high]
 *     [--max-case-usd 12] [--max-minutes 35] [--max-askrigor-calls 100] [--model claude-opus-5-5]
 *
 *   --regress names a regression harness folder (preamble.md and cases/<id>.md, later turns in cases/<id>.turnN.md);
 *   each case's first message is the preamble, a blank line and the case, as the harness sends it to ChatGPT.
 *   --prompt <file> [--turn <file> ...] --id <id> runs one conversation from files instead.
 *   --anonymous connects to the ChatGPT surface (/mcp) without a sign-in, for checking the plumbing: research tools
 *   refuse there. --tools a,b offers only those AskRigor tools. --dry lists the offered tools and spends nothing.
 *
 * The sign-in (owner question 222) is the owner's: the engine reads a short-lived research:use pass from
 * ASKRIGOR_ENGINE_TOKEN_FILE (default ~/.local/state/askrigor-web-engine/token.json) and sends it only to AskRigor,
 * never to Anthropic. It never prints the pass or the API key, and never sends either as a command-line argument.
 *
 * The engine refuses, without calling AskRigor, every call that would save, submit, review, share or change the
 * account (manage_research_access other than inspect and register_plain_answer), like the ChatGPT harness's preamble
 * and save guard. Its output
 * goes outside the repository: <out>/out/<id>[.turnN].md (the answer delivered), <out>/logs/<id>[.turnN].jsonl (events
 * in the shape of a Codex event log, so the regression judging helpers read both), <out>/usage/<id>.json (each request's
 * usage, cost and time) and <out>/progress.txt.
 */
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlockParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaToolUseBlock,
  BetaUsage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const ASKRIGOR_ORIGIN = "https://mcp.askrigor.com";
export const DEFAULT_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const DEFAULT_TOKEN_FILE = join(homedir(), ".local", "state", "askrigor-web-engine", "token.json");
const MCP_CALL_TIMEOUT_MS = 10 * 60_000;
const MAX_RESPONSE_TOKENS = 64_000;
const MAX_TOOL_CALLS_AT_ONCE = 4;
// A pass must outlast a case: the harness gives a turn 35 minutes.
const PASS_MARGIN_SECONDS = 40 * 60;

/** USD per million tokens (the Claude API price list, read 2 November 2026), and per web search. */
export interface ModelPrice { input: number; output: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number }
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },
};
export const WEB_SEARCH_USD = 0.01;

/** Calls the engine never sends: AskRigor's own preamble forbids the first three, and the rest act on accounts. */
const REFUSED_TOOLS: ReadonlySet<string> = new Set([
  "save_research_findings",
  "submit_research_contribution",
  "submit_lesson_candidate",
  "review_research_contribution",
  "review_evidence_gap_submissions",
]);
/**
 * The manage_research_access actions a research turn uses: reading the account's state, and registering the plain
 * answer before research (owner answer 217b's comparison needs its receipt). Every other action changes the account
 * (accepting a mode, revoking, the note, lesson-report and card-saving settings) or shares an answer.
 */
const RESEARCH_ACCESS_ACTIONS: ReadonlySet<unknown> = new Set(["inspect", "register_plain_answer"]);
export const REFUSAL_TEXT =
  "Not sent: this AskRigor web-app engine trial makes no save, submission, review, share or account change. " +
  "Continue without this call.";

/** Why the engine refuses this call, or undefined when it may go to AskRigor. */
export function refusalFor(name: string, input: unknown): string | undefined {
  if (REFUSED_TOOLS.has(name)) return REFUSAL_TEXT;
  if (name === "manage_research_access") {
    const action = typeof input === "object" && input !== null ? (input as Record<string, unknown>).action : undefined;
    if (!RESEARCH_ACCESS_ACTIONS.has(action)) return REFUSAL_TEXT;
  }
  return undefined;
}

export interface McpToolDescription {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** A Claude tool for an MCP tool: the same name, description and input schema, without the schema's $schema line. */
export function claudeToolFor(tool: McpToolDescription): BetaTool {
  const { $schema: _dialect, ...schema } = tool.inputSchema;
  return {
    name: tool.name,
    description: tool.description ?? "",
    input_schema: { ...schema, type: "object" } as { type: "object"; [key: string]: unknown },
  };
}

/** The web tools Claude's app would have, standing in for the web search ChatGPT's app has. */
export function webTools(maxUsesPerRequest: number): BetaToolUnion[] {
  return [
    { type: "web_search_20260209", name: "web_search", max_uses: maxUsesPerRequest },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: maxUsesPerRequest },
  ];
}

/**
 * What the model reads from an AskRigor result: its text, then its structured content as compact JSON. AskRigor's
 * text is a short summary and the structured content holds the data (a protocol page, a check's next steps), which
 * ChatGPT's app also shows its model.
 */
export function toolResultContent(result: CallToolResult): BetaTextBlockParam[] {
  const blocks: BetaTextBlockParam[] = [];
  for (const part of result.content ?? []) {
    blocks.push({ type: "text", text: part.type === "text" ? part.text : JSON.stringify(part) });
  }
  if (result.structuredContent !== undefined) {
    blocks.push({ type: "text", text: JSON.stringify(result.structuredContent) });
  }
  return blocks.length > 0 ? blocks : [{ type: "text", text: "(empty result)" }];
}

/** The cost in USD of one response, from its usage, pricing each fallback attempt at its own model's prices. */
export function costOf(usage: BetaUsage, model: string): number {
  const iterations = (usage.iterations ?? []) as unknown as Array<Record<string, unknown>>;
  const fallbacks = iterations.filter((entry) => entry.type === "fallback_message");
  const parts: Array<{ model: string; usage: Record<string, unknown> }> = fallbacks.length > 0
    ? iterations.filter((entry) => entry.type === "message" || entry.type === "fallback_message")
      .map((entry) => ({ model: entry.type === "fallback_message" ? String(entry.model) : model, usage: entry }))
    : [{ model, usage: usage as unknown as Record<string, unknown> }];
  let total = 0;
  for (const part of parts) {
    const price = MODEL_PRICES[part.model];
    if (price === undefined) throw new Error(`No price for ${part.model}`);
    const count = (name: string) => typeof part.usage[name] === "number" ? part.usage[name] as number : 0;
    const creation = part.usage.cache_creation as { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
      | null | undefined;
    const written1h = creation?.ephemeral_1h_input_tokens ?? 0;
    const written5m = creation === null || creation === undefined
      ? count("cache_creation_input_tokens")
      : creation.ephemeral_5m_input_tokens ?? 0;
    total += (count("input_tokens") * price.input + count("output_tokens") * price.output +
      written5m * price.cacheWrite5m + written1h * price.cacheWrite1h +
      count("cache_read_input_tokens") * price.cacheRead) / 1_000_000;
  }
  return total + (usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

/** The delivered answer of a response: its text blocks, in order. */
export function answerText(content: readonly BetaContentBlock[]): string {
  return content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join("\n\n")
    .trim();
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The pass the owner's sign-in left, or a reason it can't be used. Never printed. */
export function readPass(path: string, nowSeconds: number): { token: string; expiresAt: number } | { problem: string } {
  if (!existsSync(path)) return { problem: `no sign-in at ${path}: run the sign-in first (owner question 222)` };
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { return { problem: "the sign-in file is not JSON" }; }
  const record = parsed as { access_token?: unknown; expires_at?: unknown };
  if (typeof record.access_token !== "string" || typeof record.expires_at !== "number") {
    return { problem: "the sign-in file lacks a pass or its expiry" };
  }
  if (record.expires_at - nowSeconds < PASS_MARGIN_SECONDS) {
    return { problem: `the pass expires at ${new Date(record.expires_at * 1000).toISOString()}: sign in again` };
  }
  return { token: record.access_token, expiresAt: record.expires_at };
}

/** A secret file's one value, without white space. Never printed. */
function secretFrom(path: string): string {
  const value = readFileSync(path, "utf8").trim();
  if (value.length === 0 || /\s/u.test(value)) throw new Error("The key file must hold exactly one value.");
  return value;
}

/** Appends Codex-shaped events, so the regression helpers that read Codex event logs read these too. */
class EventLog {
  private item = 0;
  constructor(private readonly path: string) { writeFileSync(path, ""); }
  event(record: Record<string, unknown>) { appendFileSync(this.path, JSON.stringify(record) + "\n"); }
  completed(item: Record<string, unknown>) { this.event({ type: "item.completed", item: { id: `item_${this.item++}`, ...item } }); }
}

export interface EngineLimits { maxCaseUsd: number; maxMinutes: number; maxAskRigorCalls: number; webUsesPerRequest: number }
export interface TurnOutcome {
  answer: string;
  stop: "answered" | "refusal" | "max_tokens" | "case_cost_limit" | "time_limit" | "api_error";
  detail?: string;
  requests: number;
  askrigorCalls: number;
  refusedCalls: number;
  webSearches: number;
  webFetches: number;
  costUsd: number;
  seconds: number;
}

interface Conversation {
  anthropic: Anthropic;
  mcp: Client;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  system: BetaTextBlockParam[];
  tools: BetaToolUnion[];
  messages: BetaMessageParam[];
  limits: EngineLimits;
  usageLog: Array<Record<string, unknown>>;
  caseCostUsd: number;
}

async function callAskRigor(mcp: Client, call: BetaToolUseBlock): Promise<{ result?: CallToolResult; error?: string }> {
  try {
    const result = await mcp.callTool({ name: call.name, arguments: call.input as Record<string, unknown> }, undefined, {
      timeout: MCP_CALL_TIMEOUT_MS,
      maxTotalTimeout: MCP_CALL_TIMEOUT_MS,
      resetTimeoutOnProgress: true,
    });
    return { result: result as CallToolResult };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Streams one request, retrying a dropped connection or an overloaded API up to three times. */
async function respond(conversation: Conversation): Promise<BetaMessage> {
  for (let attempt = 1; ; attempt++) {
    try {
      const stream = conversation.anthropic.beta.messages.stream({
        model: conversation.model,
        max_tokens: MAX_RESPONSE_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: conversation.effort },
        cache_control: { type: "ephemeral" },
        system: conversation.system,
        tools: conversation.tools,
        messages: conversation.messages,
      });
      return await stream.finalMessage();
    } catch (error) {
      const retryable = error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.RateLimitError ||
        error instanceof Anthropic.InternalServerError ||
        (error instanceof Anthropic.APIError && (error.status === 529 || error.status === undefined));
      if (!retryable || attempt >= 3) throw error;
      await new Promise((done) => setTimeout(done, 15_000 * attempt));
    }
  }
}

/** Runs the tool loop until the model answers or a limit stops it. The conversation keeps every block, unchanged. */
async function runTurn(conversation: Conversation, log: EventLog, userText: string): Promise<TurnOutcome> {
  const started = Date.now();
  const outcome: TurnOutcome = {
    answer: "", stop: "answered", requests: 0, askrigorCalls: 0, refusedCalls: 0, webSearches: 0, webFetches: 0,
    costUsd: 0, seconds: 0,
  };
  conversation.messages.push({ role: "user", content: userText });
  log.event({ type: "turn.started" });
  const totals = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  try {
    for (;;) {
      if (Date.now() - started > conversation.limits.maxMinutes * 60_000) { outcome.stop = "time_limit"; break; }
      if (conversation.caseCostUsd >= conversation.limits.maxCaseUsd) { outcome.stop = "case_cost_limit"; break; }
      const requestStarted = Date.now();
      const message = await respond(conversation);
      const cost = costOf(message.usage, conversation.model);
      outcome.requests++;
      outcome.costUsd += cost;
      conversation.caseCostUsd += cost;
      totals.input += message.usage.input_tokens;
      totals.cacheRead += message.usage.cache_read_input_tokens ?? 0;
      totals.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
      totals.output += message.usage.output_tokens;
      outcome.webSearches += message.usage.server_tool_use?.web_search_requests ?? 0;
      outcome.webFetches += message.usage.server_tool_use?.web_fetch_requests ?? 0;
      const record = {
        request: outcome.requests, stop_reason: message.stop_reason, model: message.model,
        seconds: (Date.now() - requestStarted) / 1000, cost_usd: cost, usage: message.usage,
      };
      conversation.usageLog.push(record);
      log.event({ type: "engine.response", ...record });
      conversation.messages.push({ role: "assistant", content: message.content });

      for (const block of message.content) {
        if (block.type === "thinking" && block.thinking.trim() !== "") log.completed({ type: "reasoning", text: block.thinking });
        if (block.type === "server_tool_use") {
          log.completed(block.name === "web_search"
            ? { type: "web_search", query: (block.input as { query?: unknown }).query }
            : { type: block.name, input: block.input });
        }
      }
      const text = answerText(message.content);
      if (text !== "") log.completed({ type: "agent_message", text });

      if (message.stop_reason === "pause_turn") continue;
      if (message.stop_reason === "refusal") {
        outcome.stop = "refusal";
        outcome.detail = JSON.stringify(message.stop_details ?? null);
        outcome.answer = text;
        break;
      }
      const calls = message.content.filter((block): block is BetaToolUseBlock => block.type === "tool_use");
      if (message.stop_reason === "max_tokens") {
        outcome.stop = "max_tokens";
        outcome.answer = text;
        if (calls.length === 0) break;
        // A call cut off at the limit is never run; the model is told and continues.
      }
      if (calls.length === 0) { outcome.answer = text; break; }

      const results: BetaToolResultBlockParam[] = new Array(calls.length);
      const queue = calls.map((call, index) => ({ call, index }));
      const worker = async () => {
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
          const { call, index } = next;
          const refusal = message.stop_reason === "max_tokens"
            ? "Not sent: this call was cut off by the response's length limit. Send it again, shorter if you can."
            : refusalFor(call.name, call.input) ??
              (outcome.askrigorCalls >= conversation.limits.maxAskRigorCalls
                ? `Not sent: this turn reached the engine's limit of ${conversation.limits.maxAskRigorCalls} AskRigor ` +
                  "calls. Finish the answer with what you have, and say what was not done."
                : undefined);
          log.event({ type: "item.started", item: { type: "mcp_tool_call", server: "askrigor", tool: call.name } });
          if (refusal !== undefined) {
            outcome.refusedCalls++;
            results[index] = { type: "tool_result", tool_use_id: call.id, is_error: true, content: refusal };
            log.completed({
              type: "mcp_tool_call", server: "askrigor", tool: call.name, arguments: call.input, result: null,
              error: refusal, status: "refused_by_engine",
            });
            continue;
          }
          outcome.askrigorCalls++;
          const callStarted = Date.now();
          const { result, error } = await callAskRigor(conversation.mcp, call);
          results[index] = result === undefined
            ? { type: "tool_result", tool_use_id: call.id, is_error: true, content: `AskRigor call failed: ${error}` }
            : {
              type: "tool_result", tool_use_id: call.id, content: toolResultContent(result),
              ...(result.isError === true ? { is_error: true } : {}),
            };
          log.completed({
            type: "mcp_tool_call", server: "askrigor", tool: call.name, arguments: call.input,
            result: result === undefined ? null : { content: result.content, structured_content: result.structuredContent },
            error: error ?? null, status: error === undefined ? "completed" : "failed",
            seconds: (Date.now() - callStarted) / 1000,
          });
        }
      };
      await Promise.all(Array.from({ length: Math.min(MAX_TOOL_CALLS_AT_ONCE, calls.length) }, worker));
      conversation.messages.push({ role: "user", content: results });
    }
  } catch (error) {
    outcome.stop = "api_error";
    outcome.detail = error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
  }
  outcome.seconds = (Date.now() - started) / 1000;
  log.event({
    type: "turn.completed",
    usage: {
      input_tokens: totals.input + totals.cacheRead + totals.cacheWrite, cached_input_tokens: totals.cacheRead,
      cache_write_input_tokens: totals.cacheWrite, output_tokens: totals.output,
    },
    engine: { ...outcome, answer: undefined, answer_sha256: sha256(outcome.answer) },
  });
  return outcome;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function argumentsNamed(name: string): string[] {
  return process.argv.flatMap((value, index) => value === name && index + 1 < process.argv.length ? [process.argv[index + 1]!] : []);
}
function numberArgument(name: string, fallback: number): number {
  const value = argument(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}

interface CaseInput { id: string; turns: string[] }

function casesFromArguments(): CaseInput[] {
  const regress = argument("--regress");
  if (regress !== undefined) {
    const preamble = readFileSync(join(regress, "preamble.md"), "utf8").trimEnd();
    const ids = (argument("--cases") ?? "").split(",").map((id) => id.trim()).filter((id) => id !== "");
    if (ids.length === 0) throw new Error("--cases names no case");
    return ids.map((id) => {
      const turns = [`${preamble}\n\n${readFileSync(join(regress, "cases", `${id}.md`), "utf8")}`];
      for (let turn = 2; existsSync(join(regress, "cases", `${id}.turn${turn}.md`)); turn++) {
        turns.push(readFileSync(join(regress, "cases", `${id}.turn${turn}.md`), "utf8"));
      }
      return { id, turns };
    });
  }
  const prompt = argument("--prompt");
  const id = argument("--id");
  if (prompt === undefined || id === undefined) throw new Error("Give --regress and --cases, or --prompt and --id.");
  return [{ id, turns: [readFileSync(prompt, "utf8"), ...argumentsNamed("--turn").map((file) => readFileSync(file, "utf8"))] }];
}

function systemPrompt(instructions: string | undefined, today: string): BetaTextBlockParam[] {
  return [{
    type: "text",
    text: [
      `Today's date is ${today}.`,
      "AskRigor's tools are connected as the AskRigor app; you also have web search and web fetch.",
      ...(instructions === undefined ? [] : ["", "AskRigor's server instructions:", instructions]),
    ].join("\n"),
    cache_control: { type: "ephemeral", ttl: "1h" },
  }];
}

async function connectAskRigor(anonymous: boolean, nowSeconds: number): Promise<{ mcp: Client; passExpiresAt?: number }> {
  let headers: Record<string, string> = {};
  let passExpiresAt: number | undefined;
  if (!anonymous) {
    const pass = readPass(process.env.ASKRIGOR_ENGINE_TOKEN_FILE ?? DEFAULT_TOKEN_FILE, nowSeconds);
    if ("problem" in pass) throw new Error(pass.problem);
    headers = { authorization: `Bearer ${pass.token}` };
    passExpiresAt = pass.expiresAt;
  }
  const mcp = new Client({ name: "askrigor-web-engine-trial", version: "0.1.0" });
  const surface = anonymous ? "/mcp" : "/mcp/claude";
  await mcp.connect(new StreamableHTTPClientTransport(new URL(surface, ASKRIGOR_ORIGIN), { requestInit: { headers } }));
  return { mcp, ...(passExpiresAt === undefined ? {} : { passExpiresAt }) };
}

async function main(): Promise<void> {
  const out = resolve(argument("--out") ?? "");
  if (argument("--out") === undefined) throw new Error("--out names no folder");
  const cases = casesFromArguments();
  const anonymous = process.argv.includes("--anonymous");
  const dry = process.argv.includes("--dry");
  const model = argument("--model") ?? DEFAULT_MODEL;
  if (MODEL_PRICES[model] === undefined) throw new Error(`No price for ${model}`);
  const effort = (argument("--effort") ?? "high") as Conversation["effort"];
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort)) throw new Error("--effort is low, medium, high, xhigh or max");
  const budget = numberArgument("--budget", 20);
  const limits: EngineLimits = {
    maxCaseUsd: numberArgument("--max-case-usd", 12),
    maxMinutes: numberArgument("--max-minutes", 35),
    maxAskRigorCalls: numberArgument("--max-askrigor-calls", 100),
    webUsesPerRequest: numberArgument("--web-uses-per-request", 8),
  };
  for (const folder of ["out", "logs", "usage"]) mkdirSync(join(out, folder), { recursive: true });
  const progress = (line: string) => appendFileSync(join(out, "progress.txt"), `${line} ${new Date().toISOString()}\n`);

  const version = await fetch(new URL("/version", ASKRIGOR_ORIGIN)).then((response) => response.json()).catch(() => null);
  const only = argument("--tools")?.split(",").map((name) => name.trim());
  let spent = 0;
  const ledger = join(out, "usage", "ledger.json");
  if (existsSync(ledger)) spent = (JSON.parse(readFileSync(ledger, "utf8")) as { spent_usd: number }).spent_usd;

  for (const testCase of cases) {
    if (spent >= budget) { progress(`${testCase.id} NOT RUN: the run's budget of $${budget} is spent ($${spent.toFixed(2)})`); continue; }
    const { mcp, passExpiresAt } = await connectAskRigor(anonymous, Date.now() / 1000);
    try {
      const listed = await mcp.listTools();
      const tools = listed.tools.filter((tool) => only === undefined || only.includes(tool.name))
        .map((tool) => claudeToolFor(tool as McpToolDescription));
      if (dry) {
        console.log(JSON.stringify({ version, tools: tools.map((tool) => tool.name), instructions: mcp.getInstructions() !== undefined }));
        return;
      }
      const key = process.env.ASKRIGOR_ENGINE_KEY_FILE;
      if (key === undefined) throw new Error("ASKRIGOR_ENGINE_KEY_FILE names no key file");
      const workspace = process.env.ASKRIGOR_ENGINE_WORKSPACE_ID?.trim();
      const anthropic = new Anthropic({
        apiKey: secretFrom(key),
        maxRetries: 4,
        timeout: 20 * 60_000,
        ...(workspace === undefined || workspace === "" ? {} : { defaultHeaders: { "anthropic-workspace-id": workspace } }),
      });
      const conversation: Conversation = {
        anthropic, mcp, model, effort, limits,
        system: systemPrompt(mcp.getInstructions(), new Date().toISOString().slice(0, 10)),
        tools: [...tools, ...webTools(limits.webUsesPerRequest)],
        messages: [], usageLog: [], caseCostUsd: 0,
      };
      const caseStarted = Date.now();
      const turns: Array<Record<string, unknown>> = [];
      for (const [index, userText] of testCase.turns.entries()) {
        const name = index === 0 ? testCase.id : `${testCase.id}.turn${index + 1}`;
        const log = new EventLog(join(out, "logs", `${name}.jsonl`));
        log.event({ type: "thread.started", thread_id: randomUUID(), engine: { model, effort, surface: anonymous ? "/mcp" : "/mcp/claude", version } });
        writeFileSync(join(out, "logs", `${name}.prompt.md`), userText);
        const outcome = await runTurn(conversation, log, userText);
        writeFileSync(join(out, "out", `${name}.md`), outcome.answer);
        turns.push({ name, ...outcome, answer: undefined, answer_sha256: sha256(outcome.answer) });
        progress(`${name} ${outcome.stop} $${outcome.costUsd.toFixed(2)} ${Math.round(outcome.seconds)}s ` +
          `askrigor ${outcome.askrigorCalls} refused ${outcome.refusedCalls} web ${outcome.webSearches}/${outcome.webFetches}`);
        if (outcome.stop !== "answered" && outcome.stop !== "max_tokens") break;
      }
      spent += conversation.caseCostUsd;
      writeFileSync(join(out, "usage", `${testCase.id}.json`), JSON.stringify({
        case: testCase.id, model, effort, limits, version, surface: anonymous ? "/mcp" : "/mcp/claude",
        pass_expires_at: passExpiresAt === undefined ? null : new Date(passExpiresAt * 1000).toISOString(),
        started: new Date(caseStarted).toISOString(), seconds: (Date.now() - caseStarted) / 1000,
        cost_usd: conversation.caseCostUsd, turns, requests: conversation.usageLog,
      }, null, 2));
      writeFileSync(ledger, JSON.stringify({ spent_usd: spent }));
    } finally {
      await mcp.close();
    }
  }
  progress(`DONE spent $${spent.toFixed(2)} of $${budget}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error));
    process.exitCode = 1;
  });
}
