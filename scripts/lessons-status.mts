import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { z } from "zod";

const REPOSITORY_ISSUES_PATH = "repos/u-dont-existDOTcom/AskRigor-lessons/issues";
const LANE_PATH = "repos/u-dont-existDOTcom/universal-dev-architecture/contents/suggested-fixes/AskRigor";
const LEDGER_PATH = new URL("../docs/suggested-fixes-ledger.md", import.meta.url);
// Lane items can sit in open UDA pull requests for days before reaching the lane folder (20 Oct: twelve
// items from 12 to 14 Oct had never been counted), so items those pull requests add are listed too.
const PULLS_PATH = "repos/u-dont-existDOTcom/universal-dev-architecture/pulls";
const LANE_PREFIX = "suggested-fixes/AskRigor/";
const pullSchema = z.array(z.object({ number: z.number().int().positive() }));
const pullFileSchema = z.array(z.object({
  filename: z.string().min(1).max(1_024),
  status: z.string().min(1).max(32),
}));
const laneSchema = z.array(z.object({
  name: z.string().min(1).max(255).regex(/^[^/\\\x00-\x1f\x7f]+$/),
  type: z.string().min(1),
}));
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
  "ledger_unavailable",
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
  lane_status?: "available" | "unavailable";
  lane_unrecorded?: number;
  lane_unrecorded_items?: string[];
  lane_reason_code?: LessonQueueReasonCode;
  lane_pull_status?: "available" | "unavailable";
  lane_pull_unrecorded?: number;
  lane_pull_unrecorded_items?: string[];
  lane_pull_reason_code?: LessonQueueReasonCode;
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
  readLedger?: () => Promise<string>;
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

  return executeGh(execute, args);
}

function executeGh(execute: LessonStatusExecFile, args: readonly string[]): Promise<GhResult> {
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
    // The GitHub CLI's message, or the one from the gh client built into Claude Code cloud sessions.
    /^(?:unknown flag: --slurp|gh: --slurp is not supported by this built-in gh\.)(?:\r?\n|$)/.test(result.stderr)
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
  const parsed = paginatedResponseSchema.safeParse(splitJsonArrays(stdout));
  if (!parsed.success) return invalidResponse();
  return parsed.data.flat();
}

// Splits gh's --paginate output (JSON arrays written one after another) into its pages.
function splitJsonArrays(stdout: string): unknown[] {
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
  return pages;
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

async function fetchLaneSummary(dependencies: LessonStatusDependencies): Promise<Partial<LessonQueueSummary>> {
  const result = await executeGh(
    dependencies.execute ?? execFile as unknown as LessonStatusExecFile,
    ["api", LANE_PATH],
  );
  if (result.error !== null) {
    throw new LessonStatusError(classifyGhFailure(result.error, result.stderr));
  }
  if (Buffer.byteLength(result.stdout, "utf8") > MAX_GH_OUTPUT_BYTES) return invalidResponse();
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout) as unknown;
  } catch {
    return invalidResponse();
  }
  const parsed = laneSchema.safeParse(raw);
  if (!parsed.success) return invalidResponse();

  const recorded = await recordedItems(dependencies);
  const items = parsed.data
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => entry.name.slice(0, -3))
    .filter((name) => !recorded.has(name))
    .sort();
  return { lane_status: "available", lane_unrecorded: items.length, lane_unrecorded_items: items };
}

async function recordedItems(dependencies: LessonStatusDependencies): Promise<Set<string>> {
  let ledger: string;
  try {
    ledger = await (dependencies.readLedger?.() ?? readFile(LEDGER_PATH, "utf8"));
  } catch {
    throw new LessonStatusError("ledger_unavailable");
  }
  const recorded = new Set<string>();
  for (const line of ledger.split(/\r?\n/)) {
    const cell = /^\s*\|\s*([^|]+?)\s*\|/.exec(line)?.[1];
    if (cell !== undefined) recorded.add(cell.trim());
  }
  return recorded;
}

async function readPages<T>(
  execute: LessonStatusExecFile,
  path: string,
  query: readonly string[],
  schema: z.ZodType<T[]>,
): Promise<T[]> {
  const result = await executeGh(execute, ["api", "--method", "GET", "--paginate", path, ...query, "-f", "per_page=100"]);
  if (result.error !== null) {
    throw new LessonStatusError(classifyGhFailure(result.error, result.stderr));
  }
  const records: T[] = [];
  for (const page of splitJsonArrays(result.stdout)) {
    const parsed = schema.safeParse(page);
    if (!parsed.success) return invalidResponse();
    records.push(...parsed.data);
  }
  return records;
}

// Items an open UDA pull request adds to the lane folder that the ledger does not record yet, as "#<pull> <item>".
async function fetchLanePullSummary(dependencies: LessonStatusDependencies): Promise<Partial<LessonQueueSummary>> {
  const execute = dependencies.execute ?? execFile as unknown as LessonStatusExecFile;
  const pulls = await readPages(execute, PULLS_PATH, ["-f", "state=open"], pullSchema);
  const recorded = await recordedItems(dependencies);
  const items: string[] = [];
  for (const number of [...new Set(pulls.map((pull) => pull.number))].sort((a, b) => a - b)) {
    const files = await readPages(execute, `${PULLS_PATH}/${number}/files`, [], pullFileSchema);
    for (const file of files) {
      if ((file.status !== "added" && file.status !== "renamed") || !file.filename.startsWith(LANE_PREFIX)) continue;
      const name = file.filename.slice(LANE_PREFIX.length);
      if (!/^[^/\\\x00-\x1f\x7f]+\.md$/.test(name) || name === "README.md") continue;
      if (!recorded.has(name.slice(0, -3))) items.push(`#${number} ${name.slice(0, -3)}`);
    }
  }
  return { lane_pull_status: "available", lane_pull_unrecorded: items.length, lane_pull_unrecorded_items: items };
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
    let summary: LessonQueueSummary;
    let exitCode = 0;
    try {
      const issues = await fetchLessonIssues(dependencies.execute);
      summary = summarizeLessonIssues(issues, now, category);
    } catch (error) {
      const reasonCode = error instanceof LessonStatusError ? error.reasonCode : "gh_unavailable";
      summary = unavailableSummary(now, reasonCode);
      writeStderr(`Lesson queue status unavailable: ${reasonCode}\n`);
      exitCode = 1;
    }
    try {
      Object.assign(summary, await fetchLaneSummary(dependencies));
    } catch (error) {
      const reasonCode = error instanceof LessonStatusError ? error.reasonCode : "gh_unavailable";
      Object.assign(summary, { lane_status: "unavailable", lane_reason_code: reasonCode });
      writeStderr(`Suggested fixes lane status unavailable: ${reasonCode}\n`);
      exitCode = 1;
    }
    try {
      Object.assign(summary, await fetchLanePullSummary(dependencies));
    } catch (error) {
      const reasonCode = error instanceof LessonStatusError ? error.reasonCode : "gh_unavailable";
      Object.assign(summary, { lane_pull_status: "unavailable", lane_pull_reason_code: reasonCode });
      writeStderr(`Suggested fixes lane pull requests unavailable: ${reasonCode}\n`);
      exitCode = 1;
    }
    writeStdout(`${JSON.stringify(summary)}\n`);
    return exitCode;
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
