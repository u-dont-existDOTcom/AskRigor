import type { GeneralizedLesson } from "./contracts.js";
import {
  GITHUB_API_ROOT,
  GitHubApiError,
  GitHubWriteConflictError,
  LESSON_REPOSITORY_FULL_NAME,
  githubRequestJsonResponse,
  isRecord,
  type GitHubJsonResponse,
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
  incident_occurrences?: IncidentOccurrenceMetadata[];
}

interface OccurrenceMetadata {
  fingerprint: string;
  occurrence_count: number;
  observed_at: string;
  incident_occurrence?: IncidentOccurrenceMetadata;
}

interface IncidentOccurrenceMetadata {
  incident_id: string;
  incident_sha256: string;
  preservation_status: string;
  observed_at: string;
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
const GENERATED_COUNT_START = "<!-- askrigor-generated-occurrence-count:start -->";
const GENERATED_COUNT_END = "<!-- askrigor-generated-occurrence-count:end -->";
const GENERATED_LAST_SEEN_START = "<!-- askrigor-generated-last-seen:start -->";
const GENERATED_LAST_SEEN_END = "<!-- askrigor-generated-last-seen:end -->";
const OCCURRENCE_PREFIX = "<!-- askrigor-lesson-occurrence:";
const OCCURRENCE_PATTERN = /\n<!-- askrigor-lesson-occurrence:([A-Za-z0-9_-]+) -->$/u;
const MAX_WRITE_ATTEMPTS = 3;
const MAX_ISSUE_TITLE_CHARACTERS = 256;

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
    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
      try {
        return await this.submitAttempt(input, observedAt);
      } catch (error) {
        if (!(error instanceof GitHubWriteConflictError) || attempt === MAX_WRITE_ATTEMPTS) throw error;
      }
    }
    throw new GitHubApiError("github_service_unavailable", true);
  }

  private async submitAttempt(
    input: GitHubLessonSubmission,
    observedAt: string,
  ): Promise<GitHubLessonQueueResult> {
    const issues = await this.listAllIssues(input.fingerprint);
    const active = newestIssue(issues.filter((issue) => isActive(issue)));
    if (active) return await this.updateActiveIssue(active, input, observedAt);

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

  private async updateActiveIssue(
    listedIssue: ListedIssue,
    input: GitHubLessonSubmission,
    observedAt: string,
  ): Promise<GitHubLessonQueueResult> {
    const response = await this.request(`${ISSUES_PATH}/${listedIssue.number}`, { method: "GET" });
    if (!isRecord(response) || typeof response.body !== "string") {
      throw new GitHubApiError("github_service_unavailable", true);
    }
    const currentMetadata = parseMetadata(response.body);
    if (!currentMetadata || currentMetadata.fingerprint !== input.fingerprint) {
      throw new GitHubApiError("github_service_unavailable", false);
    }
    const issue = parseMatchingIssue(response, currentMetadata);
    if (!issue) throw new GitHubApiError("github_service_unavailable", false);
    if (!isActive(issue)) throw new GitHubWriteConflictError();

    const stored = await this.storedOccurrenceState(issue, input);
    if (stored.incidentAlreadyRecorded) {
      return {
        kind: "existing",
        issueNumber: issue.number,
        occurrenceCount: stored.highestCount,
        possibleRegression: issue.labels.includes("possible-regression"),
      };
    }

    const occurrenceCount = stored.highestCount + 1;
    if (!isPositiveInteger(occurrenceCount)) {
      throw new GitHubApiError("github_service_unavailable", false);
    }
    const metadata: OccurrenceMetadata = {
      fingerprint: issue.metadata.fingerprint,
      occurrence_count: occurrenceCount,
      observed_at: observedAt,
      ...(input.candidate.incident_provenance === undefined
        ? {}
        : { incident_occurrence: incidentOccurrence(input.candidate, observedAt) }),
    };
    const created = await this.request(`${ISSUES_PATH}/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: buildOccurrenceComment(metadata) }),
    });
    if (!isRecord(created) || !isPositiveInteger(created.id)) {
      throw new GitHubApiError("github_service_unavailable", true);
    }
    return {
      kind: "existing",
      issueNumber: issue.number,
      occurrenceCount,
      possibleRegression: issue.labels.includes("possible-regression"),
    };
  }

  private async storedOccurrenceState(
    issue: ListedIssue,
    input: GitHubLessonSubmission,
  ): Promise<{ highestCount: number; incidentAlreadyRecorded: boolean }> {
    let highestCount = issue.metadata.occurrence_count;
    let incidentAlreadyRecorded = false;

    for (const occurrence of issue.metadata.incident_occurrences ?? []) {
      const comparison = compareIncidentOccurrence(occurrence, input.candidate);
      if (comparison === "conflict") {
        throw new GitHubApiError("github_service_unavailable", false);
      }
      if (comparison === "same") incidentAlreadyRecorded = true;
    }

    for (let page = 1; ; page += 1) {
      const response = await this.request(
        `${ISSUES_PATH}/${issue.number}/comments?per_page=100&page=${page}`,
        { method: "GET" },
      );
      if (!Array.isArray(response)) throw new GitHubApiError("github_service_unavailable", true);
      for (const value of response) {
        if (!isRecord(value) || typeof value.body !== "string") {
          throw new GitHubApiError("github_service_unavailable", true);
        }
        const metadata = parseOccurrenceMetadata(value.body);
        if (metadata?.fingerprint !== input.fingerprint) continue;
        highestCount = Math.max(highestCount, metadata.occurrence_count);
        if (metadata.incident_occurrence !== undefined) {
          const comparison = compareIncidentOccurrence(metadata.incident_occurrence, input.candidate);
          if (comparison === "conflict") {
            throw new GitHubApiError("github_service_unavailable", false);
          }
          if (comparison === "same") incidentAlreadyRecorded = true;
        }
      }
      if (response.length < 100) break;
    }
    return { highestCount, incidentAlreadyRecorded };
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
        title: issueTitle(input.candidate),
        body: buildIssueBody(
          input.candidate,
          {
            fingerprint: input.fingerprint,
            occurrence_count: 1,
            first_seen: observedAt,
            last_seen: observedAt,
            ...(input.candidate.incident_provenance === undefined
              ? {}
              : { incident_occurrences: [incidentOccurrence(input.candidate, observedAt)] }),
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
    return (await this.requestResponse(path, init)).value;
  }

  private async requestResponse(path: string, init: RequestInit): Promise<GitHubJsonResponse> {
    let token: string;
    try {
      token = await this.options.tokenProvider.getToken();
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubApiError("github_auth_unavailable", false);
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return await githubRequestJsonResponse(this.options.fetch, `${GITHUB_API_ROOT}${path}`, {
      ...init,
      headers,
    });
  }

  private safeTimestamp(): string {
    let value: Date;
    try {
      value = this.now();
    } catch {
      throw new GitHubApiError("github_service_unavailable", false);
    }
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
    ...(metadata.incident_occurrences?.length
      ? [section(
          "Opaque incident provenance",
          metadata.incident_occurrences.map(formatIncidentOccurrence).join("\n"),
        )]
      : []),
    section("Anonymous occurrence count", ownedValue(
      GENERATED_COUNT_START,
      String(metadata.occurrence_count),
      GENERATED_COUNT_END,
    )),
    section("First seen", metadata.first_seen),
    section("Last seen", ownedValue(
      GENERATED_LAST_SEEN_START,
      metadata.last_seen,
      GENERATED_LAST_SEEN_END,
    )),
  ];
  return `${sections.join("\n\n")}\n\n${metadataMarker(metadata)}`;
}

function buildOccurrenceComment(metadata: OccurrenceMetadata): string {
  return [
    "## Anonymous lesson occurrence",
    "",
    `Occurrence count: ${metadata.occurrence_count}`,
    `Observed at: ${metadata.observed_at}`,
    ...(metadata.incident_occurrence === undefined
      ? []
      : ["", "Opaque incident provenance:", formatIncidentOccurrence(metadata.incident_occurrence)]),
    "",
    occurrenceMetadataMarker(metadata),
  ].join("\n");
}

function issueTitle(candidate: GeneralizedLesson): string {
  const prefix = `[${candidate.category}] `;
  const codePoints = [...candidate.general_lesson];
  const available = MAX_ISSUE_TITLE_CHARACTERS - [...prefix].length;
  if (codePoints.length <= available) return `${prefix}${candidate.general_lesson}`;
  return `${prefix}${codePoints.slice(0, available - 1).join("")}…`;
}

function ownedValue(startMarker: string, value: string, endMarker: string): string {
  return `${startMarker}\n${value}\n${endMarker}`;
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
    if (!isRecord(value) || !metadataKeysAreValid(value, [
      "fingerprint",
      "occurrence_count",
      "first_seen",
      "last_seen",
      "incident_occurrences",
    ])) {
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
      ...(parseIncidentOccurrences(value.incident_occurrences, value.last_seen) === undefined
        ? {}
        : { incident_occurrences: parseIncidentOccurrences(value.incident_occurrences, value.last_seen) }),
    };
    return metadataMarker(metadata) === `${METADATA_PREFIX}${match[1]} -->` ? metadata : undefined;
  } catch {
    return undefined;
  }
}

function metadataMarker(metadata: PrivateMetadata): string {
  return `${METADATA_PREFIX}${Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url")} -->`;
}

function parseOccurrenceMetadata(body: string): OccurrenceMetadata | undefined {
  const prefixCount = body.split(OCCURRENCE_PREFIX).length - 1;
  if (prefixCount === 0) return undefined;
  if (prefixCount !== 1) throw new GitHubApiError("github_service_unavailable", false);
  const match = OCCURRENCE_PATTERN.exec(body);
  if (!match) throw new GitHubApiError("github_service_unavailable", false);
  try {
    const decoded = Buffer.from(match[1]!, "base64url").toString("utf8");
    const value: unknown = JSON.parse(decoded);
    if (!isRecord(value) || !metadataKeysAreValid(value, [
      "fingerprint",
      "occurrence_count",
      "observed_at",
      "incident_occurrence",
    ])) {
      throw new GitHubApiError("github_service_unavailable", false);
    }
    if (!FINGERPRINT_PATTERN.test(String(value.fingerprint)) ||
      !isPositiveInteger(value.occurrence_count) ||
      !isCanonicalTimestamp(value.observed_at)) {
      throw new GitHubApiError("github_service_unavailable", false);
    }
    const metadata: OccurrenceMetadata = {
      fingerprint: value.fingerprint as string,
      occurrence_count: value.occurrence_count,
      observed_at: value.observed_at,
      ...(parseIncidentOccurrence(value.incident_occurrence, value.observed_at) === undefined
        ? {}
        : { incident_occurrence: parseIncidentOccurrence(value.incident_occurrence, value.observed_at) }),
    };
    if (occurrenceMetadataMarker(metadata) !== `${OCCURRENCE_PREFIX}${match[1]} -->`) {
      throw new GitHubApiError("github_service_unavailable", false);
    }
    return metadata;
  } catch (error) {
    if (error instanceof GitHubApiError) throw error;
    throw new GitHubApiError("github_service_unavailable", false);
  }
}

function occurrenceMetadataMarker(metadata: OccurrenceMetadata): string {
  return `${OCCURRENCE_PREFIX}${Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url")} -->`;
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

function incidentOccurrence(candidate: GeneralizedLesson, observedAt: string): IncidentOccurrenceMetadata {
  const provenance = candidate.incident_provenance!;
  return {
    incident_id: provenance.incident_id,
    incident_sha256: provenance.incident_sha256,
    preservation_status: provenance.preservation_status,
    observed_at: observedAt,
  };
}

function compareIncidentOccurrence(
  metadata: IncidentOccurrenceMetadata,
  candidate: GeneralizedLesson,
): "same" | "conflict" | "different" {
  const provenance = candidate.incident_provenance;
  if (provenance === undefined || metadata.incident_id !== provenance.incident_id) {
    return "different";
  }
  return metadata.incident_sha256 === provenance.incident_sha256 &&
    metadata.preservation_status === provenance.preservation_status
    ? "same"
    : "conflict";
}

function formatIncidentOccurrence(metadata: IncidentOccurrenceMetadata): string {
  return [
    `- Incident: ${escapeMarkdown(metadata.incident_id)}`,
    `digest ${metadata.incident_sha256}`,
    `status ${escapeMarkdown(metadata.preservation_status)}`,
    `observed ${metadata.observed_at}`,
  ].join("; ");
}

function parseIncidentOccurrences(
  value: unknown,
  fallbackObservedAt: unknown,
): IncidentOccurrenceMetadata[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new GitHubApiError("github_service_unavailable", false);
  return value.map((item) => parseIncidentOccurrence(item, fallbackObservedAt) ??
    raiseInvalidIncidentMetadata());
}

function parseIncidentOccurrence(
  value: unknown,
  fallbackObservedAt: unknown,
): IncidentOccurrenceMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !metadataKeysAreValid(value, [
    "incident_id",
    "incident_sha256",
    "preservation_status",
    "observed_at",
  ])) {
    throw new GitHubApiError("github_service_unavailable", false);
  }
  const observedAt = value.observed_at ?? fallbackObservedAt;
  if (
    typeof value.incident_id !== "string" ||
    !/^[A-Za-z0-9_-]{16,96}$/u.test(value.incident_id) ||
    typeof value.incident_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.incident_sha256) ||
    ![
      "EXACT_TRANSCRIPT_PRESERVED",
      "PARTIAL_TRANSCRIPT_PRESERVED",
      "LESSON_ONLY_NO_TRANSCRIPT",
      "RAW_INCIDENT_NOT_PRESERVED",
    ].includes(String(value.preservation_status)) ||
    !isCanonicalTimestamp(observedAt)
  ) {
    throw new GitHubApiError("github_service_unavailable", false);
  }
  return {
    incident_id: value.incident_id,
    incident_sha256: value.incident_sha256,
    preservation_status: String(value.preservation_status),
    observed_at: observedAt,
  };
}

function metadataKeysAreValid(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function raiseInvalidIncidentMetadata(): never {
  throw new GitHubApiError("github_service_unavailable", false);
}

function isParseableTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
