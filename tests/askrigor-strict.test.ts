import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, stat, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOptions, runCli, type CodexTransport } from "../scripts/askrigor-strict.mts";
import { AUTOMATED_MARK, NOT_FROM_USER,
  CARRIED_STATE_PROMPT, CLASSIFY_PROMPT, DRAFT_PROMPT, LOCAL_READER_RUBRIC, PREAMBLE,
  buildLocalReaderPrompt, buildPrompt, codexArguments, gate, latestCarryForward, localReaderArguments, normalizeAnswer,
  parseEventLog, restrictedFlagsFromMcpList, runStrictTurn,
} from "../scripts/lib/askrigor-strict.mts";

const answer = "A bounded research answer.";
const footer = "— Checked by AskRigor's final check (ready). The answer above is the checked draft, word for word (strict runner).";
const final = (text = answer) => ({ type: "item.completed", item: { type: "agent_message", text } });
const mcp = (server: string, tool: string, args: unknown = {}, result: unknown = null, error: unknown = null) => ({
  type: "item.completed", item: { type: "mcp_tool_call", server, tool, arguments: args, result, error },
});
function check(status = "ready", options: {
  draft?: string; carriedState?: string; nextSteps?: string[]; carryForward?: string;
  textOnly?: boolean; error?: unknown; declarations?: Record<string, unknown>;
} = {}) {
  const receipt = {
    status, next_steps: options.nextSteps ?? [], caveats: ["A declared limit."], check_line: "Checked.",
    ...(options.carryForward === undefined ? {} : { carry_forward: options.carryForward }),
  };
  return mcp("codex_apps", "askrigor_new_slug.finalize_research", {
    ...options.declarations, answer_draft: options.draft ?? answer,
    ...(options.carriedState === undefined ? {} : { carried_state: options.carriedState }),
  }, options.textOnly ? { content: [{ type: "text", text: JSON.stringify(receipt) }] }
    : { content: [{ type: "text", text: "Display text" }], structured_content: receipt }, options.error ?? null);
}
function log(...events: unknown[]): string {
  return [
    { type: "thread.started", thread_id: "thread-1" }, ...events, { type: "turn.completed", usage: {} },
  ].map((e) => JSON.stringify(e)).join("\n") + "\n";
}
async function fixtures(logs: string[], options: { rounds?: number; showUnchecked?: boolean; carriedState?: string; secondReading?: boolean } = {}) {
  const calls: { prompt: string; threadId?: string; secondReading?: boolean }[] = [];
  const result = await runStrictTurn({
    ownerText: "Owner question", rounds: options.rounds ?? 3,
    showUnchecked: options.showUnchecked ?? false, carriedState: options.carriedState, secondReading: options.secondReading ?? false,
  }, async (prompt, threadId, secondReading) => {
    calls.push({ prompt, threadId, ...(secondReading ? { secondReading } : {}) });
    const fixture = logs[calls.length - 1];
    if (fixture === undefined) throw new Error("Unexpected fixture round");
    return parseEventLog(fixture);
  });
  return { result, calls };
}

describe("strict runner event parser", () => {
  it("retains every tool field, the last agent message, and structured finalizer fields", () => {
    const tool = mcp("codex_apps", "askrigor_new_slug.fetch_protocol", { version: "current" }, { content: [] }, null);
    const turn = parseEventLog(log(tool, final("Intermediate"), check("ready_with_limits", {
      carryForward: "opaque-token", carriedState: "previous-token", nextSteps: ["A step"],
    }), final()));
    expect(turn.tools[0]).toEqual({ server: tool.item.server, tool: tool.item.tool,
      arguments: tool.item.arguments, result: tool.item.result, error: null });
    expect(turn.answer).toBe(answer);
    expect(turn.finalizations[0]).toMatchObject({
      status: "ready_with_limits", nextSteps: ["A step"], caveats: ["A declared limit."],
      checkLine: "Checked.", carryForward: "opaque-token", carriedState: "previous-token", answerDraft: answer,
    });
  });

  it("reads JSON text parts when no structured_content is present", () => {
    const turn = parseEventLog(log(check("ready", { textOnly: true }), final()));
    expect(gate(turn).kind).toBe("passed");
  });

  it("does not let display text override a structured error", () => {
    const event = mcp("codex_apps", "askrigor.finalize_research", { answer_draft: answer }, {
      content: [{ type: "text", text: JSON.stringify({ status: "ready" }) }],
      structured_content: { error: "Parameters failed connector schema validation", error_code: "invalid_args" },
    });
    expect(gate(parseEventLog(log(event, final())))).toMatchObject({ kind: "fix", reason: expect.stringContaining("failed") });
  });

  it("ignores started copies of calls and permits built-in web search", () => {
    const event = check();
    const turn = parseEventLog(log(
      { ...event, type: "item.started" }, { type: "item.completed", item: { type: "web_search" } }, event, final(),
    ));
    expect(turn.finalizations).toHaveLength(1);
    expect(gate(turn).kind).toBe("passed");
  });

  it.each(["not JSON", JSON.stringify({}), JSON.stringify({ type: "turn.failed", error: { message: answer } })])(
    "fails closed without exposing a malformed or failed event's content", (event) => {
      expect(gate(parseEventLog(log(check(), final()) + event))).toMatchObject({ kind: "failed" });
    },
  );
});

