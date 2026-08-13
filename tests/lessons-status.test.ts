import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  runLessonsStatus,
  summarizeLessonIssues,
  type LessonStatusExecFile,
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

async function runCommand(scenario: string, args: string[] = []): Promise<CommandResult> {
  const calls: CommandResult["calls"] = [];
  const execute: LessonStatusExecFile = (file, ghArgs, options, callback) => {
    calls.push({ file, args: ghArgs, shell: options.shell });
    queueMicrotask(() => {
      const isPrimary = ghArgs.includes("--slurp");
      if (scenario === "success") {
        callback(null, JSON.stringify([page1, page2]), "");
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
    }]);
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
      status: "unavailable",
      checked_at: "2026-08-13T12:00:00.000Z",
      reason_code: "invalid_response",
    });
    expect(result.stderr).toBe("Lesson queue status unavailable: invalid_response\n");
    expect(result.calls).toHaveLength(2);
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
      status: "unavailable",
      checked_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      reason_code: reasonCode,
    });
    expect(output).not.toHaveProperty("open_candidates");
    expect(output).not.toHaveProperty("needs_review");
    expect(result.stderr).toBe(`Lesson queue status unavailable: ${reasonCode}\n`);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/PRIVATE|ghp_|github\.com\/|example\.invalid/);
    expect(result.calls).toHaveLength(1);
  });

  it.each([
    ["auth-code-number", "auth_unavailable"],
    ["auth-code-string", "auth_unavailable"],
    ["bare-error", "gh_unavailable"],
  ])("classifies process error shape %s without dependency leakage", async (scenario, reasonCode) => {
    const result = await runCommand(scenario);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      status: "unavailable",
      checked_at: "2026-08-13T12:00:00.000Z",
      reason_code: reasonCode,
    });
    expect(result.stderr).toBe(`Lesson queue status unavailable: ${reasonCode}\n`);
    expect(result.calls).toHaveLength(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain("PRIVATE");
  });

  it.each([
    ["primary-buffer-error", 1],
    ["unsupported-fallback-buffer-error", 2],
  ])("reports bounded process output failure %s as invalid response", async (scenario, callCount) => {
    const result = await runCommand(scenario);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      status: "unavailable",
      checked_at: "2026-08-13T12:00:00.000Z",
      reason_code: "invalid_response",
    });
    expect(result.stderr).toBe("Lesson queue status unavailable: invalid_response\n");
    expect(result.calls).toHaveLength(callCount);
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

  it("is exposed through the package lessons:status command", async () => {
    const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, unknown>;
    };

    expect(packageJson.scripts?.["lessons:status"]).toBe("tsx scripts/lessons-status.mts");
  });
});
