import { describe, expect, it, vi } from "vitest";
import type { GeneralizedLesson } from "../apps/research-mcp/src/lessons/contracts.js";
import { GitHubApiError } from "../apps/research-mcp/src/lessons/github-app.js";
import {
  GitHubLessonQueue,
  publicCandidateId,
} from "../apps/research-mcp/src/lessons/github-lessons.js";

const fingerprint = "f".repeat(64);
const observedAt = "2026-08-13T12:00:00.000Z";
const candidate: GeneralizedLesson = {
  category: "missing_sources",
  general_lesson: "When material factual claims are made, AskRigor should attach traceable sources.",
  expected_behavior: "Cite each material claim near the sentence it supports and expose any source-access boundary.",
  failure_reason: "The answer asserted a conclusion without giving the user a way to inspect its evidence.",
  synthetic_regression_example: "A response ranks two interventions but supplies no citations for either ranking.",
  evidence_basis: "assistant_self_check",
  askrigor_version: "0.1.0",
  protocol_identities: [{ name: "HRP", version: "20.5.17", sha256: "a".repeat(64) }],
  consent_scope: "once",
};

interface StoredIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: Array<{ name: string }>;
  created_at: string;
  pull_request?: { url: string };
}

class FakeGitHub {
  readonly calls: Array<{ url: string; method: string; body?: unknown; headers: Headers }> = [];
  readonly issues: StoredIssue[] = [];
  nextNumber = 1;
  loseNextCreateResponse = false;
  createDelay?: Promise<void>;

  readonly fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    this.calls.push({ url, method, body, headers: new Headers(init?.headers) });

    if (method === "GET" && url.startsWith("https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues?")) {
      const page = Number(new URL(url).searchParams.get("page"));
      const start = (page - 1) * 100;
      return json(this.issues.slice(start, start + 100));
    }

    if (method === "POST" && url === "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues") {
      if (this.createDelay) await this.createDelay;
      const request = body as { title: string; body: string; labels: string[] };
      const issue: StoredIssue = {
        number: this.nextNumber++,
        title: request.title,
        body: request.body,
        state: "open",
        labels: request.labels.map((name) => ({ name })),
        created_at: observedAt,
      };
      this.issues.push(issue);
      if (this.loseNextCreateResponse) {
        this.loseNextCreateResponse = false;
        throw new Error("private network path and request body");
      }
      return json(issue, 201);
    }

    const patchMatch = /^https:\/\/api\.github\.com\/repos\/u-dont-existDOTcom\/AskRigor-lessons\/issues\/(\d+)$/.exec(url);
    if (method === "PATCH" && patchMatch) {
      const issue = this.issues.find((value) => value.number === Number(patchMatch[1]));
      if (!issue) return json({ message: "missing" }, 404);
      const request = body as { body: string };
      issue.body = request.body;
      return json(issue);
    }

