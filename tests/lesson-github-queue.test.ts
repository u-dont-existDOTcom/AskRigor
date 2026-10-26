import { buildCheckReport, issueCheckReportToken, checkReportSection, CHECK_REPORT_SECTION_TITLE, CHECK_REPORT_TOKEN_MAX_CHARACTERS } from "../apps/research-mcp/src/check-report.js";
import { rule } from "../apps/research-mcp/src/check-rules.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DetailedLessonReport, GeneralizedLesson } from "../apps/research-mcp/src/lessons/contracts.js";
import { GitHubApiError } from "../apps/research-mcp/src/lessons/github-app.js";
import {
  GitHubLessonQueue,
  publicCandidateId,
} from "../apps/research-mcp/src/lessons/github-lessons.js";
import { createLocalLessonGeneralizer } from "../apps/research-mcp/src/lessons/local-generalizer.js";
import { canonicalizeLesson, lessonFingerprint } from "../apps/research-mcp/src/lessons/privacy-screen.js";
import { LessonSubmissionService } from "../apps/research-mcp/src/lessons/service.js";

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

interface StoredComment {
  id: number;
  body: string;
  created_at: string;
}

interface HangingRequest {
  method: string;
  url: string;
}

class FakeGitHub {
  readonly calls: Array<{ url: string; method: string; body?: unknown; headers: Headers; signal?: AbortSignal | null }> = [];
  readonly issues: StoredIssue[] = [];
  readonly comments = new Map<number, StoredComment[]>();
  readonly versions = new Map<number, number>();
  nextNumber = 1;
  nextCommentId = 1_000;
  loseNextCreateResponse = false;
  loseNextCommentResponse = false;
  createDelay?: Promise<void>;
  commentDelay?: Promise<void>;
  editBeforeNextPatch?: (issue: StoredIssue) => void;
  hangingRequest?: HangingRequest;

  readonly fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    const headers = new Headers(init?.headers);
    this.calls.push({ url, method, body, headers, signal: init?.signal });

    if (this.hangingRequest?.method === method && url === this.hangingRequest.url) {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("private hung GitHub request")));
      });
    }

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
      this.versions.set(issue.number, 1);
      if (this.loseNextCreateResponse) {
        this.loseNextCreateResponse = false;
        throw new Error("private network path and request body");
      }
      return json(issue, 201);
    }

    const commentMatch = /^https:\/\/api\.github\.com\/repos\/u-dont-existDOTcom\/AskRigor-lessons\/issues\/(\d+)\/comments(?:\?.*)?$/u.exec(url);
    if (method === "GET" && commentMatch) {
      const issueNumber = Number(commentMatch[1]);
      const page = Number(new URL(url).searchParams.get("page"));
      const start = (page - 1) * 100;
      return json((this.comments.get(issueNumber) ?? []).slice(start, start + 100));
    }
    if (method === "POST" && commentMatch) {
      if (this.commentDelay) await this.commentDelay;
      const issueNumber = Number(commentMatch[1]);
      const request = body as { body: string };
      const comment: StoredComment = {
        id: this.nextCommentId++,
        body: request.body,
        created_at: observedAt,
      };
      const comments = this.comments.get(issueNumber) ?? [];
      comments.push(comment);
      this.comments.set(issueNumber, comments);
      if (this.loseNextCommentResponse) {
        this.loseNextCommentResponse = false;
        throw new Error("private comment response path and request body");
      }
      return json(comment, 201);
    }

    const patchMatch = /^https:\/\/api\.github\.com\/repos\/u-dont-existDOTcom\/AskRigor-lessons\/issues\/(\d+)$/.exec(url);
    if (method === "GET" && patchMatch) {
      const issue = this.issues.find((value) => value.number === Number(patchMatch[1]));
      if (!issue) return json({ message: "missing" }, 404);
      return json(issue, 200, { etag: this.etag(issue) });
    }
    if (method === "PATCH" && patchMatch) {
      const issue = this.issues.find((value) => value.number === Number(patchMatch[1]));
      if (!issue) return json({ message: "missing" }, 404);
      if (this.editBeforeNextPatch) {
        const edit = this.editBeforeNextPatch;
        this.editBeforeNextPatch = undefined;
        edit(issue);
        this.versions.set(issue.number, (this.versions.get(issue.number) ?? 1) + 1);
      }
      if (headers.get("if-match") !== this.etag(issue)) {
        return json({ message: "precondition failed" }, 412);
      }
      const request = body as { body: string };
      issue.body = request.body;
      this.versions.set(issue.number, (this.versions.get(issue.number) ?? 1) + 1);
      return json(issue, 200, { etag: this.etag(issue) });
    }

    throw new Error("Unexpected test fetch boundary");
  };

  private etag(issue: StoredIssue): string {
    return `"issue-${issue.number}-v${this.versions.get(issue.number) ?? 1}"`;
  }
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
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

