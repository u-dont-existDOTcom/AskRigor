import { describe, expect, it } from "vitest";

import {
  LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
  createLessonIncidentEvidence,
  lessonIncidentEvidenceSchema,
  messageSha256,
} from "../apps/research-mcp/src/lessons/incident-contracts.js";

describe("lesson incident caller-supplied message digests", () => {
  it("rejects a digest mismatch instead of silently replacing the caller value", () => {
    const messages = [
      { role: "user" as const, content_utf8: "Question with exact source context." },
      { role: "assistant" as const, content_utf8: "Erroneous answer." },
      { role: "user" as const, content_utf8: "No; the evidence points in the opposite direction." },
    ];
    const input = {
      schema_version: LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
      preservation_status: "EXACT_TRANSCRIPT_PRESERVED" as const,
      window: messages.map((message) => ({ ...message, sha256: "0".repeat(64) })),
      validated_defect: {
        category: "evidence_direction",
        finding: "The answer reversed the direction of the cited evidence.",
        evidence_basis: "The exact correction window establishes the direction error.",
        validated_at: "2026-09-14T18:00:00.000Z",
        validator_provenance: "askrigor-supervisor",
      },
    };

    expect(() => createLessonIncidentEvidence(input, {
      now: () => new Date("2026-09-14T18:01:00.000Z"),
      createIncidentId: () => "ali_serverdigest0001",
    })).toThrow("Message digest does not match exact UTF-8 bytes");

    const corrected = {
      ...input,
      window: messages.map((message) => ({
        ...message,
        sha256: messageSha256(message.content_utf8),
      })),
    };
    const record = createLessonIncidentEvidence(corrected, {
      now: () => new Date("2026-09-14T18:01:00.000Z"),
      createIncidentId: () => "ali_serverdigest0001",
    });

    expect(record.window.map(({ sha256 }) => sha256)).toEqual(
      messages.map(({ content_utf8 }) => messageSha256(content_utf8)),
    );
    expect(() => lessonIncidentEvidenceSchema.parse({
      ...record,
      window: record.window.map((message, index) =>
        index === 0 ? { ...message, sha256: "0".repeat(64) } : message
      ),
    })).toThrow();
  });
});
