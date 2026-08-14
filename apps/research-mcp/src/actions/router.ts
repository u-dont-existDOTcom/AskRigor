import type { IncomingMessage, ServerResponse } from "node:http";

import { hasValidActionAuthorization } from "./auth.js";
import {
  ActionBodyTooLargeError,
  InvalidActionJsonError,
  readActionJsonBody
} from "./body.js";
import { isCanonicalRawPath } from "./path.js";
import type { ActionResult, ActionRoute } from "./types.js";

const ACTION_BODY_MAX_BYTES = 8_192;
const OPENAPI_PATH = "/actions/openapi.json";
const RESERVED_PATHS = new Set(["/mcp", "/healthz", OPENAPI_PATH]);

export interface DispatchActionRequestOptions {
  pathname: string;
  clientIp: string;
  actionApiKey: string | undefined;
  routes: readonly ActionRoute[];
  createOpenApiDocument: () => Record<string, unknown>;
}

export function validateActionRoutes(routes: readonly ActionRoute[]): void {
  const seen = new Set<string>();
  for (const route of routes) {
    if (
      !isCanonicalRawPath(route.path) ||
      !route.path.startsWith("/actions/") ||
      RESERVED_PATHS.has(route.path)
    ) {
      throw new Error(`Invalid Action route path: ${route.path}`);
    }

    validateResponseHeaders(route);

    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate Action route: ${key}`);
    }
    seen.add(key);
  }
}

export async function dispatchActionRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: DispatchActionRequestOptions
): Promise<boolean> {
  if (!options.pathname.startsWith("/actions/")) {
    return false;
  }

  if (request.method === "GET" && options.pathname === OPENAPI_PATH) {
    writeJson(response, 200, options.createOpenApiDocument());
    return true;
  }

  const route = options.routes.find((candidate) =>
    candidate.method === request.method && candidate.path === options.pathname
  );
  if (route === undefined) {
    return false;
  }

  if (!route.public && !hasValidActionAuthorization(request, options.actionApiKey)) {
    writeJson(response, 401, { error: { code: "action_auth_required", retryable: false } });
    return true;
  }

  let body: unknown = undefined;
  if (route.method === "POST") {
    try {
      body = await readActionJsonBody(request, ACTION_BODY_MAX_BYTES);
    } catch (error) {
      if (error instanceof ActionBodyTooLargeError) {
        writeJson(response, 413, { error: { code: "action_body_too_large", retryable: false } });
        return true;
      }
      if (error instanceof InvalidActionJsonError) {
        writeJson(response, 400, { error: { code: "action_invalid_json", retryable: false } });
        return true;
      }
      writeJson(response, 400, { error: { code: "action_request_read_failed", retryable: false } });
      return true;
    }
  }

  try {
    const result = await route.handle({ request, clientIp: options.clientIp, body });
    if (
      isRouterOwnedStatus(route, result.status) ||
      !hasValidRequiredResponseHeaders(route, result)
    ) {
      writeJson(response, 500, { error: { code: "action_internal_error", retryable: false } });
      return true;
    }
    writeJson(response, result.status, result.body, result.headers);
  } catch {
    writeJson(response, 500, { error: { code: "action_internal_error", retryable: false } });
  }
  return true;
}

function validateResponseHeaders(route: ActionRoute): void {
  for (const [rawStatus, headers] of Object.entries(route.responseHeaders ?? {})) {
    const status = Number(rawStatus);
    if (!Number.isInteger(status) || route.responseSchemas[status] === undefined) {
      throw new Error(`Invalid Action response-header status: ${route.operationId}`);
    }
    if (isRouterOwnedStatus(route, status)) {
      throw new Error(`Action response headers cannot alter router-owned status: ${route.operationId}`);
    }

    const seen = new Set<string>();
    for (const [name, definition] of Object.entries(headers)) {
      const normalizedName = name.toLowerCase();
      if (
        !isHttpToken(name) ||
        seen.has(normalizedName) ||
        definition.required !== true ||
        definition.description.trim().length === 0 ||
        definition.schema.type !== "integer" ||
        !Number.isSafeInteger(definition.schema.minimum) ||
        definition.schema.minimum < 1
      ) {
        throw new Error(`Invalid Action response-header contract: ${route.operationId}`);
      }
      seen.add(normalizedName);
    }
  }
}

function hasValidRequiredResponseHeaders(route: ActionRoute, result: ActionResult): boolean {
  const requiredHeaders = route.responseHeaders?.[result.status];
  if (requiredHeaders === undefined) return true;

  const actualHeaders = Object.entries(result.headers ?? {});
  return Object.entries(requiredHeaders).every(([requiredName, definition]) => {
    const matchingValues = actualHeaders
      .filter(([name]) => name.toLowerCase() === requiredName.toLowerCase())
      .map(([, value]) => value);
    return matchingValues.length === 1 &&
      isIntegerAtLeast(matchingValues[0]!, definition.schema.minimum);
  });
}

function isRouterOwnedStatus(route: ActionRoute, status: number): boolean {
  return (route.method === "POST" && (status === 400 || status === 413)) ||
    (!route.public && status === 401);
}

function isHttpToken(value: string): boolean {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(value);
}

function isIntegerAtLeast(value: string, minimum: number): boolean {
  if (!/^[1-9][0-9]*$/u.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum;
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {}
): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}
