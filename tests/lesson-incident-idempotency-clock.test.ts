import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFileLessonIncidentVault } from
  "../apps/research-mcp/src/lessons/file-incident-vault.js";
import {
  LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
  messageSha256,
} from "../apps/research-mcp/src/lessons/incident-contracts.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("lesson incident idempotency across time", () => {
  it("returns the original incident for an identical retry after the clock advances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "askrigor-incident-idempotency-"));
    temporaryDirectories.push(directory);
    await chmod(directory, 0o700);

    let current = new Date("2026-09-14T18:00:00.000Z");
    const vault = createFileLessonIncidentVault({
      rootDirectory: directory,
      encryptionKey: Buffer.alloc(32, 0x42),
      keyId: "incident-key-v1",
      now: () => current,
    });
    const request = validIncident("retry-key-000001");

    const first = vault.capture(request);
    const firstRecord = vault.read(first.incident_id);
    current = new Date("2026-09-14T18:05:00.000Z");
    const retried = vault.capture(request);

    expect(retried).toEqual(first);
    expect(vault.read(first.incident_id).captured_at).toBe(firstRecord.captured_at);
    expect(firstRecord.captured_at).toBe("2026-09-14T18:00:00.000Z");
  });
});

function validIncident(idempotencyKey: string) {
  const messages = [
    { role: "user" as const, content_utf8: "What does this source show?" },
    { role: "assistant" as const, content_utf8: "It supports the proposed mechanism." },
    { role: "user" as const, content_utf8: "No, it reports the opposite direction." },
  ];
  return {
    schema_version: LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
    idempotency_key: idempotencyKey,
    preservation_status: "EXACT_TRANSCRIPT_PRESERVED" as const,
    window: messages.map((message) => ({
      ...message,
      sha256: messageSha256(message.content_utf8),
    })),
    validated_defect: {
      category: "evidence_direction",
      finding: "The answer reversed the direction of the cited evidence.",
      evidence_basis: "The exact correction window establishes the direction error.",
      validated_at: "2026-09-14T17:55:00.000Z",
      validator_provenance: "askrigor-supervisor",
    },
  };
}
