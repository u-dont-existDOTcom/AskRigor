/**
 * The web-app engine trial's cases, answered by a Claude worker on the owner's Claude plan instead of the Claude API
 * (the owner, 2 November 2026: "why we need to use the api credits if there's no web app. you can open a claude worker
 * any time right here"). Each turn is Claude Code run headless (`claude -p`) with the engine's system prompt, AskRigor's
 * tools on the engine's sign-in, web search and web fetch, and nothing else. No API credit is used.
 *
 *   npx tsx scripts/web-engine-worker.mts --regress <dir> --cases a,b[,c] --out <dir> [--effort high]
 *     [--max-minutes 35] [--max-askrigor-calls 100] [--require-protocols-by 10] [--model claude-opus-5-5]
 *
 *   --regress, --cases, --prompt/--turn/--id and ASKRIGOR_ENGINE_ACCOUNT_REFERENCE are the engine's.
 *   --refuse a,b refuses those AskRigor tools too, for checking the hook. --claude names the CLI (default
 *   ~/.local/bin/claude).
 *
 * The engine's own functions decide every tool call, in a hook Claude Code runs before and after each one (--hook pre
 * and --hook post): the refusals of every save, submission, review, share and account change, the limit of AskRigor
 * calls a turn, the save guard and the protocol guard. Before each case it checks the account and builds the system
 * prompt as the engine does. The worker starts from an empty environment, so Claude Code uses its own claude.ai login,
 * never an API key (a turn that reports one is stopped), and it ignores the user's settings, plugins, skills and other
 * MCP servers. The pass is only in the worker's environment, for Claude Code to send to AskRigor, and is scrubbed from
 * what the worker writes. Output, as the engine's: <out>/out/<id>[.turnN].md, <out>/logs/<id>[.turnN].jsonl (Claude
 * Code's stream-json events), <out>/usage/<id>.json and <out>/progress.txt.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ASKRIGOR_ORIGIN,
  DEFAULT_MODEL,
  DEFAULT_TOKEN_FILE,
  accountProblem,
  argument,
  casesFromArguments,
  connectAskRigor,
  numberArgument,
  protocolLoaded,
  protocolsMissing,
  readPass,
  refusalFor,
  saveSign,
  sha256,
  skillBody,
  systemPrompt,
} from "./web-engine.mts";

const SERVER = "askrigor";
const PREFIX = `mcp__${SERVER}__`;
/** The engine's refused tools, also denied by Claude Code's own permissions in case the hook can't run. */
const DENIED_TOOLS = [
  "save_research_findings", "submit_research_contribution", "submit_lesson_candidate", "review_research_contribution",
  "review_evidence_gap_submissions",
].map((tool) => `${PREFIX}${tool}`);

/** What the hooks keep over a case, in a file the runner reads after each turn. */
export interface WorkerState {
  maxAskRigorCalls: number;
  requireProtocolsBy?: number;
  refuse: string[];
  /** AskRigor calls completed over the whole case, for the protocol guard; calls sent in the current turn. */
  caseAskRigorCalls: number;
  turnAskRigorCalls: number;
  refusedCalls: number;
  webSearches: number;
  webFetches: number;
  protocolsLoaded: string[];
  /** How the first results reached the hook, for checking that it reads them. */
  responseShapes: string[];
  stop?: { reason: "save_guard" | "protocol_guard"; detail: string };
}

export interface HookEvent { tool_name?: string; tool_input?: unknown; tool_response?: unknown }

/** The hook's answer: nothing (the call goes ahead), a refusal the model reads, or the end of the turn. */
export type HookAnswer = undefined | { deny: string } | { stop: string };

export function newState(maxAskRigorCalls: number, requireProtocolsBy: number | undefined, refuse: string[]): WorkerState {
  return {
    maxAskRigorCalls, ...(requireProtocolsBy === undefined ? {} : { requireProtocolsBy }), refuse,
    caseAskRigorCalls: 0, turnAskRigorCalls: 0, refusedCalls: 0, webSearches: 0, webFetches: 0,
    protocolsLoaded: [], responseShapes: [],
  };
}

