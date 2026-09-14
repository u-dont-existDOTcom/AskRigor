import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { generateCustomGptPacket } from "../scripts/generate-custom-gpt-packet.mts";

const CHUNK_SIZE = 2_000;

describe("temporary deterministic Custom GPT artifact export", () => {
  it("prints gzip+base64url chunks for supervisor recovery", async () => {
    const packet = await generateCustomGptPacket();
    const artifacts = {
      openapi: packet.openApiJson,
      instructions: packet.instructionsMarkdown,
      sync: packet.syncJson,
      runtime: packet.runtimeManifestTypescript,
    } as const;

    for (const [name, value] of Object.entries(artifacts)) {
      const encoded = gzipSync(Buffer.from(value, "utf8"), { level: 9 }).toString("base64url");
      const count = Math.ceil(encoded.length / CHUNK_SIZE);
      for (let index = 0; index < count; index += 1) {
        const chunk = encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        console.log(`ASKRIGOR_ARTIFACT:${name}:${index + 1}/${count}:${chunk}`);
      }
    }

    expect(packet.openApiJson.length).toBeGreaterThan(1_000);
  });
});
