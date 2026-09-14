import { chmod, copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFileLessonIncidentVault } from
  "../apps/research-mcp/src/lessons/file-incident-vault.js";
import {
  LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
  lessonIncidentCaptureRequestSchema,
  messageSha256,
} from "../apps/research-mcp/src/lessons/incident-contracts.js";

const directories: string[] = [];
const key = Buffer.alloc(32, 0x35);

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("private lesson incident durability boundary", () => {
  it("restores ciphertext plus idempotency metadata and preserves exact retry identity", async () => {
    const source = await privateDirectory("askrigor-incident-backup-source-");
    const restored = await privateDirectory("askrigor-incident-backup-restored-");
    const request = exactIncident("backup-restore-key-0001");
    const sourceVault = createFileLessonIncidentVault({
      rootDirectory: source,
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: () => new Date("2026-09-14T16:30:00.000Z"),
    });

    const captured = sourceVault.capture(request);
    for (const name of await readdir(source)) {
      await copyFile(join(source, name), join(restored, name));
      await chmod(join(restored, name), 0o600);
    }

    const restoredVault = createFileLessonIncidentVault({
      rootDirectory: restored,
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: () => new Date("2026-09-15T12:00:00.000Z"),
    });

    expect(restoredVault.read(captured.incident_id).incident_sha256)
      .toBe(captured.incident_sha256);
    expect(restoredVault.capture(request)).toEqual(captured);
    expect(restoredVault.inventory()).toEqual([captured]);
  });

  it("rejects no-transcript preservation states at the raw incident capture boundary", () => {
    for (const preservation_status of [
      "LESSON_ONLY_NO_TRANSCRIPT",
      "RAW_INCIDENT_NOT_PRESERVED",
    ]) {
      expect(lessonIncidentCaptureRequestSchema.safeParse({
        ...exactIncident("capture-state-boundary-0001"),
        preservation_status,
      }).success).toBe(false);
    }
  });
});

function exactIncident(idempotencyKey: string) {
  const messages = [
    { role: "user" as const, content_utf8: "What follows from the supplied evidence?" },
    { role: "assistant" as const, content_utf8: "The earlier event is explained by the later marker." },
    { role: "user" as const, content_utf8: "That reverses the represented timing constraint." },
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
      finding: "The answer reversed the represented timing constraint.",
      evidence_basis: "Validated from the exact synthetic incident window.",
      validated_at: "2026-09-14T16:31:00.000Z",
      validator_provenance: "synthetic-regression",
    },
  };
}

async function privateDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  directories.push(directory);
  await chmod(directory, 0o700);
  return directory;
}