    throw new Error("Unexpected test fetch boundary");
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function queue(github: FakeGitHub, now: () => Date = () => new Date(observedAt)) {
  return new GitHubLessonQueue({
    tokenProvider: { getToken: async () => "queue-token-fixture" },
    fetch: github.fetch,
    now,
  });
}

function encodeMetadata(metadata: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
}

function marker(metadata: Record<string, unknown>): string {
  return `<!-- askrigor-lesson-metadata:${encodeMetadata(metadata)} -->`;
}

function issueBody(
  issueFingerprint: string,
  occurrenceCount = 1,
  firstSeen = observedAt,
  lastSeen = observedAt,
  prefix = "maintainer-preserved content",
): string {
  return [
    prefix,
    "",
    "## Anonymous occurrence count",
    "",
    String(occurrenceCount),
    "",
    "## First seen",
    "",
    firstSeen,
    "",
    "## Last seen",
    "",
    lastSeen,
    "",
    marker({ fingerprint: issueFingerprint, occurrence_count: occurrenceCount, first_seen: firstSeen, last_seen: lastSeen }),
  ].join("\n");
}

function addIssue(
  github: FakeGitHub,
  options: {
    number?: number;
    issueFingerprint?: string;
    count?: number;
    labels?: string[];
    state?: "open" | "closed";
    body?: string;
    pullRequest?: boolean;
  } = {},
): StoredIssue {
  const number = options.number ?? github.nextNumber;
  github.nextNumber = Math.max(github.nextNumber, number + 1);
  const issue: StoredIssue = {
    number,
    title: "fixture issue",
    body: options.body ?? issueBody(options.issueFingerprint ?? fingerprint, options.count),
    state: options.state ?? "open",
    labels: (options.labels ?? ["lesson-candidate", "needs-review"]).map((name) => ({ name })),
    created_at: `2026-08-13T11:${String(number % 60).padStart(2, "0")}:00.000Z`,
    ...(options.pullRequest ? { pull_request: { url: "private fixture" } } : {}),
  };
  github.issues.push(issue);
  return issue;
}

function parseFinalMetadata(body: string): unknown {
  const match = /\n<!-- askrigor-lesson-metadata:([A-Za-z0-9_-]+) -->$/.exec(body);
  expect(match).not.toBeNull();
  return JSON.parse(Buffer.from(match![1]!, "base64url").toString("utf8"));
}

function requestCalls(github: FakeGitHub, method: string) {
  return github.calls.filter((call) => call.method === method);
}

describe("private GitHub lesson queue", () => {
  it("maps private issue numbers to opaque public candidate identifiers", () => {
    expect(publicCandidateId(1)).toBe("ARL-0001");
    expect(publicCandidateId(42)).toBe("ARL-0042");
    expect(publicCandidateId(12_345)).toBe("ARL-12345");
  });

  it("creates one exact anonymous issue with the fixed labels and canonical final marker", async () => {
    const github = new FakeGitHub();

    await expect(queue(github).submit({ candidate, fingerprint })).resolves.toEqual({
      kind: "created",
      issueNumber: 1,
      occurrenceCount: 1,
      possibleRegression: false,
    });

    expect(requestCalls(github, "GET").map((call) => call.url)).toEqual([
      "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues?state=all&per_page=100&page=1",
    ]);
    const create = requestCalls(github, "POST")[0]!;
    expect(create.body).toEqual({
      title: "[missing_sources] When material factual claims are made, AskRigor should attach traceable sources.",
      body: [
        "## General lesson",
        "",
        "When material factual claims are made, AskRigor should attach traceable sources\\.",
        "",
        "## Expected behavior",
        "",
        "Cite each material claim near the sentence it supports and expose any source\\-access boundary\\.",
        "",
        "## Failure reason",
        "",
        "The answer asserted a conclusion without giving the user a way to inspect its evidence\\.",
        "",
        "## Synthetic regression",
        "",
        "A response ranks two interventions but supplies no citations for either ranking\\.",
        "",
        "## Evidence basis",
        "",
        "assistant\\_self\\_check",
        "",
        "## Version context",
        "",
        "AskRigor: 0\\.1\\.0",
        "Protocols:",
        "- HRP 20\\.5\\.17 \\(sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\)",
        "",
        "## Privacy gate",
        "",
        "Passed before and after model generalization\\.",
        "",
        "## Anonymous occurrence count",
        "",
        "1",
        "",
        "## First seen",
        "",
        observedAt,
        "",
        "## Last seen",
        "",
        observedAt,
        "",
        marker({ fingerprint, occurrence_count: 1, first_seen: observedAt, last_seen: observedAt }),
      ].join("\n"),
      labels: [
        "lesson-candidate",
        "needs-review",
        "source-custom-gpt",
        "category:missing_sources",
      ],
    });
    expect(String((create.body as { body: string }).body)).not.toContain(JSON.stringify(candidate));
    expect(parseFinalMetadata((create.body as { body: string }).body)).toEqual({
      fingerprint,
      occurrence_count: 1,
      first_seen: observedAt,
      last_seen: observedAt,
    });
    expect(create.headers.get("authorization")).toBe("Bearer queue-token-fixture");
    expect(create.headers.get("accept")).toBe("application/vnd.github+json");
    expect(create.headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(create.headers.get("user-agent")).toBe("AskRigor-Lesson-Queue/0.1");
  });

  it("updates only generated count and last-seen fields on the newest active exact match", async () => {
    const github = new FakeGitHub();
    addIssue(github, { number: 3, count: 7, body: issueBody(fingerprint, 7, observedAt, observedAt, "older maintainer content") });
    const maintainerText = "newest maintainer content\n\n## Anonymous occurrence count\n\nmaintainer-authored context\n\nReviewer note stays here.";
    const annotatedBody = issueBody(fingerprint, 2, observedAt, observedAt, maintainerText)
      .replace(
        "## Anonymous occurrence count\n\n2\n\n## First seen",
        "## Anonymous occurrence count\n\n2 — inline maintainer note\n\nIntervening maintainer note.\n\n## First seen",
      )
      .replace(
        `## Last seen\n\n${observedAt}`,
        `## Last seen\n\n${observedAt} — last-seen context`,
      );
    const newest = addIssue(github, { number: 8, count: 2, body: annotatedBody });
    newest.created_at = "2026-08-13T11:08:00Z";
    addIssue(github, { number: 9, count: 10, labels: ["lesson-candidate", "incorporated"] });
    let now = new Date("2026-08-13T13:00:00.000Z");

    await expect(queue(github, () => now).submit({ candidate, fingerprint })).resolves.toEqual({
      kind: "existing",
      issueNumber: 8,
      occurrenceCount: 3,
      possibleRegression: false,
    });

    expect(requestCalls(github, "POST")).toHaveLength(0);
    expect(requestCalls(github, "PATCH")).toHaveLength(1);
    expect(requestCalls(github, "PATCH")[0]!.url).toBe("https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues/8");
    expect(requestCalls(github, "PATCH")[0]!.body).toEqual({ body: newest.body });
    expect(newest.body).toContain(maintainerText);
    expect(newest.body).toContain("## Anonymous occurrence count\n\n3 — inline maintainer note\n\nIntervening maintainer note.");
    expect(newest.body).toContain("## First seen\n\n2026-08-13T12:00:00.000Z");
    expect(newest.body).toContain("## Last seen\n\n2026-08-13T13:00:00.000Z — last-seen context");
    expect(parseFinalMetadata(newest.body)).toEqual({
      fingerprint,
      occurrence_count: 3,
      first_seen: observedAt,
      last_seen: "2026-08-13T13:00:00.000Z",
    });
  });

  it("creates one linked possible-regression candidate after incorporation", async () => {
    const github = new FakeGitHub();
    addIssue(github, { number: 42, labels: ["lesson-candidate", "incorporated"] });

    await expect(queue(github).submit({ candidate, fingerprint })).resolves.toEqual({
      kind: "created",
      issueNumber: 43,
      occurrenceCount: 1,
      possibleRegression: true,
    });

    const body = String((requestCalls(github, "POST")[0]!.body as { body: string }).body);
    expect(body).toContain("## Prior candidate\n\nARL\\-0042");
    expect(requestCalls(github, "POST")[0]!.body).toMatchObject({
      labels: ["lesson-candidate", "possible-regression", "source-custom-gpt", "category:missing_sources"],
    });
  });

  it.each(["rejected", "duplicate", "insufficient-evidence"])(
    "creates one linked needs-review candidate after terminal %s",
    async (terminalLabel) => {
      const github = new FakeGitHub();
      addIssue(github, { number: 42, labels: ["lesson-candidate", terminalLabel] });

      await expect(queue(github).submit({ candidate, fingerprint })).resolves.toMatchObject({
        kind: "created",
        issueNumber: 43,
        possibleRegression: false,
      });
      expect(requestCalls(github, "POST")[0]!.body).toMatchObject({
        labels: ["lesson-candidate", "needs-review", "source-custom-gpt", "category:missing_sources"],
      });
      expect(String((requestCalls(github, "POST")[0]!.body as { body: string }).body)).toContain("## Prior candidate\n\nARL\\-0042");
    },
  );

  it("converges retries on an existing active replacement instead of the earlier terminal issue", async () => {
    const github = new FakeGitHub();
    addIssue(github, { number: 42, labels: ["lesson-candidate", "incorporated"] });
    const subject = queue(github);

    await expect(subject.submit({ candidate, fingerprint })).resolves.toMatchObject({ kind: "created", issueNumber: 43 });
    await expect(subject.submit({ candidate, fingerprint })).resolves.toEqual({
      kind: "existing",
      issueNumber: 43,
      occurrenceCount: 2,
      possibleRegression: true,
    });
    expect(requestCalls(github, "POST")).toHaveLength(1);
    expect(requestCalls(github, "PATCH")).toHaveLength(1);
  });

  it("fully paginates all issues and ignores pull requests before matching", async () => {
    const github = new FakeGitHub();
    for (let number = 1; number <= 100; number += 1) {
      addIssue(github, { number, issueFingerprint: "a".repeat(64), pullRequest: number === 100 });
    }
    addIssue(github, { number: 101, count: 4 });

    await expect(queue(github).submit({ candidate, fingerprint })).resolves.toMatchObject({
      kind: "existing",
      issueNumber: 101,
      occurrenceCount: 5,
    });
    expect(requestCalls(github, "GET").map((call) => call.url)).toEqual([
      "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues?state=all&per_page=100&page=1",
      "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues?state=all&per_page=100&page=2",
    ]);
    expect(requestCalls(github, "POST")).toHaveLength(0);
  });

  it("serializes concurrent identical submissions through one writer and creates once", async () => {
    const github = new FakeGitHub();
    let releaseCreate!: () => void;
    github.createDelay = new Promise<void>((resolve) => { releaseCreate = resolve; });
    const subject = queue(github);
    const first = subject.submit({ candidate, fingerprint });
    const second = subject.submit({ candidate, fingerprint });
    await vi.waitFor(() => expect(requestCalls(github, "POST")).toHaveLength(1));
    releaseCreate();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { kind: "created", issueNumber: 1, occurrenceCount: 1, possibleRegression: false },
      { kind: "existing", issueNumber: 1, occurrenceCount: 2, possibleRegression: false },
    ]);
    expect(requestCalls(github, "POST")).toHaveLength(1);
  });

  it("finds a committed issue after response loss and never exposes the network error", async () => {
    const github = new FakeGitHub();
    github.loseNextCreateResponse = true;
    const subject = queue(github);

    const error = await subject.submit({ candidate, fingerprint }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ code: "github_service_unavailable", retryable: true });
    expect(String(error)).not.toContain("private network path");
    await expect(subject.submit({ candidate, fingerprint })).resolves.toEqual({
      kind: "existing",
      issueNumber: 1,
      occurrenceCount: 2,
      possibleRegression: false,
    });
    expect(requestCalls(github, "POST")).toHaveLength(1);
  });

