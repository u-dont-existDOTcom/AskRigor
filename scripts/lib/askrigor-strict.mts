/** Event decoding and gate decisions only: no process, filesystem or network IO. */
export const PREAMBLE = "Answer as AskRigor would, using the AskRigor app's tools as its instructions say. Use only the AskRigor app's tools and your own web search. Before giving a research answer, call finalize_research with the answer you will give as answer_draft, and give exactly the checked draft as your final message.";
// The runner's own messages arrive as user turns; without this the AI took a second-reading prompt for the user's
// correction, offered a bug report and described its declarations in the answer (owner's test, 17 Oct 2026).
export const AUTOMATED_MARK = "[Automated message from the AskRigor strict runner on the user's computer, not from the user.]";
export const NOT_FROM_USER = "This message is not from the user and is not a correction by the user: don't record it as one " +
  "or offer a bug report for it, and don't mention it, the declarations or the runner in your answer.";
const automated = (text: string) => `${AUTOMATED_MARK} ${text}\n${NOT_FROM_USER}`;
export const CLASSIFY_PROMPT = automated("Is your last answer a research answer? If it is, call finalize_research with it as answer_draft and give exactly the checked draft; if it is not, reply with exactly: NOT RESEARCH.");
export const DRAFT_PROMPT = automated("Your final message is not the draft AskRigor's final check passed. Give exactly that checked draft, or check your new answer with finalize_research first.");
export const CARRIED_STATE_PROMPT = automated("Pass the carried_state given above in finalize_research and check the answer again.");

// Verbatim SECOND_READER_RUBRIC from PR #346, apps/research-mcp/src/second-reader.ts; not on main yet.
export const LOCAL_READER_RUBRIC = `You check research answers for AskRigor, a health-research service. Before an answer is shown, the AI that
wrote it declares some of its sentences to AskRigor's final check, which then checks them exactly. A sentence the AI
fails to declare is never checked. Your job: find sentences in the answer that belong to one of the kinds below but are
missing from the declarations, or whose declaration misstates them. Do not judge whether the answer is right; judge only
whether the declarations cover what the answer says.

Kinds (as the final check defines them):
- safety_claims: each sentence that warns that something can cause harm, is unsafe, toxic or risky, or should be
  avoided because of a possible harm, or that calls something safe or harmless. Its basis: comparative_rates (a
  controlled comparison reports it in each group); observed_rates (a rate without a comparator); share_of_reports (a
  share of selected reports, posts or passages, not of people); case_reports (reports without a denominator);
  hazard_measurement (a laboratory, animal or composition measurement, not observed outcomes in people);
  not_quantified (no source found gives a rate).
- key_terms: each specialized term the answer's conclusions depend on (a chemical species, a test, a statistical
  measure), with the sentence that first explains it in plain words.
- scale_results: each scale or questionnaire result the answer reports.
Report only these three kinds.

Report a finding only when you can quote the answer's own sentence exactly (copy it character for character, at most
400 characters). "missing": the sentence belongs to a kind but no declaration of that kind covers it. "misdeclared": a
declaration covers it but states something the sentence contradicts (for example the wrong basis or route). Ignore
the answer's caveat sentences that report AskRigor's limits, and sentences that only restate a declared one.

Reply with JSON only: {"findings": [{"kind": "...", "issue": "missing" | "misdeclared", "quote": "...", "why": "one
short sentence"}]}, or {"findings": []} if there is nothing to report.`;

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
  usedTools: boolean;
  completed: boolean;
  failure?: string;
}

