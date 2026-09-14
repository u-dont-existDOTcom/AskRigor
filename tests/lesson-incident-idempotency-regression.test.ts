import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createFileLessonIncidentVault,
  LessonIncidentVaultIntegrityError,
} from "../apps/research-mcp/src/lessons/file-incident-vault.js";
import {
  LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
  messageSha256,
} from "../apps/research-mcp/src/lessons/incident-contracts.js";

const directories: string[] = [];
const key = Buffer.alloc(32, 0x42);

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("lesson incident idempotency regression", () => {
  it("reuses the original capture timestamp and digest after wall-clock time advances", async () => {
    const directory = await safeTemporaryDirectory();
    let currentTime = new Date("2026-09-14T16:00:00.000Z");
    const vault = createFileLessonIncidentVault({
      rootDirectory: directory,
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: () => new Date(currentTime),
    });
    const request = incident("retry-key-000001");

    const first = vault.capture(request);
    currentTime = new Date("2026-09-14T18:15:00.000Z");
    const second = vault.capture(request);

    expect(second).toEqual(first);
    expect(vault.read(first.incident_id).captured_at)
      .toBe("2026-09-14T16:00:00.000Z");
  });

  it("still rejects changed incident bytes under the same idempotency key", async () => {
    const directory = await safeTemporaryDirectory();
    let currentTime = new Date("2026-09-14T16:00:00.000Z");
    const vault = createFileLessonIncidentVault({
      rootDirectory: directory,
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: () => new Date(currentTime),
    });
    const request = incident("retry-key-000002");

    vault.capture(request);
    currentTime = new Date("2026-09-15T09:00:00.000Z");

    expect(() => vault.capture({
      ...request,
      validated_defect: {
        ...request.validated_defect,
        finding: "A different validated finding for the reused key.",
      },
    })).toThrow(LessonIncidentVaultIntegrityError);
  });
});

function incident(idempotencyKey: string) {
  const contents = [
    "What does the supplied evidence establish?",
    "The response reverses the stated evidence direction.",
    "Please recheck the direction of the evidence in the supplied source.",
  ];
  return {
    schema_version: LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
    idempotency_key: idempotencyKey,
    preservation_status: "EXACT_TRANSCRIPT_PRESERVED" as const,
    window: contents.map((content, index) => ({
      role: (index === 1 ? "assistant" : "user") as "assistant" | "user",
      content_utf8: content,
      sha256: messageSha256(content),
    })),
    validated_defect: {
      category: "evidence_direction",
      finding: "The answer reversed the direction of the supplied evidence.",
      evidence_basis: "Validated from the exact source-bound incident window.",
      validated_at: "2026-09-14T15:30:00.000Z",
      validator_provenance: "mission-control-supervisor",
    },
  };
}

async function safeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "askrigor-incident-idempotency-"));
  directories.push(directory);
  await chmod(directory, 0o700);
  return directory;
}
