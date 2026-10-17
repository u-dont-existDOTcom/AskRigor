import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  codexArguments, emptyTurn, latestCarryForward, localReaderArguments, parseEventLine,
  isAskRigorTool, restrictedFlagsFromMcpList, runStrictTurn,
} from "./lib/askrigor-strict.mts";

const USAGE = `Usage: npx tsx scripts/askrigor-strict.mts [options] "question"
       npx tsx scripts/askrigor-strict.mts --continue [options] "follow-up"

Options:
  --rounds N        Fix rounds after the initial attempt (default: 3)
  --show-unchecked Also show an answer that did not pass, clearly labeled
  --keep-log       Keep the Codex JSON event log (contains private content)
  --no-second-reading  Turn off the local second reading (default: on)
  --state-dir DIR  Private state directory (default: ~/.askrigor-strict)
  --help           Show this usage
`;

export interface CliOptions {
  ownerText: string;
  continue: boolean;
  rounds: number;
  showUnchecked: boolean;
  keepLog: boolean;
  secondReading: boolean;
  stateDir: string;
}

export function parseOptions(args: readonly string[]): CliOptions {
  const options: CliOptions = {
    ownerText: "", continue: false, rounds: 3, showUnchecked: false,
    keepLog: false, secondReading: true, stateDir: join(homedir(), ".askrigor-strict"),
  };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") { positional.push(...args.slice(i + 1)); break; }
    if (arg === "--continue") options.continue = true;
    else if (arg === "--show-unchecked") options.showUnchecked = true;
    else if (arg === "--keep-log") options.keepLog = true;
    else if (arg === "--no-second-reading") options.secondReading = false;
    else if (arg === "--rounds") {
      const value = args[++i];
      if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error("--rounds requires a nonnegative integer");
      }
      options.rounds = Number(value);
    } else if (arg === "--state-dir") {
      const value = args[++i];
      if (!value) throw new Error("--state-dir requires a directory");
      options.stateDir = resolve(value);
    } else if (arg.startsWith("--")) throw new Error("Unknown option; use --help");
    else positional.push(arg);
  }
  if (positional.length !== 1 || !positional[0].trim()) throw new Error("Provide one quoted question or follow-up");
  options.ownerText = positional[0];
  return options;
}

interface State {
  thread_id: string;
  carry_forward?: string;
  updated_at: string;
}

function absent(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("State paths must be real directories");
  await chmod(path, 0o700);
}

async function loadState(path: string): Promise<State | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("State is not a regular file");
    await chmod(path, 0o600);
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (value === null || typeof value !== "object" || !("thread_id" in value)
      || typeof value.thread_id !== "string" || !/^[A-Za-z0-9_-]+$/.test(value.thread_id)
      || !("updated_at" in value) || typeof value.updated_at !== "string"
      || ("carry_forward" in value && typeof value.carry_forward !== "string")) {
      throw new Error("Invalid state");
    }
    return {
      thread_id: value.thread_id, updated_at: value.updated_at,
      ...("carry_forward" in value ? { carry_forward: value.carry_forward as string } : {}),
    };
  } catch (error) {
    if (absent(error)) return undefined;
    throw new Error("Cannot read state.json; choose another --state-dir or repair the state file");
  }
}

async function saveState(path: string, state: State): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8"); }
    finally { await file.close(); }
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: unknown) => { if (!absent(error)) throw error; });
  }
}

export type CodexTransport = (
  args: readonly string[], input: string | undefined, cwd: string,
  consume: (chunk: string) => Promise<void>,
) => Promise<number>;

/** No stdout/stderr is forwarded: only the gate may expose an answer. */
const codexTransport: CodexTransport = async (args, input, cwd, consume) => {
  const child = spawn("codex", [...args], { cwd, shell: false, stdio: ["pipe", "pipe", "ignore"] });
  const closed = new Promise<number>((fulfill, reject) => {
    child.once("error", () => reject(new Error("Codex could not be started")));
    child.once("close", (code) => fulfill(code ?? 1));
  });
  // Attach rejection handling before reading the stream (e.g. a missing executable).
  void closed.catch(() => {});
  let stdinFailed = false;
  child.stdin.on("error", () => { stdinFailed = true; });
  child.stdin.end(input);
  child.stdout.setEncoding("utf8");
  try {
    for await (const chunk of child.stdout) await consume(chunk as string);
    const code = await closed;
    return stdinFailed ? 1 : code;
  } catch {
    child.kill();
    await closed.catch(() => {});
    throw new Error("Codex execution failed");
  }
};