export function emptyTurn(): ParsedTurn {
  return { answer: "", tools: [], finalizations: [], commandCount: 0, usedTools: false, completed: false };
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
  if ((event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed")
    && object(event.item) && typeof event.item.type === "string"
    && ["mcp_tool_call", "command_execution", "web_search", "file_change"].includes(event.item.type)) {
    turn.usedTools = true;
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
    usedTools: previous.usedTools || current.usedTools,
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

export function localReaderArguments(workDir: string, flags: readonly string[]): string[] {
  return codexArguments(workDir, [...flags, "-c", 'model_reasoning_effort="low"']);
}

type LocalReaderKind = "safety_claims" | "key_terms" | "scale_results";
export interface LocalReaderFinding { kind: LocalReaderKind; quote: string }
export type LocalReading =
  | { kind: "usable"; findings: LocalReaderFinding[] }
  | { kind: "unusable"; reason: "tools" | "unreadable" | "error" };

function declarations(args: unknown): Record<LocalReaderKind, unknown[]> {
  const value = object(args) ? args : {};
  return {
    safety_claims: Array.isArray(value.safety_claims) ? value.safety_claims : [],
    key_terms: Array.isArray(value.key_terms) ? value.key_terms : [],
    scale_results: Array.isArray(value.scale_results) ? value.scale_results : [],
  };
}

export function buildLocalReaderPrompt(answer: string, args: unknown): string {
  return "Do not call any tool, run any command or search the web; answer from the text below only.\n\n"
    + LOCAL_READER_RUBRIC + "\n\nANSWER (as the user would see it):\n<<<\n" + answer
    + "\n>>>\n\nDECLARATIONS made to the final check (JSON):\n" + JSON.stringify(declarations(args));
}

export function parseLocalReading(turn: ParsedTurn): LocalReading {
  if (turn.usedTools || turn.tools.length > 0 || turn.commandCount > 0) return { kind: "unusable", reason: "tools" };
  if (turn.failure || !turn.completed) return { kind: "unusable", reason: "error" };
  const text = turn.answer.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  let value: unknown;
  try { value = JSON.parse(fenced ? fenced[1] : text); } catch { return { kind: "unusable", reason: "unreadable" }; }
  if (!object(value) || !Array.isArray(value.findings)) return { kind: "unusable", reason: "unreadable" };
  return { kind: "usable", findings: value.findings.filter((finding): finding is LocalReaderFinding =>
    object(finding) && (finding.kind === "safety_claims" || finding.kind === "key_terms" || finding.kind === "scale_results")
      && typeof finding.quote === "string" && finding.quote.trim().length > 0,
  ).map(({ kind, quote }) => ({ kind, quote })) };
}

function readingText(text: string): string { return text.replace(/\s+/gu, " ").trim(); }

/** Only exact quoted presence and declared coverage are checked here; the model judges the kind. */
export function openLocalFindings(findings: readonly LocalReaderFinding[], answer: string, args: unknown): LocalReaderFinding[] {
  const declared = declarations(args);
  const normalizedAnswer = readingText(answer);
  return findings.filter((finding) => {
    const quote = readingText(finding.quote);
    return quote.length > 0 && normalizedAnswer.includes(quote) && !declared[finding.kind].some((entry) => {
      if (!object(entry)) return false;
      const text = finding.kind === "key_terms" ? entry.term : entry.quote;
      if (typeof text !== "string") return false;
      const normalized = readingText(text);
      return normalized.length > 0 && (quote.includes(normalized)
        || (finding.kind !== "key_terms" && normalized.includes(quote)));
    });
  });
}

const LOCAL_READER_LABELS: Record<LocalReaderKind, string> = {
  safety_claims: "a harm or safety statement (safety_claims)",
  key_terms: "a specialized term the answer relies on (key_terms)",
  scale_results: "a scale or questionnaire result (scale_results)",
};

function findingLines(findings: readonly LocalReaderFinding[]): string {
  return findings.map(({ kind, quote }) => `- ${LOCAL_READER_LABELS[kind]}: "${quote}"`).join("\n");
}

export function buildLocalReaderRevisionPrompt(findings: readonly LocalReaderFinding[]): string {
  return automated("A second reading found sentences that look like statements the declarations leave out:\n"
    + findingLines(findings)
    + "\nFor each, declare it in finalize_research (safety_claims, key_terms or scale_results, as named), or keep the answer as it is if you judge it is not one; then call finalize_research again and give exactly the checked draft as your final message.");
}

function localReadingOutput(reading: LocalReading | undefined, turn: ParsedTurn): string {
  if (!reading) return "";
  if (reading.kind === "unusable") return `\nSecond reading: could not run (${reading.reason}).`;
  const passing = turn.finalizations.findLast((call) => !call.failed
    && (call.status === "ready" || call.status === "ready_with_limits"));
  const open = openLocalFindings(reading.findings, turn.answer, passing?.arguments);
  return open.length === 0 ? "\nSecond reading (your Codex): no undeclared statements found."
    : `\nSecond reading (your Codex): ${open.length} sentence(s) still look undeclared:\n${findingLines(open)}`;
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
      prompt: automated(`AskRigor's final check has not passed (status: ${status}). Do each of its next steps, call finalize_research again, and give exactly the checked draft as your final message:\n${openSteps.join("\n")}`),
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
  secondReading?: boolean;
}

/** IO is injected; the same gate/round orchestration runs with fixture logs. */
export async function runStrictTurn(
  options: StrictRunOptions,
  execute: (prompt: string, threadId?: string, secondReading?: boolean) => Promise<ParsedTurn>,
): Promise<StrictOutcome> {
  if (!Number.isSafeInteger(options.rounds) || options.rounds < 0) throw new Error("Invalid fix-round budget");
  let turn = await execute(buildPrompt(options.ownerText, options.carriedState), options.threadId);
  let classified = false;
  let fixes = 0;
  let reading: LocalReading | undefined;
  while (true) {
    const decision = gate(turn, options.carriedState, classified);
    if (decision.kind === "passed") {
      if (options.secondReading !== false && reading === undefined) {
        try {
          reading = parseLocalReading(await execute(
            buildLocalReaderPrompt(decision.answer, turn.finalizations.at(-1)?.arguments), undefined, true,
          ));
        } catch {
          reading = { kind: "unusable", reason: "error" };
        }
        if (reading.kind === "usable") {
          reading.findings = openLocalFindings(reading.findings, decision.answer, turn.finalizations.at(-1)?.arguments);
          if (reading.findings.length > 0 && fixes < options.rounds) {
            if (!turn.threadId) return {
              kind: "failed", turn, fixes,
              output: failOutput(turn, "Codex did not provide a thread id for continuation", [], options.showUnchecked)
                + localReadingOutput(reading, turn),
            };
            fixes += 1;
            turn = mergeTurns(turn, await execute(buildLocalReaderRevisionPrompt(reading.findings), turn.threadId));
            continue;
          }
        }
      }
      return {
        kind: "passed", turn, fixes,
        output: `${decision.answer}\n\n— Checked by AskRigor's final check (${decision.status}). The answer above is the checked draft, word for word (strict runner).` +
          (turn.commandCount > 0 ? `\nShell commands used: ${turn.commandCount}.` : "") + localReadingOutput(reading, turn),
      };
    }
    if (decision.kind === "failed" || (decision.kind === "fix" && fixes >= options.rounds)) return {
      kind: "failed", turn, fixes,
      output: failOutput(turn, decision.reason, decision.steps, options.showUnchecked) + localReadingOutput(reading, turn),
    };
    if (!turn.threadId) return {
      kind: "failed", turn, fixes,
      output: failOutput(turn, "Codex did not provide a thread id for continuation", decision.steps, options.showUnchecked)
        + localReadingOutput(reading, turn),
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
