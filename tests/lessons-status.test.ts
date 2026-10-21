import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  runLessonsStatus,
  summarizeLessonIssues,
  type LessonStatusExecFile,
  type LessonStatusDependencies,
} from "../scripts/lessons-status.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGE_1 = fileURLToPath(new URL("fixtures/lessons-status/issues-page-1.json", import.meta.url));
const PAGE_2 = fileURLToPath(new URL("fixtures/lessons-status/issues-page-2.json", import.meta.url));
const NOW = new Date("2026-08-13T12:00:00Z");

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

let page1: unknown[];
let page2: unknown[];
interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  calls: Array<{ file: string; args: readonly string[]; shell: unknown }>;
}

const LANE_CALL = {
  file: "gh",
  args: ["api", "repos/u-dont-existDOTcom/universal-dev-architecture/contents/suggested-fixes/AskRigor"],
  shell: false,
};
const PULLS_PATH = "repos/u-dont-existDOTcom/universal-dev-architecture/pulls";
const PULLS_CALL = {
  file: "gh",
  args: ["api", "--method", "GET", "--paginate", PULLS_PATH, "-f", "state=open", "-f", "per_page=100"],
  shell: false,
};
const filesCall = (pull: number) => ({
  file: "gh",
  args: ["api", "--method", "GET", "--paginate", `${PULLS_PATH}/${pull}/files`, "-f", "per_page=100"],
  shell: false,
});
const EMPTY_LANE = {
  lane_status: "available", lane_unrecorded: 0, lane_unrecorded_items: [],
  lane_pull_status: "available", lane_pull_unrecorded: 0, lane_pull_unrecorded_items: [],
};
const EMPTY_PULLS = { lane_pull_status: "available", lane_pull_unrecorded: 0, lane_pull_unrecorded_items: [] };