  it("ignores malformed and non-canonical markers rather than deduplicating against them", async () => {
    const github = new FakeGitHub();
    addIssue(github, { body: `fixture\n<!-- askrigor-lesson-metadata:not-base64! -->` });
    addIssue(github, { body: `fixture\n<!-- askrigor-lesson-metadata:${Buffer.from(JSON.stringify({ last_seen: observedAt, first_seen: observedAt, occurrence_count: 1, fingerprint }), "utf8").toString("base64url")} -->` });

    await expect(queue(github).submit({ candidate, fingerprint })).resolves.toMatchObject({ kind: "created" });
    expect(requestCalls(github, "POST")).toHaveLength(1);
  });

  it("fails closed without creating when a canonical matching marker has malformed issue structure", async () => {
    const github = new FakeGitHub();
    github.issues.push({
      number: 1,
      title: "fixture issue",
      body: issueBody(fingerprint),
      state: "open",
      labels: null,
      created_at: observedAt,
    } as unknown as StoredIssue);

    await expect(queue(github).submit({ candidate, fingerprint })).rejects.toMatchObject({
      code: "github_service_unavailable",
      retryable: false,
    });
    expect(requestCalls(github, "POST")).toHaveLength(0);
  });

  it("escapes GFM and HTML metacharacters in generalized body text", async () => {
    const github = new FakeGitHub();
    const adversarialCandidate: GeneralizedLesson = {
      ...candidate,
      general_lesson: "AskRigor should render ~~review~~ plus <unsafe> & evidence as literal generalized text.",
    };

    await queue(github).submit({ candidate: adversarialCandidate, fingerprint });
    const body = String((requestCalls(github, "POST")[0]!.body as { body: string }).body);
    expect(body).toContain("AskRigor should render \\~\\~review\\~\\~ plus &lt;unsafe&gt; &amp; evidence as literal generalized text\\.");
    expect(body).not.toContain("~~review~~");
    expect(body).not.toContain("<unsafe>");
  });
});
