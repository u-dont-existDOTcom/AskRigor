import { describe, expect, it } from "vitest";

import {
  createActionOpenApiDocument,
  type ActionRoute
} from "../apps/research-mcp/src/index.js";

const routes: ActionRoute[] = [{
  method: "POST",
  path: "/actions/test",
  operationId: "test_action",
  summary: "Test",
  description: "Test-only Action route.",
  consequential: true,
  public: false,
  requestSchema: { type: "object", additionalProperties: false },
  responseSchemas: { 200: { type: "object" } },
  async handle() {
    return { status: 200, body: {} };
  }
}];

describe("Action OpenAPI document", () => {
  it("describes the Action-only bearer-protected route", () => {
    const document = createActionOpenApiDocument(routes);

    expect(document.openapi).toBe("3.1.0");
    expect(document.servers).toEqual([{ url: "https://mcp.askrigor.com" }]);
    expect(document.components).toEqual({
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" }
      }
    });
    expect(document.paths).toMatchObject({
      "/actions/test": {
        post: {
          operationId: "test_action",
          security: [{ bearerAuth: [] }],
          "x-openai-isConsequential": true
        }
      }
    });
  });
});
