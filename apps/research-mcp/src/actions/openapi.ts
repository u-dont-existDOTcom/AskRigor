import type { ActionRoute } from "./types.js";

const BAD_REQUEST_SCHEMA = actionErrorSchema({
  type: "string",
  enum: ["action_invalid_json", "action_request_read_failed"]
});
const AUTH_REQUIRED_SCHEMA = actionErrorSchema({ const: "action_auth_required" });
const BODY_TOO_LARGE_SCHEMA = actionErrorSchema({ const: "action_body_too_large" });
const INTERNAL_ERROR_SCHEMA = actionErrorSchema({ const: "action_internal_error" });
const RESEARCH_RATE_LIMIT_SCHEMA = actionErrorSchema(
  { const: "action_rate_limit_exceeded" },
  true
);
const RESEARCH_RESPONSE_TOO_LARGE_SCHEMA = actionErrorSchema({
  const: "action_response_too_large"
});
const RESEARCH_CONCURRENCY_SCHEMA = actionErrorSchema(
  { const: "action_concurrency_limit_exceeded" },
  true
);
const CONTROLLED_RESEARCH_ROUTER_ERROR_SCHEMA = {
  type: "object",
  description: "Router-owned rate, concurrency, or response-size error.",
  additionalProperties: true
} as const;

export function createActionOpenApiDocument(
  routes: readonly ActionRoute[]
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = Object.create(null) as
    Record<string, Record<string, unknown>>;

  for (const route of routes) {
    const responseSchemas: Record<number, Record<string, unknown>> = {
      ...route.responseSchemas
    };
    if (route.method === "POST") {
      responseSchemas[400] = BAD_REQUEST_SCHEMA;
      responseSchemas[413] = BODY_TOO_LARGE_SCHEMA;
    }
    responseSchemas[500] = INTERNAL_ERROR_SCHEMA;
    if (!route.public) {
      responseSchemas[401] = AUTH_REQUIRED_SCHEMA;
    }
    if (route.publicResearch === true || route.controlledResearch === true) {
      responseSchemas[429] = route.controlledResearch === true
        ? CONTROLLED_RESEARCH_ROUTER_ERROR_SCHEMA
        : RESEARCH_RATE_LIMIT_SCHEMA;
      responseSchemas[502] = route.controlledResearch === true
        ? CONTROLLED_RESEARCH_ROUTER_ERROR_SCHEMA
        : RESEARCH_RESPONSE_TOO_LARGE_SCHEMA;
      responseSchemas[503] = route.controlledResearch === true
        ? CONTROLLED_RESEARCH_ROUTER_ERROR_SCHEMA
        : RESEARCH_CONCURRENCY_SCHEMA;
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
        const declaredHeaders = route.responseHeaders?.[Number(status)];
        if (declaredHeaders !== undefined && !isRouterOwnedStatus(route, Number(status))) {
          response.headers = declaredHeaders;
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
      schemas: {},
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" }
      }
    },
    paths
  };
}

function isRouterOwnedStatus(route: ActionRoute, status: number): boolean {
  return status === 500 ||
    (route.method === "POST" && (status === 400 || status === 413)) ||
    (!route.public && status === 401) ||
    ((route.publicResearch === true || route.controlledResearch === true) &&
      [429, 502, 503].includes(status));
}

function actionErrorSchema(
  codeSchema: Record<string, unknown>,
  retryable = false
): Record<string, unknown> {
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
          retryable: { const: retryable }
        }
      }
    }
  };
}
