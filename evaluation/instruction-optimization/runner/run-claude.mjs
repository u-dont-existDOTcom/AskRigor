#!/usr/bin/env node
// Runs one health question through AskRigor with Claude Code (`claude -p`)
// against a local AskRigor MCP server built from a chosen git ref, and records
// the transcript, the final answer and metrics. See README.md in this folder.
// Node built-ins only.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const METRICS_SCHEMA_VERSION = 1;
const MCP_SERVER_NAME = "askrigor";
const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`;
const PROTOCOL_FILES = { hrp: "HRP_Full.xml", universal: "Universal_Instructions.xml" };
const QUESTIONS_PATH = "evaluation/instruction-optimization/questions.json";
// Only the AskRigor tools and skill are pre-approved; these are removed outright.
const DISALLOWED_TOOLS = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch"];

// Built-in tools per surface. "claude-app" mirrors a Claude app user with the
// AskRigor connector and skill: no file, shell, or sub-agent tools, so the model
// cannot page a saved oversized tool result from disk or delegate to sub-agents.
// "claude-code" keeps Claude Code's other built-ins (Read, Agent, ...).
const SURFACE_BUILTIN_TOOLS = {
  "claude-app": "Skill,ToolSearch",
  "claude-code": null
};

// Removed from the child `claude` environment. Values are never read or saved;
// only these names are recorded in metrics.json.
const CHILD_ENV_REMOVE = [
  // Would tie the child to the calling Claude Code session or mirror its output.
  "CLAUDECODE", "CLAUDE_PID", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_REMOTE_SESSION_ID", "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_TEE_SDK_STDOUT", "CLAUDE_CODE_DIAGNOSTICS_FILE", "CLAUDE_CODE_DEBUG",
  "CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2", "CLAUDE_CODE_REMOTE_SEND_KEEPALIVES",
  "CLAUDE_CODE_SYNC_SESSION_REFS", "CLAUDE_CODE_WORKER_EPOCH", "CLAUDE_AFTER_LAST_COMPACT",
  "CLAUDE_AUTO_BACKGROUND_TASKS", "CLAUDE_CODE_BG_TASKS_REPORT_RUNNING",
  "CLAUDE_CODE_HOLD_UNANSWERED_PARKED_PERMISSION",
  // Would load extra instructions or skills (developer directories, the
  // account-synced AskRigor skill) on top of the ref's skill.
  "CLAUDE_ADDITIONAL_DIRECTORIES", "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD",
  "CLAUDE_CODE_SYNC_SKILLS", "CLAUDE_CODE_SYNC_PLUGINS", "CLAUDE_CODE_SYNC_PLUGIN_INSTALL",
  // Session-level tuning of the calling session; use --model / --effort instead.
  "CLAUDE_EFFORT", "MAX_THINKING_TOKENS", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
  // Zero-spend policy: the child must use the Claude plan, never a paid API key.
  "ANTHROPIC_API_KEY",
  // Credentials the child does not need (it has no shell or web tools).
  "GH_TOKEN", "GITHUB_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN", "CLOUDSDK_AUTH_ACCESS_TOKEN", "YOUTUBE_API_KEY", "NCBI_API_KEY",
  "GEMINI_API_KEY", "ASKRIGOR_GEMINI_API_KEY"
];
const CHILD_ENV_REMOVE_PREFIXES = ["CLAUDE_CODE_ARTIFACT_", "ASKRIGOR_"];

// Server environment is an allowlist, so no OAuth, database, Gemini or other
// production switches can leak in from the calling shell.
const SERVER_ENV_BASE = ["PATH", "HOME", "LANG", "LC_ALL", "TZ", "TMPDIR"];
const SERVER_ENV_NETWORK = [
  "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "NODE_USE_ENV_PROXY"
];
const SERVER_ENV_SECRETS = ["YOUTUBE_API_KEY", "NCBI_API_KEY"];
const SERVER_ENV_PROVIDER_CONFIG = ["NCBI_TOOL", "NCBI_EMAIL", "CROSSREF_MAILTO", "ASKRIGOR_UNPAYWALL_EMAIL"];

const USAGE = `Usage:
  node evaluation/instruction-optimization/runner/run-claude.mjs \\
    (--question-id <id> | --prompt <text>) [options]

Options:
  --ref <git ref>         AskRigor ref to build and serve (default HEAD; committed state only)
  --question-id <id>      Question id from ${QUESTIONS_PATH}
  --prompt <text>         Ad-hoc prompt instead of a question id
  --out <dir>             Output directory (default <work-dir>/results/<run-id>)
  --model <model>         Passed to claude --model
  --effort <level>        Passed to claude --effort (low, medium, high, xhigh, max)
  --max-turns <n>         Passed to claude --max-turns (default 200)
  --port <n>              Local server port (default: a free port)
  --work-dir <dir>        Worktrees and clean workspaces; must be outside the repository
                          (default $ASKRIGOR_RUNNER_WORK_DIR or <tmp>/askrigor-runner)
  --timeout-minutes <n>   Stop claude after this long (default 240)
  --allow-held-out        Required to run a HELD_OUT question (final comparison only)
  --setup-only            Build, start, probe and stop the server; do not run claude
  --reanalyze <dir>       Recompute metrics.json and answer.md from <dir>/transcript.jsonl
  -h, --help
