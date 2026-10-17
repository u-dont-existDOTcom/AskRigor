/** Event decoding and gate decisions only: no process, filesystem or network IO. */
export const PREAMBLE = "Answer as AskRigor would, using the AskRigor app's tools as its instructions say. Use only the AskRigor app's tools and your own web search. Before giving a research answer, call finalize_research with the answer you will give as answer_draft, and give exactly the checked draft as your final message.";
export const CLASSIFY_PROMPT = "Is your last answer a research answer? If it is, call finalize_research with it as answer_draft and give exactly the checked draft; if it is not, reply with exactly: NOT RESEARCH.";
export const DRAFT_PROMPT = "Your final message is not the draft AskRigor's final check passed. Give exactly that checked draft, or check your new answer with finalize_research first.";
export const CARRIED_STATE_PROMPT = "Pass the carried_state given above in finalize_research and check the answer again.";

type ObjectValue = Record<string, unknown>;
function object(value: unknown): value is ObjectValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ToolCall {
  server: string;
  tool: string;
  arguments: unknown;
  result: unknown;
  error: unknown;
}

export interface FinalizeCall extends ToolCall {
  status: string;
  failed: boolean;
  answerDraft?: string;
  carriedState?: string;
  nextSteps: string[];
  caveats: string[];
  checkLine?: string;
  carryForward?: string;
}

export interface ParsedTurn {
  threadId?: string;
  answer: string;
  tools: ToolCall[];
  finalizations: FinalizeCall[];
  commandCount: number;
  completed: boolean;
  failure?: string;
}

export function emptyTurn(): ParsedTurn {
  return { answer: "", tools: [], finalizations: [], commandCount: 0, completed: false };
}

export function isAskRigorTool(server: string, tool: string): boolean {
  const dot = tool.indexOf(".");
  return server === "codex_apps" && dot > 0 && dot < tool.length - 1
    && tool.slice(0, dot).startsWith("askrigor");
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function structuredResult(value: unknown): ObjectValue | undefined {
  if (!object(value)) return undefined;
  // A structured result, including a structured error, takes precedence over text.
  if (object(value.structured_content)) return value.structured_content;
  if (object(value.structuredContent)) return value.structuredContent;
  if (Array.isArray(value.content)) {
    for (const part of value.content) {
      if (!object(part) || part.type !== "text" || typeof part.text !== "string") continue;
      try {
        const parsed: unknown = JSON.parse(part.text);
        if (object(parsed)) return parsed;
      } catch { /* Plain text is not a structured final-check receipt. */ }
    }
  }
  return undefined;
}

function finalizeCall(call: ToolCall, item: ObjectValue): FinalizeCall {
  const receipt = structuredResult(call.result);
  const args = object(call.arguments) ? call.arguments : {};
  const failed = call.error != null || item.status === "failed"
    || (object(call.result) && call.result.isError === true)
    || receipt?.error != null || typeof receipt?.status !== "string";
  return {
    ...call,
    status: failed ? "failed" : receipt!.status as string,
    failed,
    answerDraft: typeof args.answer_draft === "string" ? args.answer_draft : undefined,
    carriedState: typeof args.carried_state === "string" ? args.carried_state : undefined,
    nextSteps: strings(receipt?.next_steps),
    caveats: strings(receipt?.caveats),
    checkLine: typeof receipt?.check_line === "string" ? receipt.check_line : undefined,
    carryForward: typeof receipt?.carry_forward === "string" ? receipt.carry_forward : undefined,
  };
}

/** Decode one complete JSON line; no raw event content is included in errors. */
export function parseEventLine(turn: ParsedTurn, line: string): void {
  if (!line.trim()) return;
  let event: unknown;
  try { event = JSON.parse(line); } catch {
    turn.failure = "Codex emitted an invalid JSON event";
    return;
  }
  if (!object(event) || typeof event.type !== "string") {
    turn.failure = "Codex emitted an invalid event";
    return;
  }
  if (event.type === "thread.started" && typeof event.thread_id === "string") {
    turn.threadId = event.thread_id;
  } else if (event.type === "turn.completed") {
    turn.completed = true;
  } else if (event.type === "turn.failed" || event.type === "error") {
    turn.failure = "Codex did not complete the turn";
  } else if (event.type === "item.completed" && object(event.item)) {
    const item = event.item;
    if (item.type === "agent_message" && typeof item.text === "string") {
      turn.answer = item.text;
    } else if (item.type === "command_execution") {
      turn.commandCount += 1;
    } else if (item.type === "mcp_tool_call") {
      if (typeof item.server !== "string" || typeof item.tool !== "string") {
        turn.failure = "Codex emitted an invalid tool call";
        return;
      }
      const call: ToolCall = {
        server: item.server, tool: item.tool, arguments: item.arguments,
        result: item.result, error: item.error,
      };
      turn.tools.push(call);
      if (isAskRigorTool(call.server, call.tool) && call.tool.slice(call.tool.indexOf(".") + 1) === "finalize_research") {
        turn.finalizations.push(finalizeCall(call, item));
      }
    }
  }
}

export function parseEventLog(log: string): ParsedTurn {
  const turn = emptyTurn();
  for (const line of log.split("\n")) parseEventLine(turn, line);
  return turn;
}

/** Across fixes, retain receipts and violations, but only the current final message. */
export function mergeTurns(previous: ParsedTurn, current: ParsedTurn): ParsedTurn {
  return {
    ...current,
    threadId: current.threadId ?? previous.threadId,
    tools: [...previous.tools, ...current.tools],
    finalizations: [...previous.finalizations, ...current.finalizations],
    commandCount: previous.commandCount + current.commandCount,
    failure: previous.failure ?? current.failure,
  };
}

export function normalizeAnswer(text: string): string {
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd()).join("\n").trim();
}