export interface CliDependencies {
  transport?: CodexTransport;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export async function runCli(args: readonly string[], dependencies: CliDependencies = {}): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => { process.stdout.write(text); });
  const stderr = dependencies.stderr ?? ((text: string) => { process.stderr.write(text); });
  const transport = dependencies.transport ?? codexTransport;
  if (args.length === 1 && args[0] === "--help") { stdout(USAGE); return 0; }
  let options: CliOptions;
  try { options = parseOptions(args); } catch (error) {
    stderr(`${(error as Error).message}\n${USAGE}`);
    return 2;
  }
  let log: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await privateDirectory(options.stateDir);
    const workDir = join(options.stateDir, "work");
    await privateDirectory(workDir);
    const statePath = join(options.stateDir, "state.json");
    const state = await loadState(statePath);
    if (options.continue && !state) throw new Error("No previous conversation; start without --continue");

    // The full list is transient only; never log it or include it in diagnostics.
    let serverList = "";
    const listCode = await transport(["mcp", "list", "--json"], undefined, workDir, async (chunk) => { serverList += chunk; });
    if (listCode !== 0) throw new Error("Cannot read the local MCP server list");
    const candidates = restrictedFlagsFromMcpList(serverList);
    serverList = "";
    // A server Codex lists but config.toml does not define (a plugin's or a built-in one) rejects this override, and
    // Codex would not start; keep only the overrides Codex accepts. The gate still reports any other tool a turn uses.
    const flags: string[] = [];
    for (let index = 0; index < candidates.length; index += 2) {
      const pair = candidates.slice(index, index + 2);
      if (pair[0] === "-c" &&
          await transport(["mcp", "list", "--json", ...pair], undefined, workDir, async () => {}) !== 0) continue;
      flags.push(...pair);
    }
    if (options.keepLog) log = await open(join(options.stateDir, `events-${randomUUID()}.jsonl`), "wx", 0o600);
    // Progress goes to stderr, so the answer on stdout stays clean; it holds counts and statuses only, never content.
    const progress = (line: string) => stderr(`  ${new Date().toISOString().slice(11, 19)} UTC  ${line}\n`);
    stderr("AskRigor strict runner: Codex is working with AskRigor. A research answer usually takes 5 to 15 minutes; " +
      "progress shows below, and the answer comes at the end.\n");
    let started = false;

    const outcome = await runStrictTurn({
      ownerText: options.ownerText, carriedState: state?.carry_forward,
      threadId: options.continue ? state?.thread_id : undefined,
      rounds: options.rounds, showUnchecked: options.showUnchecked, secondReading: options.secondReading,
    }, async (prompt, threadId, secondReading) => {
      const turn = emptyTurn();
      // resume does not emit thread.started in every CLI version.
      turn.threadId = threadId;
      let pending = "";
      if (secondReading) progress("Second reading: your Codex is reading the checked answer...");
      else if (started) progress("Sending the AI back to finish what the check or the reading asked for...");
      else progress(threadId ? "Continuing the conversation..." : "Started.");
      started = true;
      let askRigorCalls = 0;
      let finalChecks = 0;
      const report = () => {
        const calls = turn.tools.filter((call) => isAskRigorTool(call.server, call.tool)).length;
        if (Math.floor(calls / 10) > Math.floor(askRigorCalls / 10)) progress(`AskRigor calls so far: ${calls}`);
        askRigorCalls = calls;
        for (const check of turn.finalizations.slice(finalChecks)) {
          progress(`Final check: ${check.failed ? "the call failed" : check.status}` +
            (check.status === "not_ready" && check.nextSteps.length > 0 ? ` (${check.nextSteps.length} step(s) left)` : ""));
        }
        finalChecks = turn.finalizations.length;
      };
      try {
        const args = secondReading ? localReaderArguments(workDir, flags) : codexArguments(workDir, flags, threadId);
        const code = await transport(args, prompt, workDir, async (chunk) => {
          if (log) await log.writeFile(chunk, "utf8");
          pending += chunk;
          let newline: number;
          while ((newline = pending.indexOf("\n")) >= 0) {
            parseEventLine(turn, pending.slice(0, newline));
            pending = pending.slice(newline + 1);
            if (!secondReading) report();
          }
        });
        if (pending) parseEventLine(turn, pending);
        if (code !== 0) turn.failure = "Codex exited unsuccessfully";
        if (turn.threadId && !/^[A-Za-z0-9_-]+$/.test(turn.threadId)) {
          turn.threadId = undefined;
          turn.failure = "Codex emitted an invalid thread id";
        }
      } catch {
        turn.failure = "Codex execution failed";
      }
      return turn;
    });
    if (outcome.turn.threadId) {
      const token = latestCarryForward(outcome.turn) ?? state?.carry_forward;
      await saveState(statePath, {
        thread_id: outcome.turn.threadId, ...(token === undefined ? {} : { carry_forward: token }),
        updated_at: new Date().toISOString(),
      });
    }
    stdout(`${outcome.output}\n`);
    return outcome.kind === "failed" ? 1 : 0;
  } catch (error) {
    // Only our allowlisted errors are printable; system/transport errors may contain content.
    const message = error instanceof Error && [
      "State paths must be real directories",
      "Cannot read state.json; choose another --state-dir or repair the state file",
      "No previous conversation; start without --continue",
      "Cannot read the local MCP server list",
      "Invalid local MCP server name or enabled flag",
      "Codex could not be started", "Codex execution failed",
    ].includes(error.message) ? error.message : "Strict runner could not complete; check local Codex installation and state-directory access";
    stdout(`Not checked: ${message}.\n`);
    return 1;
  } finally {
    await log?.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  process.exitCode = await runCli(process.argv.slice(2));
}