describe("strict runner gate and bounded fixes", () => {
  it("shows a passing exact draft and the fixed footer", async () => {
    const { result, calls } = await fixtures([log(check(), final())]);
    expect(result.kind).toBe("passed");
    expect(result.output).toBe(`${answer}\n\n${footer}`);
    expect(calls).toEqual([{ prompt: `${PREAMBLE}\n\nOwner question`, threadId: undefined }]);
  });

  it("requests a fix for a one-word difference and accepts the repeated checked draft", async () => {
    const { result, calls } = await fixtures([log(check(), final("A broad research answer.")), log(final())]);
    expect(calls[1]).toEqual({ prompt: DRAFT_PROMPT, threadId: "thread-1" });
    expect(result.kind).toBe("passed");
    expect(result.fixes).toBe(1);
    expect(result.turn.finalizations).toHaveLength(1);
  });

  it("does next steps after not_ready, passing on the second execution", async () => {
    const { result, calls } = await fixtures([
      log(check("not_ready", { nextSteps: ["Read the study.", "Report its limit."] }), final()),
      log(check(), final()),
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toBe(`${AUTOMATED_MARK} AskRigor's final check has not passed (status: not_ready). Do each of its next steps, call finalize_research again, and give exactly the checked draft as your final message:\nRead the study.\nReport its limit.\n${NOT_FROM_USER}`);
    expect(result.kind).toBe("passed");
  });

  it.each([false, true])("bounds fixes and hides unchecked answers unless requested (%s)", async (showUnchecked) => {
    const notReady = log(check("not_ready", { nextSteps: ["Inspect remaining evidence."] }), final());
    const { result, calls } = await fixtures(Array(4).fill(notReady), { showUnchecked });
    expect(calls).toHaveLength(4);
    expect(result.fixes).toBe(3);
    expect(result.kind).toBe("failed");
    expect(result.output).toContain("Not checked: AskRigor's final check has not passed (status: not_ready).\nInspect remaining evidence.");
    expect(result.output.includes(answer)).toBe(showUnchecked);
    expect(result.output.includes("Unchecked answer:")).toBe(showUnchecked);
  });

  it("uses one shared budget across readiness, changed-draft and missing-token fixes", async () => {
    const { result, calls } = await fixtures([
      log(check("not_ready"), final()), log(check(), final("Changed")), log(check(), final()),
    ], { carriedState: "required", rounds: 2 });
    expect(calls).toHaveLength(3);
    expect(calls[2].prompt).toBe(DRAFT_PROMPT);
    expect(result.kind).toBe("failed");
    expect(result.output).toContain("required carried_state");
  });

  it("asks the model once whether an unchecked answer is research", async () => {
    const { result, calls } = await fixtures([log(final("Hello.")), log(final("NOT RESEARCH"))], { rounds: 0 });
    expect(calls[1].prompt).toBe(CLASSIFY_PROMPT);
    expect(result.output).toBe("Not a research answer (no final check).\n\nHello.");
    expect(result.kind).toBe("not_research");
  });

  it("continues the gate when the classification supplies a checked answer", async () => {
    const { result, calls } = await fixtures([log(final()), log(check(), final())]);
    expect(calls).toHaveLength(2);
    expect(result.kind).toBe("passed");
  });

  it("recognizes only exactly NOT RESEARCH, with no semantic/length classifier", async () => {
    const { result, calls } = await fixtures([
      log(final("A long answer ".repeat(100))), log(final("NOT RESEARCH\n")), log(check(), final()),
    ], { rounds: 1 });
    expect(calls[1].prompt).toBe(CLASSIFY_PROMPT);
    expect(calls[2].prompt).toContain("status: missing");
    expect(result.kind).toBe("passed");
  });

  it("reports another app and keeps the passing draft unchecked", async () => {
    const { result, calls } = await fixtures([log(mcp("codex_apps", "other_app.search"), check(), final())]);
    expect(calls).toHaveLength(1);
    expect(result.kind).toBe("failed");
    expect(result.output).toBe("This turn also used: codex_apps:other_app.search, which is not part of AskRigor.\nNot checked: tools outside AskRigor were used.");
  });

  it("does not accept a finalizer from another server or suffix lookalike", () => {
    const other = mcp("other_server", "askrigor.finalize_research", { answer_draft: answer }, { structured_content: { status: "ready" } });
    expect(gate(parseEventLog(log(other, final()))).kind).toBe("failed");
    const turn = parseEventLog(log(mcp("codex_apps", "askrigor.not_finalize_research"), final()));
    expect(turn.finalizations).toHaveLength(0);
    expect(gate(turn).kind).toBe("classify");
  });

  it("lists shell commands by count only, with no command or output, and does not block a checked answer", async () => {
    const command = { type: "item.completed", item: { type: "command_execution", command: "PRIVATE COMMAND", aggregated_output: "PRIVATE RESULT" } };
    const { result } = await fixtures([log(command, command, check(), final())]);
    expect(result.kind).toBe("passed");
    expect(result.output).toBe(`${answer}\n\n${footer}\nShell commands used: 2.`);
    expect(result.output).not.toContain("PRIVATE");
    const failing = await fixtures([log(command, check("not_ready"), final())], { rounds: 0 });
    expect(failing.result.output).toContain("Shell commands used: 1.");
  });

  it("keeps violations from classification/fix rounds, including a NOT RESEARCH reply", async () => {
    const { result } = await fixtures([log(final("Hello")), log(mcp("local", "search"), final("NOT RESEARCH"))]);
    expect(result.kind).toBe("failed");
    expect(result.output).toContain("local:search");
    const fixed = await fixtures([log(check(), final("Changed")), log(mcp("codex_apps", "other.search"), final())]);
    expect(fixed.result.kind).toBe("failed");
  });

  it("requests missing carried_state and accepts an exact token", async () => {
    const { result, calls } = await fixtures([
      log(check(), final()), log(check("ready_with_limits", { carriedState: "opaque-token" }), final()),
    ], { carriedState: "opaque-token" });
    expect(calls[0].prompt).toBe(`${PREAMBLE}\n\nIn finalize_research, pass this as carried_state: opaque-token\n\nOwner question`);
    expect(calls[1].prompt).toBe(CARRIED_STATE_PROMPT);
    expect(result.output).toContain("final check (ready_with_limits)");
    expect(gate(parseEventLog(log(check("ready", { carriedState: "wrong" }), final())), "opaque-token").kind).toBe("fix");
  });

  it("takes the latest finalization even if an earlier call passed", () => {
    const turn = parseEventLog(log(check(), check("not_ready", { nextSteps: ["Still open"] }), final()));
    expect(gate(turn)).toMatchObject({ kind: "fix", steps: ["Still open"] });
  });

  it.each([null, { message: "tool failed" }])("retries missing/failed finalizer results (%j)", (error) => {
    const event = mcp("codex_apps", "askrigor.finalize_research", { answer_draft: answer }, null, error);
    expect(gate(parseEventLog(log(event, final())))).toMatchObject({ kind: "fix", reason: expect.stringContaining("failed") });
  });

  it("only selects carry_forward from passing calls, keeping the latest supplied token", () => {
    const turn = parseEventLog(log(check("ready", { carryForward: "one" }),
      check("ready_with_limits", { carryForward: "two" }), check("not_ready", { carryForward: "bad" }), check("ready"), final()));
    expect(latestCarryForward(turn)).toBe("two");
  });

  it("ignores line endings and trailing whitespace, preserving the actual displayed answer", async () => {
    const draft = "First line.\n  Second line.";
    const displayed = "  First line.  \r\n  Second line. \r\n";
    const { result } = await fixtures([log(check("ready", { draft }), final(displayed))]);
    expect(result.kind).toBe("passed");
    expect(result.output).toBe(`${displayed}\n\n${footer}`);
    expect(normalizeAnswer("A\rB\t ")).toBe("A\nB");
  });

  it.each(["First  line.\nSecond line.", "First line.\nsecond line.", "First line.\n\nSecond line.", "First line.\n Second line."])(
    "does not ignore any other difference (%j)", (different) => {
      expect(gate(parseEventLog(log(check("ready", { draft: "First line.\nSecond line." }), final(different)))))
        .toMatchObject({ kind: "fix", prompt: DRAFT_PROMPT });
    },
  );

  it("fails closed for a missing final message or incomplete stream", () => {
    expect(gate(parseEventLog(log(check()))).kind).toBe("fix");
    expect(gate(parseEventLog(JSON.stringify(check()) + "\n" + JSON.stringify(final()))).kind).toBe("failed");
  });
});

describe("restricted commands", () => {
  it("disables all listed local MCP servers using only names/enabled flags", () => {
    const flags = restrictedFlagsFromMcpList(JSON.stringify([
      { name: "local_one", enabled: true, env: { KEY: "SECRET" }, transport: { url: "PRIVATE" } },
      { name: "local-two", enabled: false, auth: "SECRET" },
    ]));
    expect(flags).toEqual([
      "-c", "mcp_servers.local_one.enabled=false", "-c", "mcp_servers.local-two.enabled=false",
      "--disable", "browser_use", "--disable", "browser_use_external", "--disable", "in_app_browser", "--disable", "computer_use",
    ]);
    expect(JSON.stringify(flags)).not.toMatch(/SECRET|PRIVATE|auth|transport|env/);
  });

  it.each(["not JSON", "{}", '[{"name":"bad.name","enabled":true,"secret":"SECRET"}]', '[{"name":"local","secret":"SECRET"}]'])(
    "rejects invalid lists without printing fields (%j)", (value) => {
      expect(() => restrictedFlagsFromMcpList(value)).toThrow();
      try { restrictedFlagsFromMcpList(value); } catch (error) { expect(String(error)).not.toContain("SECRET"); }
    },
  );

  it("builds the exact new and resume invocations with stdin prompts", () => {
    const flags = restrictedFlagsFromMcpList("[]");
    expect(codexArguments("/private/work", flags)).toEqual(["exec", "--json", "--skip-git-repo-check", "-C", "/private/work", ...flags, "-"]);
    expect(codexArguments("/private/work", flags, "thread-1")).toEqual(["exec", "resume", "--json", "--skip-git-repo-check", ...flags, "thread-1", "-"]);
    expect(buildPrompt("Question")).toBe(`${PREAMBLE}\n\nQuestion`);
  });
});

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "askrigor-strict-test-")); temporary.push(path); return path;
}
function fakeTransport(logs: string[], calls: { args: readonly string[]; input?: string; cwd: string }[]): CodexTransport {
  let execution = 0;
  return async (args, input, cwd, consume) => {
    calls.push({ args: [...args], input, cwd });
    const content = args[0] === "mcp" ? JSON.stringify([{ name: "local", enabled: true, env: { KEY: "DO-NOT-STORE" } }]) : logs[execution++];
    if (content === undefined) throw new Error("Unexpected fixture execution");
    // Deliberately split JSON records and use a final line without a newline.
    for (let index = 0; index < content.length; index += 17) await consume(content.slice(index, index + 17));
    return 0;
  };
}