`;

const runnerStartMs = Date.now();
const secrets = [];
const liveChildren = new Set();
let interrupted = false;
let activeClaude;

function log(message) {
  const seconds = ((Date.now() - runnerStartMs) / 1000).toFixed(1);
  process.stderr.write(`[run-claude ${seconds}s] ${message}\n`);
}

function fail(message) {
  const error = new Error(message);
  error.userFacing = true;
  throw error;
}

function redact(text) {
  let output = text;
  let count = 0;
  for (const secret of secrets) {
    if (secret.length < 8 || !output.includes(secret)) continue;
    const parts = output.split(secret);
    count += parts.length - 1;
    output = parts.join("[REDACTED]");
  }
  return { text: output, count };
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseOptions() {
  const { values } = parseArgs({
    options: {
      ref: { type: "string", default: "HEAD" },
      "question-id": { type: "string" },
      prompt: { type: "string" },
      out: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      "max-turns": { type: "string", default: "200" },
      port: { type: "string" },
      "work-dir": { type: "string" },
      "timeout-minutes": { type: "string", default: "240" },
      "allow-held-out": { type: "boolean", default: false },
      "setup-only": { type: "boolean", default: false },
      "no-harness-note": { type: "boolean", default: false },
      surface: { type: "string", default: "claude-app" },
      reanalyze: { type: "string" },
      help: { type: "boolean", short: "h", default: false }
    },
    strict: true,
    allowPositionals: false
  });
  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (values.reanalyze !== undefined) return { reanalyze: path.resolve(values.reanalyze) };
  if (values["question-id"] !== undefined && values.prompt !== undefined) {
    fail("Pass only one of --question-id or --prompt.");
  }
  if (values["question-id"] === undefined && values.prompt === undefined && !values["setup-only"]) {
    fail("Pass --question-id or --prompt.");
  }
  if (values.prompt !== undefined && values.prompt.trim() === "") fail("--prompt is empty.");
  const positiveInt = (name, raw, max) => {
    const number = Number(raw);
    if (!Number.isInteger(number) || number < 1 || number > max) fail(`--${name} must be an integer from 1 to ${max}.`);
    return number;
  };
  return {
    ref: values.ref,
    questionId: values["question-id"],
    prompt: values.prompt,
    out: values.out,
    model: values.model,
    effort: values.effort,
    maxTurns: positiveInt("max-turns", values["max-turns"], 100_000),
    port: values.port === undefined ? undefined : positiveInt("port", values.port, 65_535),
    workDir: path.resolve(values["work-dir"] ?? process.env.ASKRIGOR_RUNNER_WORK_DIR ?? path.join(os.tmpdir(), "askrigor-runner")),
    timeoutMinutes: positiveInt("timeout-minutes", values["timeout-minutes"], 10_000),
    allowHeldOut: values["allow-held-out"],
    setupOnly: values["setup-only"],
    harnessNote: !values["no-harness-note"],
    surface: Object.hasOwn(SURFACE_BUILTIN_TOOLS, values.surface)
      ? values.surface
      : fail(`--surface must be one of: ${Object.keys(SURFACE_BUILTIN_TOOLS).join(", ")}.`)
  };
}

// Automated runs have no user to answer. The local server has no OAuth, so
// manage_research_access reports authorization_required, and the protocols ask
// for user approval before research. The note is identical for every arm.
const HARNESS_NOTE =
  "Test-run note: this is an unattended test run against a local AskRigor server. " +
  "Research access is not required on this server; if manage_research_access reports " +
  "authorization_required, continue without asking the user to enroll. No user can reply " +
  "during this run: treat any approval or clarification you would ask the user for as " +
  "granted with sensible defaults, complete the research, and give your final answer.";

function resolveQuestion(repoRoot, options) {
  if (options.prompt === undefined && options.questionId === undefined) {
    return { id: null, split: null, text: "", source: "none (setup only)" };
  }
  if (options.prompt !== undefined) {
    return { id: null, split: null, text: options.prompt, source: "prompt" };
  }
  const file = JSON.parse(fs.readFileSync(path.join(repoRoot, QUESTIONS_PATH), "utf8"));
  const question = file.questions.find(({ id }) => id === options.questionId);
  if (question === undefined) {
    fail(`Unknown question id ${options.questionId}. Known: ${file.questions.map(({ id }) => id).join(", ")}`);
  }
  if (question.split === "HELD_OUT" && !options.allowHeldOut) {
    fail(`${question.id} is HELD_OUT: run it only in the final before/after comparison, with --allow-held-out.`);
  }
  return { id: question.id, split: question.split, text: question.text, source: QUESTIONS_PATH };
}

// ---------------------------------------------------------------- worktree

function ensureWorktree(repoRoot, workDir, sha) {
  const worktree = path.join(workDir, "worktrees", sha.slice(0, 12));
  if (fs.existsSync(worktree)) {
    let head;
    try {
      head = git(worktree, ["rev-parse", "HEAD"]);
    } catch {
      fail(`${worktree} exists but is not a git worktree; remove it and rerun.`);
    }
    if (head !== sha) fail(`${worktree} is at ${head}, expected ${sha}; remove it and rerun.`);
    if (git(worktree, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
      fail(`${worktree} has local changes; remove it (git worktree remove --force ${worktree}) and rerun.`);
    }
    return { path: worktree, reused: true };
  }
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  git(repoRoot, ["worktree", "add", "--force", "--detach", worktree, sha]);
  return { path: worktree, reused: false };
}

function readLinkTarget(file) {
  try {
    return fs.readlinkSync(file);
  } catch {
    return undefined;
  }
}

// node_modules from the main checkout, except that workspace links
// (node_modules/@askrigor/* -> ../../packages/*) are recreated so they resolve
// inside the worktree. A plain node_modules symlink would make the worktree
// load the main checkout's packages and protocol files.
function linkOverlayEntry(source, destination, sharedRoot, workspaceLinks) {
  const target = readLinkTarget(source);
  if (target !== undefined && !isInside(path.resolve(path.dirname(source), target), sharedRoot)) {
    if (path.isAbsolute(target)) fail(`Unexpected absolute workspace link ${source} -> ${target}`);
    fs.symlinkSync(target, destination);
    workspaceLinks.push(destination);
    return;
  }
  fs.symlinkSync(source, destination);
}

function buildNodeModulesOverlay(sharedModules, overlay, lockSha256) {
  // Built next to the final location and renamed, so an interrupted build
  // never leaves a partial node_modules behind.
  const staging = `${overlay}.staging-${randomBytes(4).toString("hex")}`;
  fs.mkdirSync(staging);
  const workspaceLinks = [];
  for (const entry of fs.readdirSync(sharedModules, { withFileTypes: true })) {
    if (entry.name === ".package-lock.json") continue;
    const source = path.join(sharedModules, entry.name);
    const destination = path.join(staging, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      fs.mkdirSync(destination);
      for (const child of fs.readdirSync(source)) {
        linkOverlayEntry(path.join(source, child), path.join(destination, child), sharedModules, workspaceLinks);
      }
    } else {
      linkOverlayEntry(source, destination, sharedModules, workspaceLinks);
    }
  }
  fs.writeFileSync(path.join(staging, ".askrigor-runner-overlay.json"), `${JSON.stringify({
    source: sharedModules,
    lock_sha256: lockSha256,
    workspace_links: workspaceLinks.map((link) => path.relative(staging, link))
  }, null, 2)}\n`);
  fs.renameSync(staging, overlay);
}

function verifyWorkspaceLinks(worktree) {
  const scope = path.join(worktree, "node_modules", "@askrigor");
  if (!fs.existsSync(scope)) return;
  for (const name of fs.readdirSync(scope)) {
    const real = fs.realpathSync(path.join(scope, name));
    if (!isInside(real, worktree)) {
      fail(`node_modules/@askrigor/${name} resolves outside the worktree (${real}).`);
    }
  }
}

function runLogged(command, args, cwd, logFile, env = process.env) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  fs.appendFileSync(logFile, `$ ${command} ${args.join(" ")}  (cwd ${cwd})\n${result.stdout ?? ""}${result.stderr ?? ""}\n`);
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed in ${cwd} (exit ${result.status ?? result.signal}); see ${logFile}`);
  }
  return (Date.now() - started) / 1000;
}

