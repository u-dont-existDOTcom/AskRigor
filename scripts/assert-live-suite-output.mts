import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ANSI_ESCAPE_SEQUENCE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const REQUIRED_TEST_FILE_SUMMARY = /Test Files\s+1 passed\s*\(1\)/;
const REQUIRED_TEST_SUMMARY = /Tests\s+5 passed\s*\(5\)/;
const FORBIDDEN_SKIP_SUMMARY = /Tests[^\n]*\bskipped\b/i;

export interface LiveSuiteStatusInput {
  exitStatus: number;
  output: string;
}

export function stripAnsi(output: string): string {
  return output.replace(ANSI_ESCAPE_SEQUENCE, "");
}

export function assertLiveSuiteSuccess(input: LiveSuiteStatusInput): string {
  if (input.exitStatus !== 0) {
    throw new Error(`Live suite process exited ${input.exitStatus}`);
  }

  const sanitized = stripAnsi(input.output);

  if (!REQUIRED_TEST_FILE_SUMMARY.test(sanitized)) {
    throw new Error("Live suite did not report exactly one passing test file");
  }

  if (!REQUIRED_TEST_SUMMARY.test(sanitized) || FORBIDDEN_SKIP_SUMMARY.test(sanitized)) {
    throw new Error("Live suite did not report exactly five passing tests and zero skipped tests");
  }

  return sanitized;
}

function parseCliArguments(args: string[]): { exitStatus: number; logPath: string } {
  const exitStatusIndex = args.indexOf("--exit-status");
  const logIndex = args.indexOf("--log");
  const exitStatusValue = exitStatusIndex === -1 ? undefined : args[exitStatusIndex + 1];
  const logPath = logIndex === -1 ? undefined : args[logIndex + 1];

  if (
    exitStatusValue === undefined ||
    logPath === undefined ||
    !/^(?:0|[1-9]\d*)$/.test(exitStatusValue)
  ) {
    throw new Error("Usage: assert-live-suite-output.mts --exit-status <nonnegative integer> --log <path>");
  }

  return { exitStatus: Number(exitStatusValue), logPath };
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const { exitStatus, logPath } = parseCliArguments(process.argv.slice(2));
  const output = await readFile(logPath, "utf8");
  assertLiveSuiteSuccess({ exitStatus, output });
  console.log("Live suite status accepted: exit 0; Test Files 1 passed (1); Tests 5 passed (5); zero skipped.");
}
