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
  HEALTH_PAYLOAD,
  MAX_MCP_REQUEST_BYTES,
  SERVER_INSTRUCTIONS,
  SERVICE_NAME,
  SERVICE_VERSION
} from "./config.js";
import { registerTools } from "./register-tools.js";

export function createAskRigorServer(): McpServer {
  const server = new McpServer(
    { name: SERVICE_NAME, version: SERVICE_VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  );
  registerTools(server);
  return server;
}

export function createAskRigorHttpServer(): HttpServer {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(HEALTH_PAYLOAD));
      return;
    }

    if (pathname !== "/mcp") {
      response.writeHead(404).end();
      return;
    }

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

    const server = createAskRigorServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, parsedBody);
    } catch {
      if (!response.headersSent) {
        writeJsonRpcError(response, 500, -32603, "Internal server error");
      }
    } finally {
      await server.close();
    }
  });
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