async function runCommand(
  scenario: string,
  args: string[] = [],
  lane: unknown = [],
  ledger: LessonStatusDependencies["readLedger"] = async () => "",
  pulls: unknown = [],
  pullFiles: Record<number, unknown> = {},
): Promise<CommandResult> {
  const calls: CommandResult["calls"] = [];
  const answer = (callback: Parameters<LessonStatusExecFile>[3], value: unknown) => {
    if (typeof value === "string") {
      callback(Object.assign(new Error("ghp_PRIVATE_TOKEN"), { code: "EFAIL" }), "PRIVATE", value);
    } else {
      callback(null, JSON.stringify(value), "");
    }
  };
  const execute: LessonStatusExecFile = (file, ghArgs, options, callback) => {
    calls.push({ file, args: ghArgs, shell: options.shell });
    queueMicrotask(() => {
      if (ghArgs.includes(PULLS_PATH)) {
        answer(callback, pulls);
        return;
      }
      const filesOf = ghArgs.find((arg) => arg.startsWith(`${PULLS_PATH}/`));
      if (filesOf !== undefined) {
        answer(callback, pullFiles[Number(filesOf.split("/")[4])] ?? []);
        return;
      }
      if (ghArgs.includes(LANE_CALL.args[1])) {
        if (typeof lane === "string") {
          callback(Object.assign(new Error("ghp_PRIVATE_TOKEN"), { code: "EFAIL" }), "PRIVATE", lane);
        } else {
          callback(null, JSON.stringify(lane), "");
        }
        return;
      }
      const isPrimary = ghArgs.includes("--slurp");
      if (scenario === "success") {
        callback(null, JSON.stringify([page1, page2]), "");
        return;
      }
      if (scenario === "builtin-fallback" && isPrimary) {
        callback(
          Object.assign(new Error("PRIVATE local parser detail"), { code: 1 }) as unknown as NodeJS.ErrnoException,
          "",
          "gh: --slurp is not supported by this built-in gh.\n\nUsage: gh api <endpoint> [flags]\n",
        );
        return;
      }
      if (scenario === "builtin-fallback") {
        callback(null, `${JSON.stringify(page1)}${JSON.stringify(page2)}`, "");
        return;
      }
      if (scenario.startsWith("unsupported-fallback") && isPrimary) {
        callback(
          Object.assign(new Error("PRIVATE local parser detail"), { code: 1 }) as unknown as NodeJS.ErrnoException,
          "",
          "unknown flag: --slurp\n\nUsage:  gh api <endpoint> [flags]\n",
        );
        return;
      }
      if (scenario === "unsupported-fallback") {
        callback(null, `${JSON.stringify(page1)}\n \t${JSON.stringify(page2)}\r\n`, "");
        return;
      }
      if (scenario === "unsupported-fallback-object") {
        callback(null, JSON.stringify({ private: "PRIVATE NARRATIVE" }), "");
        return;
      }
      if (scenario === "unsupported-fallback-junk") {
        callback(null, `${JSON.stringify(page1)} PRIVATE-JUNK ${JSON.stringify(page2)}`, "");
        return;
      }
      if (scenario === "unsupported-fallback-nonjson-whitespace") {
        callback(null, `${JSON.stringify(page1)}\u00a0${JSON.stringify(page2)}`, "");
        return;
      }
      if (scenario === "unsupported-fallback-truncated") {
        callback(null, `${JSON.stringify(page1)}\n[{"number":`, "");
        return;
      }
      if (scenario === "unsupported-fallback-oversize") {
        callback(null, `[${" ".repeat((16 * 1_024 * 1_024) + 1)}]`, "");
        return;
      }
      if (scenario === "unsupported-fallback-buffer-error") {
        callback(
          Object.assign(new Error("PRIVATE maxBuffer output"), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }),
          "PRIVATE partial output",
          "PRIVATE partial stderr",
        );
        return;
      }
      if (scenario === "invalid") {
        callback(null, '{"body":"PRIVATE NARRATIVE","html_url":"https://github.com/private/repo/issues/1"}', "");
        return;
      }
      if (scenario === "auth-code-number") {
        callback(
          Object.assign(new Error("PRIVATE auth failure"), { code: 4 }) as unknown as NodeJS.ErrnoException,
          "",
          "",
        );
        return;
      }
      if (scenario === "auth-code-string") {
        callback(Object.assign(new Error("PRIVATE auth failure"), { code: "4" }), "", "PRIVATE auth stderr");
        return;
      }
      if (scenario === "bare-error") {
        callback(new Error("PRIVATE bare process failure"), "", "");
        return;
      }
      if (scenario === "primary-buffer-error") {
        callback(
          Object.assign(new Error("PRIVATE maxBuffer output"), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }),
          "PRIVATE partial output",
          "PRIVATE partial stderr",
        );
        return;
      }
      const stderr = {
        auth: "not logged into any GitHub hosts; ghp_private_token; https://github.com/u-dont-existDOTcom/AskRigor-lessons",
        repository: "HTTP 404: Not Found; PRIVATE ISSUE BODY; https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons",
        rate: "HTTP 403: API rate limit exceeded for private-user@example.invalid",
        down: "network crashed while reading PRIVATE ISSUE BODY at https://github.com/private/repo",
      }[scenario] ?? "unexpected private dependency failure";
      callback(Object.assign(new Error("private dependency failure"), { code: "EFAIL" }), "", stderr);
    });
  };
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runLessonsStatus(args, {
    execute,
    readLedger: ledger,
    now: () => NOW,
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  });
  return { exitCode, stdout: stdout.join(""), stderr: stderr.join(""), calls };
}

beforeAll(async () => {
  const first = await readJson(PAGE_1);
  const second = await readJson(PAGE_2);
  if (!Array.isArray(first) || !Array.isArray(second)) {
    throw new Error("lesson status fixtures must be arrays");
  }
  page1 = first;
  page2 = second;
});