function jsonObject(text: unknown): Record<string, unknown> | undefined {
  if (typeof text !== "string") return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/** An AskRigor result's structured content, from the tool response Claude Code gives a hook. */
export function structuredFrom(response: unknown): unknown {
  if (typeof response === "string") return jsonObject(response);
  if (Array.isArray(response)) {
    return response.map((block) => jsonObject((block as { text?: unknown } | null)?.text)).find((value) => value !== undefined);
  }
  if (typeof response === "object" && response !== null) {
    const record = response as Record<string, unknown>;
    if (record.structuredContent !== undefined) return record.structuredContent;
    if (Array.isArray(record.content)) return structuredFrom(record.content);
  }
  return undefined;
}

function shapeOf(response: unknown): string {
  if (Array.isArray(response)) return `array of ${response.map((block) => String((block as { type?: unknown } | null)?.type)).join(",")}`;
  if (typeof response === "object" && response !== null) return `object with ${Object.keys(response).join(",")}`;
  return typeof response;
}

const stopOf = (state: WorkerState): HookAnswer =>
  state.stop === undefined ? undefined : { stop: `${state.stop.reason}: ${state.stop.detail}` };

/**
 * Before a call. The protocol guard is checked here, once the calls before have completed, as the engine checks it after
 * each batch of calls; a call is counted for the guard when it completes, and for the turn's limit when it is sent.
 */
export function beforeCall(state: WorkerState, event: HookEvent): HookAnswer {
  const name = event.tool_name ?? "";
  if (state.stop !== undefined) return stopOf(state);
  if (name === "WebSearch") { state.webSearches++; return undefined; }
  if (name === "WebFetch") { state.webFetches++; return undefined; }
  if (!name.startsWith(PREFIX)) return { deny: "Not available in this trial: only AskRigor's tools, web search and web fetch." };
  const tool = name.slice(PREFIX.length);
  const missing = protocolsMissing(new Set(state.protocolsLoaded), state.caseAskRigorCalls, state.requireProtocolsBy);
  if (missing !== undefined) {
    state.stop = { reason: "protocol_guard", detail: `not loaded after ${state.caseAskRigorCalls} AskRigor calls: ${missing.join(", ")}` };
    return stopOf(state);
  }
  const refusal = refusalFor(tool, event.tool_input) ??
    (state.refuse.includes(tool) ? "Not sent: refused for the worker's self-check." : undefined) ??
    (state.turnAskRigorCalls >= state.maxAskRigorCalls
      ? `Not sent: this turn reached the engine's limit of ${state.maxAskRigorCalls} AskRigor calls. ` +
        "Finish the answer with what you have, and say what was not done."
      : undefined);
  if (refusal !== undefined) { state.refusedCalls++; return { deny: refusal }; }
  state.turnAskRigorCalls++;
  return undefined;
}

/** After a call: the protocols loaded, and the harness's save guard (saving is one switch for the whole account). */
export function afterCall(state: WorkerState, event: HookEvent): HookAnswer {
  const name = event.tool_name ?? "";
  if (!name.startsWith(PREFIX)) return undefined;
  const tool = name.slice(PREFIX.length);
  state.caseAskRigorCalls++;
  if (state.responseShapes.length < 3) state.responseShapes.push(`${tool}: ${shapeOf(event.tool_response)}`);
  const structured = structuredFrom(event.tool_response);
  const protocol = protocolLoaded(tool, event.tool_input, structured);
  if (protocol !== undefined && !state.protocolsLoaded.includes(protocol)) state.protocolsLoaded.push(protocol);
  const sign = saveSign(tool, structured);
  if (sign !== undefined && state.stop === undefined) state.stop = { reason: "save_guard", detail: `${sign} at ${tool}` };
  return stopOf(state);
}

function readState(path: string): WorkerState {
  return JSON.parse(readFileSync(path, "utf8")) as WorkerState;
}

/** Hooks for calls made at once run at once: one changes the state at a time. */
function withState<T>(path: string, change: (state: WorkerState) => T): T {
  const lock = `${path}.lock`;
  const deadline = Date.now() + 20_000;
  for (;;) {
    try { closeSync(openSync(lock, "wx")); break; } catch {
      if (Date.now() > deadline) throw new Error("the worker's state stayed locked");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    const state = readState(path);
    const answer = change(state);
    writeFileSync(path, JSON.stringify(state));
    return answer;
  } finally {
    unlinkSync(lock);
  }
}

/** Claude Code's hook: reads the event on standard input and answers on standard output. It fails closed. */
function hook(phase: string): void {
  let answer: HookAnswer;
  try {
    const event = JSON.parse(readFileSync(0, "utf8")) as HookEvent;
    const path = process.env.ASKRIGOR_WORKER_STATE;
    if (path === undefined) throw new Error("ASKRIGOR_WORKER_STATE names no state file");
    answer = withState(path, (state) => phase === "pre" ? beforeCall(state, event) : afterCall(state, event));
  } catch (error) {
    const reason = `the trial's check could not run (${error instanceof Error ? error.message : String(error)})`;
    answer = phase === "pre" ? { deny: `Not sent: ${reason}.` } : { stop: reason };
  }
  if (answer === undefined) return;
  const deny = (reason: string) => ({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  });
  process.stdout.write(JSON.stringify("deny" in answer
    ? deny(answer.deny)
    : { continue: false, stopReason: answer.stop, ...(phase === "pre" ? deny(answer.stop) : {}) }));
}

interface WorkerTurn {
  answer: string;
  stop: string;
  seconds: number;
  init?: Record<string, unknown>;
  result?: Record<string, unknown>;
  compactions: number;
}

/** One turn of `claude -p`: the message on standard input, stream-json events out, killed at the time limit. */
async function workerTurn(claude: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, userText: string,
  logPath: string, pass: string, maxMinutes: number): Promise<WorkerTurn> {
  const started = Date.now();
  const scrub = (text: string) => text.split(pass).join("[pass]");
  writeFileSync(logPath, "");
  const outcome: WorkerTurn = { answer: "", stop: "", seconds: 0, compactions: 0 };
  let forced: string | undefined;
  const child = spawn(claude, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: true });
  const kill = (why: string) => {
    forced ??= why;
    try { process.kill(-child.pid!, "SIGTERM"); } catch { /* already gone */ }
    setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already gone */ } }, 10_000).unref();
  };
  const timer = setTimeout(() => kill("time_limit"), maxMinutes * 60_000);
  let buffer = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    buffer += chunk;
    for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
      const line = scrub(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      if (line.trim() === "") continue;
      appendFileSync(logPath, line + "\n");
      const event = jsonObject(line);
      if (event?.type === "system" && event.subtype === "init") {
        outcome.init = event;
        // No API credit: a worker that reports an API key, or isn't connected to AskRigor, stops before its first request.
        if (event.apiKeySource !== undefined && event.apiKeySource !== "none") kill("api_key_in_use");
        const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers as Array<Record<string, unknown>> : [];
        if (!servers.some((server) => server.name === SERVER && server.status === "connected")) kill("askrigor_not_connected");
      }
      if (event?.type === "system" && event.subtype === "compact_boundary") outcome.compactions++;
      if (event?.type === "result") outcome.result = event;
    }
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  child.stdin.end(userText);
  const code = await new Promise<number | null>((done) => child.on("close", done));
  clearTimeout(timer);
  if (stderr.trim() !== "") writeFileSync(logPath.replace(/\.jsonl$/u, ".stderr.txt"), scrub(stderr));
  outcome.seconds = (Date.now() - started) / 1000;
  outcome.answer = typeof outcome.result?.result === "string" ? outcome.result.result : "";
  outcome.stop = forced ?? (outcome.result?.subtype === "success" && outcome.result.is_error !== true
    ? "answered"
    : `claude_${String(outcome.result?.subtype ?? `exit_${code}`)}`);
  return outcome;
}