function ensureDependencies(repoRoot, worktree, setupLog) {
  const sharedModules = path.join(repoRoot, "node_modules");
  const overlay = path.join(worktree, "node_modules");
  const marker = path.join(overlay, ".askrigor-runner-overlay.json");
  const worktreeLock = sha256(fs.readFileSync(path.join(worktree, "package-lock.json")));
  const repoLock = sha256(fs.readFileSync(path.join(repoRoot, "package-lock.json")));
  const lockIdentical = worktreeLock === repoLock && fs.existsSync(sharedModules);
  const overlayMarker = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, "utf8")) : undefined;
  const isSymlink = readLinkTarget(overlay) !== undefined;

  // npm writes node_modules/.package-lock.json at the end of a completed install.
  const completedInstall = overlayMarker === undefined && !isSymlink &&
    fs.existsSync(path.join(overlay, ".package-lock.json"));

  if (isSymlink) fs.unlinkSync(overlay);
  if (lockIdentical && overlayMarker?.lock_sha256 === worktreeLock && overlayMarker.source === sharedModules) {
    verifyWorkspaceLinks(worktree);
    return { mode: "shared_node_modules_overlay", reused: true, seconds: 0 };
  }
  // Worktrees are per commit, so a completed install always matches this lockfile.
  if (completedInstall) {
    verifyWorkspaceLinks(worktree);
    return { mode: "npm_ci", reused: true, seconds: 0 };
  }
  // A stale overlay (the main checkout's lockfile changed) or a partial install
  // is replaced.
  if (fs.existsSync(overlay)) fs.rmSync(overlay, { recursive: true, force: true });
  if (lockIdentical) {
    const started = Date.now();
    buildNodeModulesOverlay(sharedModules, overlay, worktreeLock);
    verifyWorkspaceLinks(worktree);
    return { mode: "shared_node_modules_overlay", reused: false, seconds: (Date.now() - started) / 1000 };
  }
  log("package-lock.json differs from the main checkout; running npm ci in the worktree");
  const seconds = runLogged("npm", ["ci", "--no-audit", "--no-fund"], worktree, setupLog);
  verifyWorkspaceLinks(worktree);
  return { mode: "npm_ci", reused: false, seconds };
}

// ---------------------------------------------------------------- server

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function localRequest({ port, method, pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, method, path: pathname, headers, timeout: 5000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        contentType: String(response.headers["content-type"] ?? ""),
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function waitForExit(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function startServer({ worktree, port, env, logStream }) {
  const entry = pathToFileURL(path.join(worktree, "apps", "research-mcp", "dist", "index.js")).href;
  // Same factory and environment switches as the production container
  // (node apps/research-mcp/dist/index.js); only the bind address differs,
  // because index.js always binds 0.0.0.0.
  const bootstrap = [
    "const { createAskRigorHttpServer } = await import(process.env.ASKRIGOR_RUNNER_SERVER_ENTRY);",
    "const port = Number(process.env.PORT);",
    "createAskRigorHttpServer().listen(port, '127.0.0.1', () => {",
    "  console.log(`AskRigor MCP server listening on 127.0.0.1:${port}`);",
    "});"
  ].join("\n");
  const child = spawn(process.execPath, ["--input-type=module", "-e", bootstrap], {
    cwd: worktree,
    env: { ...env, ASKRIGOR_RUNNER_SERVER_ENTRY: entry },
    stdio: ["ignore", "pipe", "pipe"]
  });
  liveChildren.add(child);
  child.once("exit", () => liveChildren.delete(child));
  const write = (chunk) => logStream.write(redact(chunk.toString("utf8")).text);
  child.stdout.on("data", write);
  child.stderr.on("data", write);
  return child;
}

async function waitForHealth(port, child, milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      fail(`AskRigor server exited during startup (${child.exitCode ?? child.signalCode}); see server.log`);
    }
    try {
      const response = await localRequest({ port, method: "GET", pathname: "/healthz" });
      if (response.status === 200) return JSON.parse(response.body);
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`AskRigor server did not become healthy within ${milliseconds / 1000}s; see server.log`);
}

function parseMcpBody(response) {
  if (response.contentType.includes("text/event-stream")) {
    const messages = response.body.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));
    return messages.at(-1);
  }
  return JSON.parse(response.body);
}

// Confirms the running server serves this ref's protocol bytes (and not, for
// example, another checkout's files through a shared node_modules).
async function probeProtocolManifests(port, protocolFiles) {
  const checks = {};
  for (const [protocol, file] of Object.entries(protocolFiles)) {
    try {
      const response = await localRequest({
        port,
        method: "POST",
        pathname: "/mcp",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: { name: "get_protocol_manifest", arguments: { protocol } }
        })
      });
      const manifest = parseMcpBody(response)?.result?.structuredContent?.manifest;
      checks[protocol] = {
        version: manifest?.version ?? null,
        revision_date: manifest?.revisionDate ?? null,
        sha256: manifest?.sha256 ?? null,
        matches_ref_file: manifest?.sha256 === file.sha256
      };
    } catch (error) {
      checks[protocol] = { matches_ref_file: false, error: String(error?.message ?? error) };
    }
  }
  return checks;
}

async function probeToolCatalog(port) {
  const post = (id, method, params) => localRequest({
    port,
    method: "POST",
    pathname: "/mcp",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  try {
    const initialize = await post(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "askrigor-eval-runner", version: "1" }
    });
    const initialized = parseMcpBody(initialize);
    const listed = parseMcpBody(await post(2, "tools/list", {}));
    const names = (listed?.result?.tools ?? []).map(({ name }) => name).sort();
    return {
      ok: names.length > 0,
      server_info: initialized?.result?.serverInfo ?? null,
      server_instructions_bytes: typeof initialized?.result?.instructions === "string"
        ? Buffer.byteLength(initialized.result.instructions) : null,
      tool_count: names.length,
      tool_names: names,
      ...(listed?.error === undefined ? {} : { error: listed.error })
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

async function stopServer(child, port) {
  const alreadyExited = child.exitCode !== null || child.signalCode !== null;
  let forced = false;
  if (!alreadyExited) {
    child.kill("SIGTERM");
    if (!(await waitForExit(child, 5000))) {
      forced = true;
      child.kill("SIGKILL");
      await waitForExit(child, 5000);
    }
  }
  const portClosed = await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(2000);
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
  });
  return {
    exited_before_stop: alreadyExited,
    forced_kill: forced,
    exit_code: child.exitCode,
    exit_signal: child.signalCode,
    stopped: child.exitCode !== null || child.signalCode !== null,
    port_closed_after_stop: portClosed
  };
}

// ---------------------------------------------------------------- claude

function childEnvironment() {
  const env = { ...process.env };
  const removed = [];
  for (const name of Object.keys(env)) {
    if (CHILD_ENV_REMOVE.includes(name) || CHILD_ENV_REMOVE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      delete env[name];
      removed.push(name);
    }
  }
  return { env, removed: removed.sort() };
}

function claudeCapabilities(claudeBin, env) {
  const help = spawnSync(claudeBin, ["--help"], { encoding: "utf8", env });
  const version = spawnSync(claudeBin, ["--version"], { encoding: "utf8", env });
  if (help.status !== 0) fail(`Could not run ${claudeBin} --help`);
  return {
    version: (version.stdout ?? "").trim() || null,
    permissionPrompts: help.stdout.includes("--permission-prompts"),
    noSessionPersistence: help.stdout.includes("--no-session-persistence")
  };
}

function runClaude({ claudeBin, args, cwd, env, transcriptPath, stderrPath, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const transcript = fs.createWriteStream(transcriptPath);
    const stderrLog = fs.createWriteStream(stderrPath);
    const events = [];
    const seenToolUses = new Set();
    let redactions = 0;
    let unparsedLines = 0;
    let timedOut = false;
    const startedMs = Date.now();
    const child = spawn(claudeBin, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    activeClaude = child;
    liveChildren.add(child);
    child.once("error", (error) => {
      clearTimeout(timer);
      liveChildren.delete(child);
      reject(error);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      log(`timeout after ${timeoutMs / 60000} minutes; stopping claude`);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 15_000).unref();
    }, timeoutMs);

    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      const t = Number(((Date.now() - startedMs) / 1000).toFixed(3));
      const { text, count } = redact(line);
      redactions += count;
      transcript.write(`${text}\n`);
      let event;
      try {
        event = JSON.parse(text);
      } catch {
        unparsedLines += 1;
        return;
      }
      events.push({ t, event });
      if (event.type === "assistant") {
        for (const block of event.message?.content ?? []) {
          if (block?.type === "tool_use" && !seenToolUses.has(block.id)) {
            seenToolUses.add(block.id);
            log(`tool call #${seenToolUses.size} ${block.name}${event.parent_tool_use_id ? " (subagent)" : ""}`);
          }
        }
      } else if (event.type === "result") {
        log(`result: ${event.subtype}, ${event.num_turns} turns`);
      }
    });
    child.stderr.on("data", (chunk) => {
      const { text, count } = redact(chunk.toString("utf8"));
      redactions += count;
      stderrLog.write(text);
    });
    const linesDone = new Promise((done) => lines.once("close", done));
    child.once("close", async (code, signal) => {
      clearTimeout(timer);
      liveChildren.delete(child);
      activeClaude = undefined;
      const endedMs = Date.now();
      await linesDone;
      await new Promise((done) => transcript.end(done));
      await new Promise((done) => stderrLog.end(done));
      resolve({ events, code, signal, timedOut, redactions, unparsedLines, startedMs, endedMs });
    });
  });
}

