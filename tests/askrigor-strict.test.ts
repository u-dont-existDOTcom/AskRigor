import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, stat, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOptions, runCli, type CodexTransport } from "../scripts/askrigor-strict.mts";
import {
  CARRIED_STATE_PROMPT, CLASSIFY_PROMPT, DRAFT_PROMPT, PREAMBLE,
  buildPrompt, codexArguments, gate, latestCarryForward, normalizeAnswer,
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
  textOnly?: boolean; error?: unknown;
} = {}) {
  const receipt = {
    status, next_steps: options.nextSteps ?? [], caveats: ["A declared limit."], check_line: "Checked.",
    ...(options.carryForward === undefined ? {} : { carry_forward: options.carryForward }),
  };
  return mcp("codex_apps", "askrigor_new_slug.finalize_research", {
    answer_draft: options.draft ?? answer,
    ...(options.carriedState === undefined ? {} : { carried_state: options.carriedState }),
  }, options.textOnly ? { content: [{ type: "text", text: JSON.stringify(receipt) }] }
    : { content: [{ type: "text", text: "Display text" }], structured_content: receipt }, options.error ?? null);
}
function log(...events: unknown[]): string {
  return [
    { type: "thread.started", thread_id: "thread-1" }, ...events, { type: "turn.completed", usage: {} },
  ].map((e) => JSON.stringify(e)).join("\n") + "\n";
}
async function fixtures(logs: string[], options: { rounds?: number; showUnchecked?: boolean; carriedState?: string } = {}) {
  const calls: { prompt: string; threadId?: string }[] = [];
  const result = await runStrictTurn({
    ownerText: "Owner question", rounds: options.rounds ?? 3,
    showUnchecked: options.showUnchecked ?? false, carriedState: options.carriedState,
  }, async (prompt, threadId) => {
    calls.push({ prompt, threadId });
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
    expect(calls[1].prompt).toBe("AskRigor's final check has not passed (status: not_ready). Do each of its next steps, call finalize_research again, and give exactly the checked draft as your final message:\nRead the study.\nReport its limit.");
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
    expect(await runCli(["--state-dir", stateDir, "Question"], { transport, stdout: () => {} })).toBe(0);
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
    const code = await runCli(["--state-dir", stateDir, "PRIVATE QUESTION"], {
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
    expect(await runCli(["--continue", "--state-dir", stateDir, "Follow-up"], {
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
    expect(await runCli(["--keep-log", "--state-dir", stateDir, "Question"], {
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
    expect(await runCli(["--continue", "--state-dir", await directory(), "Follow-up"], {
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
    expect(await runCli(["--state-dir", await directory(), "Question"], { transport, stdout: (text) => { output += text; } })).toBe(1);
    expect(output).toBe("Not checked: Codex exited unsuccessfully.\n");
    output = "";
    expect(await runCli(["--state-dir", await directory(), "Question"], {
      transport: async () => { throw new Error("SECRET CREDENTIAL"); }, stdout: (text) => { output += text; },
    })).toBe(1);
    expect(output).not.toContain("SECRET");
  });

  it("parses all options and rejects invalid/missing inputs before execution", async () => {
    expect(parseOptions(["--continue", "--rounds", "0", "--show-unchecked", "--keep-log", "--state-dir", "/tmp/private", "Follow-up"]))
      .toEqual({ continue: true, rounds: 0, showUnchecked: true, keepLog: true, stateDir: "/tmp/private", ownerText: "Follow-up" });
    for (const args of [[], ["--rounds", "-1", "q"], ["--rounds", "1.5", "q"], ["--state-dir"], ["one", "two"], ["--unknown"]]) {
      expect(() => parseOptions(args)).toThrow();
    }
    let help = "";
    expect(await runCli(["--help"], { transport: async () => { throw new Error("Must not execute"); }, stdout: (text) => { help += text; } })).toBe(0);
    expect(help).toContain("--rounds N");
  });
});