describe("lesson queue summary", () => {
  it("consumes 105 candidates across both pages and returns exact label counts", () => {
    expect(page1).toHaveLength(100);
    expect(page2).toHaveLength(8);

    expect(summarizeLessonIssues([...page1, ...page2], NOW, "missing_sources")).toEqual({
      status: "available",
      open_candidates: 101,
      needs_review: 82,
      accepted_not_incorporated: 11,
      incorporated_or_closed: 10,
      deletion_eligible: 9,
      relevant_to_category: 92,
      checked_at: "2026-08-13T12:00:00.000Z",
    });
  });

  it("omits the category count when no category is requested", () => {
    const summary = summarizeLessonIssues([...page1, ...page2], NOW);

    expect(summary).not.toHaveProperty("relevant_to_category");
    expect(summary.open_candidates).toBe(101);
  });

  it("matches category labels exactly and ignores label order", () => {
    const reordered = structuredClone([...page1, ...page2]) as Array<Record<string, unknown>>;
    const firstLabels = reordered[0].labels as unknown[];
    firstLabels.reverse();

    expect(summarizeLessonIssues(reordered, NOW, "missing_sources").relevant_to_category).toBe(92);
    expect(summarizeLessonIssues(reordered, NOW, "missing").relevant_to_category).toBe(0);
  });

  it("flags a terminal candidate only after more than 90 complete days", () => {
    const terminal = (number: number, updated_at: string) => ({
      number,
      state: "open",
      labels: [{ name: "lesson-candidate" }, { name: "incorporated" }],
      created_at: "2026-01-01T00:00:00Z",
      updated_at,
      closed_at: null,
    });

    const summary = summarizeLessonIssues([
      terminal(1, "2026-05-15T12:00:00Z"),
      terminal(2, "2026-05-15T11:59:59Z"),
      terminal(3, "2026-05-15T12:00:01Z"),
    ], NOW);

    expect(summary.deletion_eligible).toBe(1);
  });

  it("uses updated_at conservatively for labeled terminals and closed_at only for closure-only terminals", () => {
    const base = {
      state: "closed",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      closed_at: "2026-04-01T00:00:00Z",
    } as const;

    const summary = summarizeLessonIssues([
      {
        ...base,
        number: 1,
        labels: [{ name: "lesson-candidate" }, { name: "incorporated" }],
      },
      {
        ...base,
        number: 2,
        labels: [{ name: "lesson-candidate" }],
      },
    ], NOW);

    expect(summary.deletion_eligible).toBe(1);
  });

  it.each([
    ["a non-array issue collection", { issues: [] }],
    ["a malformed issue number", [{
      number: "1",
      state: "open",
      labels: [{ name: "lesson-candidate" }],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      closed_at: null,
    }]],
    ["an invalid timestamp", [{
      number: 1,
      state: "open",
      labels: [{ name: "lesson-candidate" }],
      created_at: "not-a-timestamp",
      updated_at: "2026-08-01T00:00:00Z",
      closed_at: null,
    }]],
    ["a malformed label", [{
      number: 1,
      state: "open",
      labels: [{ name: "" }],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      closed_at: null,
    }]],
    ["an impossible timestamp order", [{
      number: 1,
      state: "closed",
      labels: [{ name: "lesson-candidate" }],
      created_at: "2026-08-02T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      closed_at: "2026-08-01T00:00:00Z",
    }]],
  ])("rejects %s instead of inventing counts", (_name, input) => {
    expect(() => summarizeLessonIssues(input, NOW)).toThrow("invalid_response");
  });
});

