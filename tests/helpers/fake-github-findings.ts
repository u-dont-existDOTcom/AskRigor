// GitHub's issue API for the private findings repository, in memory: what the findings library's queue
// (findings/github-findings.ts) and the owner's review (findings/github-findings-review.ts) call. It uses no test
// runner, so the Atlas scenario (tests/helpers/atlas-scenario.ts) can run it outside vitest too.

export const FINDINGS_ISSUES_ROOT = "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-findings/issues";

export interface FakeIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  state_reason?: string;
  labels: Array<{ name: string }>;
  /** Set on a pull request, which the issues API lists too. */
  pull_request?: Record<string, unknown>;
}

export interface FakeComment {
  id: number;
  body: string;
}

export interface FakeWrite {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FakeGitHub: ${message}`);
}

const escaped = FINDINGS_ISSUES_ROOT.replace(/[.]/gu, "\\.");
const ISSUE = new RegExp(`^${escaped}/(\\d+)$`, "u");
const LABELS = new RegExp(`^${escaped}/(\\d+)/labels$`, "u");
const COMMENTS = new RegExp(`^${escaped}/(\\d+)/comments(?:\\?.*)?$`, "u");

/** The findings repository's issues, comments and labels, with every write it receives listed in order. */
export class FakeGitHub {
  readonly issues: FakeIssue[] = [];
  readonly comments = new Map<number, FakeComment[]>();
  readonly writes: FakeWrite[] = [];
  /** Answers every request with this status and a private upstream body. */
  failWith?: number;
  /** Answers the requests it names with that status, and the others as usual. */
  failWhen?: (request: { method: string; url: string }) => number | undefined;
  private nextNumber: number;
  private nextComment = 1;

  constructor(options: { firstIssueNumber?: number } = {}) {
    this.nextNumber = options.firstIssueNumber ?? 42;
  }

  /** An issue by number. */
  issue(number: number): FakeIssue {
    const issue = this.issues.find((candidate) => candidate.number === number);
    check(issue !== undefined, `no issue ${number}`);
    return issue!;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (this.failWith !== undefined) return json({ message: "private upstream body" }, this.failWith);
    const injected = this.failWhen?.({ method, url });
    if (injected !== undefined) return json({ message: "private upstream body" }, injected);
    const body = init?.body === undefined ? {} : JSON.parse(String(init.body)) as Record<string, unknown>;
    const withCount = (issue: FakeIssue) => ({ ...issue, comments: this.comments.get(issue.number)?.length ?? 0 });

    if (method === "GET" && url.startsWith(`${FINDINGS_ISSUES_ROOT}?`)) {
      const query = new URL(url).searchParams;
      check(query.get("state") === "open", "the open cards are listed");
      check(query.get("labels") === "findings-card", "the findings cards are listed by label");
      const page = Number(query.get("page"));
      return json(this.issues
        .filter((issue) => issue.state === "open" && issue.labels.some(({ name }) => name === "findings-card"))
        .slice((page - 1) * 100, page * 100)
        .map(withCount));
    }
    if (method === "POST" && url === FINDINGS_ISSUES_ROOT) {
      this.writes.push({ method, url, body });
      const issue: FakeIssue = {
        number: this.nextNumber++,
        title: String(body.title),
        body: String(body.body),
        state: "open",
        labels: (body.labels as string[]).map((name) => ({ name })),
      };
      this.issues.push(issue);
      return json(issue, 201);
    }
    const issueMatch = ISSUE.exec(url);
    if (issueMatch !== null && method === "GET") {
      const issue = this.issues.find(({ number }) => number === Number(issueMatch[1]));
      return issue === undefined ? json({ message: "Not Found" }, 404) : json(withCount(issue));
    }
    if (issueMatch !== null && method === "PATCH") {
      this.writes.push({ method, url, body });
      const issue = this.issue(Number(issueMatch[1]));
      const { labels, ...rest } = body;
      Object.assign(issue, rest);
      if (Array.isArray(labels)) issue.labels = (labels as string[]).map((name) => ({ name }));
      return json(withCount(issue));
    }
    const labelsMatch = LABELS.exec(url);
    if (labelsMatch !== null && method === "POST") {
      this.writes.push({ method, url, body });
      const issue = this.issue(Number(labelsMatch[1]));
      for (const name of body.labels as string[]) {
        if (!issue.labels.some((label) => label.name === name)) issue.labels.push({ name });
      }
      return json(issue.labels);
    }
    const commentsMatch = COMMENTS.exec(url);
    if (commentsMatch !== null && method === "GET") {
      const page = Number(new URL(url).searchParams.get("page"));
      return json((this.comments.get(Number(commentsMatch[1])) ?? []).slice((page - 1) * 100, page * 100));
    }
    if (commentsMatch !== null && method === "POST") {
      this.writes.push({ method, url, body });
      const list = this.comments.get(Number(commentsMatch[1])) ?? [];
      const comment = { id: this.nextComment++, body: String(body.body) };
      list.push(comment);
      this.comments.set(Number(commentsMatch[1]), list);
      return json(comment, 201);
    }
    throw new Error(`FakeGitHub: unexpected request ${method} ${url}`);
  };
}

/** The JSON record a card issue or a later save's comment carries, as the library wrote it. */
export function storedRecordOf(body: string): unknown {
  const match = /(`{3,})json\n([\s\S]*?)\n\1/u.exec(body);
  check(match !== null, "the body carries a record");
  return JSON.parse(match![2]!);
}