async function main(): Promise<void> {
  const phase = argument("--hook");
  if (phase !== undefined) { hook(phase); return; }
  const out = resolve(argument("--out") ?? "");
  if (argument("--out") === undefined) throw new Error("--out names no folder");
  const cases = casesFromArguments();
  const model = argument("--model") ?? DEFAULT_MODEL;
  const effort = argument("--effort") ?? "high";
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort)) throw new Error("--effort is low, medium, high, xhigh or max");
  const maxMinutes = numberArgument("--max-minutes", 35);
  const maxAskRigorCalls = numberArgument("--max-askrigor-calls", 100);
  const requireProtocolsBy = argument("--require-protocols-by") === undefined ? undefined : numberArgument("--require-protocols-by", 1);
  const refuse = (argument("--refuse") ?? "").split(",").map((tool) => tool.trim()).filter((tool) => tool !== "");
  const claude = argument("--claude") ?? join(homedir(), ".local", "bin", "claude");
  for (const folder of ["out", "logs", "usage", "worker", join("worker", "cwd")]) mkdirSync(join(out, folder), { recursive: true });
  const progress = (line: string) => appendFileSync(join(out, "progress.txt"), `${line} ${new Date().toISOString()}\n`);

  const version = await fetch(new URL("/version", ASKRIGOR_ORIGIN)).then((response) => response.json()).catch(() => null);
  const skillFile = readFileSync(new URL("../skills/askrigor/SKILL.md", import.meta.url), "utf8");
  const skill = skillBody(skillFile);
  const here = fileURLToPath(import.meta.url);
  const tsx = join(dirname(here), "..", "node_modules", ".bin", "tsx");
  const hookCommand = (when: string) => ({ type: "command", command: `${JSON.stringify(tsx)} ${JSON.stringify(here)} --hook ${when}`, timeout: 60 });
  const settingsFile = join(out, "worker", "settings.json");
  writeFileSync(settingsFile, JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: "*", hooks: [hookCommand("pre")] }],
      PostToolUse: [{ matcher: "*", hooks: [hookCommand("post")] }],
    },
  }, null, 2));
  // Claude Code expands the variable from the worker's environment, so the pass is in no file.
  const mcpFile = join(out, "worker", "mcp.json");
  writeFileSync(mcpFile, JSON.stringify({
    mcpServers: {
      [SERVER]: {
        type: "http", url: new URL("/mcp/claude", ASKRIGOR_ORIGIN).href,
        headers: { Authorization: "Bearer ${ASKRIGOR_WORKER_PASS}" },
      },
    },
  }, null, 2));

  for (const testCase of cases) {
    const nowSeconds = Date.now() / 1000;
    const pass = readPass(process.env.ASKRIGOR_ENGINE_TOKEN_FILE ?? DEFAULT_TOKEN_FILE, nowSeconds);
    if ("problem" in pass) { progress(`${testCase.id} NOT RUN, and the run stops: ${pass.problem}`); return; }
    const { mcp, passExpiresAt } = await connectAskRigor(false, nowSeconds);
    let system: string;
    try {
      const inspected = await mcp.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
      const problem = accountProblem(inspected.structuredContent, process.env.ASKRIGOR_ENGINE_ACCOUNT_REFERENCE?.trim() || undefined);
      if (problem !== undefined) { progress(`${testCase.id} NOT RUN, and the run stops: ${problem}`); return; }
      system = systemPrompt(mcp.getInstructions(), new Date().toISOString().slice(0, 10), skill)[0]!.text;
    } finally {
      await mcp.close();
    }
    const systemFile = join(out, "worker", `${testCase.id}.system.txt`);
    writeFileSync(systemFile, system);
    const stateFile = join(out, "worker", `${testCase.id}.state.json`);
    writeFileSync(stateFile, JSON.stringify(newState(maxAskRigorCalls, requireProtocolsBy, refuse)));
    const env: NodeJS.ProcessEnv = {
      HOME: homedir(), USER: process.env.USER ?? "", LANG: "C", LC_ALL: "C", TERM: "dumb",
      PATH: [dirname(process.execPath), join(homedir(), ".local", "bin"), "/usr/local/bin", "/usr/bin", "/bin"].join(":"),
      // All of AskRigor's tools offered at once, as the engine offers them, not found through a search first.
      ENABLE_TOOL_SEARCH: "false",
      ASKRIGOR_WORKER_PASS: pass.token,
      ASKRIGOR_WORKER_STATE: stateFile,
    };
    const sessionId = randomUUID();
    const caseStarted = Date.now();
    const turns: Array<Record<string, unknown>> = [];
    let init: Record<string, unknown> | undefined;
    for (const [index, userText] of testCase.turns.entries()) {
      const name = index === 0 ? testCase.id : `${testCase.id}.turn${index + 1}`;
      writeFileSync(join(out, "logs", `${name}.prompt.md`), userText);
      const before = withState(stateFile, (state) => { state.turnAskRigorCalls = 0; return { ...state }; });
      const args = [
        "-p", "--model", model, "--effort", effort, "--system-prompt-file", systemFile,
        "--tools", "WebSearch,WebFetch", "--restricted", "--strict-mcp-config", "--mcp-config", mcpFile,
        "--settings", settingsFile, "--permission-mode", "dontAsk", "--permission-prompts", "none",
        "--allowedTools", `mcp__${SERVER},WebSearch,WebFetch`, "--disallowedTools", DENIED_TOOLS.join(","),
        "--disable-slash-commands", "--no-chrome", "--output-format", "stream-json", "--verbose", "--include-hook-events",
        ...(index === 0 ? ["--session-id", sessionId] : ["--resume", sessionId]),
      ];
      const outcome = await workerTurn(claude, args, join(out, "worker", "cwd"), env, userText,
        join(out, "logs", `${name}.jsonl`), pass.token, maxMinutes);
      init ??= outcome.init;
      const after = readState(stateFile);
      const stop = after.stop?.reason ?? outcome.stop;
      writeFileSync(join(out, "out", `${name}.md`), outcome.answer);
      const apiEquivalentUsd = typeof outcome.result?.total_cost_usd === "number" ? outcome.result.total_cost_usd : null;
      const turn = {
        name, stop, detail: after.stop?.detail ?? null, seconds: outcome.seconds,
        askrigorCalls: after.turnAskRigorCalls, refusedCalls: after.refusedCalls - before.refusedCalls,
        webSearches: after.webSearches - before.webSearches, webFetches: after.webFetches - before.webFetches,
        protocolsLoaded: after.protocolsLoaded, compactions: outcome.compactions, answer_sha256: sha256(outcome.answer),
        api_equivalent_usd: apiEquivalentUsd, num_turns: outcome.result?.num_turns ?? null, usage: outcome.result?.usage ?? null,
      };
      turns.push(turn);
      progress(`${name} ${stop} ${Math.round(outcome.seconds)}s askrigor ${turn.askrigorCalls} refused ${turn.refusedCalls} ` +
        `web ${turn.webSearches}/${turn.webFetches} protocols ${after.protocolsLoaded.join("+") || "none"}` +
        (apiEquivalentUsd === null ? "" : ` api-equivalent $${apiEquivalentUsd.toFixed(2)}`));
      if (stop !== "answered") break;
    }
    writeFileSync(join(out, "usage", `${testCase.id}.json`), JSON.stringify({
      case: testCase.id, model, effort, version, surface: "/mcp/claude", runner: "claude -p on the owner's Claude plan",
      skill_sha256: sha256(skillFile), system_sha256: sha256(system),
      worker: init === undefined ? null : {
        claude_code_version: init.claude_code_version, model: init.model, apiKeySource: init.apiKeySource,
        permissionMode: init.permissionMode, mcp_servers: init.mcp_servers,
        tools: Array.isArray(init.tools) ? (init.tools as string[]).filter((tool) => !tool.startsWith(PREFIX)) : null,
        askrigor_tools: Array.isArray(init.tools) ? (init.tools as string[]).filter((tool) => tool.startsWith(PREFIX)).length : null,
      },
      limits: { maxMinutes, maxAskRigorCalls, requireProtocolsBy: requireProtocolsBy ?? null },
      pass_expires_at: passExpiresAt === undefined ? null : new Date(passExpiresAt * 1000).toISOString(),
      started: new Date(caseStarted).toISOString(), seconds: (Date.now() - caseStarted) / 1000,
      response_shapes: readState(stateFile).responseShapes, turns,
    }, null, 2));
    const stops = new Set(turns.map((turn) => turn.stop));
    if (stops.has("save_guard")) { progress("SAVE_GUARD_STOP: no further case starts"); return; }
    if (stops.has("protocol_guard")) { progress("PROTOCOL_GUARD_STOP: the model did not load Universal and HRP; no further case starts"); return; }
    if (stops.has("api_key_in_use") || stops.has("askrigor_not_connected")) { progress(`WORKER_STOP: ${[...stops].join(", ")}`); return; }
  }
  progress("DONE");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error));
    process.exitCode = 1;
  });
}