describe("automated runner messages", () => {
  it("mark every message the runner sends as automated and not a correction by the user", async () => {
    for (const prompt of [CLASSIFY_PROMPT, DRAFT_PROMPT, CARRIED_STATE_PROMPT, revisionPrompt]) {
      expect(prompt.startsWith(AUTOMATED_MARK)).toBe(true);
      expect(prompt.endsWith(NOT_FROM_USER)).toBe(true);
    }
    expect(NOT_FROM_USER).toContain("not a correction by the user");
    expect(NOT_FROM_USER).toContain("offer a bug report");
  });
});

describe("CLI progress", () => {
  it("reports progress on stderr with counts and statuses only, never the question or the answer", async () => {
    const stateDir = join(await directory(), "state");
    const calls: { args: readonly string[]; input?: string; cwd: string }[] = [];
    let output = "";
    let progress = "";
    const tools = Array.from({ length: 10 }, () => mcp("codex_apps", "askrigor_app.search_pubmed"));
    const code = await runCli(["--state-dir", stateDir, "--no-second-reading", "PRIVATE QUESTION"], {
      transport: fakeTransport([log(...tools, check("not_ready"), check("ready"), final()).trimEnd()], calls),
      stdout: (text) => { output += text; }, stderr: (text) => { progress += text; },
    });
    expect(code).toBe(0);
    expect(progress).toContain("AskRigor strict runner: Codex is working with AskRigor.");
    expect(progress).toMatch(/\d\d:\d\d:\d\d UTC {2}Started\./u);
    expect(progress).toContain("AskRigor calls so far: 10");
    expect(progress).toContain("Final check: not_ready");
    expect(progress).toContain("Final check: ready");
    expect(progress).not.toContain("PRIVATE QUESTION");
    expect(progress).not.toContain(answer);
    expect(output).toBe(`${answer}\n\n${footer}\n`);
  });
});

