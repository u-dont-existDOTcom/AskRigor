import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { z } from "zod";

const REPOSITORY_ISSUES_PATH = "repos/u-dont-existDOTcom/AskRigor-lessons/issues";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_GH_OUTPUT_BYTES = 16 * 1_024 * 1_024;
const TERMINAL_LABELS = new Set([
  "incorporated",
  "rejected",
  "duplicate",
  "insufficient-evidence",
]);

const reasonCodeSchema = z.enum([
  "gh_unavailable",
  "auth_unavailable",
  "repository_unavailable",
  "github_rate_limited",
  "invalid_response",
]);

export type LessonQueueReasonCode = z.infer<typeof reasonCodeSchema>;

export interface LessonQueueSummary {
  status: "available" | "unavailable";
  open_candidates?: number;
  needs_review?: number;
  accepted_not_incorporated?: number;
  incorporated_or_closed?: number;
  deletion_eligible?: number;
  relevant_to_category?: number;
  checked_at: string;
  reason_code?: LessonQueueReasonCode;
}

const timestampSchema = z.string().datetime({ offset: false });
const labelSchema = z.union([
  z.string().min(1).max(100),
  z.object({ name: z.string().min(1).max(100) }),
]);
const issueSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(["open", "closed"]),
  labels: z.array(labelSchema),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  closed_at: timestampSchema.nullable(),
  pull_request: z.object({}).optional(),
}).superRefine((issue, context) => {
  const createdAt = Date.parse(issue.created_at);
  const updatedAt = Date.parse(issue.updated_at);
  const closedAt = issue.closed_at === null ? undefined : Date.parse(issue.closed_at);

  if (createdAt > updatedAt) {
    context.addIssue({ code: "custom", message: "created_at must not follow updated_at" });
  }
  if (issue.state === "closed" && closedAt === undefined) {
    context.addIssue({ code: "custom", message: "closed issues require closed_at" });
  }
  if (issue.state === "open" && closedAt !== undefined) {
    context.addIssue({ code: "custom", message: "open issues require null closed_at" });
  }
  if (closedAt !== undefined && (closedAt < createdAt || closedAt > updatedAt)) {
    context.addIssue({ code: "custom", message: "closed_at must be within the issue lifetime" });
  }
});
const issueArraySchema = z.array(issueSchema);
const paginatedResponseSchema = z.array(issueArraySchema);

type LessonIssue = z.infer<typeof issueSchema>;

class LessonStatusError extends Error {
  constructor(readonly reasonCode: LessonQueueReasonCode) {
    super(reasonCode);
    this.name = "LessonStatusError";
  }
}

export interface LessonStatusExecOptions {
  encoding: "utf8";
  maxBuffer: number;
  windowsHide: true;
  shell: false;
}

export type LessonStatusExecFile = (
  file: string,
  args: readonly string[],
  options: LessonStatusExecOptions,
  callback: (error: import("node:child_process").ExecFileException | null, stdout: string, stderr: string) => void,
) => unknown;

export interface LessonStatusDependencies {
  execute?: LessonStatusExecFile;
  now?: () => Date;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
}

function invalidResponse(): never {
  throw new LessonStatusError("invalid_response");
}

function checkedAt(now: Date): string {
  if (!Number.isFinite(now.getTime())) {
    return invalidResponse();
  }
  return now.toISOString();
}

function labelNames(issue: LessonIssue): Set<string> {
  return new Set(issue.labels.map((label) => typeof label === "string" ? label : label.name));
}

function isTerminal(issue: LessonIssue, labels: ReadonlySet<string>): boolean {
  return issue.state === "closed" || [...TERMINAL_LABELS].some((label) => labels.has(label));
}