export function buildPrompt(ownerText: string, carriedState?: string): string {
  return [PREAMBLE, ...(carriedState === undefined ? [] : [
    `In finalize_research, pass this as carried_state: ${carriedState}`,
  ]), ownerText].join("\n\n");
}

/** Only the name/enabled projection can influence flags; no credential field escapes. */
export function restrictedFlagsFromMcpList(input: string): string[] {
  let entries: unknown;
  try { entries = JSON.parse(input); } catch { throw new Error("Cannot read the local MCP server list"); }
  if (!Array.isArray(entries)) throw new Error("Cannot read the local MCP server list");
  const servers = entries.map((entry) => {
    if (!object(entry) || typeof entry.name !== "string" || !/^[A-Za-z0-9_-]+$/.test(entry.name)
      || typeof entry.enabled !== "boolean") throw new Error("Invalid local MCP server name or enabled flag");
    return { name: entry.name, enabled: entry.enabled };
  });
  return [
    ...servers.flatMap(({ name }) => ["-c", `mcp_servers.${name}.enabled=false`]),
    ...["browser_use", "browser_use_external", "in_app_browser", "computer_use"].flatMap((name) => ["--disable", name]),
  ];
}

export function codexArguments(workDir: string, flags: readonly string[], threadId?: string): string[] {
  return threadId === undefined
    ? ["exec", "--json", "--skip-git-repo-check", "-C", workDir, ...flags, "-"]
    : ["exec", "resume", "--json", "--skip-git-repo-check", ...flags, threadId, "-"];
}

export type GateDecision =
  | { kind: "passed"; status: "ready" | "ready_with_limits"; answer: string }
  | { kind: "classify"; prompt: string; reason: string; steps: string[] }
  | { kind: "fix"; prompt: string; reason: string; steps: string[] }
  | { kind: "failed"; reason: string; steps: string[] };

function oneLine(value: string): string { return value.replace(/[\r\n\x00-\x1f\x7f]+/g, " "); }

/** Other apps' or servers' tools: they make a turn unchecked. */
export function otherTools(turn: ParsedTurn): string[] {
  return [...new Set(turn.tools.filter((call) => !isAskRigorTool(call.server, call.tool))
    .map((call) => `${oneLine(call.server)}:${oneLine(call.tool)}`))];
}

/** Shell commands are reported by count only; the final check's receipts, not the shell, back a research answer. */
export function toolWarnings(turn: ParsedTurn): string[] {
  return [
    ...otherTools(turn).map((name) => `This turn also used: ${name}, which is not part of AskRigor.`),
    ...(turn.commandCount > 0 ? [`Shell commands used: ${turn.commandCount}.`] : []),
  ];
}

