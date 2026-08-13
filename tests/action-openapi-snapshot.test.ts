import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createActionOpenApiDocument } from
  "../apps/research-mcp/src/actions/openapi.js";
import { createDefaultActionRoutes } from
  "../apps/research-mcp/src/lessons/runtime.js";
import { generateActionOpenApiJson } from
  "../scripts/generate-action-openapi.mts";

const committedDocumentUrl = new URL("../docs/custom-gpt-action-openapi.json", import.meta.url);

describe("reproducible Custom GPT Action OpenAPI", () => {
  it("generates the committed deterministic two-space JSON document with a trailing newline", async () => {
    const routes = createDefaultActionRoutes();
    const document = createActionOpenApiDocument(routes);
    const generated = generateActionOpenApiJson();
    const committed = await readFile(committedDocumentUrl, "utf8");

    expect(generated).toBe(`${JSON.stringify(document, null, 2)}\n`);
    expect(committed).toBe(generated);
    expect(JSON.parse(committed)).toEqual(document);
  });

  it("describes one private consequential lesson operation without secrets or private repository data", () => {
    const document = createActionOpenApiDocument(createDefaultActionRoutes()) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    const operation = document.paths["/actions/lessons"]?.post;

    expect(Object.keys(document.paths)).toEqual(["/actions/lessons"]);
    expect(operation).toMatchObject({
      operationId: "submit_lesson_candidate",
      "x-openai-isConsequential": true,
      security: [{ bearerAuth: [] }],
    });
    expect(String(operation?.summary).length).toBeLessThanOrEqual(300);
    expect(String(operation?.description).length).toBeLessThanOrEqual(700);
    expect(operation?.requestBody).toMatchObject({
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
    expect(Object.keys(operation?.responses as object)).toEqual(["200", "415", "422", "429", "503"]);

    const serialized = JSON.stringify(document);
    expect(objectKeys(document)).not.toEqual(expect.arrayContaining(["example", "examples"]));
    expect(serialized).not.toContain("test-action-key");
    expect(serialized).not.toContain("test-openai-key");
    expect(serialized).not.toContain("u-dont-existDOTcom");
    expect(serialized).not.toContain("github.com");
  });
});

function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...objectKeys(child)]);
}
