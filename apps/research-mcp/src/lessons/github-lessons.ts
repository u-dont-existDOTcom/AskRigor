import type { GeneralizedLesson } from "./contracts.js";
import {
  GITHUB_API_ROOT,
  GitHubApiError,
  LESSON_REPOSITORY_FULL_NAME,
  githubRequestJson,
  isRecord,
  type GitHubTokenProvider,
} from "./github-app.js";

export interface GitHubLessonSubmission {
  candidate: GeneralizedLesson;
  fingerprint: string;
}

export interface GitHubLessonQueueResult {
  kind: "created" | "existing";
  issueNumber: number;
  occurrenceCount: number;
  possibleRegression: boolean;
}

export interface GitHubLessonQueueOptions {
  tokenProvider: GitHubTokenProvider;
  fetch: typeof fetch;
  now?: () => Date;
}

interface PrivateMetadata {
  fingerprint: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
}

interface ListedIssue {
  number: number;
  body: string;
  state: "open" | "closed";
  labels: string[];
  createdAtMilliseconds: number;
  metadata: PrivateMetadata;
}

const ISSUES_PATH = `/repos/${LESSON_REPOSITORY_FULL_NAME}/issues`;
const TERMINAL_LABELS = new Set(["incorporated", "rejected", "duplicate", "insufficient-evidence"]);
const METADATA_PREFIX = "<!-- askrigor-lesson-metadata:";
const METADATA_PATTERN = /\n<!-- askrigor-lesson-metadata:([A-Za-z0-9_-]+) -->$/u;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;

/** Converts a private issue number into the only identifier exposed publicly. */
export function publicCandidateId(issueNumber: number): string {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new GitHubApiError("github_service_unavailable", false);
  }
  return `ARL-${String(issueNumber).padStart(4, "0")}`;
}

/** A single-writer private issue queue with list-before-write idempotency. */
export class GitHubLessonQueue {
  private readonly now: () => Date;
  private writer: Promise<void> = Promise.resolve();

  constructor(private readonly options: GitHubLessonQueueOptions) {
    this.now = options.now ?? (() => new Date());
  }