describe("CLI server overrides", () => {
  it("drops an override Codex refuses (a server config.toml does not define) and keeps the feature switches", async () => {
    const stateDir = join(await directory(), "state");
    const calls: { args: readonly string[]; input?: string; cwd: string }[] = [];
    let executions = 0;
    const transport: CodexTransport = async (args, input, cwd, consume) => {
      calls.push({ args: [...args], input, cwd });
      if (args[0] === "mcp") {
        if (args.length === 3) {
          await consume(JSON.stringify([{ name: "local", enabled: true }, { name: "builtin", enabled: true }]));
          return 0;
        }
        return args.includes("mcp_servers.builtin.enabled=false") ? 1 : 0;
      }
      executions += 1;
      await consume(log(check("ready"), final()));
      return 0;
    };
    expect(await runCli(["--no-second-reading", "--state-dir", stateDir, "Question"], { transport, stdout: () => {} })).toBe(0);
    const exec = calls.find(({ args }) => args[0] === "exec")!;
    expect(exec.args).toContain("mcp_servers.local.enabled=false");
    expect(exec.args).not.toContain("mcp_servers.builtin.enabled=false");
    expect(exec.args).toContain("computer_use");
    expect(executions).toBe(1);
  });
});

describe("CLI IO with a fixture transport (never invokes Codex)", () => {
  it("uses private directories/files and persists only the permitted state fields", async () => {
    const stateDir = join(await directory(), "state");
    const calls: { args: readonly string[]; input?: string; cwd: string }[] = [];
    let output = "";
    const code = await runCli(["--no-second-reading", "--state-dir", stateDir, "PRIVATE QUESTION"], {
      transport: fakeTransport([log(check("ready", { carryForward: "token-1" }), final()).trimEnd()], calls),
      stdout: (text) => { output += text; },
    });
    expect(code).toBe(0);
    expect(output).toBe(`${answer}\n\n${footer}\n`);
    expect(calls[0].args).toEqual(["mcp", "list", "--json"]);
    // Each server override is tried first; Codex accepts this one, so it is kept.
    expect(calls[1].args).toEqual(["mcp", "list", "--json", "-c", "mcp_servers.local.enabled=false"]);
    expect(calls[2].args).toEqual(codexArguments(join(stateDir, "work"), restrictedFlagsFromMcpList('[{"name":"local","enabled":true}]')));
    expect(calls[2].input).toContain("PRIVATE QUESTION");
    expect(calls.every((call) => call.cwd === join(stateDir, "work"))).toBe(true);
    const saved = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"));
    expect(saved).toEqual({ thread_id: "thread-1", carry_forward: "token-1", updated_at: expect.any(String) });
    expect(await readdir(stateDir)).toEqual(["state.json", "work"]);
    expect((await stat(stateDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(stateDir, "work"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(stateDir, "state.json"))).mode & 0o777).toBe(0o600);
  });

  it("continues the saved thread, carries its token, and keeps the old token if none is returned", async () => {
    const stateDir = await directory();
    await writeFile(join(stateDir, "state.json"), JSON.stringify({ thread_id: "previous-thread", carry_forward: "previous-token", updated_at: "earlier" }), { mode: 0o644 });
    await chmod(stateDir, 0o755);
    const calls: { args: readonly string[]; input?: string; cwd: string }[] = [];
    const resumed = log(check("ready", { carriedState: "previous-token" }), final()).split("\n").slice(1).join("\n");
    expect(await runCli(["--no-second-reading", "--continue", "--state-dir", stateDir, "Follow-up"], {
      transport: fakeTransport([resumed], calls), stdout: () => {},
    })).toBe(0);
    expect(calls[2].args).toContain("previous-thread");
    expect(calls[2].args.slice(0, 2)).toEqual(["exec", "resume"]);
    expect(calls[2].input).toContain("In finalize_research, pass this as carried_state: previous-token");
    expect(JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"))).toMatchObject({ thread_id: "previous-thread", carry_forward: "previous-token" });
    expect((await stat(stateDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(stateDir, "state.json"))).mode & 0o777).toBe(0o600);
  });

  it("retains raw events only with --keep-log, never the MCP configuration", async () => {
    const stateDir = await directory();
    const events = log(check(), final());
    expect(await runCli(["--no-second-reading", "--keep-log", "--state-dir", stateDir, "Question"], {
      transport: fakeTransport([events], []), stdout: () => {},
    })).toBe(0);
    const files = await readdir(stateDir);
    const logFile = files.find((name) => name.endsWith(".jsonl"))!;
    expect(logFile).toBeTruthy();
    expect(await readFile(join(stateDir, logFile), "utf8")).toBe(events);
    expect((await stat(join(stateDir, logFile))).mode & 0o777).toBe(0o600);
    for (const file of files.filter((name) => name !== "work")) {
      expect(await readFile(join(stateDir, file), "utf8")).not.toContain("DO-NOT-STORE");
    }
  });

  it("does not launch anything for --continue with no state", async () => {
    const calls: { args: readonly string[]; input?: string; cwd: string }[] = [];
    let output = "";
    expect(await runCli(["--no-second-reading", "--continue", "--state-dir", await directory(), "Follow-up"], {
      transport: fakeTransport([], calls), stdout: (text) => { output += text; },
    })).toBe(1);
    expect(calls).toHaveLength(0);
    expect(output).toContain("No previous conversation");
  });

  it("hides raw transport failures and rejects a nonzero execution even with passing events", async () => {
    const transport: CodexTransport = async (args, _input, _cwd, consume) => {
      if (args[0] === "mcp") { await consume("[]"); return 0; }
      await consume(log(check(), final())); return 1;
    };
    let output = "";
    expect(await runCli(["--no-second-reading", "--state-dir", await directory(), "Question"], { transport, stdout: (text) => { output += text; } })).toBe(1);
    expect(output).toBe("Not checked: Codex exited unsuccessfully.\n");
    output = "";
    expect(await runCli(["--no-second-reading", "--state-dir", await directory(), "Question"], {
      transport: async () => { throw new Error("SECRET CREDENTIAL"); }, stdout: (text) => { output += text; },
    })).toBe(1);
    expect(output).not.toContain("SECRET");
  });

  it("parses all options and rejects invalid/missing inputs before execution", async () => {
    expect(parseOptions(["--continue", "--rounds", "0", "--show-unchecked", "--keep-log", "--state-dir", "/tmp/private", "Follow-up"]))
      .toEqual({ continue: true, rounds: 0, showUnchecked: true, keepLog: true, secondReading: true, stateDir: "/tmp/private", ownerText: "Follow-up" });
    for (const args of [[], ["--rounds", "-1", "q"], ["--rounds", "1.5", "q"], ["--state-dir"], ["one", "two"], ["--unknown"]]) {
      expect(() => parseOptions(args)).toThrow();
    }
    let help = "";
    expect(await runCli(["--help"], { transport: async () => { throw new Error("Must not execute"); }, stdout: (text) => { help += text; } })).toBe(0);
    expect(help).toContain("--rounds N");
  });
});

const readingFooter = "Second reading (your Codex): no undeclared statements found.";
const harm = "This can cause harm.";
const term = "A confidence interval describes uncertainty.";
const scale = "The questionnaire score was 12.";
const readerAnswer = `${harm}\n${term}\n${scale}`;
const findings = [
  { kind: "safety_claims", quote: harm },
  { kind: "key_terms", quote: term },
  { kind: "scale_results", quote: scale },
];
const declaredFindings = {
  safety_claims: [{ quote: harm }], key_terms: [{ term: "confidence interval" }], scale_results: [{ quote: scale }],
};
const advisoryLines = `- a harm or safety statement (safety_claims): "${harm}"\n`
  + `- a specialized term the answer relies on (key_terms): "${term}"\n`
  + `- a scale or questionnaire result (scale_results): "${scale}"`;
const revisionPrompt = `${AUTOMATED_MARK} A second reading found sentences that look like statements the declarations leave out:\n`
  + advisoryLines
  + "\nFor each, declare it in finalize_research (safety_claims, key_terms or scale_results, as named), or keep the answer as it is if you judge it is not one; then call finalize_research again and give exactly the checked draft as your final message."
  + `\n${NOT_FROM_USER}`;
const readingLog = (value: unknown = { findings }) => log(final(JSON.stringify(value)));
const checkedReaderAnswer = (declarations?: Record<string, unknown>) =>
  log(check("ready", { draft: readerAnswer, declarations }), final(readerAnswer));

describe("local second reading with fixture logs", () => {
  it("does not start a second session or add a line when off", async () => {
    const { result, calls } = await fixtures([checkedReaderAnswer()], { secondReading: false });
    expect(calls).toHaveLength(1);
    expect(result.output).toBe(`${readerAnswer}\n\n${footer}`);
  });

  it("drops covered findings without resuming the main thread", async () => {
    const { result, calls } = await fixtures([
      checkedReaderAnswer(declaredFindings), readingLog(),
    ], { secondReading: true });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ prompt: buildLocalReaderPrompt(readerAnswer, declaredFindings), threadId: undefined, secondReading: true });
    expect(result.fixes).toBe(0);
    expect(result.output).toBe(`${readerAnswer}\n\n${footer}\n${readingFooter}`);
  });

  it("resumes the main thread once with the exact prompt, then accepts declared findings", async () => {
    const { result, calls } = await fixtures([
      checkedReaderAnswer(), readingLog(), checkedReaderAnswer(declaredFindings),
    ], { secondReading: true });
    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual({ prompt: revisionPrompt, threadId: "thread-1" });
    expect(result.fixes).toBe(1);
    expect(result.turn.finalizations).toHaveLength(2);
    expect(result.output).toBe(`${readerAnswer}\n\n${footer}\n${readingFooter}`);
  });

  it("lists still-open findings as advisory when the AI keeps its checked answer", async () => {
    const { result, calls } = await fixtures([
      checkedReaderAnswer(), readingLog(), checkedReaderAnswer(),
    ], { secondReading: true });
    expect(calls).toHaveLength(3);
    expect(result.kind).toBe("passed");
    expect(result.output).toBe(`${readerAnswer}\n\n${footer}\nSecond reading (your Codex): 3 sentence(s) still look undeclared:\n${advisoryLines}`);
  });

  it("resolves a finding removed from the final checked answer", async () => {
    const { result } = await fixtures([
      checkedReaderAnswer(), readingLog({ findings: [findings[0]] }), log(check(), final()),
    ], { secondReading: true });
    expect(result.output).toBe(`${answer}\n\n${footer}\n${readingFooter}`);
  });

  it("drops absent quotes, other kinds, and malformed or empty findings", async () => {
    const { result, calls } = await fixtures([
      checkedReaderAnswer(), readingLog({ findings: [
        { kind: "safety_claims", quote: "A sentence not in the answer." },
        { kind: "other", quote: harm }, { kind: "key_terms", quote: "  \n\t" },
        { kind: "scale_results", quote: 12 }, { kind: ["safety_claims"], quote: harm }, { quote: harm }, null, "bad",
      ] }),
    ], { secondReading: true });
    expect(calls).toHaveLength(2);
    expect(result.output).toBe(`${readerAnswer}\n\n${footer}\n${readingFooter}`);
  });

  it.each([
    ["safety_claims", "This can", { quote: "This\t can   cause harm." }],
    ["safety_claims", "This can cause harm.", { quote: "can cause" }],
    ["scale_results", "The questionnaire score was 12.", { quote: "score was 12." }],
    ["scale_results", "score was 12.", { quote: "The questionnaire\nscore was 12." }],
    ["key_terms", term, { term: "confidence\t interval" }],
  ])("normalizes whitespace and checks declared coverage for %s", async (kind, quote, declaration) => {
    const { result, calls } = await fixtures([
      checkedReaderAnswer({ [kind as string]: [declaration] }), readingLog({ findings: [{ kind, quote }] }),
    ], { secondReading: true });
    expect(calls).toHaveLength(2);
    expect(result.output).toContain(readingFooter);
  });

  it("requires matching kinds and does not treat a longer declared term as coverage", async () => {
    const { result } = await fixtures([
      checkedReaderAnswer({ safety_claims: [{ quote: term }], key_terms: [{ term: `${term} More words.` }] }),
      readingLog({ findings: [findings[1]] }), checkedReaderAnswer(),
    ], { secondReading: true });
    expect(result.output).toContain(`1 sentence(s) still look undeclared:\n- a specialized term the answer relies on (key_terms): "${term}"`);
  });

  it.each([
    mcp("codex_apps", "askrigor.search"),
    { type: "item.completed", item: { type: "web_search" } },
    { type: "item.completed", item: { type: "command_execution" } },
    { type: "item.started", item: { type: "mcp_tool_call", server: "local", tool: "search" } },
    { type: "item.started", item: { type: "web_search" } },
    { type: "item.started", item: { type: "command_execution" } },
  ])("rejects a reading that used a tool, search or command (%j)", async (event) => {
    const { result, calls } = await fixtures([
      checkedReaderAnswer(), log(event, final(JSON.stringify({ findings }))),
    ], { secondReading: true });
    expect(calls).toHaveLength(2);
    expect(result.kind).toBe("passed");
    expect(result.turn.tools).toHaveLength(1);
    expect(result.turn.commandCount).toBe(0);
    expect(result.output).toBe(`${readerAnswer}\n\n${footer}\nSecond reading: could not run (tools).`);
  });

  it.each(["```json", "```"])("accepts one surrounding JSON code fence (%s)", async (fence) => {
    const { result } = await fixtures([
      checkedReaderAnswer(declaredFindings), log(final(` \n${fence}\n${JSON.stringify({ findings })}\n\x60\x60\x60\n `)),
    ], { secondReading: true });
    expect(result.output).toContain(readingFooter);
  });

  it.each(["not JSON", "[]", "null", "{}", '{"findings":{}}', "```text\n{\"findings\":[]}\n```", 'Before {"findings":[]}'])(
    "reports an unreadable reading without exposing its text (%j)", async (text) => {
      const { result, calls } = await fixtures([
        checkedReaderAnswer(), log(final(text)),
      ], { secondReading: true });
      expect(calls).toHaveLength(2);
      expect(result.output).toBe(`${readerAnswer}\n\n${footer}\nSecond reading: could not run (unreadable).`);
    },
  );

  it.each([
    log(final('{"findings":[]}'), { type: "turn.failed" }),
    JSON.stringify(final('{"findings":[]}')),
    log(final('{"findings":[]}')) + "invalid event\n",
  ])("reports an errored or incomplete reading (%j)", async (events) => {
    const { result } = await fixtures([checkedReaderAnswer(), events], { secondReading: true });
    expect(result.output).toBe(`${readerAnswer}\n\n${footer}\nSecond reading: could not run (error).`);
  });

  it("builds the exact reading prompt from the passing call's three declarations only", () => {
    expect(buildLocalReaderPrompt(readerAnswer, { ...declaredFindings, answer_draft: "DRAFT", carried_state: "TOKEN", other: "PRIVATE" }))
      .toBe("Do not call any tool, run any command or search the web; answer from the text below only.\n\n"
        + LOCAL_READER_RUBRIC + "\n\nANSWER (as the user would see it):\n<<<\n" + readerAnswer
        + "\n>>>\n\nDECLARATIONS made to the final check (JSON):\n" + JSON.stringify(declaredFindings));
    expect(buildLocalReaderPrompt(answer, undefined)).toContain(JSON.stringify({ safety_claims: [], key_terms: [], scale_results: [] }));
  });

  it("waits for the passing finalizer and uses its arguments rather than an earlier call", async () => {
    const { result, calls } = await fixtures([
      log(check("not_ready", { declarations: { safety_claims: [{ quote: "OLD" }] } }), final()),
      checkedReaderAnswer(declaredFindings), readingLog(),
    ], { secondReading: true });
    expect(calls[2].prompt).toBe(buildLocalReaderPrompt(readerAnswer, declaredFindings));
    expect(result.fixes).toBe(1);
  });

  it("shares the fix budget and lists findings without a resume when none remains", async () => {
    const { result, calls } = await fixtures([
      log(check("not_ready"), final()), checkedReaderAnswer(), readingLog(),
    ], { rounds: 1, secondReading: true });
    expect(calls).toHaveLength(3);
    expect(result.fixes).toBe(1);
    expect(result.kind).toBe("passed");
    expect(result.output).toContain(`3 sentence(s) still look undeclared:\n${advisoryLines}`);
  });

  it("gates again after the advisory resume, with no second reading on subsequent fixes", async () => {
    const { result, calls } = await fixtures([
      checkedReaderAnswer(), readingLog(),
      log(check("not_ready", { draft: readerAnswer, declarations: declaredFindings }), final(readerAnswer)),
      checkedReaderAnswer(declaredFindings),
    ], { rounds: 2, secondReading: true });
    expect(calls).toHaveLength(4);
    expect(calls[2].prompt).toBe(revisionPrompt);
    expect(calls[3].prompt).toContain("final check has not passed");
    expect(result.fixes).toBe(2);
    expect(result.output).toContain(readingFooter);
  });

  it("keeps Not checked and the advisory when the resumed gate fails", async () => {
    const { result, calls } = await fixtures([
      checkedReaderAnswer(), readingLog(),
      log(check("not_ready", { draft: readerAnswer, declarations: declaredFindings, nextSteps: ["Still required."] }), final(readerAnswer)),
    ], { rounds: 1, secondReading: true });
    expect(calls).toHaveLength(3);
    expect(result.kind).toBe("failed");
    expect(result.output).toBe("Not checked: AskRigor's final check has not passed (status: not_ready).\nStill required.\n"
      + `Second reading (your Codex): 3 sentence(s) still look undeclared:\n${advisoryLines}`);
  });

  it("does not read an answer that never passes or is declared non-research", async () => {
    const failing = await fixtures([log(check("not_ready"), final())], { rounds: 0, secondReading: true });
    expect(failing.calls).toHaveLength(1);
    expect(failing.result.output).not.toContain("Second reading");
    const greeting = await fixtures([log(final("Hello")), log(final("NOT RESEARCH"))], { secondReading: true });
    expect(greeting.calls).toHaveLength(2);
    expect(greeting.result.output).not.toContain("Second reading");
  });
});