// ---------------------------------------------------------------- analysis

function shortToolName(name) {
  return typeof name === "string" && name.startsWith(MCP_TOOL_PREFIX) ? name.slice(MCP_TOOL_PREFIX.length) : name;
}

function summarizeInput(input) {
  if (input === null || typeof input !== "object") return input;
  const summary = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") summary[key] = value.length <= 200 ? value : `<string ${value.length} chars>`;
    else if (typeof value === "number" || typeof value === "boolean" || value === null) summary[key] = value;
    else if (Array.isArray(value)) summary[key] = `<array ${value.length}>`;
    else summary[key] = `<object ${JSON.stringify(value).length} chars>`;
  }
  return summary;
}

function deliveredText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => (block?.type === "text" && typeof block.text === "string" ? block.text : "")).join("\n");
}

function tryJson(text, out) {
  if (typeof text !== "string") return;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
  try {
    const value = JSON.parse(trimmed);
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) out.push(item);
    }
  } catch {
    // not JSON
  }
}

// Structured tool output as far as the transcript exposes it: the raw
// tool_use_result (which can carry structuredContent) and JSON in the content
// the model saw.
function resultPayloads(call) {
  const payloads = [];
  const raw = call.raw_result;
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    if (raw.structuredContent !== null && typeof raw.structuredContent === "object") payloads.push(raw.structuredContent);
    payloads.push(raw);
  } else if (Array.isArray(raw)) {
    for (const block of raw) if (block?.type === "text") tryJson(block.text, payloads);
  } else {
    tryJson(raw, payloads);
  }
  if (typeof call.content === "string") tryJson(call.content, payloads);
  else if (Array.isArray(call.content)) for (const block of call.content) if (block?.type === "text") tryJson(block.text, payloads);
  return payloads;
}

function pick(call, keys) {
  for (const payload of call.payloads) {
    let value = payload;
    for (const key of keys) value = value !== null && typeof value === "object" ? value[key] : undefined;
    if (value !== undefined) return value;
  }
  // Fallback for scalar leaves printed in text the model saw.
  const leaf = keys.at(-1);
  const match = new RegExp(`"${leaf}"\\s*:\\s*("([^"\\\\]*)"|true|false|-?\\d+(?:\\.\\d+)?)`).exec(call.text);
  if (match === null) return undefined;
  if (match[2] !== undefined) return match[2];
  return JSON.parse(match[1]);
}

function outcome(call, keys) {
  const value = pick(call, keys);
  if (value !== undefined) return value;
  if (call.is_error) return "tool_error";
  return call.has_result ? "unknown" : "no_result";
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[String(item[key])] = (counts[String(item[key])] ?? 0) + 1;
  return counts;
}

