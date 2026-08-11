import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const EXACT_SECRET_RUNTIME_FIELDS = [
  "NCBI_API_KEY",
  "YOUTUBE_API_KEY"
] as const;

const GENERIC_SENSITIVE_OUTPUT_PATTERNS = [
  /AIza[0-9A-Za-z_-]{35}/,
  /\b(?:YOUTUBE|NCBI)_API_KEY=/
] as const;

export interface LiveSuiteLogScanInput {
  output: string;
  environment: Record<string, string | undefined>;
}

export function scanLiveSuiteLog(input: LiveSuiteLogScanInput): void {
  const configuredValues = EXACT_SECRET_RUNTIME_FIELDS
    .map((field) => input.environment[field]?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0);

  if (
    configuredValues.some((value) => input.output.includes(value)) ||
    GENERIC_SENSITIVE_OUTPUT_PATTERNS.some((pattern) => pattern.test(input.output))
  ) {
    throw new Error("Live-suite output contains configured sensitive value");
  }
}

function parseCliArguments(args: string[]): { logPath: string } {
  const logIndex = args.indexOf("--log");
  const logPath = logIndex === -1 ? undefined : args[logIndex + 1];

  if (logPath === undefined || logPath.length === 0) {
    throw new Error("Usage: scan-live-suite-log.mts --log <path>");
  }

  return { logPath };
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const { logPath } = parseCliArguments(process.argv.slice(2));
  const output = await readFile(logPath, "utf8");
  scanLiveSuiteLog({ output, environment: process.env });
  console.log("Live-suite output security scan accepted.");
}