export function summarizeLessonIssues(
  input: unknown,
  now: Date,
  category?: string,
): LessonQueueSummary {
  if (category !== undefined && !/^[a-z][a-z0-9_-]{0,63}$/.test(category)) {
    return invalidResponse();
  }

  const parsed = issueArraySchema.safeParse(input);
  if (!parsed.success) {
    return invalidResponse();
  }

  const checked_at = checkedAt(now);
  const candidates = parsed.data.filter((issue) => {
    if (issue.pull_request !== undefined) {
      return false;
    }
    return labelNames(issue).has("lesson-candidate");
  });

  let openCandidates = 0;
  let needsReview = 0;
  let acceptedNotIncorporated = 0;
  let incorporatedOrClosed = 0;
  let deletionEligible = 0;
  let relevantToCategory = 0;

  for (const issue of candidates) {
    const labels = labelNames(issue);
    const incorporated = labels.has("incorporated");

    if (issue.state === "open") openCandidates += 1;
    if (labels.has("needs-review")) needsReview += 1;
    if (labels.has("accepted") && !incorporated) acceptedNotIncorporated += 1;
    if (incorporated || issue.state === "closed") incorporatedOrClosed += 1;
    if (category !== undefined && labels.has(`category:${category}`)) relevantToCategory += 1;

    if (isTerminal(issue, labels)) {
      const hasTerminalLabel = [...TERMINAL_LABELS].some((label) => labels.has(label));
      // GitHub's issue listing has no label-event timestamp. updated_at is the
      // conservative lower bound for labeled terminals; closed_at is safe only
      // when closure itself is the sole terminal signal.
      const terminalTimestamp = hasTerminalLabel ? issue.updated_at : issue.closed_at;
      if (terminalTimestamp === null) {
        return invalidResponse();
      }
      if (now.getTime() - Date.parse(terminalTimestamp) > NINETY_DAYS_MS) {
        deletionEligible += 1;
      }
    }
  }

  return {
    status: "available",
    open_candidates: openCandidates,
    needs_review: needsReview,
    accepted_not_incorporated: acceptedNotIncorporated,
    incorporated_or_closed: incorporatedOrClosed,
    deletion_eligible: deletionEligible,
    ...(category === undefined ? {} : { relevant_to_category: relevantToCategory }),
    checked_at,
  };
}

function classifyGhFailure(
  error: import("node:child_process").ExecFileException,
  stderr: string,
): LessonQueueReasonCode {
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return "invalid_response";
  }
  if (error.code === 4 || error.code === "4") {
    return "auth_unavailable";
  }
  const normalized = stderr.toLowerCase();
  if (/rate limit|secondary rate|\b429\b/.test(normalized)) {
    return "github_rate_limited";
  }
  if (/\b404\b|not found|could not resolve to a repository/.test(normalized)) {
    return "repository_unavailable";
  }
  if (/\b401\b|\b403\b|not logged|authentication|authenticate|gh auth/.test(normalized)) {
    return "auth_unavailable";
  }
  return "gh_unavailable";
}

interface GhResult {
  error: import("node:child_process").ExecFileException | null;
  stdout: string;
  stderr: string;
}

const COMMON_GH_ARGS = [
  "api", "--method", "GET", "--paginate",
  REPOSITORY_ISSUES_PATH,
  "-f", "state=all", "-f", "per_page=100",
] as const;

function runGh(execute: LessonStatusExecFile, slurp: boolean): Promise<GhResult> {
  const args = slurp
    ? [...COMMON_GH_ARGS.slice(0, 4), "--slurp", ...COMMON_GH_ARGS.slice(4)]
    : [...COMMON_GH_ARGS];

  return new Promise((fulfill) => {
    execute("gh", args, {
      encoding: "utf8",
      maxBuffer: MAX_GH_OUTPUT_BYTES,
      windowsHide: true,
      shell: false,
    }, (error, stdout, stderr) => fulfill({ error, stdout, stderr }));
  });
}

function isUnsupportedSlurp(result: GhResult): boolean {
  return (
    (result.error?.code === 1 || result.error?.code === "1") &&
    result.stdout.length === 0 &&
    /^unknown flag: --slurp(?:\r?\n|$)/.test(result.stderr)
  );
}