export function gate(turn: ParsedTurn, carriedState?: string, classified = false): GateDecision {
  const last = turn.finalizations.at(-1);
  const steps = last?.nextSteps ?? [];
  // These violations are permanent for this owner turn, including all fix rounds.
  if (otherTools(turn).length > 0) return { kind: "failed", reason: "tools outside AskRigor were used", steps };
  if (turn.failure || !turn.completed) return {
    kind: "failed", reason: turn.failure ?? "Codex did not complete the turn", steps,
  };
  if (!last && !classified) return {
    kind: "classify", prompt: CLASSIFY_PROMPT, reason: "finalize_research was not called", steps: [],
  };
  if (!last || last.failed || (last.status !== "ready" && last.status !== "ready_with_limits")) {
    const status = last ? oneLine(last.status) : "missing";
    const openSteps = steps.length ? steps : ["Call finalize_research successfully with the answer as answer_draft."];
    return {
      kind: "fix", reason: last ? `AskRigor's final check has not passed (status: ${status})` : "finalize_research was not called",
      steps: openSteps,
      prompt: `AskRigor's final check has not passed (status: ${status}). Do each of its next steps, call finalize_research again, and give exactly the checked draft as your final message:\n${openSteps.join("\n")}`,
    };
  }
  if (typeof last.answerDraft !== "string" || !normalizeAnswer(last.answerDraft)
    || normalizeAnswer(turn.answer) !== normalizeAnswer(last.answerDraft)) return {
    kind: "fix", prompt: DRAFT_PROMPT,
    reason: "the final message is not the checked answer_draft", steps: [DRAFT_PROMPT],
  };
  if (carriedState !== undefined && last.carriedState !== carriedState) return {
    kind: "fix", prompt: CARRIED_STATE_PROMPT,
    reason: "the final check did not include the required carried_state", steps: [CARRIED_STATE_PROMPT],
  };
  return { kind: "passed", status: last.status, answer: turn.answer };
}

export function latestCarryForward(turn: ParsedTurn): string | undefined {
  return turn.finalizations.findLast((call) => !call.failed
    && (call.status === "ready" || call.status === "ready_with_limits")
    && call.carryForward !== undefined)?.carryForward;
}

export interface StrictOutcome {
  kind: "passed" | "not_research" | "failed";
  turn: ParsedTurn;
  output: string;
  fixes: number;
}

function failOutput(turn: ParsedTurn, reason: string, steps: string[], showUnchecked: boolean): string {
  return [
    ...toolWarnings(turn), `Not checked: ${oneLine(reason)}.`, ...steps,
    ...(showUnchecked && turn.answer ? ["", "Unchecked answer:", turn.answer] : []),
  ].join("\n");
}

export interface StrictRunOptions {
  ownerText: string;
  carriedState?: string;
  threadId?: string;
  rounds: number;
  showUnchecked: boolean;
}

/** IO is injected; the same gate/round orchestration runs with fixture logs. */
export async function runStrictTurn(
  options: StrictRunOptions,
  execute: (prompt: string, threadId?: string) => Promise<ParsedTurn>,
): Promise<StrictOutcome> {
  if (!Number.isSafeInteger(options.rounds) || options.rounds < 0) throw new Error("Invalid fix-round budget");
  let turn = await execute(buildPrompt(options.ownerText, options.carriedState), options.threadId);
  let classified = false;
  let fixes = 0;
  while (true) {
    const decision = gate(turn, options.carriedState, classified);
    if (decision.kind === "passed") return {
      kind: "passed", turn, fixes,
      output: `${decision.answer}\n\n— Checked by AskRigor's final check (${decision.status}). The answer above is the checked draft, word for word (strict runner).` +
        (turn.commandCount > 0 ? `\nShell commands used: ${turn.commandCount}.` : ""),
    };
    if (decision.kind === "failed" || (decision.kind === "fix" && fixes >= options.rounds)) return {
      kind: "failed", turn, fixes,
      output: failOutput(turn, decision.reason, decision.steps, options.showUnchecked),
    };
    if (!turn.threadId) return {
      kind: "failed", turn, fixes,
      output: failOutput(turn, "Codex did not provide a thread id for continuation", decision.steps, options.showUnchecked),
    };
    if (decision.kind === "classify") {
      const earlierAnswer = turn.answer;
      classified = true;
      turn = mergeTurns(turn, await execute(decision.prompt, turn.threadId));
      if (turn.answer === "NOT RESEARCH" && !turn.failure && turn.completed && otherTools(turn).length === 0) {
        return { kind: "not_research", turn, fixes, output: `Not a research answer (no final check).\n\n${earlierAnswer}` };
      }
    } else {
      fixes += 1;
      turn = mergeTurns(turn, await execute(decision.prompt, turn.threadId));
    }
  }
}
