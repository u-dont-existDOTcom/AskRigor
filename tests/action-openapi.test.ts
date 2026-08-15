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

  it("documents authoritative common private POST errors and a declared Retry-After header", () => {
    const document = createActionOpenApiDocument([{
      ...routes[0],
      responseSchemas: {
        200: { type: "object" },
        400: { const: "route-owned-contradiction" },
        401: { const: "route-owned-contradiction" },
        413: { const: "route-owned-contradiction" },
        429: {
          type: "object",
          additionalProperties: false,
          required: ["status"],
          properties: { status: { const: "rate_limited" } }
        }
      },
      responseHeaders: {
        429: {
          "Retry-After": {
            required: true,
            description: "Seconds until the Action request may be retried.",
            schema: { type: "integer", minimum: 1 }
          }
        }
      }
    }]) as {
      paths: Record<string, { post: { responses: Record<string, unknown> } }>;
    };
    const responses = document.paths["/actions/test"]!.post.responses;

    expect(responses).toMatchObject({
      400: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["error"],
              properties: {
                error: {
                  type: "object",
                  additionalProperties: false,
                  required: ["code", "retryable"],
                  properties: {
                    code: {
                      type: "string",
                      enum: ["action_invalid_json", "action_request_read_failed"]
                    },
                    retryable: { const: false }
                  }
                }
              }
            }
          }
        }
      },
      401: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["error"],
              properties: {
                error: {
                  type: "object",
                  additionalProperties: false,
                  required: ["code", "retryable"],
                  properties: {
                    code: { const: "action_auth_required" },
                    retryable: { const: false }
                  }
                }
              }
            }
          }
        }
      },
      413: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["error"],
              properties: {
                error: {
                  type: "object",
                  additionalProperties: false,
                  required: ["code", "retryable"],
                  properties: {
                    code: { const: "action_body_too_large" },
                    retryable: { const: false }
                  }
                }
              }
            }
          }
        }
      },
      429: {
        headers: {
          "Retry-After": {
            required: true,
            description: "Seconds until the Action request may be retried.",
            schema: { type: "integer", minimum: 1 }
          }
        }
      }
    });
  });

  it("does not invent Retry-After for an undeclared 429 response header", () => {
    const document = createActionOpenApiDocument([{
      ...routes[0],
      responseSchemas: {
        429: { type: "object" }
      }
    }]) as {
      paths: Record<string, { post: { responses: Record<string, { headers?: unknown }> } }>;
    };

    expect(document.paths["/actions/test"]!.post.responses["429"]!.headers).toBeUndefined();
  });

  it("does not mutate object prototypes when constructing route paths", () => {
    expect(Object.prototype).not.toHaveProperty("post");
    try {
      createActionOpenApiDocument([{
        ...routes[0],
        path: "__proto__"
      }]);
      expect(Object.prototype).not.toHaveProperty("post");
    } finally {
      delete (Object.prototype as { post?: unknown }).post;
    }
  });
});
