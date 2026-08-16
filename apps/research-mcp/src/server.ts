import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse
} from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isJsonContentType } from "@modelcontextprotocol/sdk/shared/mediaType.js";

import {
  actionApiKeyFromEnv,
  actionsAreEnabled,
  HEALTH_PAYLOAD,
  MAX_MCP_REQUEST_BYTES,
  parseTrustedClientIpHeader,
  PUBLIC_MCP_CONCURRENCY_LIMIT,
  PUBLIC_RATE_LIMIT,
  publicServerIsEnabled,
  researchActionsAreEnabled,
  SERVER_INSTRUCTIONS,
  SERVICE_NAME,
  SERVICE_VERSION
} from "./config.js";
import { createActionOpenApiDocument } from "./actions/openapi.js";
import { hasValidActionAuthorization } from "./actions/auth.js";
import { isCanonicalRawPath } from "./actions/path.js";
import {
  dispatchActionRequest,
  validateActionRoutes
} from "./actions/router.js";
import type { ActionRoute } from "./actions/types.js";
import { createResearchActionRoutes } from "./actions/research-routes.js";
import { createEnabledActionRoutes } from "./actions/runtime.js";
import {
  isLessonActionJsonContentType,
  LESSON_ACTION_JSON_CONTENT_TYPE_ERROR,
  LESSON_ACTION_PATH
} from "./lessons/action-route.js";
import { createDefaultActionRoutes } from "./lessons/runtime.js";
import {
  createConcurrencyLimiter,
  createTokenBucketLimiter,
  resolveClientIp,
  type ConcurrencyLimiter,
  type TokenBucketLimiter,
  type TrustedClientIpHeader
} from "./rate-limit.js";
import { registerTools } from "./register-tools.js";

export function createAskRigorServer(): McpServer {
  const server = new McpServer(
    { name: SERVICE_NAME, version: SERVICE_VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  );
  registerTools(server);
  return server;
}

export interface AskRigorHttpServerOptions {
  publicServerEnabled?: boolean;
  actionsEnabled?: boolean;
  researchActionsEnabled?: boolean;
  actionApiKey?: string;
  actionRoutes?: readonly ActionRoute[];
  trustedClientIpHeader?: TrustedClientIpHeader;
  rateLimiter?: TokenBucketLimiter;
  concurrencyLimiter?: ConcurrencyLimiter;
  createMcpServer?: () => McpServer;
}

export function createAskRigorHttpServer(
  options: AskRigorHttpServerOptions = {}
): HttpServer {
  const publicServerEnabled = options.publicServerEnabled ?? publicServerIsEnabled();
  const actionsEnabled = options.actionsEnabled ?? actionsAreEnabled();
  const researchActionsEnabled = options.researchActionsEnabled ??
    researchActionsAreEnabled();
  const actionApiKey = options.actionApiKey ?? actionApiKeyFromEnv();
  const configuredActionRoutes = options.actionRoutes ?? [
    ...(researchActionsEnabled ? createResearchActionRoutes() : []),
    ...createDefaultActionRoutes()
  ];
  validateActionRoutes(configuredActionRoutes);
  const actionRoutes = createEnabledActionRoutes({
    researchEnabled: researchActionsEnabled,
    lessonsEnabled: actionsEnabled,
    research: configuredActionRoutes.filter(({ publicResearch }) =>
      publicResearch === true
    ),
    lessons: configuredActionRoutes.filter(({ publicResearch }) =>
      publicResearch !== true
    )
  });
  const trustedClientIpHeader = options.trustedClientIpHeader ??
    parseTrustedClientIpHeader();
  const rateLimiter = options.rateLimiter ?? createTokenBucketLimiter(PUBLIC_RATE_LIMIT);
  const concurrencyLimiter = options.concurrencyLimiter ??
    createConcurrencyLimiter(PUBLIC_MCP_CONCURRENCY_LIMIT);
  const createMcpServer = options.createMcpServer ?? createAskRigorServer;

  return createServer(async (request, response) => {
    const pathname = exactOriginFormPath(request.url);
    if (pathname === undefined) {
      response.writeHead(404).end();
      return;
    }

    if (request.method === "GET" && pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(HEALTH_PAYLOAD));
      return;
    }

    if (
      actionsEnabled &&
      request.method === "POST" &&
      pathname === LESSON_ACTION_PATH &&
      actionRoutes.some((route) =>
        route.method === "POST" &&
        route.path === LESSON_ACTION_PATH &&
        route.operationId === "submit_lesson_candidate" &&
        route.public === false
      ) &&
      !isLessonActionJsonContentType(request.headers["content-type"]) &&
      hasValidActionAuthorization(request, actionApiKey)
    ) {
      response.writeHead(415, { "content-type": "application/json" });
      response.end(JSON.stringify(LESSON_ACTION_JSON_CONTENT_TYPE_ERROR));
      return;
    }

    if (actionRoutes.length > 0 && await dispatchActionRequest(request, response, {
      pathname,
      clientIp: resolveClientIp(request, trustedClientIpHeader),
      actionApiKey,
      routes: actionRoutes,
      createOpenApiDocument: () => createActionOpenApiDocument(actionRoutes),
      publicRateLimiter: rateLimiter,
      publicConcurrencyLimiter: concurrencyLimiter
    })) {
      return;
    }

    if (pathname !== "/mcp") {
      response.writeHead(404).end();
      return;
    }

    if (!publicServerEnabled) {
      writeJsonRpcError(response, 503, -32000, "public_server_disabled", true);
      return;
    }

    if (!rateLimiter.consume(resolveClientIp(request, trustedClientIpHeader))) {
      writeJsonRpcError(response, 429, -32000, "rate_limit_exceeded", true);
      return;
    }

    const releasePermit = concurrencyLimiter.tryAcquire();
    if (releasePermit === undefined) {
      writeJsonRpcError(response, 503, -32000, "concurrency_limit_exceeded", true);
      return;
    }

    try {
      let parsedBody: unknown;
      if (request.method === "POST" && sdkAcceptsPostBody(request)) {
        try {
          parsedBody = await readBoundedJsonBody(request);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            writeJsonRpcError(
              response,
              413,
              -32000,
              "Request body exceeds 1 MiB limit",
              true
            );
            return;
          }

          writeJsonRpcError(response, 400, -32700, "Parse error: Invalid JSON");
          return;
        }
      }

      let server: McpServer | undefined;
      try {
        server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined
        });
        await server.connect(transport);
        await transport.handleRequest(request, response, parsedBody);
      } catch {
        if (!response.headersSent) {
          writeJsonRpcError(response, 500, -32603, "Internal server error");
        }
      } finally {
        await server?.close();
      }
    } finally {
      releasePermit();
    }
  });
}

