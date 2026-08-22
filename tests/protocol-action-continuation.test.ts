import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

const NOW = 1_787_000_000_000;
const SECRET = "p".repeat(32);
const text = [
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Protocol>",
  "a".repeat(47_950),
  "😀",
  "é".repeat(24_100),
  "b".repeat(50_000),
  "</Protocol>"
].join("");

const sha256 = (value: string) =>
  createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");

const manifest = (value = text) => ({
  name: "AskRigor HRP",
  version: "test-version",
  revisionDate: "2026-08-16",
  sha256: sha256(value)
});

const dependencies = (options: {
  value?: string;
  secret?: string;
  now?: number;
} = {}) => ({
  continuationSecret: options.secret ?? SECRET,
  now: () => options.now ?? NOW,
  async loadProtocol() {
    return options.value ?? text;
  },
  async getProtocolManifest() {
    return manifest(options.value ?? text);
  }
});

describe("protocol Action continuation", () => {
  it("reconstructs exact UTF-8 bytes through ordered bounded chunks", async () => {
    const module = await import("../apps/research-mcp/src/index.js") as
      Record<string, unknown>;
    const createChunk = module.createProtocolActionChunk as
      ((input: { protocol: "hrp"; cursor?: string }, deps: ReturnType<typeof dependencies>) =>
        Promise<{
          protocol: "hrp";
          manifest: ReturnType<typeof manifest>;
          chunk_index: number;
          chunk_count: number;
          byte_start: number;
          byte_end_exclusive: number;
          total_bytes: number;
          chunk_sha256: string;
          text: string;
          next_cursor?: string;
          complete: boolean;
        }>) | undefined;

    expect(createChunk).toBeTypeOf("function");
    const chunks: Awaited<ReturnType<NonNullable<typeof createChunk>>>[] = [];
    let cursor: string | undefined;
    do {
      const chunk = await createChunk!({
        protocol: "hrp",
        ...(cursor === undefined ? {} : { cursor })
      }, dependencies());
      chunks.push(chunk);
      cursor = chunk.next_cursor;
    } while (cursor !== undefined);

    const reconstructed = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk.text, "utf8"))
    );
    expect(reconstructed).toEqual(Buffer.from(text, "utf8"));
    expect(sha256(reconstructed.toString("utf8"))).toBe(manifest().sha256);
    expect(chunks.every((chunk) =>
      Buffer.byteLength(chunk.text, "utf8") <= 48_000 &&
      sha256(chunk.text) === chunk.chunk_sha256
    )).toBe(true);
    expect(chunks.map(({ chunk_index }) => chunk_index)).toEqual(
      Array.from({ length: chunks.length }, (_, index) => index)
    );
    expect(chunks.every(({ chunk_count }) => chunk_count === chunks.length)).toBe(true);
    expect(chunks[0]).toMatchObject({ byte_start: 0, protocol: "hrp" });
    expect(chunks.at(-1)).toMatchObject({
      complete: true,
      byte_end_exclusive: Buffer.byteLength(text, "utf8"),
      total_bytes: Buffer.byteLength(text, "utf8")
    });
    expect(chunks.at(-1)?.next_cursor).toBeUndefined();
  }, 10_000);

  it("authenticates cursor state without embedding XML or the secret", async () => {
    const { createProtocolActionChunk } = await import(
      "../apps/research-mcp/src/actions/protocol-continuation.js"
    );
    const first = await createProtocolActionChunk({ protocol: "hrp" }, dependencies());

    expect(first.next_cursor).toBeDefined();
    const payload = Buffer.from(first.next_cursor!.split(".")[0]!, "base64url")
      .toString("utf8");
    expect(payload).toContain("askrigor_protocol_action");
    expect(payload).toContain(manifest().sha256);
    expect(payload).not.toContain("<Protocol>");
    expect(payload).not.toContain(SECRET);
  });

  it("rejects tampering, the wrong secret, expiry, and changed canonical bytes", async () => {
    const { createProtocolActionChunk } = await import(
      "../apps/research-mcp/src/actions/protocol-continuation.js"
    );
    const first = await createProtocolActionChunk({ protocol: "hrp" }, dependencies());
    const [payload, signature] = first.next_cursor!.split(".") as [string, string];
    const changedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;
    const changedSignature = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    await expect(createProtocolActionChunk(
      { protocol: "hrp", cursor: `${changedPayload}.${signature}` },
      dependencies()
    )).rejects.toThrow(/invalid/i);
    await expect(createProtocolActionChunk(
      { protocol: "hrp", cursor: `${payload}.${changedSignature}` },
      dependencies()
    )).rejects.toThrow(/invalid/i);
    await expect(createProtocolActionChunk(
      { protocol: "hrp", cursor: first.next_cursor },
      dependencies({ secret: "w".repeat(32) })
    )).rejects.toThrow(/invalid/i);
    await expect(createProtocolActionChunk(
      { protocol: "hrp", cursor: first.next_cursor },
      dependencies({ now: NOW + 3_600_000 })
    )).rejects.toThrow(/expired/i);
    await expect(createProtocolActionChunk(
      { protocol: "hrp", cursor: first.next_cursor },
      dependencies({ value: `${text}changed` })
    )).rejects.toThrow(/changed/i);
  });

  it("rejects a short secret and a cursor bound to another protocol", async () => {
    const { createProtocolActionChunk } = await import(
      "../apps/research-mcp/src/actions/protocol-continuation.js"
    );

    await expect(createProtocolActionChunk(
      { protocol: "hrp" },
      dependencies({ secret: "short" })
    )).rejects.toThrow(/32/);

    const first = await createProtocolActionChunk({ protocol: "hrp" }, dependencies());
    await expect(createProtocolActionChunk(
      { protocol: "universal", cursor: first.next_cursor },
      dependencies()
    )).rejects.toThrow(/protocol/i);
  });
});