describe("lesson queue command", () => {
  it("uses the fixed read-only paginated gh boundary and emits only summary JSON", async () => {
    const result = await runCommand("success", ["--category", "missing_sources"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "available",
      open_candidates: 101,
      needs_review: 82,
      accepted_not_incorporated: 11,
      incorporated_or_closed: 10,
      deletion_eligible: 9,
      relevant_to_category: 92,
    });
    expect(result.stdout).not.toContain("PRIVATE NARRATIVE");
    expect(result.stdout).not.toContain("github.com/");

    expect(result.calls).toEqual([{
      file: "gh",
      args: [
        "api",
        "--method", "GET",
        "--paginate",
        "--slurp",
        "repos/u-dont-existDOTcom/AskRigor-lessons/issues",
        "-f", "state=all",
        "-f", "per_page=100",
      ],
      shell: false,
    }, LANE_CALL, PULLS_CALL]);
  });

  it("retries the fixed read-only request without slurp only for the local unsupported flag", async () => {
    const result = await runCommand("unsupported-fallback", ["--category", "missing_sources"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "available",
      open_candidates: 101,
      relevant_to_category: 92,
    });
    expect(result.calls).toEqual([
      {
        file: "gh",
        args: [
          "api", "--method", "GET", "--paginate", "--slurp",
          "repos/u-dont-existDOTcom/AskRigor-lessons/issues",
          "-f", "state=all", "-f", "per_page=100",
        ],
        shell: false,
      },
      {
        file: "gh",
        args: [
          "api", "--method", "GET", "--paginate",
          "repos/u-dont-existDOTcom/AskRigor-lessons/issues",
          "-f", "state=all", "-f", "per_page=100",
        ],
        shell: false,
      },
      LANE_CALL,
      PULLS_CALL,
    ]);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/PRIVATE|github\.com\//);
  });

  it.each([
    "unsupported-fallback-object",
    "unsupported-fallback-junk",
    "unsupported-fallback-nonjson-whitespace",
    "unsupported-fallback-truncated",
    "unsupported-fallback-oversize",
  ])("rejects invalid bounded fallback page framing for %s", async (scenario) => {
    const result = await runCommand(scenario);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ...EMPTY_LANE,
      status: "unavailable",
      checked_at: "2026-08-13T12:00:00.000Z",
      reason_code: "invalid_response",
    });
    expect(result.stderr).toBe("Lesson queue status unavailable: invalid_response\n");
    expect(result.calls).toHaveLength(4);
    expect(`${result.stdout}${result.stderr}`).not.toContain("PRIVATE");
  });

  it.each([
    ["auth", "auth_unavailable"],
    ["repository", "repository_unavailable"],
    ["rate", "github_rate_limited"],
    ["down", "gh_unavailable"],
    ["invalid", "invalid_response"],
  ])("returns unavailable/nonzero for %s without leaking dependency output", async (scenario, reasonCode) => {
    const result = await runCommand(scenario);
    const output = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(result.exitCode).toBe(1);
    expect(output).toEqual({
      ...EMPTY_LANE,
      status: "unavailable",
      checked_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      reason_code: reasonCode,
    });
    expect(output).not.toHaveProperty("open_candidates");
    expect(output).not.toHaveProperty("needs_review");
    expect(result.stderr).toBe(`Lesson queue status unavailable: ${reasonCode}\n`);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/PRIVATE|ghp_|github\.com\/|example\.invalid/);
    expect(result.calls).toHaveLength(3);
  });

  it.each([
    ["auth-code-number", "auth_unavailable"],
    ["auth-code-string", "auth_unavailable"],
    ["bare-error", "gh_unavailable"],
  ])("classifies process error shape %s without dependency leakage", async (scenario, reasonCode) => {
    const result = await runCommand(scenario);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ...EMPTY_LANE,
      status: "unavailable",
      checked_at: "2026-08-13T12:00:00.000Z",
      reason_code: reasonCode,
    });
    expect(result.stderr).toBe(`Lesson queue status unavailable: ${reasonCode}\n`);
    expect(result.calls).toHaveLength(3);
    expect(`${result.stdout}${result.stderr}`).not.toContain("PRIVATE");
  });

  it.each([
    ["primary-buffer-error", 1],
    ["unsupported-fallback-buffer-error", 2],
  ])("reports bounded process output failure %s as invalid response", async (scenario, callCount) => {
    const result = await runCommand(scenario);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ...EMPTY_LANE,
      status: "unavailable",
      checked_at: "2026-08-13T12:00:00.000Z",
      reason_code: "invalid_response",
    });
    expect(result.stderr).toBe("Lesson queue status unavailable: invalid_response\n");
    expect(result.calls).toHaveLength(callCount + 2);
    expect(`${result.stdout}${result.stderr}`).not.toContain("PRIVATE");
  });

  it("rejects malformed CLI arguments before running gh", async () => {
    const result = await runCommand("success", ["--category"]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "unavailable",
      reason_code: "invalid_response",
    });
    expect(result.calls).toEqual([]);
  });

  it("returns zero when every lane item is recorded in a first table cell", async () => {
    const result = await runCommand("success", [], [
      { name: "fix-a.md", type: "file" }, { name: "fix-b.md", type: "file" },
    ], async () => "| Item | Outcome |\n| fix-a | adopted |\n| fix-b | declined |\n");
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ...summarizeLessonIssues([...page1, ...page2], NOW), ...EMPTY_LANE,
    });
  });

  it("lists sorted new names, ignoring README, directories and other extensions", async () => {
    const result = await runCommand("success", [], [
      { name: "z-new.md", type: "file", content: "PRIVATE" },
      { name: "recorded.md", type: "file" },
      { name: "a-new.md", type: "file" },
      { name: "README.md", type: "file" },
      { name: "folder.md", type: "dir" },
      { name: "link.md", type: "symlink" },
      { name: "notes.txt", type: "file" },
    ], async () => "| recorded | deferred |\n| another | a-new |\nz-new\n");
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ...summarizeLessonIssues([...page1, ...page2], NOW),
      lane_status: "available", lane_unrecorded: 2, lane_unrecorded_items: ["a-new", "z-new"],
      ...EMPTY_PULLS,
    });
    expect(result.stdout).not.toContain("PRIVATE");
  });

  it.each([
    ["HTTP 404 PRIVATE ghp_token", "repository_unavailable"],
    ["HTTP 401 PRIVATE", "auth_unavailable"],
    ["HTTP 429 PRIVATE", "github_rate_limited"],
    ["network PRIVATE", "gh_unavailable"],
    [{ private: "PRIVATE" }, "invalid_response"],
    [[{ name: "bad.md" }], "invalid_response"],
  ])("reports an unreadable lane without zero counts or dependency details", async (lane, reason) => {
    const result = await runCommand("success", [], lane);
    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual({
      ...summarizeLessonIssues([...page1, ...page2], NOW),
      lane_status: "unavailable", lane_reason_code: reason,
      ...EMPTY_PULLS,
    });
    expect(output).not.toHaveProperty("lane_unrecorded");
    expect(output).not.toHaveProperty("lane_unrecorded_items");
    expect(result.stderr).toBe(`Suggested fixes lane status unavailable: ${reason}\n`);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/PRIVATE|ghp_/);
  });

  it("reports an unreadable ledger without inventing unrecorded counts", async () => {
    const result = await runCommand("success", [], [], async () => { throw new Error("PRIVATE"); });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      ...summarizeLessonIssues([...page1, ...page2], NOW),
      lane_status: "unavailable", lane_reason_code: "ledger_unavailable",
      lane_pull_status: "unavailable", lane_pull_reason_code: "ledger_unavailable",
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain("PRIVATE");
  });

  it("falls back without slurp for the gh client built into Claude Code cloud sessions", async () => {
    const result = await runCommand("builtin-fallback");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ...summarizeLessonIssues([...page1, ...page2], NOW), ...EMPTY_LANE });
    expect(result.calls).toHaveLength(4);
    expect(result.calls[1]?.args).not.toContain("--slurp");
  });

  it("lists lane items that open UDA pull requests add and the ledger does not record", async () => {
    const lane = (name: string, status = "added") => ({ filename: `suggested-fixes/AskRigor/${name}`, status, patch: "PRIVATE" });
    const result = await runCommand("success", [], [], async () => "| recorded | adopted |\n", [
      { number: 408, title: "PRIVATE" }, { number: 345 }, { number: 345 }, { number: 12 },
    ], {
      345: [lane("recorded.md"), lane("b-new.md")],
      408: [
        lane("a-new.md"), lane("README.md"), lane("sub/nested.md"), lane("changed.md", "modified"),
        lane("gone.md", "removed"), lane("notes.txt"), lane("moved.md", "renamed"),
        { filename: "suggested-fixes/Other/c.md", status: "added" }, { filename: "patterns/x.md", status: "added" },
      ],
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ...summarizeLessonIssues([...page1, ...page2], NOW),
      lane_status: "available", lane_unrecorded: 0, lane_unrecorded_items: [],
      lane_pull_status: "available", lane_pull_unrecorded: 3,
      lane_pull_unrecorded_items: ["#345 b-new", "#408 a-new", "#408 moved"],
    });
    expect(result.calls.slice(2)).toEqual([PULLS_CALL, filesCall(12), filesCall(345), filesCall(408)]);
    expect(result.stdout).not.toContain("PRIVATE");
  });

  it.each([
    ["HTTP 403 PRIVATE ghp_token", {}, "auth_unavailable"],
    [{ private: "PRIVATE" }, {}, "invalid_response"],
    [[{ number: 7 }], { 7: "HTTP 429 PRIVATE" }, "github_rate_limited"],
    [[{ number: 7 }], { 7: [{ filename: "suggested-fixes/AskRigor/x.md" }] }, "invalid_response"],
  ])("reports unreadable lane pull requests without zero counts or dependency details", async (pulls, files, reason) => {
    const result = await runCommand("success", [], [], async () => "", pulls, files as Record<number, unknown>);
    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual({
      ...summarizeLessonIssues([...page1, ...page2], NOW),
      lane_status: "available", lane_unrecorded: 0, lane_unrecorded_items: [],
      lane_pull_status: "unavailable", lane_pull_reason_code: reason,
    });
    expect(output).not.toHaveProperty("lane_pull_unrecorded");
    expect(result.stderr).toBe(`Suggested fixes lane pull requests unavailable: ${reason}\n`);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/PRIVATE|ghp_/);
  });

  it("is exposed through the package lessons:status command", async () => {
    const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, unknown>;
    };

    expect(packageJson.scripts?.["lessons:status"]).toBe("tsx scripts/lessons-status.mts");
  });
});