function analyze(run, context) {
  const events = run.events;
  const init = events.find(({ event }) => event.type === "system" && event.subtype === "init")?.event;
  const result = events.findLast(({ event }) => event.type === "result")?.event;
  const calls = [];
  const byId = new Map();
  const usageByMessage = new Map();
  const texts = [];

  for (const { t, event } of events) {
    if (event.type === "assistant" && event.message !== undefined) {
      const message = event.message;
      if (message.id !== undefined && message.usage !== undefined) usageByMessage.set(message.id, message.usage);
      for (const block of Array.isArray(message.content) ? message.content : []) {
        if (block?.type === "tool_use" && block.id !== undefined && !byId.has(block.id)) {
          const call = {
            seq: calls.length + 1,
            id: block.id,
            name: block.name,
            input: block.input ?? {},
            subagent: event.parent_tool_use_id != null,
            t_call_s: t
          };
          calls.push(call);
          byId.set(block.id, call);
        } else if (block?.type === "text" && typeof block.text === "string" && event.parent_tool_use_id == null) {
          texts.push({ text: block.text, callsBefore: calls.length });
        }
      }
    } else if (event.type === "user" && Array.isArray(event.message?.content)) {
      const toolResults = event.message.content.filter((block) => block?.type === "tool_result");
      for (const block of toolResults) {
        const call = byId.get(block.tool_use_id);
        if (call === undefined || call.has_result) continue;
        call.has_result = true;
        call.is_error = block.is_error === true;
        call.content = block.content;
        call.raw_result = toolResults.length === 1 ? event.tool_use_result : undefined;
        call.t_result_s = t;
      }
    }
  }

  const total = calls.length;
  for (const call of calls) {
    call.short = shortToolName(call.name);
    call.index_before_final_answer = call.seq - total - 1;
    call.text = deliveredText(call.content);
    call.payloads = resultPayloads(call);
    call.is_error ??= false;
    call.has_result ??= false;
  }
  const where = (call) => ({ seq: call.seq, index_before_final_answer: call.index_before_final_answer });
  const named = (name) => calls.filter((call) => call.short === name);

  // Final answer.
  let answer = "";
  let answerSource = "none";
  if (typeof result?.result === "string" && result.result.trim() !== "") {
    answer = result.result;
    answerSource = "result_event";
  } else {
    const tail = texts.filter(({ callsBefore }) => callsBefore === total).map(({ text }) => text);
    if (tail.length > 0) {
      answer = tail.join("\n\n");
      answerSource = "last_assistant_text";
    }
  }

  // Tokens.
  let tokens;
  if (result?.usage !== undefined) {
    tokens = {
      source: "result.usage",
      input: result.usage.input_tokens ?? 0,
      output: result.usage.output_tokens ?? 0,
      cache_read: result.usage.cache_read_input_tokens ?? 0,
      cache_creation: result.usage.cache_creation_input_tokens ?? 0
    };
  } else {
    tokens = { source: "assistant_messages_deduplicated", input: 0, output: 0, cache_read: 0, cache_creation: 0 };
    for (const usage of usageByMessage.values()) {
      tokens.input += usage.input_tokens ?? 0;
      tokens.output += usage.output_tokens ?? 0;
      tokens.cache_read += usage.cache_read_input_tokens ?? 0;
      tokens.cache_creation += usage.cache_creation_input_tokens ?? 0;
    }
  }

  // Protocol loads.
  const protocolLoads = named("load_protocol").map((call) => {
    const protocol = call.input.protocol ?? null;
    const text = pick(call, ["text"]);
    const deliveredBytes = Buffer.byteLength(call.text);
    const canonicalBytes = context.protocolFiles[protocol]?.bytes ?? null;
    const protocolTextBytes = typeof text === "string" ? Buffer.byteLength(text) : null;
    return {
      ...where(call),
      protocol,
      is_error: call.is_error,
      ok: pick(call, ["ok"]) ?? null,
      version: pick(call, ["manifest", "version"]) ?? null,
      sha256: pick(call, ["manifest", "sha256"]) ?? null,
      protocol_text_bytes: protocolTextBytes,
      canonical_file_bytes: canonicalBytes,
      tool_result_bytes_seen_by_model: deliveredBytes,
      model_saw_full_text: canonicalBytes === null ? null : deliveredBytes >= canonicalBytes,
      ...(canonicalBytes !== null && deliveredBytes < canonicalBytes
        ? { model_visible_excerpt: call.text.slice(0, 300) } : {})
    };
  });
  const manifestChecks = [...named("get_protocol_manifest"), ...named("verify_protocol_integrity")].map((call) => ({
    ...where(call),
    tool: call.short,
    protocol: call.input.protocol ?? null,
    is_error: call.is_error,
    version: pick(call, ["manifest", "version"]) ?? null,
    sha256: pick(call, ["manifest", "sha256"]) ?? null
  }));

  // Receipts.
  const surveys = named("survey_youtube_community").map((call) => ({
    ...where(call),
    is_error: call.is_error,
    access_status: outcome(call, ["access_status"]),
    candidates: (() => { const candidates = pick(call, ["candidates"]); return Array.isArray(candidates) ? candidates.length : null; })()
  }));
  const videoAudits = named("audit_youtube_video_community").map((call) => ({
    ...where(call),
    video_id: call.input.video_id ?? null,
    continuation: call.input.continuation_token !== undefined,
    is_error: call.is_error,
    completion_state: outcome(call, ["receipt", "completion_state"]),
    synthesis_lock: pick(call, ["receipt", "synthesis_lock"]) ?? null,
    continuation_recommended: pick(call, ["continuation_recommended"]) ?? null,
    access_status: pick(call, ["access_status"]) ?? null
  }));
  const lastStateByVideo = {};
  for (const audit of videoAudits) lastStateByVideo[String(audit.video_id)] = audit.completion_state;

  const chains = new Map();
  const acquisitions = named("acquire_open_full_text").map((call) => {
    const handle = pick(call, ["coverage_receipt", "document_handle"]);
    const exhausted = pick(call, ["coverage_receipt", "exhausted"]) === true;
    const status = outcome(call, ["status"]);
    if (typeof handle === "string") {
      chains.set(handle, {
        document_handle: handle,
        doi: call.input.doi ?? null,
        acquire_seq: call.seq,
        source_content_sha256: pick(call, ["coverage_receipt", "source_content_sha256"]) ?? null,
        continue_seqs: [],
        exhausted,
        exhausted_at_seq: exhausted ? call.seq : null,
        validations: []
      });
    }
    return { ...where(call), doi: call.input.doi ?? null, pmcid: call.input.pmcid ?? null, status, is_error: call.is_error, document_handle: handle ?? null, exhausted };
  });
  const chainFor = (handle) => {
    if (typeof handle !== "string") return undefined;
    if (!chains.has(handle)) {
      chains.set(handle, { document_handle: handle, doi: null, acquire_seq: null, source_content_sha256: null, continue_seqs: [], exhausted: false, exhausted_at_seq: null, validations: [] });
    }
    return chains.get(handle);
  };
  const continuations = named("continue_open_full_text").map((call) => {
    const handle = call.input.document_handle;
    const exhausted = pick(call, ["coverage_receipt", "exhausted"]) === true;
    const chain = chainFor(handle);
    if (chain !== undefined) {
      chain.continue_seqs.push(call.seq);
      if (exhausted && !chain.exhausted) {
        chain.exhausted = true;
        chain.exhausted_at_seq = call.seq;
      }
    }
    return { ...where(call), document_handle: handle ?? null, is_error: call.is_error, exhausted };
  });
  const methodAudit = (tool) => {
    const auditCalls = named(tool).map((call) => {
      const handle = call.input.document_handle;
      const chain = chainFor(handle);
      const status = outcome(call, ["status"]);
      const returnedHandle = pick(call, ["coverage_receipt", "document_handle"]);
      const returnedSha = pick(call, ["coverage_receipt", "source_content_sha256"]);
      const matches = returnedHandle === undefined
        ? null
        : returnedHandle === handle && chain?.source_content_sha256 != null && returnedSha === chain.source_content_sha256;
      const record = {
        ...where(call),
        document_handle: handle ?? null,
        repository_reuse: call.input.repository_analysis_version_id !== undefined,
        is_error: call.is_error,
        status,
        receipt_matches_acquisition: matches
      };
      chain?.validations.push({ tool, seq: call.seq, status, receipt_matches_acquisition: matches });
      return record;
    });
    return { count: auditCalls.length, by_status: countBy(auditCalls, "status"), calls: auditCalls };
  };
  const studyAudits = methodAudit("validate_study_method_audit");
  const reviewAudits = methodAudit("validate_review_method_audit");
  const chainList = [...chains.values()];
  for (const chain of chainList) chain.validations.sort((left, right) => left.seq - right.seq);

  const retractions = named("check_retraction_status").map((call) => ({
    ...where(call),
    identifier: call.input.identifier ?? null,
    is_error: call.is_error,
    status: outcome(call, ["data", "status"]),
    access_status: pick(call, ["access_status"]) ?? null
  }));
  const researchAccess = named("manage_research_access").map((call) => ({
    ...where(call),
    action: call.input.action ?? null,
    is_error: call.is_error,
    ok: pick(call, ["ok"]) ?? null,
    access_status: pick(call, ["access", "status"]) ?? null,
    error_code: pick(call, ["error", "code"]) ?? null
  }));
  const contributions = named("submit_research_contribution").map((call) => ({
    ...where(call),
    proposal_kind: call.input.proposalKind ?? null,
    is_error: call.is_error,
    error_code: pick(call, ["error", "code"]) ?? null
  }));

  const skillCalls = calls.filter((call) => call.name === "Skill").map((call) => ({
    ...where(call),
    skill: call.input.skill ?? call.input.command ?? call.input.name ?? null,
    is_error: call.is_error
  }));
  const toolsByName = {};
  for (const call of calls) toolsByName[call.name] = (toolsByName[call.name] ?? 0) + 1;
  const initTools = Array.isArray(init?.tools) ? init.tools : [];
  const initSkills = init?.skills ?? null;
  const rateLimits = events.filter(({ event }) => event.type === "rate_limit_event").map(({ t, event }) => ({
    t_s: t,
    status: event.rate_limit_info?.status ?? null,
    type: event.rate_limit_info?.rateLimitType ?? null,
    utilization: Object.fromEntries(Object.entries(event.rate_limit_info?.unifiedWindows ?? {})
      .map(([window, value]) => [window, value?.utilization ?? null]))
  }));

  return {
    answer,
    answerSource,
    init,
    result,
    metrics: {
      num_turns: result?.num_turns ?? null,
      result_subtype: result?.subtype ?? null,
      result_is_error: result?.is_error ?? null,
      terminal_reason: result?.terminal_reason ?? null,
      subagents_spawned: result?.subagent_stats?.spawned ?? null,
      api_seconds: typeof result?.duration_api_ms === "number" ? result.duration_api_ms / 1000 : null,
      tool_calls_total: total,
      tool_calls_by_name: toolsByName,
      tool_calls_with_error: calls.filter((call) => call.is_error).length,
      tool_calls_without_result: calls.filter((call) => !call.has_result).length,
      tool_call_order: calls.map((call) => call.short),
      tool_calls: calls.map((call) => ({
        seq: call.seq,
        index_before_final_answer: call.index_before_final_answer,
        name: call.name,
        subagent: call.subagent,
        is_error: call.is_error,
        t_call_s: call.t_call_s,
        t_result_s: call.t_result_s ?? null,
        result_bytes_seen_by_model: Buffer.byteLength(call.text),
        input: summarizeInput(call.input)
      })),
      tokens,
      tokens_by_model: result?.modelUsage ?? null,
      api_equivalent_cost_usd_estimate: result?.total_cost_usd ?? null,
      // Plan utilization reported in the stream (first and last report); the
      // difference approximates this run's share of the plan window.
      plan_rate_limit: rateLimits.length === 0 ? null : { first: rateLimits[0], last: rateLimits.at(-1), reports: rateLimits.length },
      permission_denials: result?.permission_denials ?? [],
      protocol_loads: protocolLoads,
      protocol_manifest_checks: manifestChecks,
      receipts: {
        manage_research_access: { count: researchAccess.length, calls: researchAccess },
        survey_youtube_community: { called: surveys.length > 0, count: surveys.length, calls: surveys },
        audit_youtube_video_community: {
          count: videoAudits.length,
          by_completion_state: countBy(videoAudits, "completion_state"),
          final_state_by_video: lastStateByVideo,
          calls: videoAudits
        },
        other_youtube_tool_counts: Object.fromEntries(
          ["search_youtube", "get_youtube_video", "get_youtube_comments", "search_youtube_comments", "audit_youtube_community"]
            .map((name) => [name, named(name).length])
        ),
        full_text: {
          acquire_count: acquisitions.length,
          continue_count: continuations.length,
          chains_started: chainList.filter((chain) => chain.acquire_seq !== null).length,
          chains_exhausted: chainList.filter((chain) => chain.exhausted).length,
          chains_with_matching_validated_audit: chainList.filter((chain) => chain.validations.some((validation) =>
            /_validated$/u.test(String(validation.status)) && validation.receipt_matches_acquisition === true)).length,
          chains: chainList,
          acquisitions,
          continuations
        },
        method_audits: {
          validate_study_method_audit: studyAudits,
          validate_review_method_audit: reviewAudits
        },
        check_retraction_status: { count: retractions.length, calls: retractions },
        submit_research_contribution: { count: contributions.length, calls: contributions }
      },
      skill_invocations: skillCalls,
      claude_session: {
        claude_code_version: init?.claude_code_version ?? context.claudeVersion,
        model: init?.model ?? null,
        permission_mode: init?.permissionMode ?? null,
        api_key_source: init?.apiKeySource ?? null,
        cwd: init?.cwd ?? null,
        mcp_servers: init?.mcp_servers ?? null,
        tool_count: initTools.length,
        askrigor_tool_count: initTools.filter((name) => String(name).startsWith(MCP_TOOL_PREFIX)).length,
        other_mcp_tools: initTools.filter((name) => String(name).startsWith("mcp__") && !String(name).startsWith(MCP_TOOL_PREFIX)),
        builtin_tools: initTools.filter((name) => !String(name).startsWith("mcp__")),
        disallowed_tools_absent: DISALLOWED_TOOLS.every((name) => !initTools.includes(name)),
        askrigor_skill_available: Array.isArray(initSkills) ? initSkills.includes(MCP_SERVER_NAME) : null,
        namespaced_skills: Array.isArray(initSkills) ? initSkills.filter((name) => String(name).includes(":")) : null,
        skills: initSkills,
        slash_commands: init?.slash_commands ?? null,
        plugins: init?.plugins ?? null
      },
      transcript: {
        events: events.length,
        unparsed_lines: run.unparsedLines,
        redactions: run.redactions
      }
    }
  };
}

