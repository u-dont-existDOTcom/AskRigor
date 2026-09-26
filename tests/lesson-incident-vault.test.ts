import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  createFileLessonIncidentVault,
  lessonIncidentVaultConfigFromEnv,
  LessonIncidentVaultIntegrityError,
} from "../apps/research-mcp/src/lessons/file-incident-vault.js";
import {
  createLessonIncidentActionRoute,
  LESSON_INCIDENT_ACTION_OPERATION_ID,
  LESSON_INCIDENT_ACTION_PATH,
} from "../apps/research-mcp/src/lessons/incident-action-route.js";
import {
  LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
  LESSON_INCIDENT_ROUTE_MAX_BYTES,
  LESSON_INCIDENT_SCHEMA_VERSION,
  messageSha256,
} from "../apps/research-mcp/src/lessons/incident-contracts.js";
import {
  createLessonIncidentReplayManifest,
  createLessonIncidentReplayPacket,
} from "../apps/research-mcp/src/lessons/incident-replay.js";
import { createAskRigorHttpServer, createAskRigorServer } from "../apps/research-mcp/src/server.js";

const temporaryDirectories: string[] = [];
const fixedNow = () => new Date("2026-09-14T16:00:00.000Z");
const key = Buffer.alloc(32, 0x42);
const otherKey = Buffer.alloc(32, 0x24);

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("lesson incident evidence contract", () => {
  it("preserves exact UTF-8 bytes and recomputes the canonical incident digest", async () => {
    const vault = createFileLessonIncidentVault({
      rootDirectory: await safeTemporaryDirectory(),
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: fixedNow,
    });
    const input = validIncident();
    const receipt = vault.capture(input);
    const record = vault.read(receipt.incident_id);

    expect(record).toMatchObject({
      schema_version: LESSON_INCIDENT_SCHEMA_VERSION,
      captured_at: "2026-09-14T16:00:00.000Z",
      preservation_status: "EXACT_TRANSCRIPT_PRESERVED",
      incident_sha256: receipt.incident_sha256,
    });
    expect(record.window.map((message) => message.content_utf8)).toEqual([
      "Can DMSO inhibit this pathogen at 70 percent?",
      "It probably promotes it at that concentration.",
      "That is wrong: my correction is that the cited evidence was inhibition, not promotion.",
    ]);
    expect(record.window.map((message) => message.sha256)).toEqual(
      record.window.map((message) => messageSha256(message.content_utf8)),
    );
  });

  it("rejects malformed exact claims, unknown fields, bad digests, and record limits", async () => {
    const vault = createFileLessonIncidentVault({
      rootDirectory: await safeTemporaryDirectory(),
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: fixedNow,
    });

    expect(() => vault.capture({ ...validIncident(), extra: true })).toThrow();
    expect(() => vault.capture({
      ...validIncident(),
      window: [{ ...validIncident().window[0], sha256: "0".repeat(64) }],
    })).toThrow();
    expect(() => vault.capture({
      ...validIncident(),
      window: [validIncident().window[0]],
    })).toThrow();
    expect(() => vault.capture({
      ...validIncident("PARTIAL_TRANSCRIPT_PRESERVED"),
      window: Array.from({ length: 13 }, () => validIncident().window[0]),
    })).toThrow();
    expect(() => vault.capture({
      ...validIncident("PARTIAL_TRANSCRIPT_PRESERVED"),
      window: [{
        role: "user",
        content_utf8: "x".repeat(24 * 1_024 + 1),
        sha256: messageSha256("x".repeat(24 * 1_024 + 1)),
      }],
    })).toThrow();
  });
});

