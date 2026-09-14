import { describe, expect, it } from "vitest";

import type { GeneralizedLesson } from
  "../apps/research-mcp/src/lessons/contracts.js";
import { GitHubLessonQueue } from
  "../apps/research-mcp/src/lessons/github-lessons.js";

const fingerprint = "f".repeat(64);
const observedAt = "2026-09-14T18:30:00.000Z";

function candidate(incidentId: string, digestCharacter = "a"): GeneralizedLesson {
  return {
    category: "evidence_weighting",
    general_lesson: "When source evidence points in a specific direction, AskRigor should preserve that direction in its conclusion.",
    expected_behavior: "Keep the source-supported direction intact through synthesis and distinguish it from unsupported alternatives or mechanisms.",
    failure_reason: "The response reversed the direction of the cited evidence after retrieval.",
    synthetic_regression_example: "A source reports inhibition, but the final answer rewrites it as promotion without supporting evidence.",
    evidence_basis: "source_recheck",
    incident_provenance: {
      incident_id: incidentId,
      incident_sha256: digestCharacter.repeat(64),
      preservation_status: "EXACT_TRANSCRIPT_PRESERVED",
    },
    consent_scope: "once",
  };
}

interface StoredIssue {
  number: number;
  title: string;
  body: string;
  state: "open";
  labels: Array<{ name: string }>;
  created_at: string;
}

class FakeGitHub {
  issue?: StoredIssue;
  comments: Array<{ id: number; body: string; created_at: string }> = [];
  postIssueCount = 0;
  postCommentCount = 0;

  readonly fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));

    if (method === "GET" && url.includes("/issues?state=all")) {
      return json(this.issue === undefined ? [] : [this.issue]);
    }
    if (method === "POST" && url.endsWith("/issues")) {
      this.postIssueCount += 1;
      const request = body as { title: string; body: string; labels: string[] };
      this.issue = {
        number: 1,
        title: request.title,
        body: request.body,
        state: "open",
        labels: request.labels.map((name) => ({ name })),
        created_at: observedAt,
      };
      return json(this.issue, 201);
    }
    if (method === "GET" && url.endsWith("/issues/1")) {
      return json(this.issue);
    }
    if (method === "GET" && url.includes("/issues/1/comments?")) {
      return json(this.comments);
    }
    if (method === "POST" && url.endsWith("/issues/1/comments")) {
      this.postCommentCount += 1;
      const comment = {
        id: this.comments.length + 100,
        body: (body as { body: string }).body,
        created_at: observedAt,
      };
      this.comments.push(comment);
      return json(comment, 201);
    }
    throw new Error(`Unexpected fake GitHub request: ${method} ${url}`);
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("opaque incident occurrence idempotency", () => {
  it("does not count the same preserved incident twice, but counts a distinct incident", async () => {
    const github = new FakeGitHub();
    const queue = new GitHubLessonQueue({
      tokenProvider: { getToken: async () => "test-token" },
      fetch: github.fetch,
      now: () => new Date(observedAt),
    });
    const firstCandidate = candidate("ali_occurrence00000001");

    await expect(queue.submit({ candidate: firstCandidate, fingerprint })).resolves.toMatchObject({
      kind: "created",
      occurrenceCount: 1,
    });
    await expect(queue.submit({ candidate: firstCandidate, fingerprint })).resolves.toMatchObject({
      kind: "existing",
      occurrenceCount: 1,
    });
    expect(github.postIssueCount).toBe(1);
    expect(github.postCommentCount).toBe(0);

    await expect(queue.submit({
      candidate: candidate("ali_occurrence00000002", "b"),
      fingerprint,
    })).resolves.toMatchObject({
      kind: "existing",
      occurrenceCount: 2,
    });
    expect(github.postCommentCount).toBe(1);
  });
});