// These exercise the same CLI boundary as production, but all Codex IO is replaced by fixture logs.
describe("local reading CLI transport and persistence", () => {
  it("defaults on, starts a fresh low-effort session with the same flags, and preserves main-thread state and log", async () => {
    const stateDir = await directory();
    await writeFile(join(stateDir, "state.json"), JSON.stringify({ thread_id: "main-thread", carry_forward: "main-token", updated_at: "earlier" }));
    const main = log(check("ready", { carriedState: "main-token", carryForward: "next-main-token", draft: readerAnswer, declarations: declaredFindings }), final(readerAnswer))
      .split("\n").slice(1).join("\n");
    const reader = log(check("ready", { carryForward: "READER-TOKEN" }), final(JSON.stringify({ findings: [] })))
      .replace('"thread-1"', '"reader-thread"');
    const calls: { args: readonly string[]; input?: string; cwd: string }[] = [];
    let output = "";
    expect(await runCli(["--continue", "--keep-log", "--state-dir", stateDir, "Question"], {
      transport: fakeTransport([main, reader], calls), stdout: (text) => { output += text; },
    })).toBe(0);
    const execs = calls.filter(({ args }) => args[0] === "exec");
    const flags = restrictedFlagsFromMcpList('[{"name":"local","enabled":true}]');
    expect(execs).toHaveLength(2);
    expect(execs[0].args).toEqual(codexArguments(join(stateDir, "work"), flags, "main-thread"));
    expect(execs[1].args).toEqual(["exec", "--json", "--skip-git-repo-check", "-C", join(stateDir, "work"), ...flags, "-c", 'model_reasoning_effort="low"', "-"]);
    expect(execs[1].args).toEqual(localReaderArguments(join(stateDir, "work"), flags));
    expect(execs[1].input).toBe(buildLocalReaderPrompt(readerAnswer, declaredFindings));
    expect(execs.every(({ cwd }) => cwd === join(stateDir, "work"))).toBe(true);
    // The fixture deliberately contains an MCP call, so the reader is unusable; none of it enters the main gate/state.
    expect(output).toBe(`${readerAnswer}\n\n${footer}\nSecond reading: could not run (tools).\n`);
    expect(JSON.parse(await readFile(join(stateDir, "state.json"), "utf8")))
      .toEqual({ thread_id: "main-thread", carry_forward: "next-main-token", updated_at: expect.any(String) });
    const files = await readdir(stateDir);
    expect(files).toHaveLength(3);
    const eventFile = files.find((file) => file.endsWith(".jsonl"))!;
    expect(await readFile(join(stateDir, eventFile), "utf8")).toBe(main + reader);
  });

  it("does not start a second execution with --no-second-reading", async () => {
    const calls: { args: readonly string[]; input?: string; cwd: string }[] = [];
    let output = "";
    expect(await runCli(["--no-second-reading", "--state-dir", await directory(), "Question"], {
      transport: fakeTransport([checkedReaderAnswer()], calls), stdout: (text) => { output += text; },
    })).toBe(0);
    expect(calls.filter(({ args }) => args[0] === "exec")).toHaveLength(1);
    expect(output).toBe(`${readerAnswer}\n\n${footer}\n`);
    expect(parseOptions(["--no-second-reading", "Question"]).secondReading).toBe(false);
    expect(parseOptions(["Question"]).secondReading).toBe(true);
  });

  it.each(["exit", "throw"])("reports a failed Codex reading as error (%s)", async (failure) => {
    let execution = 0;
    const transport: CodexTransport = async (args, _input, _cwd, consume) => {
      if (args[0] === "mcp") { await consume("[]"); return 0; }
      execution += 1;
      if (execution === 1) { await consume(checkedReaderAnswer()); return 0; }
      if (failure === "throw") throw new Error("PRIVATE READER FAILURE");
      await consume(readingLog({ findings: [] }));
      return 1;
    };
    let output = "";
    expect(await runCli(["--state-dir", await directory(), "Question"], { transport, stdout: (text) => { output += text; } })).toBe(0);
    expect(execution).toBe(2);
    expect(output).toBe(`${readerAnswer}\n\n${footer}\nSecond reading: could not run (error).\n`);
  });
});
