import { createServer, type Server as HttpServer } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  HEALTH_PAYLOAD,
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

    const server = createAskRigorServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null
        }));
      }
    } finally {
      await server.close();
    }
  });
}