function parseSlurpedPages(stdout: string): LessonIssue[] {
  if (Buffer.byteLength(stdout, "utf8") > MAX_GH_OUTPUT_BYTES) {
    return invalidResponse();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stdout) as unknown;
  } catch {
    return invalidResponse();
  }
  const parsed = paginatedResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return invalidResponse();
  }
  return parsed.data.flat();
}

function parseSequentialPages(stdout: string): LessonIssue[] {
  if (Buffer.byteLength(stdout, "utf8") > MAX_GH_OUTPUT_BYTES) {
    return invalidResponse();
  }

  const pages: unknown[] = [];
  let position = 0;
  while (position < stdout.length) {
    while (/[ \t\r\n]/.test(stdout[position] ?? "")) position += 1;
    if (position === stdout.length) break;
    if (stdout[position] !== "[") return invalidResponse();

    const start = position;
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (; position < stdout.length; position += 1) {
      const character = stdout[position];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === "[" || character === "{") {
        stack.push(character);
      } else if (character === "]" || character === "}") {
        const expected = character === "]" ? "[" : "{";
        if (stack.pop() !== expected) return invalidResponse();
        if (stack.length === 0) {
          position += 1;
          break;
        }
      }
    }
    if (inString || stack.length !== 0) return invalidResponse();

    try {
      pages.push(JSON.parse(stdout.slice(start, position)) as unknown);
    } catch {
      return invalidResponse();
    }
  }

  if (pages.length === 0) return invalidResponse();
  const parsed = paginatedResponseSchema.safeParse(pages);
  if (!parsed.success) return invalidResponse();
  return parsed.data.flat();
}

async function fetchLessonIssues(
  execute: LessonStatusExecFile = execFile as unknown as LessonStatusExecFile,
): Promise<LessonIssue[]> {
  const primary = await runGh(execute, true);
  if (primary.error === null) {
    return parseSlurpedPages(primary.stdout);
  }
  if (!isUnsupportedSlurp(primary)) {
    const reasonCode = primary.error.code === "ENOENT"
      ? "gh_unavailable"
      : classifyGhFailure(primary.error, primary.stderr);
    throw new LessonStatusError(reasonCode);
  }

  const fallback = await runGh(execute, false);
  if (fallback.error !== null) {
    const reasonCode = fallback.error.code === "ENOENT"
      ? "gh_unavailable"
      : classifyGhFailure(fallback.error, fallback.stderr);
    throw new LessonStatusError(reasonCode);
  }
  return parseSequentialPages(fallback.stdout);
}

function parseCategory(args: readonly string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (
    args.length !== 2 ||
    args[0] !== "--category" ||
    !/^[a-z][a-z0-9_-]{0,63}$/.test(args[1] ?? "")
  ) {
    return invalidResponse();
  }
  return args[1];
}

function unavailableSummary(now: Date, reasonCode: LessonQueueReasonCode): LessonQueueSummary {
  return {
    status: "unavailable",
    checked_at: checkedAt(now),
    reason_code: reasonCode,
  };
}

export async function runLessonsStatus(
  args: readonly string[],
  dependencies: LessonStatusDependencies = {},
): Promise<number> {
  const now = dependencies.now?.() ?? new Date();
  const writeStdout = dependencies.stdout ?? ((value: string) => process.stdout.write(value));
  const writeStderr = dependencies.stderr ?? ((value: string) => process.stderr.write(value));
  try {
    const category = parseCategory(args);
    const issues = await fetchLessonIssues(dependencies.execute);
    writeStdout(`${JSON.stringify(summarizeLessonIssues(issues, now, category))}\n`);
    return 0;
  } catch (error) {
    const reasonCode = error instanceof LessonStatusError
      ? error.reasonCode
      : "gh_unavailable";
    writeStdout(`${JSON.stringify(unavailableSummary(now, reasonCode))}\n`);
    writeStderr(`Lesson queue status unavailable: ${reasonCode}\n`);
    return 1;
  }
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  process.exitCode = await runLessonsStatus(process.argv.slice(2));
}
