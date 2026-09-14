import { describe, expect, it } from "vitest";

import {
  createLessonIncidentActionRoute,
} from "../apps/research-mcp/src/lessons/incident-action-route.js";
import {
  LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
  messageSha256,
} from "../apps/research-mcp/src/lessons/incident-contracts.js";
import {
  LessonIncidentVaultIntegrityError,
} from "../apps/research-mcp/src/lessons/file-incident-vault.js";

describe("lesson incident Action integrity boundary", () => {
  it("returns a nonretryable privacy/security boundary for integrity failures", async () => {
    const route = createLessonIncidentActionRoute({
      capture() {
        throw new LessonIncidentVaultIntegrityError("private diagnostic must stay hidden");
      },
    });

    const result = await route.handle({
      request: {} as never,
      clientIp: "127.0.0.1",
      body: validIncident(),
    });

    expect(result).toEqual({
      status: 422,
      body: {
        status: "invalid_incident",
        retryable: false,
        reason_code: "privacy_or_security_boundary",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private diagnostic");
  });
});

function validIncident() {
  const messages = [
    { role: "user" as const, content_utf8: "What does this source show?" },
    { role: "assistant" as const, content_utf8: "It supports the proposed mechanism." },
    { role: "user" as const, content_utf8: "No, it reports the opposite direction." },
  ];
  return {
    schema_version: LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
    preservation_status: "EXACT_TRANSCRIPT_PRESERVED" as const,
    window: messages.map((message) => ({
      ...message,
      sha256: messageSha256(message.content_utf8),
    })),
    validated_defect: {
      category: "evidence_direction",
      finding: "The answer reversed the direction of the cited evidence.",
      evidence_basis: "The exact correction window establishes the direction error.",
      validated_at: "2026-09-14T18:00:00.000Z",
      validator_provenance: "askrigor-supervisor",
    },
  };
}
