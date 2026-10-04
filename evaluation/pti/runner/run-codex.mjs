#!/usr/bin/env node
// Runs one staged PTI conversation through Codex (`codex exec`, then
// `codex exec resume` for each later turn) as the bare-GPT arm, on the owner's
// ChatGPT plan: no API key is used, so actual model spend is $0.
//
// Codex runs from a clean CODEX_HOME (codex-home.mjs) and an empty read-only
// workspace, so no plugin, ChatGPT app, MCP server, project trust or global
// AGENTS.md reaches the model. Each turn's answer is saved under
// <out>/turns/<id>.md, like run-claude.mjs's --turns-file mode. Node built-ins
// only; run with Node 24.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { parseArgs } from "node:util";

import { createCleanCodexHome } from "./codex-home.mjs";

const USAGE = `Usage:
  node evaluation/pti/runner/run-codex.mjs --turns-file <case.json> --out <dir> [options]

Options:
  --model <model>          Codex model (default gpt-6.1-sol)
  --effort <level>         model_reasoning_effort (default xhigh)
  --web-search             Let the model search the web
  --timeout-minutes <n>    Per-turn timeout (default 60)
  --allow-held-out         Required for a VALIDATION case (frozen comparison only)
  -h, --help
`;

const startedMs = Date.now();
const log = (message) => process.stderr.write(`[run-codex ${((Date.now() - startedMs) / 1000).toFixed(1)}s] ${message}\n`);

function fail(message) {
  process.stderr.write(`run-codex: ${message}\n`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    "turns-file": { type: "string" },
    out: { type: "string" },
    model: { type: "string", default: "gpt-6.1-sol" },
    effort: { type: "string", default: "xhigh" },
    "web-search": { type: "boolean", default: false },
    "timeout-minutes": { type: "string", default: "60" },
    "allow-held-out": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false }
  },
  strict: true,
  allowPositionals: false
});
if (values.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}
if (values["turns-file"] === undefined || values.out === undefined) fail("Pass --turns-file and --out.");
if (!/^[a-z]+$/u.test(values.effort)) fail("--effort must be a plain level such as high or xhigh.");
const timeoutMs = Number(values["timeout-minutes"]) * 60_000;
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) fail("--timeout-minutes must be a positive number.");

const caseFile = JSON.parse(fs.readFileSync(path.resolve(values["turns-file"]), "utf8"));
const turns = Array.isArray(caseFile.turns) ? caseFile.turns : [];
if (turns.length === 0 || turns.some((turn) => typeof turn?.id !== "string" || typeof turn?.user !== "string" ||
  turn.user.trim() === "")) {
  fail(`${values["turns-file"]} needs a "turns" array of {"id", "user"} messages.`);
}
if (caseFile.data_role === "VALIDATION" && !values["allow-held-out"]) {
  fail(`${caseFile.id} is VALIDATION: run it only in the frozen comparison, with --allow-held-out.`);
}

const outDir = path.resolve(values.out);
if (fs.existsSync(path.join(outDir, "metrics.json"))) fail(`${outDir} already holds a run; choose another --out.`);
fs.mkdirSync(path.join(outDir, "turns"), { recursive: true });

const codex = createCleanCodexHome({ model: values.model, effort: values.effort, webSearch: values["web-search"] });
const codexVersion = execFileSync("codex", ["--version"], { encoding: "utf8", env: codex.env }).trim();

function runTurn(args, turnIndex, transcript) {
  return new Promise((resolve) => {
    const turnStart = Date.now();
    const child = spawn("codex", args, { cwd: codex.workspace, env: codex.env, stdio: ["ignore", "pipe", "pipe"] });
    let threadId = null;
    let lastMessage = null;
    let usage = null;
    const errors = [];
    const toolItems = {};
    const timer = setTimeout(() => {
      log(`turn ${turnIndex + 1} timed out; stopping codex`);
      child.kill("SIGTERM");
    }, timeoutMs);
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      transcript.write(`${JSON.stringify({ turn: turnIndex + 1, line })}\n`);
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === "thread.started" && typeof event.thread_id === "string") threadId = event.thread_id;
      if (event.type === "item.completed" && typeof event.item?.type === "string") {
        if (event.item.type === "agent_message" && typeof event.item.text === "string") lastMessage = event.item.text;
        else if (event.item.type !== "reasoning") toolItems[event.item.type] = (toolItems[event.item.type] ?? 0) + 1;
      }
      if (event.type === "turn.completed") usage = event.usage ?? null;
      if (event.type === "error" || event.type === "turn.failed") errors.push(event.message ?? event.error ?? "error");
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, threadId, lastMessage, usage, errors, toolItems, stderrTail: stderr.slice(-2000),
        seconds: Number(((Date.now() - turnStart) / 1000).toFixed(3)) });
    });
  });
}

const transcript = fs.createWriteStream(path.join(outDir, "transcript.jsonl"));
const records = [];
let threadId = null;
try {
  for (const [index, turn] of turns.entries()) {
    const lastFile = path.join(codex.scratch, `last-${index + 1}.txt`);
    const common = ["--json", "--skip-git-repo-check", "-o", lastFile, "-m", values.model];
    const args = index === 0
      ? ["exec", ...common, "--sandbox", "read-only", turn.user]
      : ["exec", "resume", ...common, threadId, turn.user];
    log(`turn ${index + 1} of ${turns.length} (${turn.id})`);
    const result = await runTurn(args, index, transcript);
    if (index === 0) threadId = result.threadId;
    const fromFile = fs.existsSync(lastFile) ? fs.readFileSync(lastFile, "utf8") : "";
    const answer = (result.lastMessage ?? fromFile).trimEnd();
    fs.writeFileSync(path.join(outDir, "turns", `${turn.id}.md`), answer === "" ? "" : `${answer}\n`);
    records.push({
      id: turn.id,
      exit_code: result.code,
      signal: result.signal,
      seconds: result.seconds,
      answer_chars: answer.length,
      tool_items: result.toolItems,
      usage: result.usage,
      errors: result.errors
    });
    if (result.code !== 0 || answer === "" || (index === 0 && threadId === null)) {
      log(`turn ${index + 1} failed (exit ${result.code}); stopping`);
      records.at(-1).stderr_tail = result.stderrTail;
      break;
    }
  }
} finally {
  await new Promise((done) => transcript.end(done));
}

const complete = records.length === turns.length && records.every(({ exit_code, answer_chars }) =>
  exit_code === 0 && answer_chars > 0);
const metrics = {
  schema_version: 1,
  runner: "evaluation/pti/runner/run-codex.mjs",
  arm: "bare-gpt",
  case_id: caseFile.id ?? null,
  case_data_role: caseFile.data_role ?? null,
  turns_requested: turns.map(({ id }) => id),
  model_requested: values.model,
  effort_requested: values.effort,
  web_search: values["web-search"],
  codex_version: codexVersion,
  codex_home: codex.describe(),
  thread_id: threadId,
  started_at: new Date(startedMs).toISOString(),
  wall_seconds: Number(((Date.now() - startedMs) / 1000).toFixed(3)),
  turns: records,
  complete,
  actual_spend_usd_note: "Codex signed in with the owner's ChatGPT plan; no API key reached it (actual model spend $0)."
};
fs.writeFileSync(path.join(outDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
codex.remove();
log(`outputs in ${outDir}`);
process.stdout.write(`${JSON.stringify({ out: outDir, complete, turns: records.length, wall_seconds: metrics.wall_seconds }, null, 2)}\n`);
process.exitCode = complete ? 0 : 1;