function applyAnalysis(metrics, analysis, outDir) {
  fs.writeFileSync(path.join(outDir, "answer.md"), analysis.answer === "" ? "" : `${analysis.answer.trimEnd()}\n`);
  metrics.model = analysis.init?.model ?? metrics.model ?? null;
  metrics.answer = { source: analysis.answerSource, chars: analysis.answer.length };
  Object.assign(metrics, analysis.metrics);
  if (metrics.exit !== null && typeof metrics.exit === "object") metrics.exit.result_subtype = analysis.metrics.result_subtype;
}

// Re-derives metrics.json and answer.md from a saved transcript, keeping the
// run facts (ref, server, timing) recorded at run time. Tool timings come from
// the events' own timestamps relative to started_at.
function reanalyze(directory) {
  const metricsPath = path.join(directory, "metrics.json");
  const previous = fs.existsSync(metricsPath) ? JSON.parse(fs.readFileSync(metricsPath, "utf8")) : {};
  const startedMs = Date.parse(previous.started_at ?? "");
  const events = [];
  let unparsedLines = 0;
  for (const line of fs.readFileSync(path.join(directory, "transcript.jsonl"), "utf8").split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      unparsedLines += 1;
      continue;
    }
    const at = Date.parse(event.timestamp ?? "");
    const t = Number.isFinite(at) && Number.isFinite(startedMs) ? Number(((at - startedMs) / 1000).toFixed(3)) : null;
    events.push({ t, event });
  }
  const analysis = analyze(
    { events, unparsedLines, redactions: previous.transcript?.redactions ?? 0 },
    { protocolFiles: previous.protocol_files ?? {}, claudeVersion: previous.environment?.claude_code_version ?? null }
  );
  const metrics = { ...previous };
  applyAnalysis(metrics, analysis, directory);
  metrics.reanalyzed_at = new Date().toISOString();
  fs.writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  log(`reanalyzed ${directory}: ${metrics.tool_calls_total} tool calls, answer ${metrics.answer.chars} chars`);
  return 0;
}

