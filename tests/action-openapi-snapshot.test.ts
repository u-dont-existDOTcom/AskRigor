import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { generateCustomGptActionOpenApiJson } from
  "../scripts/generate-custom-gpt-packet.mts";

const committedDocumentUrl = new URL("../docs/custom-gpt-action-openapi.json", import.meta.url);

describe("reproducible Custom GPT Action OpenAPI", () => {
  it("generates the committed deterministic two-space JSON document with a trailing newline", async () => {
    const generated = generateCustomGptActionOpenApiJson();
    const committed = await readFile(committedDocumentUrl, "utf8");

    expect(committed).toBe(generated);
    expect(JSON.parse(committed)).toEqual(JSON.parse(generated));
  });

  it("describes four authenticated controlled reads and two private consequential lesson operations without secrets", () => {
    const document = JSON.parse(generateCustomGptActionOpenApiJson()) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    const lessonOperation = document.paths["/actions/lessons"]?.post;
    const incidentOperation = document.paths["/actions/lesson-incidents"]?.post;

    expect(Object.keys(document.paths)).toHaveLength(6);
    expect(lessonOperation).toMatchObject({
      operationId: "submit_lesson_candidate",
      "x-openai-isConsequential": true,
      security: [{ bearerAuth: [] }],
    });
    expect(incidentOperation).toMatchObject({
      operationId: "preserve_lesson_incident",
      "x-openai-isConsequential": true,
      security: [{ bearerAuth: [] }],
    });
    for (const methods of Object.values(document.paths)) {
      for (const candidate of Object.values(methods)) {
        expect(String(candidate.summary).length).toBeLessThanOrEqual(300);
        expect(String(candidate.description).length).toBeLessThanOrEqual(300);
      }
    }
    expect(lessonOperation?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
          },
        },
      },
    });
    expect(incidentOperation?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
          },
        },
      },
    });
    expect(Object.keys(lessonOperation?.responses as object)).toEqual([
      "200", "400", "401", "413", "415", "422", "429", "500", "503"
    ]);
    expect(Object.keys(incidentOperation?.responses as object)).toEqual([
      "200", "400", "401", "413", "422", "500", "503"
    ]);
    expect((lessonOperation?.responses as Record<string, unknown>)["429"]).toMatchObject({
      headers: {
        "Retry-After": {
          required: true,
          description: "Seconds until the Action request may be retried.",
          schema: { type: "integer", minimum: 1 },
        },
      },
    });
    const lessonOperationIds = new Set([
      "preserve_lesson_incident",
      "submit_lesson_candidate",
    ]);
    const controlled = Object.values(document.paths)
      .flatMap(Object.values)
      .filter((candidate) => !lessonOperationIds.has(String(candidate.operationId)));
    expect(controlled).toHaveLength(4);
    expect(controlled.every((candidate) =>
      JSON.stringify(candidate.security) === JSON.stringify([{ bearerAuth: [] }]) &&
      candidate["x-openai-isConsequential"] === false &&
      ["200", "400", "401", "409", "413", "422", "429", "500", "502", "503"]
        .every((status) => Object.hasOwn(candidate.responses as object, status))
    )).toBe(true);

    const serialized = JSON.stringify(document);
    expect(serialized.length).toBeLessThan(100_000);
    expect(serialized).toContain("Server-authoritative finalization decision");
    expect(serialized).toContain("videos_worth_watching");
    expect(serialized).not.toContain('"semantic_result":{}');
    expect(serialized).not.toContain('"worker_payload_receipt":{}');
    expect(objectKeys(document)).not.toEqual(expect.arrayContaining(["example", "examples"]));
    expect(serialized).not.toContain("test-action-key");
    expect(serialized).not.toContain("test-openai-key");
    expect(serialized).not.toContain("u-dont-existDOTcom");
    expect(serialized).not.toContain("github.com");
    expect(arrayValuedItemsPaths(document)).toEqual([]);
  });
});

function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...objectKeys(child)]);
}

function arrayValuedItemsPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      arrayValuedItemsPaths(child, `${path}[${index}]`)
    );
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    return key === "items" && Array.isArray(child)
      ? [childPath]
      : arrayValuedItemsPaths(child, childPath);
  });
}
