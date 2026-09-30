import {
  GITHUB_API_ROOT,
  GitHubApiError,
  githubRequestJson,
  isRecord,
  repositoryFullName,
  type GitHubRepository,
  type GitHubTokenProvider,
} from "../lessons/github-app.js";
import type { FindingsRecord } from "./service.js";

/**
 * The findings library's private review queue: one GitHub issue per card,
 * labeled findings-card and pending-review, for the owner to review. A card
 * whose question and claims match an open card's is added to that card as an
 * occurrence comment instead. A save repeated with the same finalization
 * receipt writes nothing new, so a retry cannot count twice.
 */

export const FINDINGS_CARD_LABEL = "findings-card";
export const PENDING_REVIEW_LABEL = "pending-review";

export interface GitHubFindingsSubmission {
  record: FindingsRecord;
  fingerprint: string;
  /** sha256 of the finalization receipt the save came with. */
  receiptSha256: string;
}

export interface GitHubFindingsQueueResult {
  kind: "created" | "existing";
  issueNumber: number;
  occurrenceCount: number;
}

export interface GitHubFindingsQueueOptions {
  tokenProvider: GitHubTokenProvider;
  fetch: typeof fetch;
  repository: GitHubRepository;
}

interface CardMetadata {
  fingerprint: string;
  receipt_sha256: string;
  saved_at: string;
}

interface OccurrenceMetadata extends CardMetadata {
  occurrence_count: number;
}

const HEX_64 = /^[a-f0-9]{64}$/u;
const CARD_MARKER = "askrigor-findings-card";
const OCCURRENCE_MARKER = "askrigor-findings-occurrence";
const MAX_TITLE_CHARACTERS = 256;
// GitHub refuses an issue or comment body over 65,536 characters.
const MAX_BODY_CHARACTERS = 60_000;

/** The only identifier the save tool shows: the issue number, as ARF-0042. */
export function publicFindingsCardId(issueNumber: number): string {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new GitHubApiError("github_service_unavailable", false);
  }
  return `ARF-${String(issueNumber).padStart(4, "0")}`;
}

/** A single-writer queue: saves run one at a time in this process, each listing before it writes. */
export class GitHubFindingsQueue {
  private writer: Promise<void> = Promise.resolve();
  private readonly issuesPath: string;

  constructor(private readonly options: GitHubFindingsQueueOptions) {
    this.issuesPath = `/repos/${repositoryFullName(options.repository)}/issues`;
  }

  submit(input: GitHubFindingsSubmission): Promise<GitHubFindingsQueueResult> {
    const result = this.writer.then(() => this.submitSerialized(input));
    this.writer = result.then(() => undefined, () => undefined);
    return result;
  }

  private async submitSerialized(input: GitHubFindingsSubmission): Promise<GitHubFindingsQueueResult> {
    if (!HEX_64.test(input.fingerprint) || !HEX_64.test(input.receiptSha256)) {
      throw new GitHubApiError("github_service_unavailable", false);
    }
    const open = await this.findOpenCard(input.fingerprint);
    return open === undefined
      ? await this.createCard(input)
      : await this.addOccurrence(open.number, open.metadata, input);
  }

  private async findOpenCard(fingerprint: string): Promise<{ number: number; metadata: CardMetadata } | undefined> {
    let found: { number: number; metadata: CardMetadata } | undefined;
    for (let page = 1; ; page += 1) {
      const response = await this.request(
        `${this.issuesPath}?state=open&labels=${FINDINGS_CARD_LABEL}&per_page=100&page=${page}`,
        { method: "GET" },
      );
      if (!Array.isArray(response)) throw new GitHubApiError("github_service_unavailable", true);
      for (const issue of response) {
        if (!isRecord(issue) || "pull_request" in issue || typeof issue.body !== "string" ||
          !isPositiveInteger(issue.number)) {
          continue;
        }
        const metadata = parseMarker(issue.body, CARD_MARKER, parseCardMetadata);
        // The oldest open card with this fingerprint collects its occurrences.
        if (metadata?.fingerprint === fingerprint && (found === undefined || issue.number < found.number)) {
          found = { number: issue.number, metadata };
        }
      }
      if (response.length < 100) break;
    }
    return found;
  }

