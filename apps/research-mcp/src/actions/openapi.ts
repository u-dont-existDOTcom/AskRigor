import type { ActionRoute } from "./types.js";

export function createActionOpenApiDocument(
  routes: readonly ActionRoute[]
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const operation: Record<string, unknown> = {
      operationId: route.operationId,
      summary: route.summary,
      description: route.description,
      "x-openai-isConsequential": route.consequential,
      responses: Object.fromEntries(Object.entries(route.responseSchemas).map(([status, schema]) => [
        status,
        {
          description: `HTTP ${status} response`,
          content: { "application/json": { schema } }
        }
      ]))
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