function occurrenceMarker(metadata: Record<string, unknown>): string {
  return `<!-- askrigor-lesson-occurrence:${encodeMetadata(metadata)} -->`;
}

function occurrenceComment(
  issueFingerprint: string,
  occurrenceCount: number,
  observedAtValue = observedAt,
): string {
  return [
    "## Anonymous lesson occurrence",
    "",
    `Occurrence count: ${occurrenceCount}`,
    `Observed at: ${observedAtValue}`,
    "",
    occurrenceMarker({
      fingerprint: issueFingerprint,
      occurrence_count: occurrenceCount,
      observed_at: observedAtValue,
    }),
  ].join("\n");
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
    "<!-- askrigor-generated-occurrence-count:start -->",
    String(occurrenceCount),
    "<!-- askrigor-generated-occurrence-count:end -->",
    "",
    "## First seen",
    "",
    firstSeen,
    "",
    "## Last seen",
    "",
    "<!-- askrigor-generated-last-seen:start -->",
    lastSeen,
    "<!-- askrigor-generated-last-seen:end -->",
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
  github.versions.set(number, 1);
  return issue;
}

function addComment(github: FakeGitHub, issueNumber: number, body: string): StoredComment {
  const comment: StoredComment = {
    id: github.nextCommentId++,
    body,
    created_at: observedAt,
  };
  const comments = github.comments.get(issueNumber) ?? [];
  comments.push(comment);
  github.comments.set(issueNumber, comments);
  return comment;
}

function parseFinalMetadata(body: string): unknown {
  const match = /\n<!-- askrigor-lesson-metadata:([A-Za-z0-9_-]+) -->$/.exec(body);
  expect(match).not.toBeNull();
  return JSON.parse(Buffer.from(match![1]!, "base64url").toString("utf8"));
}

function parseOccurrenceMetadata(body: string): unknown {
  const match = /\n<!-- askrigor-lesson-occurrence:([A-Za-z0-9_-]+) -->$/.exec(body);
  expect(match).not.toBeNull();
  return JSON.parse(Buffer.from(match![1]!, "base64url").toString("utf8"));
}

function requestCalls(github: FakeGitHub, method: string) {
  return github.calls.filter((call) => call.method === method);
}