// ---------------------------------------------------------------- main

function protocolFileInfo(worktree) {
  const info = {};
  for (const [name, file] of Object.entries(PROTOCOL_FILES)) {
    const filePath = path.join(worktree, "protocols", file);
    if (!fs.existsSync(filePath)) continue;
    const bytes = fs.readFileSync(filePath);
    info[name] = { file: `protocols/${file}`, bytes: bytes.length, sha256: sha256(bytes) };
  }
  return info;
}

function ancestorInstructionFiles(directory) {
  const found = [];
  let current = path.dirname(directory);
  for (;;) {
    for (const name of ["CLAUDE.md", "CLAUDE.local.md", "AGENTS.md", ".claude"]) {
      if (fs.existsSync(path.join(current, name))) found.push(path.join(current, name));
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const userMemory = path.join(os.homedir(), ".claude", "CLAUDE.md");
  if (fs.existsSync(userMemory)) found.push(userMemory);
  return found;
}

function listFiles(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
  });
}

async function main() {
  const options = parseOptions();
  if (options.reanalyze !== undefined) return reanalyze(options.reanalyze);
  if (!process.versions.node.startsWith("24.")) log(`warning: running on Node ${process.versions.node}; the project pins Node 24`);
  const repoRoot = git(SCRIPT_DIR, ["rev-parse", "--show-toplevel"]);
  if (isInside(options.workDir, repoRoot)) fail(`--work-dir must be outside the repository (${repoRoot}).`);
  const question = resolveQuestion(repoRoot, options);
  let sha;
  try {
    sha = git(repoRoot, ["rev-parse", "--verify", "--quiet", `${options.ref}^{commit}`]);
  } catch {
    fail(`Cannot resolve git ref ${options.ref}.`);
  }
  const stamp = new Date(runnerStartMs).toISOString().replace(/[-:]/gu, "").replace(/\.\d+Z$/u, "Z");
  const label = question.id ?? (question.text === "" ? "setup" : "prompt");
  const runId = `${stamp}-${label}-${sha.slice(0, 7)}-${randomBytes(2).toString("hex")}`;
  const outDir = path.resolve(options.out ?? path.join(options.workDir, "results", runId));
  if (fs.existsSync(path.join(outDir, "metrics.json")) || fs.existsSync(path.join(outDir, "transcript.jsonl"))) {
    fail(`${outDir} already holds a run; choose another --out.`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const setupLog = path.join(outDir, "setup.log");
  const claudeBin = process.env.CLAUDE_BIN ?? "claude";
  const { env: childEnv, removed: childEnvRemoved } = childEnvironment();
  const claudeInfo = claudeCapabilities(claudeBin, childEnv);
  const checkInterrupted = () => { if (interrupted) fail("Interrupted before the claude run started."); };

  const metrics = {
    schema_version: METRICS_SCHEMA_VERSION,
    run_id: runId,
    runner: path.relative(repoRoot, fileURLToPath(import.meta.url)),
    ref: options.ref,
    commit_sha: sha,
    // The server is built from the committed ref only; uncommitted paths in the
    // calling checkout are not part of the run.
    source_checkout_uncommitted_paths: git(repoRoot, ["status", "--porcelain"]).split("\n").filter(Boolean).length,
    question_id: question.id,
    question_split: question.split,
    question_source: question.source,
    prompt: question.text,
    model_requested: options.model ?? null,
    effort_requested: options.effort ?? null,
    max_turns: options.maxTurns,
    model: null,
    runner_started_at: new Date(runnerStartMs).toISOString(),
    started_at: null,
    ended_at: null,
    wall_seconds: null,
    setup_seconds: null,
    exit: null,
    actual_spend_usd_note: "Claude Code reports an API-equivalent estimate; runs use the Claude plan (actual model spend $0) unless claude_session.api_key_source shows an API key.",
    environment: {
      youtube_api_key_present: Boolean(process.env.YOUTUBE_API_KEY),
      ncbi_api_key_present: Boolean(process.env.NCBI_API_KEY),
      gemini_api_key_present: Boolean(process.env.ASKRIGOR_GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      ncbi_email_present: Boolean(process.env.NCBI_EMAIL),
      crossref_mailto_present: Boolean(process.env.CROSSREF_MAILTO),
      unpaywall_email_present: Boolean(process.env.ASKRIGOR_UNPAYWALL_EMAIL),
      node_version: process.versions.node,
      claude_code_version: claudeInfo.version
    }
  };
  const writeMetrics = () => fs.writeFileSync(path.join(outDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);

  let server;
  let serverLog;
  let port;
  let exitCode = 1;
  try {
    // 1. Worktree, dependencies, build.
    log(`ref ${options.ref} -> ${sha}`);
    const worktree = ensureWorktree(repoRoot, options.workDir, sha);
    log(`${worktree.reused ? "reusing" : "created"} worktree ${worktree.path}`);
    const dependencies = ensureDependencies(repoRoot, worktree.path, setupLog);
    log(`dependencies: ${dependencies.mode}${dependencies.reused ? " (reused)" : ""}`);
    log("building (npm run build)");
    const buildSeconds = runLogged("npm", ["run", "build"], worktree.path, setupLog);
    metrics.worktree = { path: worktree.path, reused: worktree.reused, dependencies, build_seconds: buildSeconds };
    metrics.protocol_files = protocolFileInfo(worktree.path);
    checkInterrupted();

    // 2. Local server without OAuth.
    port = options.port ?? await freePort();
    const continuationSecret = randomBytes(32).toString("base64url");
    secrets.push(continuationSecret);
    const serverEnv = {};
    for (const name of [...SERVER_ENV_BASE, ...SERVER_ENV_NETWORK, ...SERVER_ENV_SECRETS, ...SERVER_ENV_PROVIDER_CONFIG]) {
      if (process.env[name] !== undefined && process.env[name] !== "") serverEnv[name] = process.env[name];
    }
    // The server reads ASKRIGOR_GEMINI_API_KEY; the environment may name it GEMINI_API_KEY.
    const geminiKey = process.env.ASKRIGOR_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiKey) serverEnv.ASKRIGOR_GEMINI_API_KEY = geminiKey;
    for (const name of [...SERVER_ENV_SECRETS, "ASKRIGOR_GEMINI_API_KEY"]) {
      if (serverEnv[name] !== undefined) secrets.push(serverEnv[name]);
    }
    const proxied = Boolean(serverEnv.HTTPS_PROXY ?? serverEnv.https_proxy);
    if (proxied && serverEnv.NODE_USE_ENV_PROXY === undefined) serverEnv.NODE_USE_ENV_PROXY = "1";
    Object.assign(serverEnv, {
      NODE_ENV: "production",
      PORT: String(port),
      ASKRIGOR_PUBLIC_SERVER_ENABLED: "true",
      ASKRIGOR_YOUTUBE_CONTINUATION_SECRET: continuationSecret
    });
    serverLog = fs.createWriteStream(path.join(outDir, "server.log"));
    log(`starting AskRigor server on 127.0.0.1:${port}`);
    server = startServer({ worktree: worktree.path, port, env: serverEnv, logStream: serverLog });
    const health = await waitForHealth(port, server, 60_000);
    const catalog = await probeToolCatalog(port);
    const manifests = await probeProtocolManifests(port, metrics.protocol_files);
    log(`server healthy; MCP tools/list returned ${catalog.tool_count ?? 0} tools`);
    metrics.server = {
      url: `http://127.0.0.1:${port}/mcp`,
      pid: server.pid,
      health,
      oauth_configured: false,
      node_use_env_proxy: serverEnv.NODE_USE_ENV_PROXY === "1",
      env_names: Object.keys(serverEnv).sort(),
      tool_catalog: catalog,
      protocol_manifests: manifests
    };
    const mismatched = Object.entries(manifests).filter(([, check]) => !check.matches_ref_file).map(([name]) => name);
    if (!catalog.ok) fail(`MCP tools/list probe failed: ${catalog.error ? JSON.stringify(catalog.error) : "no tools"}`);
    if (mismatched.length > 0) fail(`Server protocol manifests do not match ${sha.slice(0, 12)} files: ${mismatched.join(", ")}`);

    // 3. Clean workspace outside the repository, with the ref's skill.
    const runDir = path.join(options.workDir, "runs", runId);
    const workspace = path.join(runDir, "workspace");
    const skillSource = path.join(worktree.path, "skills", "askrigor");
    if (!fs.existsSync(path.join(skillSource, "SKILL.md"))) fail(`${sha} has no skills/askrigor/SKILL.md`);
    const skillTarget = path.join(workspace, ".claude", "skills", "askrigor");
    fs.mkdirSync(path.dirname(skillTarget), { recursive: true });
    fs.cpSync(skillSource, skillTarget, { recursive: true });
    const mcpConfigPath = path.join(runDir, "mcp-config.json");
    const mcpConfig = { mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: `http://127.0.0.1:${port}/mcp` } } };
    fs.writeFileSync(mcpConfigPath, `${JSON.stringify(mcpConfig, null, 2)}\n`);
    fs.copyFileSync(mcpConfigPath, path.join(outDir, "mcp-config.json"));
    const skillBytes = fs.readFileSync(path.join(skillTarget, "SKILL.md"));
    metrics.workspace = {
      path: workspace,
      skill_files: listFiles(skillTarget),
      skill_md_bytes: skillBytes.length,
      skill_md_sha256: sha256(skillBytes),
      ancestor_instruction_files: ancestorInstructionFiles(workspace)
    };

    // 4. claude -p.
    const args = [
      "-p", question.text,
      "--mcp-config", mcpConfigPath,
      "--strict-mcp-config",
      "--output-format", "stream-json",
      "--verbose",
      "--allowedTools", `mcp__${MCP_SERVER_NAME}`, `Skill(${MCP_SERVER_NAME})`,
      "--disallowedTools", ...DISALLOWED_TOOLS,
      "--max-turns", String(options.maxTurns)
    ];
    if (claudeInfo.noSessionPersistence) args.push("--no-session-persistence");
    if (claudeInfo.permissionPrompts) args.push("--permission-prompts", "none");
    if (options.model !== undefined) args.push("--model", options.model);
    if (options.effort !== undefined) args.push("--effort", options.effort);
    if (options.harnessNote) args.push("--append-system-prompt", HARNESS_NOTE);
    metrics.harness_note = options.harnessNote ? HARNESS_NOTE : null;
    const builtinTools = SURFACE_BUILTIN_TOOLS[options.surface];
    if (builtinTools !== null) args.push("--tools", builtinTools);
    metrics.surface = { name: options.surface, builtin_tools: builtinTools ?? "default" };
    metrics.claude_command = { bin: claudeBin, args, cwd: workspace, env_removed: childEnvRemoved };
    metrics.setup_seconds = Number(((Date.now() - runnerStartMs) / 1000).toFixed(3));
    if (options.setupOnly) {
      metrics.setup_only = true;
      metrics.server = { ...metrics.server, ...(await stopServer(server, port)) };
      log(`setup only: server stopped (port closed: ${metrics.server.port_closed_after_stop}); claude not run`);
      return metrics.server.stopped && metrics.server.tool_catalog?.ok ? 0 : 1;
    }
    checkInterrupted();
    log(`running claude -p in ${workspace}`);
    writeMetrics();
    const run = await runClaude({
      claudeBin,
      args,
      cwd: workspace,
      env: childEnv,
      transcriptPath: path.join(outDir, "transcript.jsonl"),
      stderrPath: path.join(outDir, "claude-stderr.log"),
      timeoutMs: options.timeoutMinutes * 60_000
    });
    metrics.started_at = new Date(run.startedMs).toISOString();
    metrics.ended_at = new Date(run.endedMs).toISOString();
    metrics.wall_seconds = Number(((run.endedMs - run.startedMs) / 1000).toFixed(3));
    metrics.exit = { claude_exit_code: run.code, claude_signal: run.signal, timed_out: run.timedOut, interrupted };

    // 5. Stop the server before analysis.
    const stop = await stopServer(server, port);
    metrics.server = { ...metrics.server, ...stop };
    log(`server stopped (port closed: ${stop.port_closed_after_stop})`);

    const analysis = analyze(run, { protocolFiles: metrics.protocol_files, claudeVersion: claudeInfo.version });
    applyAnalysis(metrics, analysis, outDir);
    exitCode = run.code === 0 && analysis.metrics.result_subtype === "success" && !run.timedOut && !interrupted ? 0 : 1;
  } catch (error) {
    metrics.error = String(error?.message ?? error);
    throw error;
  } finally {
    if (server !== undefined && metrics.server?.stopped === undefined) {
      const stop = await stopServer(server, port);
      metrics.server = { ...(metrics.server ?? {}), ...stop };
    }
    if (serverLog !== undefined) await new Promise((resolve) => serverLog.end(resolve));
    metrics.total_runner_seconds = Number(((Date.now() - runnerStartMs) / 1000).toFixed(3));
    writeMetrics();
    log(`outputs in ${outDir}`);
  }
  const summary = {
    out: outDir,
    result: metrics.result_subtype,
    wall_seconds: metrics.wall_seconds,
    num_turns: metrics.num_turns,
    tool_calls_total: metrics.tool_calls_total,
    answer_chars: metrics.answer?.chars,
    server_stopped: metrics.server?.stopped
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return exitCode;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    log(`${signal} received; stopping claude and the server`);
    activeClaude?.kill("SIGTERM");
  });
}
process.on("exit", () => {
  for (const child of liveChildren) child.kill("SIGKILL");
});

main().then(
  (code) => { process.exitCode = interrupted ? 130 : code; },
  (error) => {
    process.stderr.write(`run-claude: ${error?.userFacing ? error.message : error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
);