describe("encrypted lesson incident vault", () => {
  it("loads the dedicated vault environment without accepting partial or malformed secrets", async () => {
    const directory = await safeTemporaryDirectory();
    const encodedKey = key.toString("base64url");
    expect(lessonIncidentVaultConfigFromEnv({
      ASKRIGOR_LESSON_INCIDENT_DIRECTORY: directory,
      ASKRIGOR_LESSON_INCIDENT_KEY: encodedKey,
      ASKRIGOR_LESSON_INCIDENT_KEY_ID: "incident-key-v1",
    })).toMatchObject({
      rootDirectory: directory,
      keyId: "incident-key-v1",
    });
    expect(lessonIncidentVaultConfigFromEnv({})).toBeUndefined();
    expect(() => lessonIncidentVaultConfigFromEnv({
      ASKRIGOR_LESSON_INCIDENT_DIRECTORY: directory,
      ASKRIGOR_LESSON_INCIDENT_KEY: encodedKey,
    })).toThrow("Lesson incident vault configuration unavailable");
    expect(() => lessonIncidentVaultConfigFromEnv({
      ASKRIGOR_LESSON_INCIDENT_DIRECTORY: directory,
      ASKRIGOR_LESSON_INCIDENT_KEY: Buffer.alloc(31).toString("base64url"),
      ASKRIGOR_LESSON_INCIDENT_KEY_ID: "incident-key-v1",
    })).toThrow("Lesson incident vault configuration unavailable");
  });

  it("writes encrypted owner-private files, reads after process-style restart, and inventories opaque receipts", async () => {
    const directory = await safeTemporaryDirectory();
    const first = createFileLessonIncidentVault({
      rootDirectory: directory,
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: fixedNow,
    });
    const receipt = first.capture(validIncident());
    const stored = await readFile(join(directory, `${receipt.incident_id}.json`), "utf8");

    expect(stored).not.toContain("DMSO");
    expect(stored).not.toContain("wrong");
    expect(stored).not.toContain("70 percent");

    const second = createFileLessonIncidentVault({
      rootDirectory: directory,
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: fixedNow,
    });
    expect(second.read(receipt.incident_id).incident_sha256).toBe(receipt.incident_sha256);
    expect(second.inventory()).toEqual([receipt]);
  });

  it("fails closed for wrong keys, key ID mismatch, tampering, symlinks, and traversal-like IDs", async () => {
    const directory = await safeTemporaryDirectory();
    const vault = createFileLessonIncidentVault({
      rootDirectory: directory,
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: fixedNow,
    });
    const receipt = vault.capture(validIncident());
    expect(() => createFileLessonIncidentVault({
      rootDirectory: directory,
      encryptionKey: otherKey,
      keyId: "incident-key-v1",
      now: fixedNow,
    }).read(receipt.incident_id)).toThrow(LessonIncidentVaultIntegrityError);
    expect(() => createFileLessonIncidentVault({
      rootDirectory: directory,
      encryptionKey: key,
      keyId: "incident-key-v2",
      now: fixedNow,
    }).read(receipt.incident_id)).toThrow(LessonIncidentVaultIntegrityError);

    const path = join(directory, `${receipt.incident_id}.json`);
    const envelope = JSON.parse(await readFile(path, "utf8"));
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -1)}A`;
    await writeFile(path, `${JSON.stringify(envelope)}\n`);
    await expect(readFile(path, "utf8")).resolves.not.toContain("DMSO");
    expect(() => vault.read(receipt.incident_id)).toThrow(LessonIncidentVaultIntegrityError);

    expect(() => vault.read("../outside")).toThrow();
    const symlinkRoot = join(tmpdir(), `askrigor-incident-link-${process.pid}`);
    temporaryDirectories.push(symlinkRoot);
    await symlink(directory, symlinkRoot);
    expect(() => createFileLessonIncidentVault({
      rootDirectory: symlinkRoot,
      encryptionKey: key,
      keyId: "incident-key-v1",
    })).toThrow("Lesson incident vault root must be owner-private");
  });

  it("deduplicates idempotent retries and rejects divergent reuse", async () => {
    const vault = createFileLessonIncidentVault({
      rootDirectory: await safeTemporaryDirectory(),
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: fixedNow,
    });
    const first = vault.capture(validIncident(undefined, "retry-key-000001"));
    const second = vault.capture(validIncident(undefined, "retry-key-000001"));
    expect(second).toEqual(first);
    expect(() => vault.capture({
      ...validIncident(undefined, "retry-key-000001"),
      validated_defect: {
        ...validIncident().validated_defect,
        finding: "A different validated finding for the same idempotency key.",
      },
    })).toThrow(LessonIncidentVaultIntegrityError);
  });
});

describe("private lesson incident Action surface", () => {
  it("uses a 128 KiB route cap and returns only opaque success fields", async () => {
    const route = createLessonIncidentActionRoute({
      capture: () => ({
        incident_id: "ali_1234567890abcdef",
        incident_sha256: "a".repeat(64),
        preservation_status: "EXACT_TRANSCRIPT_PRESERVED",
      }),
    });

    expect(route.maximumRequestBytes).toBe(LESSON_INCIDENT_ROUTE_MAX_BYTES);
    await withHttpServer(route, async (baseUrl) => {
      const response = await postIncident(baseUrl, validIncident());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "preserved",
        incident_id: "ali_1234567890abcdef",
        incident_sha256: "a".repeat(64),
        preservation_status: "EXACT_TRANSCRIPT_PRESERVED",
        retryable: false,
      });
    });
  });

  it("keeps invalid and unavailable responses content-free and enforces the route body limit", async () => {
    const route = createLessonIncidentActionRoute({
      capture: () => {
        throw new Error("DMSO private path /vault/plaintext");
      },
    });
    await withHttpServer(route, async (baseUrl) => {
      const invalid = await postIncident(baseUrl, { ...validIncident(), extra: true });
      expect(invalid.status).toBe(422);
      const invalidBody = await invalid.text();
      expect(invalidBody).not.toContain("DMSO");
      expect(invalidBody).not.toContain("/vault");

      const unavailable = await postIncident(baseUrl, validIncident());
      expect(unavailable.status).toBe(503);
      const unavailableBody = await unavailable.text();
      expect(unavailableBody).not.toContain("DMSO");
      expect(unavailableBody).not.toContain("/vault");

      const tooLarge = await fetch(new URL(LESSON_INCIDENT_ACTION_PATH, baseUrl), {
        method: "POST",
        headers: {
          authorization: "Bearer test-action-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...validIncident("PARTIAL_TRANSCRIPT_PRESERVED"),
          window: [{
            role: "user",
            content_utf8: "x".repeat(LESSON_INCIDENT_ROUTE_MAX_BYTES),
            sha256: "a".repeat(64),
          }],
        }),
      });
      expect(tooLarge.status).toBe(413);
    });
  });

  it("is private Action-only and absent from the public MCP tool catalog", async () => {
    const route = createLessonIncidentActionRoute({ capture: () => {
      throw new Error("unused");
    } });
    expect(route).toMatchObject({
      method: "POST",
      path: LESSON_INCIDENT_ACTION_PATH,
      operationId: LESSON_INCIDENT_ACTION_OPERATION_ID,
      public: false,
      consequential: true,
    });

    const server = createAskRigorServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "lesson-incident-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(29);
      expect(tools.tools.map(({ name }) => name)).not.toContain(LESSON_INCIDENT_ACTION_OPERATION_ID);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});

describe("owner-private lesson incident replay", () => {
  it("materializes raw windows only from an authorized vault read and writes opaque public manifests", async () => {
    const vault = createFileLessonIncidentVault({
      rootDirectory: await safeTemporaryDirectory(),
      encryptionKey: key,
      keyId: "incident-key-v1",
      now: fixedNow,
    });
    const receipt = vault.capture(validIncident());
    const record = vault.read(receipt.incident_id);

    const packet = createLessonIncidentReplayPacket(vault, receipt.incident_id);
    expect(packet.development_evidence).toBe(true);
    expect(packet.prompt_window.map((message) => message.content_utf8).join("\n"))
      .toContain("DMSO");
    expect(packet.replay_digest).toMatch(/^[a-f0-9]{64}$/u);

    const manifest = createLessonIncidentReplayManifest(record);
    expect(JSON.stringify(manifest)).not.toContain("DMSO");
    expect(JSON.stringify(manifest)).not.toContain("wrong");
    expect(manifest).toMatchObject({
      development_evidence: true,
      raw_window_location: "owner_private_incident_vault",
      incident: receipt,
    });
  });
});

function validIncident(
  status = "EXACT_TRANSCRIPT_PRESERVED",
  idempotencyKey?: string,
) {
  const window = [
    "Can DMSO inhibit this pathogen at 70 percent?",
    "It probably promotes it at that concentration.",
    "That is wrong: my correction is that the cited evidence was inhibition, not promotion.",
  ].map((content, index) => ({
    role: index === 1 ? "assistant" : "user",
    content_utf8: content,
    sha256: messageSha256(content),
  }));
  return {
    schema_version: LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
    ...(idempotencyKey === undefined ? {} : { idempotency_key: idempotencyKey }),
    preservation_status: status,
    source: {
      private_conversation_ref: "chatgpt:private:incident-001",
      askrigor_version: "0.1.0",
      model: "gpt-5.6-sol",
      mode: "AskRigor",
      protocol_identities: [{ name: "HRP", version: "20.5.17", sha256: "b".repeat(64) }],
    },
    window,
    validated_defect: {
      category: "evidence_direction",
      finding: "The answer inverted inhibition evidence into promotion wording.",
      evidence_basis: "Validated against the exact correction window.",
      validated_at: "2026-09-14T15:30:00.000Z",
      validator_provenance: "mission-control-supervisor",
    },
  };
}

async function safeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "askrigor-lesson-incident-"));
  temporaryDirectories.push(directory);
  await chmod(directory, 0o700);
  return directory;
}

async function withHttpServer<T>(
  route: ReturnType<typeof createLessonIncidentActionRoute>,
  callback: (baseUrl: URL) => Promise<T>,
): Promise<T> {
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    actionsEnabled: true,
    actionApiKey: "test-action-key",
    actionRoutes: [route],
  });
  await listen(server);
  const address = server.address() as AddressInfo;
  try {
    return await callback(new URL(`http://127.0.0.1:${address.port}`));
  } finally {
    await close(server);
  }
}

function listen(server: ReturnType<typeof createAskRigorHttpServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server: ReturnType<typeof createAskRigorHttpServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function postIncident(baseUrl: URL, body: unknown): Promise<Response> {
  return fetch(new URL(LESSON_INCIDENT_ACTION_PATH, baseUrl), {
    method: "POST",
    headers: {
      authorization: "Bearer test-action-key",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