function exactOriginFormPath(target: string | undefined): string | undefined {
  if (target === undefined || target.includes("#")) {
    return undefined;
  }
  const queryIndex = target.indexOf("?");
  const path = queryIndex < 0 ? target : target.slice(0, queryIndex);
  return isCanonicalRawPath(path) ? path : undefined;
}

class RequestBodyTooLargeError extends Error {}

function sdkAcceptsPostBody(request: IncomingMessage): boolean {
  const accept = request.headers.accept;
  return accept?.includes("application/json") === true &&
    accept.includes("text/event-stream") &&
    isJsonContentType(request.headers["content-type"]);
}

function readBoundedJsonBody(request: IncomingMessage): Promise<unknown> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MCP_REQUEST_BYTES) {
    retainRequestErrorListenerUntilClose(request);
    request.pause();
    return Promise.reject(new RequestBodyTooLargeError());
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;

    const cleanup = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAborted);
      request.off("error", onError);
      request.off("close", onClose);
    };
    const stopReading = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAborted);
      request.pause();
    };
    const rejectOnce = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const resolveOnce = (value: unknown) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += bytes.byteLength;

      if (receivedBytes > MAX_MCP_REQUEST_BYTES) {
        stopReading();
        rejectOnce(new RequestBodyTooLargeError());
        return;
      }

      chunks.push(bytes);
    };
    const onEnd = () => {
      stopReading();
      try {
        resolveOnce(
          JSON.parse(Buffer.concat(chunks, receivedBytes).toString("utf8"))
        );
      } catch {
        rejectOnce(new Error("Invalid JSON"));
      }
    };
    const onAborted = () => {
      stopReading();
      rejectOnce(new Error("Request aborted"));
    };
    const onError = () => {
      stopReading();
      rejectOnce(new Error("Request read failed"));
    };
    const onClose = () => {
      cleanup();
      rejectOnce(new Error("Request closed"));
    };

    request.on("data", onData);
    request.once("end", onEnd);
    request.once("aborted", onAborted);
    request.on("error", onError);
    request.once("close", onClose);
  });
}

function retainRequestErrorListenerUntilClose(request: IncomingMessage): void {
  const onError = () => {};
  const onClose = () => {
    request.off("error", onError);
  };

  request.on("error", onError);
  request.once("close", onClose);
}

function writeJsonRpcError(
  response: ServerResponse,
  status: number,
  code: number,
  message: string,
  closeConnection = false
): void {
  response.writeHead(status, {
    "content-type": "application/json",
    ...(closeConnection ? { connection: "close" } : {})
  });
  response.end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  }));
}