afterEach(() => {
  vi.useRealTimers();
});

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
        "Passed the server's privacy screen\\.",
        "",
        "## Anonymous occurrence count",
        "",
        "<!-- askrigor-generated-occurrence-count:start -->",
        "1",
        "<!-- askrigor-generated-occurrence-count:end -->",
        "",
        "## First seen",
        "",
        observedAt,
        "",
        "## Last seen",
        "",
        "<!-- askrigor-generated-last-seen:start -->",
        observedAt,
        "<!-- askrigor-generated-last-seen:end -->",
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

  it("labels a lesson sent through the connector with its surface", async () => {
    const github = new FakeGitHub();

    await queue(github).submit({ candidate, fingerprint, source: "connector" });
    expect(requestCalls(github, "POST")[0]!.body).toMatchObject({
      labels: ["lesson-candidate", "needs-review", "source-connector", "category:missing_sources"],
    });
  });

  // Issue #357: a connector lesson may name the public AskRigor issue that
  // reports the failure; the body shows it as one reference built from the number.
  it("shows a connector lesson's related public issue as one reference and changes nothing else", async () => {
    const plain = new FakeGitHub();
    const related = new FakeGitHub();

    await queue(plain).submit({ candidate, fingerprint, source: "connector" });
    await queue(related).submit({ candidate, fingerprint, source: "connector", relatedIssue: 357 });

    const plainCreate = requestCalls(plain, "POST")[0]!.body as { title: string; body: string; labels: string[] };
    const relatedCreate = requestCalls(related, "POST")[0]!.body as { title: string; body: string; labels: string[] };
    const reference = "## Related AskRigor issue\n\nu-dont-existDOTcom/AskRigor#357";
    expect(relatedCreate.body).toContain(
      `## Privacy gate\n\nPassed the server's privacy screen\\.\n\n${reference}\n\n## Anonymous occurrence count`,
    );
    expect(relatedCreate.body.replace(`${reference}\n\n`, "")).toBe(plainCreate.body);
    expect(relatedCreate.title).toBe(plainCreate.title);
    expect(relatedCreate.labels).toEqual(plainCreate.labels);
    expect(parseFinalMetadata(relatedCreate.body)).toEqual({
      fingerprint,
      occurrence_count: 1,
      first_seen: observedAt,
      last_seen: observedAt,
    });
    expect(plainCreate.body).not.toContain("Related AskRigor issue");
  });

  it.each([
    ["zero", 0],
    ["negative", -357],
    ["not an integer", 357.5],
    ["over the bound", 1_000_001],
    ["not a number", Number.NaN],
    ["a numeric string", "357"],
    ["a reference string", "u-dont-existDOTcom/AskRigor#357"],
  ])(
    "fails closed before any GitHub request when the related issue is %s",
    async (_name, relatedIssue) => {
      const github = new FakeGitHub();

      await expect(queue(github).submit({
        candidate,
        fingerprint,
        source: "connector",
        relatedIssue: relatedIssue as number,
      })).rejects.toMatchObject({ code: "github_service_unavailable", retryable: false });
      expect(github.calls).toHaveLength(0);
    },
  );

  it("treats the same lesson with or without a related issue as one candidate, and a repeat's comment names the issue", async () => {
    const github = new FakeGitHub();
    const repeatAt = "2026-08-13T13:00:00.000Z";
    let now = new Date(observedAt);
    const service = new LessonSubmissionService({
      limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
      anonymizer: createLocalLessonGeneralizer(),
      queue: queue(github, () => now),
    });

    await expect(service.submit(candidate, "connector")).resolves.toEqual({
      status: "submitted",
      candidate_id: "ARL-0001",
      occurrence_count: 1,
      retryable: false,
    });
    now = new Date(repeatAt);
    const repeat = await service.submit({ ...candidate, related_issue: 357 }, "connector");

    expect(repeat).toEqual({
      status: "existing_candidate",
      candidate_id: "ARL-0001",
      occurrence_count: 2,
      retryable: false,
    });
    expect(JSON.stringify(repeat)).not.toContain("357");
    const lessonFingerprintValue = lessonFingerprint(canonicalizeLesson(candidate));
    expect(github.issues).toHaveLength(1);
    expect(parseFinalMetadata(github.issues[0]!.body)).toMatchObject({ fingerprint: lessonFingerprintValue });
    expect(github.issues[0]!.body).not.toContain("Related AskRigor issue");
    expect(github.comments.get(1)?.map(({ body }) => body)).toEqual([[
      "## Anonymous lesson occurrence",
      "",
      "Occurrence count: 2",
      `Observed at: ${repeatAt}`,
      "Related AskRigor issue: u-dont-existDOTcom/AskRigor#357",
      "",
      occurrenceMarker({ fingerprint: lessonFingerprintValue, occurrence_count: 2, observed_at: repeatAt }),
    ].join("\n")]);
  });

  // Owner question 154: a connector lesson from an account that turned detailed lesson reports on carries a detailed
  // report, rendered from its validated fields with the same escaping; it is in neither the fingerprint nor the
  // hidden metadata, and a repeat's occurrence comment carries the repeat's report.
  describe("detailed report", () => {
    const report: DetailedLessonReport = {
      steps: [
        "The assistant searched one database for the intervention and found three trials.",
        "It wrote the answer before reading any of the trials in full.",
      ],
      observed: "The answer called the evidence strong although no trial had been read in full.",
      expected: "The answer should read the decisive trials in full, or say the evidence was not read, before rating it.",
      causes: [
        { cause: "The final check accepted an answer that declared no key studies.", confidence: "high" },
        { cause: "The tool description did not say that a strength rating needs a full-text read.", confidence: "medium" },
      ],
      parts_to_change: ["finalize_research", "The final check's key-study rule"],
      proposed_change: "Refuse a strength rating unless a key study was read in full or the answer says it was not.",
      test_cases: [
        { case: "An invented answer rates three abstracts as strong; the check refuses it.", negative_control: false },
        { case: "An invented answer reads one trial in full and rates it; the check accepts it.", negative_control: true },
      ],
      uncertain: "Whether the model would still rate the evidence once the rule names the full-text read.",
    };
    const section = [
      "## Detailed report",
      "",
      "### Steps",
      "",
      "1. The assistant searched one database for the intervention and found three trials\\.",
      "2. It wrote the answer before reading any of the trials in full\\.",
      "",
      "### What happened",
      "",
      "The answer called the evidence strong although no trial had been read in full\\.",
      "",
      "### What was expected",
      "",
      "The answer should read the decisive trials in full, or say the evidence was not read, before rating it\\.",
      "",
      "### Causes",
      "",
      "- The final check accepted an answer that declared no key studies\\. \\(confidence: high\\)",
      "- The tool description did not say that a strength rating needs a full\\-text read\\. \\(confidence: medium\\)",
      "",
      "### Parts to change",
      "",
      "- finalize\\_research",
      "- The final check's key\\-study rule",
      "",
      "### Proposed change",
      "",
      "Refuse a strength rating unless a key study was read in full or the answer says it was not\\.",
      "",
      "### Invented test cases",
      "",
      "1. An invented answer rates three abstracts as strong; the check refuses it\\.",
      "2. Negative control: An invented answer reads one trial in full and rates it; the check accepts it\\.",
      "",
      "### What stays uncertain",
      "",
      "Whether the model would still rate the evidence once the rule names the full\\-text read\\.",
    ].join("\n");

    it("adds one Detailed report section to a new issue and changes nothing else", async () => {
      const plain = new FakeGitHub();
      const detailed = new FakeGitHub();

      await queue(plain).submit({ candidate, fingerprint, source: "connector", relatedIssue: 357 });
      await expect(queue(detailed).submit({
        candidate,
        fingerprint,
        source: "connector",
        relatedIssue: 357,
        detailedReport: report,
      })).resolves.toEqual({ kind: "created", issueNumber: 1, occurrenceCount: 1, possibleRegression: false });

      const plainCreate = requestCalls(plain, "POST")[0]!.body as { title: string; body: string; labels: string[] };
      const detailedCreate = requestCalls(detailed, "POST")[0]!.body as { title: string; body: string; labels: string[] };
      expect(detailedCreate.body).toContain(
        `## Related AskRigor issue\n\nu-dont-existDOTcom/AskRigor#357\n\n${section}\n\n## Anonymous occurrence count`,
      );
      expect(detailedCreate.body.replace(`${section}\n\n`, "")).toBe(plainCreate.body);
      expect(detailedCreate.title).toBe(plainCreate.title);
      expect(detailedCreate.labels).toEqual(plainCreate.labels);
      expect(parseFinalMetadata(detailedCreate.body)).toEqual({
        fingerprint,
        occurrence_count: 1,
        first_seen: observedAt,
        last_seen: observedAt,
      });
    });

    it("appends a repeat's report to its occurrence comment and leaves the issue body alone", async () => {
      const github = new FakeGitHub();
      const issue = addIssue(github, { number: 8, count: 2 });
      const body = issue.body;
      const now = new Date("2026-08-13T13:00:00.000Z");

      await expect(queue(github, () => now).submit({ candidate, fingerprint, source: "connector", detailedReport: report }))
        .resolves.toEqual({ kind: "existing", issueNumber: 8, occurrenceCount: 3, possibleRegression: false });

      expect(issue.body).toBe(body);
      expect(requestCalls(github, "PATCH")).toHaveLength(0);
      expect(github.comments.get(8)?.map((comment) => comment.body)).toEqual([[
        "## Anonymous lesson occurrence",
        "",
        "Occurrence count: 3",
        `Observed at: ${now.toISOString()}`,
        "",
        section,
        "",
        occurrenceMarker({ fingerprint, occurrence_count: 3, observed_at: now.toISOString() }),
      ].join("\n")]);
      expect(parseOccurrenceMetadata(github.comments.get(8)![0]!.body)).toEqual({
        fingerprint,
        occurrence_count: 3,
        observed_at: now.toISOString(),
      });
      // A later occurrence counts on from the commented one.
      await expect(queue(github, () => now).submit({ candidate, fingerprint, source: "connector" }))
        .resolves.toMatchObject({ kind: "existing", occurrenceCount: 4 });
      expect(github.comments.get(8)?.at(-1)?.body).toBe(occurrenceComment(fingerprint, 4, now.toISOString()));
    });

    it("escapes the report's text, so it can open no heading, list, link or queue marker of its own", async () => {
      const github = new FakeGitHub();
      const fakeMarker = "<!-- askrigor-lesson-occurrence:e30 -->";
      const adversarial: DetailedLessonReport = {
        ...report,
        steps: [`# Heading ${fakeMarker}`],
        observed: "<b>bold</b> & ~~struck~~ [link](x)",
        parts_to_change: ["- not a list item"],
      };

      await queue(github).submit({ candidate, fingerprint, source: "connector", detailedReport: adversarial });
      const created = String((requestCalls(github, "POST")[0]!.body as { body: string }).body);
      expect(created).toContain("1. \\# Heading &lt;\\!\\-\\- askrigor\\-lesson\\-occurrence:e30 \\-\\-&gt;");
      expect(created).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; \\~\\~struck\\~\\~ \\[link\\]\\(x\\)");
      expect(created).toContain("- \\- not a list item");
      expect(created).not.toContain(fakeMarker);
      // The repeat's comment holds one queue marker, its own, so the count still reads.
      await queue(github).submit({ candidate, fingerprint, source: "connector", detailedReport: adversarial });
      await expect(queue(github).submit({ candidate, fingerprint })).resolves.toMatchObject({ occurrenceCount: 3 });
    });

    it.each([
      ["over 10,000 characters in all", {
        ...report,
        steps: Array.from({ length: 12 }, () => "s".repeat(300)),
        test_cases: Array.from({ length: 5 }, () => ({ case: "t".repeat(1_200), negative_control: false })),
      }],
      ["with another field", { ...report, transcript: "The raw chat." }],
      ["without its steps", { ...report, steps: [] }],
      ["not an object", "A long report."],
    ])("fails closed before any GitHub request when the report is %s", async (_name, detailedReport) => {
      const github = new FakeGitHub();

      await expect(queue(github).submit({
        candidate,
        fingerprint,
        source: "connector",
        detailedReport: detailedReport as DetailedLessonReport,
      })).rejects.toMatchObject({ code: "github_service_unavailable", retryable: false });
      expect(github.calls).toHaveLength(0);
    });

    it("treats the same lesson with or without a report as one candidate, through the lesson service", async () => {
      const github = new FakeGitHub();
      const repeatAt = "2026-08-13T13:00:00.000Z";
      let now = new Date(observedAt);
      const service = new LessonSubmissionService({
        limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
        anonymizer: createLocalLessonGeneralizer(),
        queue: queue(github, () => now),
      });

      await expect(service.submit({ ...candidate, detailed_report: report }, "connector", { detailedReports: true }))
        .resolves.toEqual({ status: "submitted", candidate_id: "ARL-0001", occurrence_count: 1, retryable: false });
      now = new Date(repeatAt);
      const repeat = await service.submit({ ...candidate, detailed_report: report }, "connector", { detailedReports: true });
      expect(repeat).toEqual({ status: "existing_candidate", candidate_id: "ARL-0001", occurrence_count: 2, retryable: false });
      // Refused while the setting is off: no comment, and the count stays.
      await expect(service.submit({ ...candidate, detailed_report: report }, "connector"))
        .resolves.toMatchObject({ status: "detailed_report_refused" });

      const lessonFingerprintValue = lessonFingerprint(canonicalizeLesson(candidate));
      expect(github.issues).toHaveLength(1);
      expect(github.issues[0]!.body).toContain(section);
      expect(parseFinalMetadata(github.issues[0]!.body)).toEqual({
        fingerprint: lessonFingerprintValue,
        occurrence_count: 1,
        first_seen: observedAt,
        last_seen: observedAt,
      });
      expect(github.comments.get(1)?.map(({ body }) => body)).toEqual([[
        "## Anonymous lesson occurrence",
        "",
        "Occurrence count: 2",
        `Observed at: ${repeatAt}`,
        "",
        section,
        "",
        occurrenceMarker({ fingerprint: lessonFingerprintValue, occurrence_count: 2, observed_at: repeatAt }),
      ].join("\n")]);
      expect(JSON.stringify(repeat)).not.toContain("trials");
    });
  });

  it("bounds a maximum-length lesson to one deterministic 256-character title while retaining the full body", async () => {
    const github = new FakeGitHub();
    const longCandidate: GeneralizedLesson = { ...candidate, general_lesson: "x".repeat(600) };

    await queue(github).submit({ candidate: longCandidate, fingerprint });
    const create = requestCalls(github, "POST")[0]!.body as { title: string; body: string };
    expect(create.title).toBe(`[missing_sources] ${"x".repeat(237)}…`);
    expect([...create.title]).toHaveLength(256);
    expect(create.body).toContain("x".repeat(600));
  });

  it("appends one anonymous occurrence comment and preserves the active issue body byte-for-byte", async () => {
    const github = new FakeGitHub();
    addIssue(github, { number: 3, count: 7, body: issueBody(fingerprint, 7, observedAt, observedAt, "older maintainer content") });
    const maintainerText = "newest maintainer content\n\n## Anonymous occurrence count\n\nmaintainer-authored context\n\nReviewer note stays here.";
    const annotatedBody = issueBody(fingerprint, 2, observedAt, observedAt, maintainerText);
    const newest = addIssue(github, { number: 8, count: 2, body: annotatedBody });
    newest.created_at = "2026-08-13T11:08:00Z";
    addIssue(github, { number: 9, count: 10, labels: ["lesson-candidate", "incorporated"] });
    const now = new Date("2026-08-13T13:00:00.000Z");

    await expect(queue(github, () => now).submit({ candidate, fingerprint })).resolves.toEqual({
      kind: "existing",
      issueNumber: 8,
      occurrenceCount: 3,
      possibleRegression: false,
    });

    expect(requestCalls(github, "PATCH")).toHaveLength(0);
    expect(newest.body).toBe(annotatedBody);
    expect(parseFinalMetadata(newest.body)).toEqual({
      fingerprint,
      occurrence_count: 2,
      first_seen: observedAt,
      last_seen: observedAt,
    });
    const commentCreates = requestCalls(github, "POST").filter((call) => call.url.endsWith("/issues/8/comments"));
    expect(commentCreates).toHaveLength(1);
    expect(commentCreates[0]!.body).toEqual({ body: occurrenceComment(fingerprint, 3, now.toISOString()) });
    expect(parseOccurrenceMetadata(String((commentCreates[0]!.body as { body: string }).body))).toEqual({
      fingerprint,
      occurrence_count: 3,
      observed_at: now.toISOString(),
    });
    expect(String((commentCreates[0]!.body as { body: string }).body)).not.toContain(candidate.general_lesson);
  });

  it("reconstructs the next count from paginated comments while ignoring ordinary and foreign comments", async () => {
    const github = new FakeGitHub();
    const issue = addIssue(github, { number: 8, count: 2 });
    for (let index = 0; index < 99; index += 1) {
      addComment(github, issue.number, `maintainer note ${index}`);
    }
    addComment(github, issue.number, occurrenceComment("a".repeat(64), 99));
    addComment(github, issue.number, occurrenceComment(fingerprint, 7));

    await expect(queue(github, () => new Date("2026-08-13T13:00:00.000Z")).submit({ candidate, fingerprint }))
      .resolves.toMatchObject({ kind: "existing", occurrenceCount: 8 });
    expect(requestCalls(github, "GET").map((call) => call.url)).toContain(
      "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues/8/comments?per_page=100&page=2",
    );
    expect(github.comments.get(issue.number)?.at(-1)?.body).toBe(
      occurrenceComment(fingerprint, 8, "2026-08-13T13:00:00.000Z"),
    );
    expect(requestCalls(github, "PATCH")).toHaveLength(0);
  });

  it("fails closed without writing when a comment claims the queue namespace with malformed metadata", async () => {
    const github = new FakeGitHub();
    addIssue(github, { number: 8, count: 2 });
    addComment(github, 8, "maintainer note\n<!-- askrigor-lesson-occurrence:not-canonical! -->");

    await expect(queue(github).submit({ candidate, fingerprint })).rejects.toMatchObject({
      code: "github_service_unavailable",
      retryable: false,
    });
    expect(requestCalls(github, "POST")).toHaveLength(0);
    expect(requestCalls(github, "PATCH")).toHaveLength(0);
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
    expect(requestCalls(github, "POST")).toHaveLength(2);
    expect(requestCalls(github, "POST").map((call) => call.url)).toEqual([
      "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues",
      "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues/43/comments",
    ]);
    expect(requestCalls(github, "PATCH")).toHaveLength(0);
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
      "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues/101",
      "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues/101/comments?per_page=100&page=1",
    ]);
    expect(requestCalls(github, "POST")).toHaveLength(1);
    expect(requestCalls(github, "POST")[0]!.url).toBe(
      "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues/101/comments",
    );
  });

  it("serializes concurrent identical submissions through one writer and creates once", async () => {
    const github = new FakeGitHub();
    let releaseCreate!: () => void;
    github.createDelay = new Promise<void>((resolve) => { releaseCreate = resolve; });
    const subject = queue(github);
    const first = subject.submit({ candidate, fingerprint });
    const second = subject.submit({ candidate, fingerprint });
    await vi.waitFor(() => expect(
      requestCalls(github, "POST").filter((call) => call.url.endsWith("/issues")),
    ).toHaveLength(1));
    releaseCreate();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { kind: "created", issueNumber: 1, occurrenceCount: 1, possibleRegression: false },
      { kind: "existing", issueNumber: 1, occurrenceCount: 2, possibleRegression: false },
    ]);
    expect(requestCalls(github, "POST")).toHaveLength(2);
    expect(requestCalls(github, "POST").filter((call) => call.url.endsWith("/comments"))).toHaveLength(1);
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
    expect(requestCalls(github, "POST")).toHaveLength(2);
    expect(github.issues).toHaveLength(1);
  });

  it("keeps one issue and advances from a committed occurrence comment after response loss", async () => {
    const github = new FakeGitHub();
    addIssue(github, { number: 8, count: 1 });
    github.loseNextCommentResponse = true;
    const subject = queue(github);

    const error = await subject.submit({ candidate, fingerprint }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ code: "github_service_unavailable", retryable: true });
    expect(String(error)).not.toContain("private comment response path");
    await expect(subject.submit({ candidate, fingerprint })).resolves.toMatchObject({
      kind: "existing",
      issueNumber: 8,
      occurrenceCount: 3,
    });
    expect(github.issues).toHaveLength(1);
    expect(github.comments.get(8)?.map(({ body }) => parseOccurrenceMetadata(body))).toEqual([
      { fingerprint, occurrence_count: 2, observed_at: observedAt },
      { fingerprint, occurrence_count: 3, observed_at: observedAt },
    ]);
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

  it("sanitizes an injected queue clock failure", async () => {
    const github = new FakeGitHub();
    const subject = queue(github, () => { throw new Error("private queue clock details"); });

    const error = await subject.submit({ candidate, fingerprint }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ code: "github_service_unavailable", retryable: false });
    expect(String(error)).not.toContain("private queue clock details");
    expect(github.calls).toHaveLength(0);
  });

  it.each([
    ["issue listing", "GET", "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues?state=all&per_page=100&page=1", false],
    ["issue creation", "POST", "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues", false],
    ["occurrence comment listing", "GET", "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues/8/comments?per_page=100&page=1", true],
    ["occurrence comment creation", "POST", "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-lessons/issues/8/comments", true],
  ])("aborts a hung %s at the application deadline", async (_name, method, url, needsIssue) => {
    vi.useFakeTimers();
    const github = new FakeGitHub();
    if (needsIssue) addIssue(github, { number: 8, count: 2 });
    github.hangingRequest = { method, url };
    const outcome = queue(github).submit({ candidate, fingerprint }).catch((value: unknown) => value);
    await vi.waitFor(() => expect(github.calls.some((call) => call.method === method && call.url === url)).toBe(true));
    const hungCall = github.calls.findLast((call) => call.method === method && call.url === url)!;

    expect(hungCall.signal).toBeDefined();
    await vi.advanceTimersByTimeAsync(20_000);
    const error = await outcome;
    expect(error).toMatchObject({ code: "github_service_unavailable", retryable: true });
    expect(String(error)).not.toContain("private hung GitHub request");
  });
});

