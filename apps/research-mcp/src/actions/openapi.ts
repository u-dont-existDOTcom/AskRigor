import type { ActionRoute } from "./types.js";

const BAD_REQUEST_SCHEMA = actionErrorSchema({
  type: "string",
  enum: ["action_invalid_json", "action_request_read_failed"]
});
const AUTH_REQUIRED_SCHEMA = actionErrorSchema({ const: "action_auth_required" });
const BODY_TOO_LARGE_SCHEMA = actionErrorSchema({ const: "action_body_too_large" });

export function createActionOpenApiDocument(
  routes: readonly ActionRoute[]
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const responseSchemas: Record<number, Record<string, unknown>> = {
      ...route.responseSchemas
    };
    if (route.method === "POST") {
      responseSchemas[400] ??= BAD_REQUEST_SCHEMA;
      responseSchemas[413] ??= BODY_TOO_LARGE_SCHEMA;
    }
    if (!route.public) {
      responseSchemas[401] ??= AUTH_REQUIRED_SCHEMA;
    }

    const operation: Record<string, unknown> = {
      operationId: route.operationId,
      summary: route.summary,
      description: route.description,
      "x-openai-isConsequential": route.consequential,
      responses: Object.fromEntries(Object.entries(responseSchemas).map(([status, schema]) => {
        const response: Record<string, unknown> = {
          description: `HTTP ${status} response`,
          content: { "application/json": { schema } }
        };
        if (status === "429") {
          response.headers = {
            "Retry-After": {
              required: true,
              description: "Seconds until the Action request may be retried.",
              schema: { type: "integer", minimum: 1 }
            }
          };
        }
        return [status, response];
      }))
    };

    if (!route.public) {
      operation.security = [{ bearerAuth: [] }];
    }
    if (route.method === "POST" && route.requestSchema !== undefined) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: route.requestSchema } }
      };
    }

    paths[route.path] ??= {};
    paths[route.path][route.method.toLowerCase()] = operation;
  }

  return {
    openapi: "3.1.0",
    info: { title: "AskRigor Actions", version: "0.1.0" },
    servers: [{ url: "https://mcp.askrigor.com" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" }
      }
    },
    paths
  };
}

function actionErrorSchema(codeSchema: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["error"],
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "retryable"],
        properties: {
          code: codeSchema,
          retryable: { const: false }
        }
      }
    }
  };
}