  submit(input: GitHubLessonSubmission): Promise<GitHubLessonQueueResult> {
    const result = this.writer.then(() => this.submitSerialized(input));
    this.writer = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async submitSerialized(input: GitHubLessonSubmission): Promise<GitHubLessonQueueResult> {
    if (!FINGERPRINT_PATTERN.test(input.fingerprint)) {
      throw new GitHubApiError("github_service_unavailable", false);
    }
    const observedAt = this.safeTimestamp();
    const issues = await this.listAllIssues(input.fingerprint);
    const active = newestIssue(issues.filter((issue) => isActive(issue)));
    if (active) return await this.updateActiveIssue(active, observedAt);

    const terminal = newestIssue(issues);
    return await this.createIssue(input, observedAt, terminal);
  }

  private async listAllIssues(fingerprint: string): Promise<ListedIssue[]> {
    const matching: ListedIssue[] = [];
    for (let page = 1; ; page += 1) {
      const response = await this.request(
        `${ISSUES_PATH}?state=all&per_page=100&page=${page}`,
        { method: "GET" },
      );
      if (!Array.isArray(response)) throw new GitHubApiError("github_service_unavailable", true);
      for (const value of response) {
        if (!isRecord(value) || "pull_request" in value || typeof value.body !== "string") continue;
        const metadata = parseMetadata(value.body);
        if (!metadata || metadata.fingerprint !== fingerprint) continue;
        const issue = parseMatchingIssue(value, metadata);
        if (!issue) throw new GitHubApiError("github_service_unavailable", false);
        matching.push(issue);
      }
      if (response.length < 100) break;
    }
    return matching;
  }

  private async updateActiveIssue(issue: ListedIssue, observedAt: string): Promise<GitHubLessonQueueResult> {
    const occurrenceCount = issue.metadata.occurrence_count + 1;
    const metadata: PrivateMetadata = {
      fingerprint: issue.metadata.fingerprint,
      occurrence_count: occurrenceCount,
      first_seen: issue.metadata.first_seen,
      last_seen: observedAt,
    };
    const body = updateGeneratedFields(issue.body, issue.metadata, metadata);
    await this.request(`${ISSUES_PATH}/${issue.number}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    return {
      kind: "existing",
      issueNumber: issue.number,
      occurrenceCount,
      possibleRegression: issue.labels.includes("possible-regression"),
    };
  }

  private async createIssue(
    input: GitHubLessonSubmission,
    observedAt: string,
    terminal: ListedIssue | undefined,
  ): Promise<GitHubLessonQueueResult> {
    const possibleRegression = terminal?.labels.includes("incorporated") ?? false;
    const labels = [
      "lesson-candidate",
      possibleRegression ? "possible-regression" : "needs-review",
      "source-custom-gpt",
      `category:${input.candidate.category}`,
    ];
    const response = await this.request(ISSUES_PATH, {
      method: "POST",
      body: JSON.stringify({
        title: `[${input.candidate.category}] ${input.candidate.general_lesson}`,
        body: buildIssueBody(
          input.candidate,
          {
            fingerprint: input.fingerprint,
            occurrence_count: 1,
            first_seen: observedAt,
            last_seen: observedAt,
          },
          terminal?.number,
        ),
        labels,
      }),
    });
    if (!isRecord(response) || !isPositiveInteger(response.number)) {
      throw new GitHubApiError("github_service_unavailable", true);
    }
    return {
      kind: "created",
      issueNumber: response.number,
      occurrenceCount: 1,
      possibleRegression,
    };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let token: string;
    try {
      token = await this.options.tokenProvider.getToken();
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubApiError("github_auth_unavailable", false);
    }
    return await githubRequestJson(this.options.fetch, `${GITHUB_API_ROOT}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  private safeTimestamp(): string {
    const value = this.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new GitHubApiError("github_service_unavailable", false);
    }
    return value.toISOString();
  }
}

function buildIssueBody(
  candidate: GeneralizedLesson,
  metadata: PrivateMetadata,
  priorIssueNumber: number | undefined,
): string {
  const versionContext = [
    `AskRigor: ${candidate.askrigor_version ? escapeMarkdown(candidate.askrigor_version) : "Not supplied"}`,
    ...(candidate.protocol_identities?.length
      ? [
          "Protocols:",
          ...candidate.protocol_identities.map((identity) =>
            `- ${escapeMarkdown(identity.name)} ${escapeMarkdown(identity.version)}` +
            (identity.sha256 ? ` \\(sha256: ${identity.sha256}\\)` : "")
          ),
        ]
      : ["Protocols: Not supplied"]),
  ].join("\n");
  const sections = [
    section("General lesson", escapeMarkdown(candidate.general_lesson)),
    section("Expected behavior", escapeMarkdown(candidate.expected_behavior)),
    section("Failure reason", escapeMarkdown(candidate.failure_reason)),
    section("Synthetic regression", escapeMarkdown(candidate.synthetic_regression_example)),
    section("Evidence basis", escapeMarkdown(candidate.evidence_basis)),
    section("Version context", versionContext),
    section("Privacy gate", escapeMarkdown("Passed before and after model generalization.")),
    ...(priorIssueNumber === undefined
      ? []
      : [section("Prior candidate", escapeMarkdown(publicCandidateId(priorIssueNumber)))]),
    section("Anonymous occurrence count", String(metadata.occurrence_count)),
    section("First seen", metadata.first_seen),
    section("Last seen", metadata.last_seen),
  ];
  return `${sections.join("\n\n")}\n\n${metadataMarker(metadata)}`;
}

function updateGeneratedFields(
  body: string,
  previous: PrivateMetadata,
  next: PrivateMetadata,
): string {
  let updated = replaceLastOwnedValue(
    body,
    "Anonymous occurrence count",
    String(previous.occurrence_count),
    String(next.occurrence_count),
    true,
  );
  updated = replaceLastOwnedValue(updated, "Last seen", previous.last_seen, next.last_seen, false);
  if (!METADATA_PATTERN.test(updated)) {
    throw new GitHubApiError("github_service_unavailable", false);
  }
  return updated.replace(METADATA_PATTERN, `\n${metadataMarker(next)}`);
}

function replaceLastOwnedValue(
  body: string,
  heading: string,
  previous: string,
  next: string,
  rejectFollowingDigit: boolean,
): string {
  const prefix = `\n## ${heading}\n\n`;
  const prefixIndex = body.lastIndexOf(prefix);
  if (prefixIndex < 0) throw new GitHubApiError("github_service_unavailable", false);
  const valueIndex = prefixIndex + prefix.length;
  if (!body.startsWith(previous, valueIndex)) {
    throw new GitHubApiError("github_service_unavailable", false);
  }
  const following = body[valueIndex + previous.length];
  if (rejectFollowingDigit && following !== undefined && /[0-9]/u.test(following)) {
    throw new GitHubApiError("github_service_unavailable", false);
  }
  return body.slice(0, valueIndex) + next + body.slice(valueIndex + previous.length);
}

function parseMatchingIssue(value: Record<string, unknown>, metadata: PrivateMetadata): ListedIssue | undefined {
  if (!isPositiveInteger(value.number) || typeof value.body !== "string") return undefined;
  if (value.state !== "open" && value.state !== "closed") return undefined;
  if (!Array.isArray(value.labels)) return undefined;
  const labels: string[] = [];
  for (const label of value.labels) {
    if (typeof label === "string") labels.push(label);
    else if (isRecord(label) && typeof label.name === "string") labels.push(label.name);
    else return undefined;
  }
  if (!isParseableTimestamp(value.created_at)) return undefined;
  const createdAtMilliseconds = Date.parse(value.created_at);
  return {
    number: value.number,
    body: value.body,
    state: value.state,
    labels,
    createdAtMilliseconds,
    metadata,
  };
}

function parseMetadata(body: string): PrivateMetadata | undefined {
  const match = METADATA_PATTERN.exec(body);
  if (!match) return undefined;
  try {
    const decoded = Buffer.from(match[1]!, "base64url").toString("utf8");
    const value: unknown = JSON.parse(decoded);
    if (!isRecord(value) || Object.keys(value).join(",") !== "fingerprint,occurrence_count,first_seen,last_seen") {
      return undefined;
    }
    if (!FINGERPRINT_PATTERN.test(String(value.fingerprint)) ||
      !isPositiveInteger(value.occurrence_count) ||
      !isCanonicalTimestamp(value.first_seen) ||
      !isCanonicalTimestamp(value.last_seen)) {
      return undefined;
    }
    const metadata: PrivateMetadata = {
      fingerprint: value.fingerprint as string,
      occurrence_count: value.occurrence_count,
      first_seen: value.first_seen,
      last_seen: value.last_seen,
    };
    return metadataMarker(metadata) === `${METADATA_PREFIX}${match[1]} -->` ? metadata : undefined;
  } catch {
    return undefined;
  }
}

function metadataMarker(metadata: PrivateMetadata): string {
  return `${METADATA_PREFIX}${Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url")} -->`;
}

function isActive(issue: ListedIssue): boolean {
  return issue.state === "open" && !issue.labels.some((label) => TERMINAL_LABELS.has(label));
}

function newestIssue(issues: ListedIssue[]): ListedIssue | undefined {
  return issues.reduce<ListedIssue | undefined>((newest, issue) => {
    if (!newest) return issue;
    if (issue.createdAtMilliseconds !== newest.createdAtMilliseconds) {
      return issue.createdAtMilliseconds > newest.createdAtMilliseconds ? issue : newest;
    }
    return issue.number > newest.number ? issue : newest;
  }, undefined);
}

function section(heading: string, value: string): string {
  return `## ${heading}\n\n${value}`;
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/([\\`*_[\]{}()#+\-.!|~])/gu, "\\$1");
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isParseableTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