  private async addOccurrence(
    issueNumber: number,
    card: CardMetadata,
    input: GitHubFindingsSubmission,
  ): Promise<GitHubFindingsQueueResult> {
    if (card.receipt_sha256 === input.receiptSha256) {
      return { kind: "created", issueNumber, occurrenceCount: 1 };
    }
    let highestCount = 1;
    for (let page = 1; ; page += 1) {
      const response = await this.request(
        `${this.issuesPath}/${issueNumber}/comments?per_page=100&page=${page}`,
        { method: "GET" },
      );
      if (!Array.isArray(response)) throw new GitHubApiError("github_service_unavailable", true);
      for (const comment of response) {
        if (!isRecord(comment) || typeof comment.body !== "string") continue;
        const occurrence = parseMarker(comment.body, OCCURRENCE_MARKER, parseOccurrenceMetadata);
        if (occurrence?.fingerprint !== input.fingerprint) continue;
        if (occurrence.receipt_sha256 === input.receiptSha256) {
          return { kind: "existing", issueNumber, occurrenceCount: occurrence.occurrence_count };
        }
        highestCount = Math.max(highestCount, occurrence.occurrence_count);
      }
      if (response.length < 100) break;
    }
    const occurrence: OccurrenceMetadata = {
      fingerprint: input.fingerprint,
      receipt_sha256: input.receiptSha256,
      saved_at: input.record.stamp.saved_at,
      occurrence_count: highestCount + 1,
    };
    const created = await this.request(`${this.issuesPath}/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: occurrenceComment(input.record, occurrence) }),
    });
    if (!isRecord(created) || !isPositiveInteger(created.id)) {
      throw new GitHubApiError("github_service_unavailable", true);
    }
    return { kind: "existing", issueNumber, occurrenceCount: occurrence.occurrence_count };
  }

  private async createCard(input: GitHubFindingsSubmission): Promise<GitHubFindingsQueueResult> {
    const metadata: CardMetadata = {
      fingerprint: input.fingerprint,
      receipt_sha256: input.receiptSha256,
      saved_at: input.record.stamp.saved_at,
    };
    const response = await this.request(this.issuesPath, {
      method: "POST",
      body: JSON.stringify({
        title: issueTitle(input.record.card.question),
        body: cardIssueBody(input.record, metadata),
        labels: [FINDINGS_CARD_LABEL, PENDING_REVIEW_LABEL],
      }),
    });
    if (!isRecord(response) || !isPositiveInteger(response.number)) {
      throw new GitHubApiError("github_service_unavailable", true);
    }
    return { kind: "created", issueNumber: response.number, occurrenceCount: 1 };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let token: string;
    try {
      token = await this.options.tokenProvider.getToken();
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubApiError("github_auth_unavailable", false);
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return await githubRequestJson(this.options.fetch, `${GITHUB_API_ROOT}${path}`, { ...init, headers });
  }
}

function cardIssueBody(record: FindingsRecord, metadata: CardMetadata): string {
  const tail = `## Full record\n\n${fencedJson(record)}\n\n${marker(CARD_MARKER, metadata)}`;
  const full = `${readableCard(record)}\n\n${readableStamp(record)}\n\n## Review\n\nPending the owner's review: ` +
    `nothing in this card is accepted until then.\n\n${tail}`;
  return boundedBody(full, tail);
}

function occurrenceComment(record: FindingsRecord, metadata: OccurrenceMetadata): string {
  const tail = `## Full record\n\n${fencedJson(record)}\n\n${marker(OCCURRENCE_MARKER, metadata)}`;
  const full = `## Saved again\n\nOccurrence ${metadata.occurrence_count}: the same question and claims, saved ` +
    `again after another checked answer.\n\n${readableStamp(record)}\n\n${tail}`;
  return boundedBody(full, tail);
}

/** The readable body if it fits; otherwise the full record alone; otherwise nothing is written. */
function boundedBody(full: string, tail: string): string {
  if (full.length <= MAX_BODY_CHARACTERS) return full;
  const short = `Too long to show here; the full record follows.\n\n${tail}`;
  if (short.length <= MAX_BODY_CHARACTERS) return short;
  throw new GitHubApiError("github_service_unavailable", false);
}

function readableCard(record: FindingsRecord): string {
  const { card } = record;
  return [
    section("Question", escapeMarkdown(card.question)),
    section("Usual answer", escapeMarkdown(card.usual_answer)),
    ...card.findings.map((finding, index) => section(`Finding ${index + 1}`, [
      `- Claim: ${escapeMarkdown(finding.claim)}`,
      `- Certainty: ${escapeMarkdown(finding.certainty)}`,
      `- Applies to: ${escapeMarkdown(finding.applies_to)}`,
      `- In the answer: ${escapeMarkdown(finding.answer_quote)}`,
      `- Sources: ${finding.sources.map(escapeMarkdown).join(", ")}`,
      `- Why the usual answer misses it: ${escapeMarkdown(finding.why_not_usual)}`,
      `- Tags: ${finding.tags.length === 0 ? "none" : finding.tags.map(escapeMarkdown).join(", ")}`,
      `- What would change it: ${escapeMarkdown(finding.what_would_change_it)}`,
    ].join("\n"))),
    ...(card.open_leads.length === 0
      ? []
      : [section("Open leads", card.open_leads.map((lead) => `- ${escapeMarkdown(lead)}`).join("\n"))]),
  ].join("\n\n");
}

function readableStamp(record: FindingsRecord): string {
  const { stamp } = record;
  const research = stamp.research;
  const counts = [
    research.receipts_verified === undefined ? undefined : `${research.receipts_verified} receipts verified`,
    research.validated_sources === undefined ? undefined : `${research.validated_sources} validated sources`,
    research.lead_sources === undefined ? undefined : `${research.lead_sources} lead sources`,
    research.material_videos === undefined ? undefined : `${research.material_videos} material videos`,
  ].filter((count): count is string => count !== undefined);
  return section("Version stamp", [
    `- Saved at: ${stamp.saved_at}`,
    `- AskRigor: version ${escapeMarkdown(stamp.askrigor_version)}, build ${escapeMarkdown(stamp.askrigor_build)}`,
    ...stamp.protocols.map((protocol) =>
      `- Protocol: ${escapeMarkdown(protocol.name)} ${escapeMarkdown(protocol.version)} \\(sha256 ${protocol.sha256}\\)`),
    `- Tool catalog sha256: ${stamp.tool_catalog_sha256}`,
    `- Surface: ${escapeMarkdown(stamp.surface)}`,
    `- Model, as the app reported it \\(not verified\\): ` +
      `${stamp.reported_model_unverified === undefined ? "not given" : escapeMarkdown(stamp.reported_model_unverified)}`,
    `- Research: ${escapeMarkdown([research.depth ?? "depth unknown", research.status ?? "status unknown"].join(", "))}` +
      `${counts.length === 0 ? "" : `; ${counts.join(", ")}`}; finalized at ${research.finalized_at}`,
  ].join("\n"));
}

/** Fenced JSON whose fence is longer than any run of backticks inside, so no text can close it early. */
function fencedJson(record: FindingsRecord): string {
  const json = JSON.stringify(record, null, 2);
  let longest = 0;
  for (const [run] of json.matchAll(/`+/gu)) longest = Math.max(longest, run.length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}json\n${json}\n${fence}`;
}

function issueTitle(question: string): string {
  const codePoints = [...question];
  return codePoints.length <= MAX_TITLE_CHARACTERS
    ? question
    : `${codePoints.slice(0, MAX_TITLE_CHARACTERS - 1).join("")}…`;
}

function section(heading: string, value: string): string {
  return `## ${heading}\n\n${value}`;
}

/** Markdown-safe text: no formatting, links, HTML or mentions take effect. */
function escapeMarkdown(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(/([\\`*_[\]{}()#+\-.!|~])/gu, "\\$1")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/@/gu, "&#64;");
}

function marker(name: string, metadata: CardMetadata | OccurrenceMetadata): string {
  return `<!-- ${name}:${Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url")} -->`;
}

/** The metadata a body ends with, as this queue wrote it; undefined for anything else. */
function parseMarker<T>(body: string, name: string, parse: (value: Record<string, unknown>) => T | undefined): T | undefined {
  // An edit in GitHub's editor may leave a line break after it.
  const match = new RegExp(`\\n<!-- ${name}:([A-Za-z0-9_-]{1,2048}) -->\\s*$`, "u").exec(body);
  if (match === null) return undefined;
  try {
    const value: unknown = JSON.parse(Buffer.from(match[1]!, "base64url").toString("utf8"));
    return isRecord(value) ? parse(value) : undefined;
  } catch {
    return undefined;
  }
}

function parseCardMetadata(value: Record<string, unknown>): CardMetadata | undefined {
  return typeof value.fingerprint === "string" && HEX_64.test(value.fingerprint) &&
    typeof value.receipt_sha256 === "string" && HEX_64.test(value.receipt_sha256) &&
    typeof value.saved_at === "string"
    ? { fingerprint: value.fingerprint, receipt_sha256: value.receipt_sha256, saved_at: value.saved_at }
    : undefined;
}

function parseOccurrenceMetadata(value: Record<string, unknown>): OccurrenceMetadata | undefined {
  const card = parseCardMetadata(value);
  return card !== undefined && isPositiveInteger(value.occurrence_count)
    ? { ...card, occurrence_count: value.occurrence_count }
    : undefined;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}
