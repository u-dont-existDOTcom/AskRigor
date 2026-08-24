import type { IncomingMessage, ServerResponse } from "node:http";

import { isJsonContentType } from "@modelcontextprotocol/sdk/shared/mediaType.js";
import { z } from "zod";

import { hasValidActionAuthorization } from "./actions/auth.js";
import {
  ActionBodyTooLargeError,
  InvalidActionJsonError,
  readActionJsonBody
} from "./actions/body.js";
import {
  N8nControlPlaneConflictError,
  N8nControlPlaneUnavailableError,
  n8nControlPlaneProjectionSchema,
  type N8nControlPlane
} from "./n8n-control-plane-pilot.js";
import type {
  ConcurrencyLimiter,
  TokenBucketLimiter
} from "./rate-limit.js";

export const N8N_CONTROL_PLANE_PREFIX = "/internal/n8n/v1" as const;
const REQUEST_MAX_BYTES = 8 * 1_024;
const RESPONSE_MAX_BYTES = 8 * 1_024;
const sessionIdSchema = z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u);
const executionIdSchema = z.string().regex(/^arn8n1_[A-Za-z0-9_-]{32}$/u);
const startSchema = z.object({ session_id: sessionIdSchema }).strict();
const executionSchema = z.object({ execution_id: executionIdSchema }).strict();

const errorSchema = z.object({
  error: z.object({
    code: z.enum([
      "n8n_control_auth_required",
      "n8n_control_origin_forbidden",
      "n8n_control_method_not_allowed",
      "n8n_control_content_type_required",
      "n8n_control_body_too_large",
      "n8n_control_invalid_json",
      "n8n_control_input_invalid",
      "n8n_control_path_not_found",
      "n8n_control_execution_unavailable",
      "n8n_control_conflict",
      "n8n_control_rate_limited",
      "n8n_control_concurrency_limited",
      "n8n_control_upstream_failure",
      "n8n_control_internal_error"
    ]),
    retryable: z.boolean()
  }).strict()
}).strict();

type ErrorCode = z.output<typeof errorSchema>["error"]["code"];

export interface N8nControlPlaneHandler {
  dispatch(
    request: IncomingMessage,
    response: ServerResponse,
    options: {
      pathname: string;
      clientIp: string;
      apiKey: string;
      rateLimiter: TokenBucketLimiter;
      concurrencyLimiter: ConcurrencyLimiter;
    }
  ): Promise<boolean>;
}

export function createN8nControlPlaneHandler(
  control: N8nControlPlane
): N8nControlPlaneHandler {
  return Object.freeze({ dispatch });

  async function dispatch(
    request: IncomingMessage,
    response: ServerResponse,
    options: {
      pathname: string;
      clientIp: string;
      apiKey: string;
      rateLimiter: TokenBucketLimiter;
      concurrencyLimiter: ConcurrencyLimiter;
    }
  ): Promise<boolean> {
    if (!options.pathname.startsWith(`${N8N_CONTROL_PLANE_PREFIX}/`)) return false;
    if (request.headers.origin !== undefined) {
      writeError(response, 403, "n8n_control_origin_forbidden", false);
      return true;
    }
    if (!hasValidActionAuthorization(request, options.apiKey)) {
      writeError(response, 401, "n8n_control_auth_required", false);
      return true;
    }
    if (request.method !== "POST") {
      writeError(response, 405, "n8n_control_method_not_allowed", false, {
        allow: "POST"
      });
      return true;
    }
    if (!isJsonContentType(request.headers["content-type"])) {
      writeError(response, 415, "n8n_control_content_type_required", false);
      return true;
    }
    if (!options.rateLimiter.consume(options.clientIp)) {
      writeError(response, 429, "n8n_control_rate_limited", true);
      return true;
    }
    const release = options.concurrencyLimiter.tryAcquire();
    if (release === undefined) {
      writeError(response, 503, "n8n_control_concurrency_limited", true);
      return true;
    }
    try {
      let body: unknown;
      try {
        body = await readActionJsonBody(request, REQUEST_MAX_BYTES);
      } catch (error) {
        writeError(
          response,
          error instanceof ActionBodyTooLargeError ? 413 : 400,
          error instanceof ActionBodyTooLargeError
            ? "n8n_control_body_too_large"
            : "n8n_control_invalid_json",
          false
        );
        return true;
      }
      try {
        const result = await route(options.pathname, body);
        writeJson(response, 200, result);
      } catch (error) {
        if (error instanceof N8nControlPlaneUnavailableError) {
          writeError(response, 404, "n8n_control_execution_unavailable", false);
        } else if (error instanceof N8nControlPlanePathNotFoundError) {
          writeError(response, 404, "n8n_control_path_not_found", false);
        } else if (error instanceof N8nControlPlaneConflictError) {
          writeError(response, 409, "n8n_control_conflict", true);
        } else if (error instanceof z.ZodError) {
          writeError(response, 422, "n8n_control_input_invalid", false);
        } else if (error instanceof InvalidActionJsonError) {
          writeError(response, 400, "n8n_control_invalid_json", false);
        } else {
          writeError(response, 502, "n8n_control_upstream_failure", true);
        }
      }
      return true;
    } finally {
      release();
    }
  }

  async function route(pathname: string, body: unknown) {
    if (pathname === `${N8N_CONTROL_PLANE_PREFIX}/start`) {
      return n8nControlPlaneProjectionSchema.parse(
        await control.start(startSchema.parse(body).session_id)
      );
    }
    if (pathname === `${N8N_CONTROL_PLANE_PREFIX}/tick`) {
      return n8nControlPlaneProjectionSchema.parse(
        await control.tick(executionSchema.parse(body).execution_id)
      );
    }
    if (pathname === `${N8N_CONTROL_PLANE_PREFIX}/status`) {
      return n8nControlPlaneProjectionSchema.parse(
        control.status(executionSchema.parse(body).execution_id)
      );
    }
    throw new N8nControlPlanePathNotFoundError();
  }
}

class N8nControlPlanePathNotFoundError extends Error {}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {}
): void {
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, "utf8") > RESPONSE_MAX_BYTES) {
    writeError(response, 500, "n8n_control_internal_error", false);
    return;
  }
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers
  });
  response.end(serialized);
}

function writeError(
  response: ServerResponse,
  status: number,
  code: ErrorCode,
  retryable: boolean,
  headers: Readonly<Record<string, string>> = {}
): void {
  writeJson(response, status, errorSchema.parse({
    error: { code, retryable }
  }), headers);
}