describe("the signed final-check report in a filed lesson", () => {
  const secret = "server-final-check-report-secret-0123456789abcdef";
  const makeReport = () => buildCheckReport({
    status: "stopped", reason: "stuck", round: 3,
    couldNot: [{ kind: "research", consecutive: 3, text: "Not exported", rule: rule`Audit video ${"private-video"} with audit_youtube_video_community.` }],
    nextTurn: []
  }, { versions: { build: "6f229e39", hrp: "20.6.31", universal: "20.5.46" }, receipts: [], allowed: () => false });
  const subject = (github: FakeGitHub) => new LessonSubmissionService({
    limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
    anonymizer: createLocalLessonGeneralizer(), queue: queue(github), reportSigningSecret: () => secret,
  });
  it("files the server report verbatim after privacy screening, with detailed reports off, including repeats", async () => {
    const github = new FakeGitHub();
    const service = subject(github);
    const report = makeReport();
    const token = issueCheckReportToken(report, secret);
    const raw = { ...candidate, check_report_token: token };
    await expect(service.submit(raw, "connector")).resolves.toMatchObject({ status: "submitted" });
    const body = github.issues[0]!.body;
    expect(body).toContain(checkReportSection(report));
    expect(body.indexOf("## Privacy gate")).toBeLessThan(body.indexOf(CHECK_REPORT_SECTION_TITLE));
    expect(body).not.toContain(token);
    expect(body).not.toContain("private-video");
    await expect(service.submit(raw, "connector")).resolves.toMatchObject({ status: "existing_candidate" });
    expect(github.comments.get(1)?.[0]!.body).toContain(checkReportSection(report));
    const unsafe = { ...raw, failure_reason: "Contact person@example.com for the private details of this failure." };
    const before = github.calls.length;
    await expect(service.submit(unsafe, "connector")).resolves.toMatchObject({ status: "privacy_rejected" });
    expect(github.calls).toHaveLength(before);
  });
  it("refuses altered, foreign-domain, foreign-server and oversized tokens without a queue request", async () => {
    const github = new FakeGitHub();
    const service = subject(github);
    const token = issueCheckReportToken(makeReport(), secret);
    const [prefix, payload, signature] = token.split("~");
    const report = JSON.parse(Buffer.from(payload!, "base64url").toString());
    report.could_not[0].rule = "An altered rule.";
    for (const invalid of [
      `${prefix}~${Buffer.from(JSON.stringify(report)).toString("base64url")}~${signature}`,
      token.replace("br1", "cr2"), issueCheckReportToken(makeReport(), "another server"),
      "a".repeat(CHECK_REPORT_TOKEN_MAX_CHARACTERS + 1),
    ]) await expect(service.submit({ ...candidate, check_report_token: invalid }, "connector"))
      .resolves.toEqual({ status: "check_report_refused", retryable: false, reason_code: "invalid_check_report_token" });
    expect(github.calls).toHaveLength(0);
  });
  it("verifies and files the correction rule, screens a missing rule and keeps Action fields strict", async () => {
    const github = new FakeGitHub();
    const service = subject(github);
    await expect(service.submit({ ...candidate, preventing_rule: "HarmWarningCalibration" }, "connector"))
      .resolves.toMatchObject({ status: "submitted" });
    expect(github.issues[0]!.body).toContain("HarmWarningCalibration");
    await expect(service.submit({ ...candidate, preventing_rule: "no_rule", missing_rule: "Check the source identity before ranking." }, "connector"))
      .resolves.toMatchObject({ status: "existing_candidate" });
    expect(github.comments.get(1)?.[0]!.body).toContain("Check the source identity before ranking\\.");
    const before = github.calls.length;
    for (const extra of [{ preventing_rule: "not_an_actual_rule" }, { preventing_rule: "no_rule" }, { missing_rule: "Unpaired text" }]) {
      await expect(service.submit({ ...candidate, ...extra }, "connector"))
        .resolves.toEqual({ status: "correction_rule_refused", retryable: false, reason_code: "invalid_preventing_rule" });
    }
    await expect(service.submit({ ...candidate, preventing_rule: "no_rule", missing_rule: "Contact person@example.com about the missing rule." }, "connector"))
      .resolves.toMatchObject({ status: "privacy_rejected" });
    await expect(service.submit({ ...candidate, check_report_token: issueCheckReportToken(makeReport(), secret) }, "custom-gpt"))
      .resolves.toMatchObject({ status: "privacy_rejected" });
    expect(github.calls).toHaveLength(before);
  });
});
